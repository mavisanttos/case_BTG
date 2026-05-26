#!/usr/bin/env python3
"""
generate_mock_prospectus.py
--------------------------
Gerador inteligente de dados simulados (mocks) realistas para os Prospectos da CVM.
Lê os números de requerimento reais do arquivo 'modern_offers_rcvm160.csv' e gera
o arquivo 'prospectos_extraidos.csv' com 100% dos campos preenchidos de forma coerente.

Novidades:
  - Geração de links dinâmicos para a página da oferta e download direto do PDF.
  - Algoritmo de inteligência de crédito e atratividade (Scoring BTG de 0 a 100).
  - Compatibilidade imediata com o dashboard Streamlit do BTG.
"""

import csv
import os
import sys
import random
import uuid
from pathlib import Path

# ─── Configuração de Caminhos do Projeto ──────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "cvm"
CSV_INPUT = DATA_DIR / "modern_offers_rcvm160.csv"
CSV_OUTPUT = DATA_DIR / "prospectos_extraidos.csv"

# ─── Campos Estruturados do Relatório (Layout Oficial do BTG) ──────────────────
CAMPOS = [
    "preco_emissao", "valor_patrimonial_cota", "pvp_oferta", "dy_projetado_pct",
    "taxa_administracao", "taxa_performance", "custo_total_oferta_pct",
    "montante_total", "montante_minimo", "lote_base", "lote_adicional",
    "numero_cotas_ofertadas", "numero_emissao", "prazo_oferta_dias",
    "cronograma_resumido", "condicao_encerramento_antecipado", "direito_preferencia",
    "regime_distribuicao", "data_primeiro_rendimento", "tipo_fii", "tipo_ativo_alvo",
    "localizacao_geografica", "destinacao_recursos", "pipeline_ativos",
    "vacancia_fisica_pct", "vacancia_financeira_pct", "prazo_medio_contratos",
    "tipo_contrato", "indexador_predominante", "maior_inquilino_pct", "hedge_cambial",
    "ltv_medio_pct", "indexador_carteira_papel", "maior_devedor_pct", "rating_medio_cris",
    "garantias_cri", "rendimentos_ultimos_12m", "cotacao_mercado_ref",
    "patrimonio_liquido_atual", "pvp_historico_medio", "fatores_risco_principais",
    "concentracao_geografica", "concentracao_indexador",
    "link_oferta_cvm", "link_pdf_download", "score_oferta"  # Novos campos adicionados
]


# ─── Lógica de Raciocínio de Crédito e Atração (Scoring BTG) ───────────────────

def calcular_score_oferta(dados: dict, tipo_fii: str) -> int:
    """
    Calcula uma nota de 0 a 100 baseada em múltiplos critérios financeiros e operacionais.
    Excelente para ordenar e filtrar as melhores oportunidades de investimento no Front.
    """
    score = 70.0  # Começa com uma nota base neutra
    
    # 1. Critério P/VP (Peso de 30 pontos na variação)
    try:
        pvp = float(dados["pvp_oferta"])
        if pvp < 1.0:
            # Desconto é excelente (Até +15 pontos)
            score += (1.0 - pvp) * 150
        else:
            # Ágio penaliza o investimento (Até -15 pontos)
            score -= (pvp - 1.0) * 100
    except:
        pass

    # 2. Critério Dividend Yield Projetado (Peso de 30 pontos na variação)
    try:
        dy = float(dados["dy_projetado_pct"])
        # Benchmark de mercado de FII: 11% ao ano
        if dy > 11.0:
            score += (dy - 11.0) * 8
        else:
            score -= (11.0 - dy) * 10
    except:
        pass

    # 3. Custos da Oferta (Peso de 15 pontos)
    try:
        custo = float(dados["custo_total_oferta_pct"])
        # Custos abaixo de 2.5% são ótimos para o cotista
        if custo < 2.5:
            score += 5
        elif custo > 3.5:
            score -= 8
    except:
        pass

    # 4. Qualidade Operacional (Peso de 25 pontos)
    if tipo_fii == "Tijolo":
        # Vacância física baixa é sinônimo de segurança (Até +10 pontos)
        try:
            vac = float(dados["vacancia_fisica_pct"])
            if vac < 3.0:
                score += 10
            elif vac > 10.0:
                score -= 10
        except:
            pass
        # Contratos longos dão previsibilidade (Até +10 pontos)
        try:
            prazo = float(dados["prazo_medio_contratos"].split()[0])
            if prazo > 6.0:
                score += 10
            elif prazo < 3.0:
                score -= 5
        except:
            pass
    else:
        # Papel: LTV baixo significa mais margem de colateral (Até +10 pontos)
        try:
            ltv = float(dados["ltv_medio_pct"])
            if ltv < 55.0:
                score += 12
            elif ltv > 65.0:
                score -= 10
        except:
            pass
        # Rating de crédito forte (Até +10 pontos)
        rating = str(dados["rating_medio_cris"]).upper()
        if "AAA" in rating or "AA+" in rating:
            score += 13
        elif "A-" in rating or "BBB" in rating:
            score -= 5

    # Limita o score final de forma estrita entre 0 e 100
    return max(0, min(100, int(score)))


# ─── Lógica de Geração Estocástica Realista de Mocks ──────────────────────────

def formatar_brl(valor: float) -> str:
    """Formatador auxiliar para o padrão monetário brasileiro de forma precisa (R$ 1.000,00)."""
    partes = f"{valor:.2f}".split('.')
    inteiro = partes[0]
    decimal = partes[1]
    
    inteiro_formatado = []
    for i, digito in enumerate(reversed(inteiro)):
        if i > 0 and i % 3 == 0:
            inteiro_formatado.append('.')
        inteiro_formatado.append(digito)
        
    return f"R$ {''.join(reversed(inteiro_formatado))},{decimal}"


def gerar_linha_prospecto(oferta_id: str, nome_emissor: str, classe_ativo: str) -> dict:
    """
    Gera métricas financeiras altamente realistas de forma estocástica (probabilística)
    com base nas práticas atuais do mercado de capitais brasileiro.
    """
    emissor_lower = nome_emissor.lower()
    classe_lower = str(classe_ativo).lower() if classe_ativo else ""
    
    is_papel = any(x in emissor_lower or x in classe_lower for x in ["recebiveis", "papel", "cri", "credito", "divida", "fict"])
    tipo_fii = "Papel" if is_papel else "Tijolo"

    preco_num = random.choice([10.0, 100.0, 100.0, 103.50, 150.0])
    preco_emissao = formatar_brl(preco_num)

    vp_num = preco_num * random.choice([0.97, 0.99, 1.0, 1.01, 1.03])
    valor_patrimonial_cota = formatar_brl(vp_num)
    pvp_oferta = f"{preco_num / vp_num:.2f}"

    dy_projetado_pct = f"{random.uniform(9.5, 13.2):.1f}"

    taxa_administracao = f"{random.choice(['0,80% a.a.', '0,95% a.a.', '1,00% a.a.', '1,10% a.a.'])}"
    taxa_performance = f"{random.choice(['20% sobre o que exceder IFIX', '20% sobre o que exceder IPCA + 6% a.a.', 'Sem taxa de performance'])}"
    custo_total_oferta_pct = f"{random.uniform(1.5, 3.8):.2f}"

    montante_total_num = random.choice([120_000_000.0, 250_000_000.0, 450_000_000.0, 600_000_000.0])
    montante_total = formatar_brl(montante_total_num)
    montante_minimo = formatar_brl(montante_total_num * 0.1)
    lote_base = formatar_brl(montante_total_num * 0.8)
    lote_adicional = formatar_brl(montante_total_num * 0.2)

    numero_cotas_ofertadas = str(int(montante_total_num / preco_num))
    numero_emissao = str(random.randint(1, 15))
    prazo_oferta_dias = str(random.choice([45, 60, 90]))
    cronograma_resumido = "Início: 15/05/2026 | Encerramento: 15/07/2026 | Liquidação: 18/07/2026"
    condicao_encerramento_antecipado = "Mediante o atingimento do lote mínimo e deliberação do coordenador líder."
    
    direito_preferencia = f"{random.choice(['Sim, prazo de 10 dias úteis', 'Não se aplica ao rito'])}"
    regime_distribuicao = f"{random.choice(['Melhores esforços', 'Garantia firme de liquidação'])}"
    data_primeiro_rendimento = "15º dia útil do segundo mês subsequente ao encerramento da distribuição."

    if tipo_fii == "Tijolo":
        tipo_ativo_alvo = random.choice(["Galpões Logísticos Classe A", "Lajes Corporativas Premium", "Shopping Centers Regionais"])
        localizacao_geografica = random.choice(["SP (85%), RJ (15%)", "Multiregiões (SP, MG, PR, SC)", "São Paulo - Capital"])
        destinacao_recursos = "90% Aquisição de ativos imobiliários | 5% Obras | 5% Reserva de Caixa"
        pipeline_ativos = f"Aquisição de ativo logístico classe A totalmente locado no estado de São Paulo."
        
        vacancia_fisica_pct = f"{random.uniform(0.0, 7.5):.1f}"
        vacancia_financeira_pct = f"{random.uniform(0.0, 4.2):.1f}"
        prazo_medio_contratos = f"{random.uniform(4.5, 7.5):.1f} anos"
        tipo_contract = random.choice(["Típicos (65%), Atípicos (35%)", "Atípicos (100%)", "Típicos (100%)"])
        indexador_predominante = random.choice(["IPCA", "IGP-M"])
        maior_inquilino_pct = f"{random.choice(['Mercado Livre', 'Ambev', 'GPA', 'Americanas'])} — {random.randint(12, 28)}%"
        hedge_cambial = "Não aplicável"
        
        ltv_medio_pct = "null"
        indexador_carteira_papel = "null"
        maior_devedor_pct = "null"
        rating_medio_cris = "null"
        garantias_cri = "null"
    else:
        tipo_ativo_alvo = "Certificados de Recebíveis Imobiliários (CRIs)"
        localizacao_geografica = "Foco em ativos corporativos multiestado (SP, RJ, MG)"
        destinacao_recursos = "95% Alocação em CRIs de alta qualidade de crédito | 5% Caixa operacional"
        pipeline_ativos = "Alocação tática em 5 novos CRIs de emissores de primeira linha (rating AA+)."
        
        vacancia_fisica_pct = "null"
        vacancia_financeira_pct = "null"
        prazo_medio_contratos = "null"
        tipo_contract = "null"
        indexador_predominante = "null"
        maior_inquilino_pct = "null"
        hedge_cambial = "null"
        
        ltv_medio_pct = f"{random.uniform(48.5, 62.0):.1f}"
        indexador_carteira_papel = "IPCA (80%) | CDI (20%)"
        maior_devedor_pct = f"Grupo Mateus — {random.randint(8, 15)}%"
        rating_medio_cris = random.choice(["AA- (Fitch)", "AAA (Moody's Local)", "A+ (S&P)"])
        garantias_cri = "Alienação fiduciária de imóveis reais | Cessão fiduciária de recebíveis imobiliários"

    num_emissao_int = int(numero_emissao)
    if num_emissao_int > 1:
        rendimentos_ultimos_12m = f"R$ {random.uniform(8.50, 13.90):.2f}/cota".replace(".", ",")
        cotacao_mercado_ref = formatar_brl(preco_num * random.uniform(0.95, 1.01))
        patrimonio_liquido_atual = formatar_brl(montante_total_num * random.choice([2.0, 3.5, 5.0]))
        pvp_historico_medio = f"{random.uniform(0.93, 1.02):.2f}"
    else:
        rendimentos_ultimos_12m = "null"
        cotacao_mercado_ref = "null"
        patrimonio_liquido_atual = "null"
        pvp_historico_medio = "null"

    fatores_risco_principais = "Risco de liquidez secundária das cotas | Risco de crédito dos inquilinos/devedores | Risco macroeconômico inflacionário"
    concentracao_geografica = "Exposição moderada no estado de São Paulo, mitigada pela qualidade Triple A dos ativos."
    concentracao_indexador = "Sensibilidade à variação de indexadores de inflação (IPCA/IGP-M) que corrigem os recebíveis."

    # Geração dos links dinâmicos requeridos para o Front-End
    link_oferta_cvm = f"https://web.cvm.gov.br/sre-publico-cvm/#/oferta-publica/{oferta_id}"
    link_pdf_download = f"https://web.cvm.gov.br/sre-publico-cvm/rest/download/{uuid.uuid4()}"

    # Dicionário intermediário para alimentar o cálculo de Score
    retorno_prospecto = {
        "arquivo_pdf": f"prospecto_{oferta_id}.pdf",
        "preco_emissao": preco_emissao,
        "valor_patrimonial_cota": valor_patrimonial_cota,
        "pvp_oferta": pvp_oferta,
        "dy_projetado_pct": dy_projetado_pct,
        "taxa_administracao": taxa_administracao,
        "taxa_performance": taxa_performance,
        "custo_total_oferta_pct": custo_total_oferta_pct,
        "montante_total": montante_total,
        "montante_minimo": montante_minimo,
        "lote_base": lote_base,
        "lote_adicional": lote_adicional,
        "numero_cotas_ofertadas": numero_cotas_ofertadas,
        "numero_emissao": numero_emissao,
        "prazo_oferta_dias": prazo_oferta_dias,
        "cronograma_resumido": cronograma_resumido,
        "condicao_encerramento_antecipado": condicao_encerramento_antecipado,
        "direito_preferencia": direito_preferencia,
        "regime_distribuicao": regime_distribuicao,
        "data_primeiro_rendimento": data_primeiro_rendimento,
        "tipo_fii": tipo_fii,
        "tipo_ativo_alvo": tipo_ativo_alvo,
        "localizacao_geografica": localizacao_geografica,
        "destinacao_recursos": destinacao_recursos,
        "pipeline_ativos": pipeline_ativos,
        "vacancia_fisica_pct": vacancia_fisica_pct,
        "vacancia_financeira_pct": vacancia_financeira_pct,
        "prazo_medio_contratos": prazo_medio_contratos,
        "tipo_contrato": tipo_contract,
        "indexador_predominante": indexador_predominante,
        "maior_inquilino_pct": maior_inquilino_pct,
        "hedge_cambial": hedge_cambial,
        "ltv_medio_pct": ltv_medio_pct,
        "indexador_carteira_papel": indexador_carteira_papel,
        "maior_devedor_pct": maior_devedor_pct,
        "rating_medio_cris": rating_medio_cris,
        "garantias_cri": garantias_cri,
        "rendimentos_ultimos_12m": rendimentos_ultimos_12m,
        "cotacao_mercado_ref": cotacao_mercado_ref,
        "patrimonio_liquido_atual": patrimonio_liquido_atual,
        "pvp_historico_medio": pvp_historico_medio,
        "fatores_risco_principais": fatores_risco_principais,
        "concentracao_geografica": concentracao_geografica,
        "concentracao_indexador": concentracao_indexador,
        "link_oferta_cvm": link_oferta_cvm,
        "link_pdf_download": link_pdf_download
    }

    # Atribui o Score dinamicamente
    retorno_prospecto["score_oferta"] = str(calcular_score_oferta(retorno_prospecto, tipo_fii))
    return retorno_prospecto


# ─── Execução do Pipeline do Gerador ──────────────────────────────────────────

def main():
    print(f"\n{'='*80}")
    print("🤖 GERADOR AUTOMÁTICO DE PROSPECTOS DO DASHBOARD (MOCKS REALISTAS)")
    print(f"{'='*80}\n")

    if not CSV_INPUT.exists():
        print(f"❌ [ERRO] Planilha moderna da CVM não encontrada: {CSV_INPUT}")
        print("   Por favor execute primeiro: python src/data_ingestion/download_cvm_data.py")
        sys.exit(1)

    print(f"📂 Lendo dados das ofertas modernas a partir de: {CSV_INPUT.name}")
    
    ofertas_reais = []
    with open(CSV_INPUT, mode="r", encoding="utf-8") as f:
        leitor = csv.DictReader(f, delimiter=";")
        for linha in leitor:
            req_id = linha.get("Numero_Requerimento")
            emissor = linha.get("Nome_Emissor", "Fundo Imobiliário Genérico")
            classe = linha.get("Valor_Mobiliario", "FII")
            if req_id and req_id.strip():
                ofertas_reais.append((req_id.strip(), emissor.strip(), classe.strip()))

    ofertas_reais = list(dict.fromkeys(ofertas_reais))
    print(f"   Foram localizadas {len(ofertas_reais)} ofertas reais no banco de dados da CVM.")

    dados_gerados = []
    for req_id, emissor, classe in ofertas_reais:
        linha_mock = gerar_linha_prospecto(req_id, emissor, classe)
        dados_gerados.append(linha_mock)

    # Escreve o arquivo final no disco com os novos cabeçalhos
    colunas_completas = ["arquivo_pdf"] + CAMPOS
    CSV_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    
    with open(CSV_OUTPUT, mode="w", newline="", encoding="utf-8-sig") as f:
        escritor = csv.DictWriter(f, fieldnames=colunas_completas, delimiter=";")
        escritor.writeheader()
        escritor.writerows(dados_gerados)

    print(f"\n🎯 [SUCESSO] Processamento Concluído!")
    print(f"   O arquivo '{CSV_OUTPUT.name}' foi alimentado com {len(dados_gerados)} linhas.")
    print(f"   Pronto para consumo no dashboard em: {CSV_OUTPUT.resolve()}\n")


if __name__ == "__main__":
    main()