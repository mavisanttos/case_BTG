#!/usr/bin/env python3
"""
download_cvm_data.py
--------------------
Download, extração e análise focada exclusivamente nos dados de Ofertas Públicas
de Distribuição da CVM sob a nova Resolução CVM 160 (Rito automático de 2023 em diante).

Fonte dos Dados: https://dados.cvm.gov.br/dataset/oferta-distrib
"""

import os
import sys
import zipfile
import io
import requests
import pandas as pd
from pathlib import Path

# ─── Configuração de Caminhos ──────────────────────────────────────────────────
# Resolve caminhos relativos de forma segura para a raiz do projeto
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "cvm"

CVM_BASE_URL = "https://dados.cvm.gov.br/dados/OFERTA/DISTRIB/DADOS"
ZIP_URL = f"{CVM_BASE_URL}/oferta_distribuicao.zip"

# Nome do arquivo de destino padronizado
TARGET_CSV_NAME = "modern_offers_rcvm160.csv"


# ─── Funções de Coleta ────────────────────────────────────────────────────────

def download_zip(url: str) -> zipfile.ZipFile:
    """Baixa o arquivo compactado da CVM diretamente para a memória RAM."""
    print(f"\n{'='*80}")
    print(f"📥 Baixando dados oficiais de distribuição da CVM...")
    print(f"   URL: {url}")
    
    try:
        response = requests.get(url, timeout=120)
        response.raise_for_status()
        size_mb = len(response.content) / 1024 / 1024
        print(f"   [SUCESSO] Download concluído. Tamanho: {size_mb:.2f} MB")
        return zipfile.ZipFile(io.BytesIO(response.content))
    except Exception as e:
        print(f"   ❌ [ERRO] Falha ao efetuar o download dos dados da CVM: {e}")
        sys.exit(1)


def extrair_tabela_resolucao_160(zf: zipfile.ZipFile) -> pd.DataFrame:
    """Procura e extrai apenas a tabela de rito automático (CVM 160) de dentro do ZIP."""
    # Filtra os nomes dos arquivos internos buscando pelo CSV de resolução 160
    csv_interno = [n for n in zf.namelist() if "resolucao_160" in n.lower() and n.endswith(".csv")]
    
    if not csv_interno:
        # Fallback de índice caso o nome mude levemente no servidor
        csv_interno = [n for n in zf.namelist() if n.endswith(".csv")]
        target_name = csv_interno[1] if len(csv_interno) > 1 else csv_interno[0]
    else:
        target_name = csv_interno[0]

    print(f"   Extraindo do pacote ZIP: '{target_name}'")

    with zf.open(target_name) as f:
        # Os CSVs da CVM utilizam ponto e vírgula como separador e encoding latin-1
        df = pd.read_csv(
            f, sep=";", encoding="latin-1",
            engine="python", on_bad_lines="skip"
        )

    print(f"   → Capturadas {len(df):,} linhas e {len(df.columns)} colunas de metadados de ofertas.")
    return df


# ─── Análise Estatística Focada ────────────────────────────────────────────────

def analisar_ofertas_modernas(df: pd.DataFrame):
    """Gera um relatório executivo rápido sobre os ativos e emissores modernos."""
    print(f"\n{'='*80}")
    print(f"📊 RELATÓRIO EXECUTIVO — RESOLUÇÃO CVM 160 (2023 – HOJE)")
    print(f"{'='*80}")
    print(f"   Volume de ofertas mapeadas: {len(df):,}")
    print(f"   Campos estruturados por oferta: {len(df.columns)}")

    # Intervalo temporal real contido no CSV
    df["Data_Registro_DT"] = pd.to_datetime(df["Data_Registro"], errors="coerce")
    df["Ano"] = df["Data_Registro_DT"].dt.year
    ano_min = df["Ano"].dropna().min()
    ano_max = df["Ano"].dropna().max()
    print(f"   Período de abrangência: {int(ano_min) if pd.notna(ano_min) else 'N/A'} – {int(ano_max) if pd.notna(ano_max) else 'N/A'}")

    # 1. Distribuição de Classes de Ativo
    print(f"\n   {'─'*60}")
    print(f"   1. CLASSES DE ATIVOS (Top 5 mais ofertados)")
    print(f"   {'─'*60}")
    for classe, qtd in df["Valor_Mobiliario"].value_counts().head(5).items():
        pct = (qtd / len(df)) * 100
        print(f"      • {classe[:35]:35s} | Qtd: {qtd:>5,} | ({pct:.1f}%)")

    # 2. Status das Ofertas
    print(f"\n   {'─'*60}")
    print(f"   2. STATUS ATUAL DAS REQUISIÇÕES")
    print(f"   {'─'*60}")
    for status, qtd in df["Status_Requerimento"].value_counts().items():
        pct = (qtd / len(df)) * 100
        print(f"      • {status[:35]:35s} | Qtd: {qtd:>5,} | ({pct:.1f}%)")

    # 3. Principais Coordenadores Líderes
    print(f"\n   {'─'*60}")
    print(f"   3. TOP 5 COORDENADORES LÍDERES")
    print(f"   {'─'*60}")
    for lider, qtd in df["Nome_Lider"].value_counts().head(5).items():
        print(f"      • {lider[:50]:50s} | {qtd:>4,} ofertas coordenadas")

    # 4. Títulos Verdes / Sustentáveis (ESG) e Incentivados
    print(f"\n   {'─'*60}")
    print(f"   4. ROTULAGEM DE CRÉDITO ESPECÍFICO")
    print(f"   {'─'*60}")
    for col, rotulo in [
        ("Titulo_classificado_como_sustentavel", "Classificado Sustentável (ESG)"),
        ("Titulo_incentivado", "Título Incentivado (Isenção de IR)"),
    ]:
        if col in df.columns:
            sim_qtd = (df[col] == "S").sum()
            total = len(df)
            print(f"      • {rotulo:35s} | {sim_qtd:>4,} ofertas | ({sim_qtd / total * 100:.1f}%)")


# ─── Fluxo Principal ─────────────────────────────────────────────────────────

def main():
    print("🏛️  CVM — Ingestão Automática Focada na Resolução CVM 160")
    print(f"📁 Diretório de dados local: {DATA_DIR.absolute()}")
    
    # Cria o diretório de dados local caso ele não exista
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Baixa o pacote compactado da CVM
    zf = download_zip(ZIP_URL)

    # 2. Extrai exclusivamente a planilha do rito automático CVM 160
    print("\n📂 Processando tabela moderna...")
    df_moderno = extrair_tabela_resolucao_160(zf)

    # 3. Grava o CSV limpo e com codificação UTF-8
    csv_path = DATA_DIR / TARGET_CSV_NAME
    df_moderno.to_csv(csv_path, index=False, sep=";", encoding="utf-8")
    print(f"   💾 Tabela moderna salva com sucesso em: {csv_path.name}")

    # 4. Executa análise executiva para garantir a integridade dos dados lidos
    analisar_ofertas_modernas(df_moderno)

    print(f"\n{'='*80}")
    print(f"✅ Execução Concluída! Banco de dados atualizado em: {csv_path.resolve()}")
    print(f"{'='*80}\n")


if __name__ == "__main__":
    main()