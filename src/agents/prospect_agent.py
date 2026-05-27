#!/usr/bin/env python3
"""
market_agent.py
---------------
Agente de Chat inteligente da BTG Pactual Intelligence.
Orquestrado via LangChain e LangGraph, consome dados consolidados de:
  1. Metadados Regulatórios CVM (modern_offers_rcvm160.csv)
  2. Métricas Profundas de Prospectos e Scores (prospectos_extraidos.csv)
  3. Indicadores Macroeconômicos Diários (daily_indicators.json)

Utiliza a API do Gemini 2.5 Flash como motor de raciocínio.
"""

import json
import os
import sys
import re
import unicodedata
import warnings
from pathlib import Path
import pandas as pd
from dotenv import load_dotenv
from langchain_core.tools import tool

# Ignora warnings de depreciação do LangGraph/LangChain
with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    from langgraph.prebuilt import create_react_agent

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    print("[ERRO] Biblioteca 'langchain-google-genai' não instalada.")
    print("       Execute: pip install langchain-google-genai")
    sys.exit(1)

# ─── Configuração de Caminhos e Ambiente ──────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")
DATA_DIR = PROJECT_ROOT / "data"

# Developer Quality of Life: Mapeia GEMINI_API_KEY para GOOGLE_API_KEY usada pelo LangChain
if "GEMINI_API_KEY" in os.environ and "GOOGLE_API_KEY" not in os.environ:
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]

# ─── Inicialização e Fusão Inteligente de Dados ────────────────────────────────

CVM_PATH = DATA_DIR / "cvm" / "modern_offers_rcvm160.csv"
PROSPECTOS_PATH = DATA_DIR / "cvm" / "prospectos_extraidos.csv"
MACRO_PATH = DATA_DIR / "macro" / "daily_indicators.json"

# 1. Carrega Indicadores Macro
if MACRO_PATH.exists():
    with open(MACRO_PATH, encoding="utf-8") as f:
        _macro_indicators = json.load(f)
else:
    _macro_indicators = {}

# 2. Carrega e une as tabelas da CVM e de Prospectos Extraídos
_df_merged = pd.DataFrame()

if CVM_PATH.exists():
    df_cvm = pd.read_csv(CVM_PATH, sep=";")
    df_cvm["Numero_Requerimento"] = df_cvm["Numero_Requerimento"].astype(str).str.strip()
    
    if PROSPECTOS_PATH.exists():
        df_pros = pd.read_csv(PROSPECTOS_PATH, sep=";")
        
        # Extrai o id numérico de 'prospecto_{id}.pdf' para bater com o Numero_Requerimento da CVM
        df_pros["Numero_Requerimento"] = df_pros["arquivo_pdf"].astype(str).str.extract(r'prospecto_(\d+)\.pdf')
        df_pros["Numero_Requerimento"] = df_pros["Numero_Requerimento"].fillna("").str.strip()
        
        # Merge interno: Traz metadados da CVM + Métricas profundas extraídas/simuladas
        _df_merged = pd.merge(df_cvm, df_pros, on="Numero_Requerimento", how="inner")
        print(f"[AGENTE] Fusão concluída com sucesso: {_df_merged.shape[0]} ofertas consolidadas disponíveis.")
    else:
        _df_merged = df_cvm
        print("[AGENTE] Alerta: Apenas dados regulatórios carregados. Planilha de prospectos ausente.")
else:
    print("[AGENTE] Erro crítico: Base regulatória CVM não encontrada.")


# ─── Ferramentas do Agente (Tools) ───────────────────────────────────────────

@tool
def market_macro_indicators() -> str:
    """
    Retorna os indicadores macroeconômicos oficiais do Brasil (Meta Selic, CDI e IPCA acumulado).
    Use sempre que o usuário perguntar sobre as taxas básicas, inflação ou benchmarks de rentabilidade.
    """
    if not _macro_indicators:
        return "Indicadores macroeconômicos não disponíveis no momento."
    
    return (
        f"INDICADORES MACROECONÔMICOS ATUAIS (Fonte: Banco Central):\n"
        f"- Meta Taxa Selic: {_macro_indicators.get('selic_meta', 'N/D')}% a.a.\n"
        f"- Taxa DI / CDI: {_macro_indicators.get('cdi_daily', 'N/D')}% a.a.\n"
        f"- Inflação IPCA (acumulada 12 meses): {_macro_indicators.get('ipca_12m', 'N/D')}%"
    )


@tool
def search_fii_offers(tipo_fii: str = "", score_minimo: int = 0, limite: int = 5) -> str:
    """
    Busca, filtra e ordena ofertas de FIIs consolidadas.
    Parâmetros:
      - tipo_fii: 'Tijolo' ou 'Papel' (vazio busca ambos)
      - score_minimo: Filtra por qualidade mínima de atratividade (0 a 100)
    Retorna uma tabela markdown limpa com preços, yield, P/VP, score e links oficiais.
    """
    if _df_merged.empty:
        return "Banco de dados consolidado indisponível."

    df = _df_merged.copy()

    # Aplica filtro de tipo de FII (case-insensitive)
    if tipo_fii:
        tipo_limpo = tipo_fii.strip().lower()
        df = df[df["tipo_fii"].fillna("").str.lower().str.contains(tipo_limpo)]

    # Aplica filtro de Score BTG
    if score_minimo > 0:
        df["score_oferta_num"] = pd.to_numeric(df["score_oferta"], errors="coerce").fillna(0)
        df = df[df["score_oferta_num"] >= score_minimo]

    if df.empty:
        return "Nenhuma oferta localizada que corresponda aos filtros informados."

    # Ordena pelo melhor score (atratividade técnica)
    df["score_sort"] = pd.to_numeric(df["score_oferta"], errors="coerce").fillna(0)
    df = df.sort_values("score_sort", ascending=False).head(limite)

    cols = [
        "Numero_Requerimento", "Nome_Emissor", "tipo_fii", "preco_emissao",
        "pvp_oferta", "dy_projetado_pct", "score_oferta", "link_oferta_cvm"
    ]
    
    resultado = df[cols].copy()
    resultado.columns = ["Req CVM", "Fundo Imobiliário", "Segmento", "Preço", "P/VP", "DY Proj (%)", "Score BTG", "Link Oficial CVM"]

    tabela_md = resultado.to_markdown(index=False)
    return f"Principais ofertas localizadas no mercado (Ordenadas por Score de Atratividade):\n\n{tabela_md}"


@tool
def query_specific_offer_details(termo_busca: str) -> str:
    """
    Busca detalhes minuciosos e qualitativos de uma única oferta específica usando o nome do Fundo ou o ID do Requerimento.
    Retorna dados operacionais, pipeline de ativos, vacância/LTV, custos de estruturação, taxas e fatores de risco.
    """
    if _df_merged.empty:
        return "Base consolidada indisponível."

    # Remove acentos para busca flexível
    def clean_text(s):
        if pd.isna(s): return ""
        return "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn").lower().strip()

    termo_limpo = clean_text(termo_busca)
    
    df = _df_merged.copy()
    df["busca_emissor"] = df["Nome_Emissor"].apply(clean_text)
    df["busca_req"] = df["Numero_Requerimento"].apply(clean_text)

    # Procura por ID ou Nome do Emissor
    match_df = df[(df["busca_emissor"].str.contains(termo_limpo)) | (df["busca_req"] == termo_limpo)]

    if match_df.empty:
        return f"Não foi possível localizar nenhuma oferta sob o termo '{termo_busca}'."

    # Pega o primeiro match
    oferta = match_df.iloc[0]
    tipo = str(oferta.get("tipo_fii", "Tijolo"))

    relatorio = [
        f"🏛️ DETALHAMENTO DE OFERTA: {oferta['Nome_Emissor']} (Req CVM: {oferta['Numero_Requerimento']})",
        f"=========================================================================",
        f"• Segmento FII:          {tipo}",
        f"• Coordenador Líder:     {oferta.get('Nome_Lider', 'Não Informado')}",
        f"• Preço de Emissão:      {oferta.get('preco_emissao', 'N/A')}",
        f"• Valor Patrimonial:     {oferta.get('valor_patrimonial_cota', 'N/A')} | P/VP: {oferta.get('pvp_oferta', 'N/A')}",
        f"• Dividend Yield Proj:   {oferta.get('dy_projetado_pct', 'N/A')}% a.a.",
        f"• Taxas da Emissão:      Adm: {oferta.get('taxa_administracao', 'N/A')} | Perf: {oferta.get('taxa_performance', 'N/A')}",
        f"• Custo de Distribuição: {oferta.get('custo_total_oferta_pct', 'N/A')}% do montante captado",
        f"• Montante Máximo:       {oferta.get('montante_total', 'N/A')}",
        f"• Lote Base / Adicional: Base: {oferta.get('lote_base', 'N/A')} | Adicional: {oferta.get('lote_adicional', 'N/A')}",
        f"• Regime / Cronograma:   {oferta.get('regime_distribuicao', 'N/A')} | {oferta.get('cronograma_resumido', 'N/A')}",
        f"• Destinação Recursos:   {oferta.get('destinacao_recursos', 'N/A')}",
        f"• Pipeline de Ativos:    {oferta.get('pipeline_ativos', 'N/A')}",
    ]

    if tipo == "Tijolo":
        relatorio.extend([
            f"\n📊 Métricas Operacionais (Tijolo):",
            f"  - Vacância Física:     {oferta.get('vacancia_fisica_pct', 'N/A')}% | Financeira: {oferta.get('vacancia_financeira_pct', 'N/A')}%",
            f"  - Prazo Médio Contratos:{oferta.get('prazo_medio_contratos', 'N/A')}",
            f"  - Perfil Contratos:     {oferta.get('tipo_contrato', 'N/A')} | Indexador: {oferta.get('indexador_predominante', 'N/A')}",
            f"  - Principal Inquilino:  {oferta.get('maior_inquilino_pct', 'N/A')}",
        ])
    else:
        relatorio.extend([
            f"\n📊 Métricas de Crédito (Papel/CRIs):",
            f"  - LTV Médio Carteira:   {oferta.get('ltv_medio_pct', 'N/A')}%",
            f"  - Indexador Carteira:   {oferta.get('indexador_carteira_papel', 'N/A')}",
            f"  - Maior Devedor:        {oferta.get('maior_devedor_pct', 'N/A')}",
            f"  - Rating Médio CRIs:    {oferta.get('rating_medio_cris', 'N/A')}",
            f"  - Garantias do Lastro:  {oferta.get('garantias_cri', 'N/A')}",
        ])

    relatorio.extend([
        f"\n⚠️ Análise de Risco & Links:",
        f"  - Fatores de Risco:     {oferta.get('fatores_risco_principais', 'N/A')}",
        f"  - Concentração:         Geográfica: {oferta.get('concentracao_geografica', 'N/A')} | Indexador: {oferta.get('concentracao_indexador', 'N/A')}",
        f"  - Score BTG de Crédito: {oferta.get('score_oferta', 'N/A')}/100",
        f"  - Link do Portal CVM:   {oferta.get('link_oferta_cvm', 'N/A')}",
        f"  - Download do PDF:      {oferta.get('link_pdf_download', 'N/A')}"
    ])

    return "\n".join(relatorio)


@tool
def compare_fii_offers(lista_requerimentos: list[str]) -> str:
    """
    Faz uma tabela de comparação lado a lado de 2 a 3 ofertas de FIIs de forma direta.
    Parâmetro: lista de códigos de requerimento (ex: ['392', '401', '402'])
    """
    if _df_merged.empty:
        return "Base consolidada indisponível."

    reqs = [str(r).strip() for r in lista_requerimentos]
    df = _df_merged[_df_merged["Numero_Requerimento"].isin(reqs)].copy()

    if df.empty:
        return "Nenhum dos requerimentos informados foi localizado para comparação."

    # Configura o dataframe para comparação transposta
    df_compare = df[[
        "Numero_Requerimento", "Nome_Emissor", "tipo_fii", "preco_emissao", "pvp_oferta",
        "dy_projetado_pct", "custo_total_oferta_pct", "montante_total", "score_oferta"
    ]].copy()

    df_compare.columns = [
        "Req CVM", "Fundo", "Tipo", "Preço", "P/VP", "Yield Proj", "Custo Emissão", "Montante Total", "Score BTG"
    ]

    # Transpõe para exibição vertical comparativa lado a lado (padrão BTG)
    df_transposed = df_compare.set_index("Fundo").T
    tabela_md = df_transposed.to_markdown()

    return f"Comparação lado a lado das ofertas solicitadas:\n\n{tabela_md}"


# ─── Construção do Agente ReAct (Gemini 2.5 Flash) ───────────────────────────

def build_market_agent():
    """Instancia o agente de chat configurado com as ferramentas e o Gemini."""
    if not os.environ.get("GOOGLE_API_KEY"):
        raise EnvironmentError("[ERRO] Variável de ambiente GEMINI_API_KEY ou GOOGLE_API_KEY não localizada.")

    # Inicializa o Gemini 2.5 Flash de produção estável via LangChain
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0.0
    )

    tools = [
        market_macro_indicators,
        search_fii_offers,
        query_specific_offer_details,
        compare_fii_offers
    ]

    system_prompt = """Você é o Analista de Crédito e Inteligência de Mercado Sênior do BTG Pactual.
Sua missão é dar respostas precisas, altamente corporativas, lógicas e técnicas sobre o mercado de ofertas primárias de Fundos Imobiliários (FIIs).

Fontes de dados vivas que você possui (carregadas localmente via Python):
1. Base Consolidada CVM + Prospectos (modern_offers_rcvm160.csv + prospectos_extraidos.csv):
   - Contém metadados de emissores, coordenadores, preços, P/VP, dividend yield, custos de captação, vacância, LTV de CRIs e o exclusivo Score BTG de atratividade de crédito de cada oferta (0 a 100).
2. Indicadores Macro do Banco Central: Selic, CDI e IPCA para servir de benchmark de comparação.

Diretrizes de Comportamento & Tom:
- Adote um tom de banco de atacado/private banking: analítico, sóbrio, objetivo e focado em risco-retorno.
- Nunca faça suposições ("acho", "talvez"). Se a informação não estiver na base, responda com clareza técnica de que o dado não foi declarado no prospecto (null).
- Sempre invoque as ferramentas adequadas de dados antes de responder a perguntas sobre emissores, taxas, rankings ou comparações.
- Quando exibir tabelas de dados estruturados gerados pelas ferramentas, repasse-as integralmente e limpas no formato Markdown recebido.

Regras de Negócio Importantes:
1. Ao sugerir ofertas de investimento, ordene-as prioritariamente usando o 'Score BTG' (atratividade técnica calculada pelo nosso algoritmo de análise de crédito).
2. Use a ferramenta 'query_specific_offer_details' sempre que o usuário pedir detalhes profundos de uma oferta (como carteira de ativos, inquilinos, garantias reais de CRIs, riscos imobiliários ou links).
3. Caso o usuário queira confrontar ou comparar mais de uma oferta, use a ferramenta 'compare_fii_offers'.
4. Seja direto na resposta: ignore frases como "pesquisando na base de dados...". Traga a resposta técnica imediatamente.
"""

    return create_react_agent(llm, tools, prompt=system_prompt)


# ─── Execução e Demonstração do Agente ───────────────────────────────────────

if __name__ == "__main__":
    # Demonstração rápida de teste local do agente caso executado de forma isolada
    try:
        agent = build_market_agent()
        
        # Teste de prompt simulando uma pergunta clássica de um assessor do BTG
        pergunta = "Quais são os FIIs de Tijolo com os melhores scores disponíveis na base e compare os dois primeiros?"
        print(f"\n💬 Pergunta do Usuário: '{pergunta}'\n")
        
        inputs = {"messages": [("user", pergunta)]}
        for chunk in agent.stream(inputs, stream_mode="values"):
            # Exibe o fluxo de mensagens do agente ReAct
            if "messages" in chunk and chunk["messages"]:
                ultima_msg = chunk["messages"][-1]
                if ultima_msg.content.strip():
                    print(f"🤖 {ultima_msg.type.upper()}: {ultima_msg.content}\n")
                    
    except Exception as e:
        print(f"❌ Erro na execução do Agente de Chat: {e}")