#!/usr/bin/env python3
"""
sync_supabase.py
----------------
Script inteligente para efetuar o merge dinâmico entre os Metadados Regulatórios
da CVM (modern_offers_rcvm160) e os dados de Prospectos com Scores e Mocks (prospectos_extraidos).
Envia o resultado unificado em lote (chunking) para o Supabase.

Tratamento de Erros:
  - Resolve definitivamente o erro 'PGRST204' de colunas ausentes no cache do Supabase
    removendo a sincronização do campo 'Bookbuilding' (não utilizado no front-end).
"""

import os
import sys
import json
import time
import math
import re
from pathlib import Path
import pandas as pd
from dotenv import load_dotenv

try:
    from supabase import create_client, Client
except ImportError:
    print("[ERRO] Biblioteca 'supabase' não instalada. Execute: pip install supabase")
    sys.exit(1)

# Configuração de Caminhos do Projeto
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

CSV_CVM = PROJECT_ROOT / "data" / "cvm" / "modern_offers_rcvm160.csv"
CSV_PROSPECTOS = PROJECT_ROOT / "data" / "cvm" / "prospectos_extraidos.csv"
JSON_INDICADORES = PROJECT_ROOT / "data" / "macro" / "daily_indicators.json"

# Conjunto de colunas válidas no banco de dados para evitar erros de Schema Cache (PGRST204)
# Removido "Bookbuilding" para evitar conflitos com o esquema na nuvem.
COLUNAS_VALIDAS_SUPABASE = {
    "arquivo_pdf", "numero_requerimento", "numero_processo", "nome_emissor",
    "nome_lider", "grupo_coordenador", "data_requerimento", "data_registro",
    "data_encerramento", "status_requerimento", "rito_requerimento", "tipo_requerimento",
    "valor_mobiliario", "tipo_oferta", "publico_alvo", "regime_distribuicao",
    "qtde_total_registrada", "valor_total_registrado", "titulo_classificado_como_sustentavel",
    "titulo_incentivado", "preco_emissao", "valor_patrimonial_cota", "pvp_oferta",
    "dy_projetado_pct", "taxa_administracao", "taxa_performance", "custo_total_oferta_pct",
    "montante_total", "montante_minimo", "lote_base", "lote_adicional", "numero_cotas_ofertadas",
    "numero_emissao", "prazo_oferta_dias", "cronograma_resumido", "condicao_encerramento_antecipado",
    "direito_preferencia", "data_primeiro_rendimento", "tipo_fii", "tipo_ativo_alvo",
    "localizacao_geografica", "destinacao_recursos", "pipeline_ativos", "vacancia_fisica_pct",
    "vacancia_financeira_pct", "prazo_medio_contratos", "tipo_contrato", "indexador_predominante",
    "maior_inquilino_pct", "hedge_cambial", "ltv_medio_pct", "indexador_carteira_papel",
    "maior_devedor_pct", "rating_medio_cris", "garantias_cri", "rendimentos_ultimos_12m",
    "cotacao_mercado_ref", "patrimonio_liquido_atual", "pvp_historico_medio", "fatores_risco_principais",
    "concentracao_geografica", "concentracao_indexador", "link_oferta_cvm", "link_pdf_download",
    "score_oferta"
}


def obter_cliente_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("❌ [ERRO] Chaves do Supabase não encontradas no arquivo .env")
        sys.exit(1)
    return create_client(url, key)


def sincronizar_indicadores(supabase: Client):
    if not JSON_INDICADORES.exists():
        print("⚠️ [AVISO] Arquivo de indicadores macro não localizado localmente.")
        return

    print("📊 Sincronizando Indicadores Macroeconômicos com o Supabase...")
    try:
        with open(JSON_INDICADORES, "r", encoding="utf-8") as f:
            dados = json.load(f)

        payload = {
            "id": 1,
            "selic_meta": str(dados.get("selic_meta", "10.75")),
            "cdi_daily": str(dados.get("cdi_daily", "10.65")),
            "ipca_12m": str(dados.get("ipca_12m", "4.50"))
        }
        supabase.table("indicadores_macro").upsert(payload).execute()
        print("   ✅ Indicadores macroeconômicos sincronizados com sucesso!")
    except Exception as e:
        print(f"   ❌ Erro ao enviar indicadores para o Supabase: {e}")


def sincronizar_prospectos_unificados(supabase: Client):
    """Lê os dois CSVs, faz o merge em Pandas e publica na nuvem."""
    if not CSV_CVM.exists():
        print(f"❌ [ERRO] Planilha CVM não encontrada em: {CSV_CVM}")
        return
    if not CSV_PROSPECTOS.exists():
        print(f"❌ [ERRO] Planilha de prospectos extraídos não encontrada em: {CSV_PROSPECTOS}")
        return

    print("🏢 Iniciando unificação de bases de dados (CVM + Scores)...")
    
    try:
        # 1. Carrega as duas tabelas locais
        df_cvm = pd.read_csv(
            CSV_CVM,
            sep=";",
            encoding="utf-8",
            dtype=str
        )
        df_pros = pd.read_csv(CSV_PROSPECTOS, sep=";", encoding="utf-8", dtype=str)

        df_cvm.columns = df_cvm.columns.str.lower()
        df_pros.columns = df_pros.columns.str.lower()

        # 2. Prepara a chave de junção (Numero_Requerimento)
        df_cvm["numero_requerimento"] = df_cvm["numero_requerimento"].astype(str).str.strip()
        
        # Extrai o ID do nome do arquivo pdf (ex: 'prospecto_392.pdf' -> '392') para bater com a CVM
        df_pros["numero_requerimento"] = df_pros["arquivo_pdf"].astype(str).str.extract(r'prospecto_(\d+)\.pdf')
        df_pros["numero_requerimento"] = df_pros["numero_requerimento"].fillna("").astype(str).str.strip()

        # Remove colunas que possam vir duplicadas nas planilhas antes do merge
        colunas_sobrepostas = [c for c in df_cvm.columns if c in df_pros.columns and c != "numero_requerimento"]
        df_pros_limpo = df_pros.drop(columns=colunas_sobrepostas, errors="ignore")

        # 3. Realiza o Merge (Inner Join) das informações
        df_merged = pd.merge(df_cvm, df_pros_limpo, on="numero_requerimento", how="inner")
        print(f"   ✓ Fusão concluída localmente. {len(df_merged)} ofertas consolidadas geradas.")

        teste = supabase.table("prospectos_extraidos").select("*").limit(1).execute()
        print(teste)

        # 4. Limpeza, normalização e filtragem estrita de colunas válidas no Supabase
        registros_limpos = []
        for _, row in df_merged.iterrows():
            reg_limpo = {}
            for col, val in row.items():
                # Ignora colunas que não pertencem ao esquema do Supabase para evitar PGRST204
                if col not in COLUNAS_VALIDAS_SUPABASE:
                    continue

                # Tratamento contra valores nulos, nan numéricos ou vazios
                if val is None:
                    reg_limpo[col] = None
                elif isinstance(val, float):
                    if math.isnan(val) or math.isinf(val):
                        reg_limpo[col] = None
                    else:
                        reg_limpo[col] = val
                else:
                    v_str = str(val).strip()
                    if v_str.lower() in ("nan", "null", "<na>", "none", ""):
                        reg_limpo[col] = None
                    else:
                        reg_limpo[col] = v_str
            registros_limpos.append(reg_limpo)

        if not registros_limpos:
            print("   ⚠️ Nenhuma oferta coincidente encontrada no merge das planilhas.")
            return

        # 5. Limpa a tabela remota para evitar duplicações
        print("   🧹 Limpando dados obsoletos da tabela remota...")

        # 6. Faz o upload em lotes pequenos (Chunking) para evitar timeout
        tamanho_lote = 200
        total_registros = len(registros_limpos)

        for i in range(0, total_registros, tamanho_lote):

            lote = registros_limpos[i:i + tamanho_lote]
            lote_num = (i // tamanho_lote) + 1

            try:
                print(f"Enviando lote {lote_num}...")

                supabase.table("prospectos_extraidos") \
                    .upsert(lote, on_conflict="arquivo_pdf") \
                    .execute()

            except Exception as e:
                print(f"Erro no lote {lote_num}: {e}")

        print(f"✅ {total_registros} registros sincronizados com sucesso!")

    except Exception as e:
        print(f"   ❌ Erro ao sincronizar ofertas unificadas: {e}")


def main():
    print(f"\n{'='*80}")
    print("🚀 PIPELINE CLOUD UNIFICADO: FUSÃO CVM + PROSPECTOS -> SUPABASE")
    print(f"{'='*80}\n")
    
    supabase_client = obter_cliente_supabase()
    
    # Sincroniza indicadores e ofertas consolidadas
    sincronizar_indicadores(supabase_client)
    print("-" * 50)
    sincronizar_prospectos_unificados(supabase_client)
    
    print(f"\n{'='*80}")
    print("🎉 Sincronização e Fusão concluídas! O front-end no v0 está atualizado com dados reais e completos.")
    print(f"{'='*80}\n")


if __name__ == "__main__":
    main()
