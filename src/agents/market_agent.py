#!/usr/bin/env python3
"""
market_agent.py
---------------
FastAPI + LangGraph agent para o BTG Intelligence Partner.

Uso:
    uvicorn src.agents.market_agent:app --reload --port 8000
"""

import asyncio
import json
import os
import unicodedata
import warnings
from functools import partial
from pathlib import Path

import pandas as pd
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_core.tools import tool
from langchain_groq import ChatGroq

with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    from langgraph.prebuilt import create_react_agent

# ── Caminhos ───────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR     = PROJECT_ROOT / "data"

# Fallback caso __file__ resolva errado (ex: alguns configs de uvicorn)
if not (DATA_DIR / "cvm").exists():
    PROJECT_ROOT = Path.cwd()
    DATA_DIR     = PROJECT_ROOT / "data"

load_dotenv(PROJECT_ROOT / ".env")

# ── Bases de dados ─────────────────────────────────────────────────────────

def _load_csv(path: Path, **kwargs) -> pd.DataFrame:
    if path.exists():
        return pd.read_csv(path, **kwargs)
    return pd.DataFrame()

# 1. Ofertas CVM regulatórias
_df_cvm = _load_csv(DATA_DIR / "cvm" / "modern_offers_rcvm160.csv", sep=";")
if not _df_cvm.empty:
    _df_cvm["Data_Registro"] = pd.to_datetime(_df_cvm["Data_Registro"], errors="coerce")
    _df_cvm["Ano"] = _df_cvm["Data_Registro"].dt.year

# 2. Prospectos de FII extraídos dos PDFs
_df_prospectos = _load_csv(DATA_DIR / "cvm" / "prospectos_extraidos.csv", sep=";", dtype=str)

# 3. Renda fixa recomendada pelas corretoras
_df_renda_fixa = _load_csv(DATA_DIR / "cvm" / "renda_fixa_recomendada.csv", sep=";", dtype=str)

# 4. Indicadores macro do Banco Central
_macro: dict = {}
_macro_path = DATA_DIR / "macro" / "daily_indicators.json"
if _macro_path.exists():
    with open(_macro_path, encoding="utf-8") as f:
        _macro = json.load(f)


def _clean(s) -> str:
    """Remove acentos e normaliza para comparação case-insensitive."""
    if pd.isna(s):
        return ""
    return (
        unicodedata.normalize("NFD", str(s))
        .encode("ascii", "ignore")
        .decode()
        .strip()
        .lower()
    )


def _to_float(val) -> float | None:
    try:
        return float(str(val).replace(",", ".").replace("%", "").strip())
    except Exception:
        return None


# ── Tools ──────────────────────────────────────────────────────────────────

@tool
def market_macro_indicators() -> str:
    """
    Retorna os indicadores macroeconômicos oficiais do Brasil:
    Meta Selic, CDI e IPCA acumulado 12 meses (Fonte: Banco Central).
    Use SEMPRE que a pergunta envolver taxas básicas, inflação ou cenário macro.
    """
    if not _macro:
        return "Indicadores macroeconômicos não disponíveis no momento."
    return (
        "INDICADORES MACROECONÔMICOS (Fonte: Banco Central):\n"
        f"- Meta Taxa Selic : {_macro.get('selic_meta', 'N/D')}% a.a.\n"
        f"- CDI             : {_macro.get('cdi_daily',  'N/D')}% a.a.\n"
        f"- IPCA (12 meses) : {_macro.get('ipca_12m',   'N/D')}%"
    )


@tool
def cvm_market_summary() -> str:
    """
    Resumo estatístico das emissões registradas na CVM (RCVM 160):
    volume total, top 5 tipos de ativo e top 5 coordenadores líderes.
    Use para dar um panorama geral do mercado primário.
    """
    if _df_cvm.empty:
        return "Base de dados CVM vazia ou não localizada."

    total  = len(_df_cvm)
    volume = _df_cvm["Valor_Total_Registrado"].sum() / 1e9

    por_tipo = (
        _df_cvm.groupby("Valor_Mobiliario")["Valor_Total_Registrado"]
        .agg(qtd="count", volume_bi=lambda x: x.sum() / 1e9)
        .sort_values("volume_bi", ascending=False)
        .head(5)
    )
    por_lider = (
        _df_cvm.groupby("Nome_Lider")["Valor_Total_Registrado"]
        .agg(qtd="count", volume_bi=lambda x: x.sum() / 1e9)
        .sort_values("volume_bi", ascending=False)
        .head(5)
    )
    return (
        f"RESUMO CVM (RCVM 160):\n"
        f"Total de ofertas: {total:,} | Volume total: R$ {volume:.1f}B\n\n"
        f"TOP 5 POR TIPO DE ATIVO:\n{por_tipo.to_markdown()}\n\n"
        f"TOP 5 COORDENADORES LÍDERES:\n{por_lider.to_markdown()}"
    )


@tool
def search_cvm_offers(
    tipo: str  = "",
    lider: str = "",
    ano: int   = 0,
    limite: int = 5,
) -> str:
    """
    Busca ofertas específicas na base regulatória da CVM.
    Parâmetros:
      - tipo  : tipo de ativo (ex: 'FII', 'CRI', 'Debênture')
      - lider : nome do banco coordenador (ex: 'BTG', 'XP', 'Itaú')
      - ano   : ano de registro (ex: 2024, 2025)
      - limite: máximo de resultados (padrão 5)
    """
    if _df_cvm.empty:
        return "Base CVM indisponível."

    df = _df_cvm.copy()
    if tipo:
        df = df[df["Valor_Mobiliario"].fillna("").apply(lambda x: _clean(tipo) in _clean(x))]
    if lider:
        df = df[df["Nome_Lider"].fillna("").apply(lambda x: _clean(lider) in _clean(x))]
    if ano:
        df = df[df["Ano"] == ano]

    if df.empty:
        return "Nenhuma oferta encontrada com os filtros informados."

    cols = ["Data_Registro", "Valor_Mobiliario", "Nome_Emissor", "Nome_Lider", "Valor_Total_Registrado"]
    res  = df[cols].sort_values("Data_Registro", ascending=False).head(limite).copy()
    res["Valor_Total_Registrado"] = res["Valor_Total_Registrado"].apply(
        lambda v: f"R$ {v/1e6:.1f}M" if pd.notna(v) else "N/D"
    )
    res["Data_Registro"] = res["Data_Registro"].dt.strftime("%d/%m/%Y")
    res.columns = ["Data", "Tipo de Ativo", "Emissor", "Coordenador Líder", "Volume"]
    return f"Ofertas encontradas na CVM:\n\n{res.to_markdown(index=False)}"


@tool
def search_prospectos_fii(
    tipo_fii: str  = "",
    min_dy: float  = 0,
    max_pvp: float = 0,
    limite: int    = 5,
) -> str:
    """
    Busca prospectos de FII extraídos dos PDFs da CVM.
    Parâmetros:
      - tipo_fii: filtro por tipo (ex: 'tijolo', 'papel', 'hibrido')
      - min_dy  : DY mínimo em % (ex: 8.0 para DY >= 8%)
      - max_pvp : P/VP máximo (ex: 1.0 para P/VP <= 1)
      - limite  : máximo de resultados (padrão 5)
    Use para perguntas sobre características de fundos, scores, vacância, LTV, taxas.
    """
    if _df_prospectos.empty:
        return "Base de prospectos vazia. Execute o prospect_agent.py para popular os dados."

    df = _df_prospectos.copy()

    if tipo_fii:
        col = df.get("tipo_fii", pd.Series(dtype=str))
        df  = df[col.fillna("").str.lower().str.contains(_clean(tipo_fii))]

    if min_dy > 0:
        df = df[df["dy_projetado_pct"].apply(_to_float).fillna(0) >= min_dy]

    if max_pvp > 0:
        df = df[df["pvp_oferta"].apply(_to_float).fillna(999) <= max_pvp]

    if df.empty:
        return "Nenhum prospecto encontrado com os filtros informados."

    cols = [c for c in [
        "arquivo_pdf", "tipo_fii", "tipo_ativo_alvo", "preco_emissao",
        "pvp_oferta", "dy_projetado_pct", "taxa_administracao",
        "vacancia_fisica_pct", "ltv_medio_pct", "localizacao_geografica",
    ] if c in df.columns]

    total = len(df)
    res   = df[cols].head(limite)
    return (
        f"Prospectos de FII ({total} encontrados, exibindo {min(limite, total)}):\n\n"
        f"{res.to_markdown(index=False)}"
    )


@tool
def fii_market_stats() -> str:
    """
    Panorama geral dos prospectos de FII disponíveis:
    total de fundos, distribuição por tipo, DY médio, P/VP médio e vacância média.
    Use quando o usuário pedir visão geral do mercado de FII.
    """
    if _df_prospectos.empty:
        return "Base de prospectos vazia. Execute o prospect_agent.py para popular os dados."

    def num_col(col: str) -> pd.Series:
        return pd.to_numeric(
            _df_prospectos.get(col, pd.Series(dtype=str))
            .str.replace(",", ".", regex=False)
            .str.replace("%", "", regex=False)
            .str.strip(),
            errors="coerce",
        )

    total    = len(_df_prospectos)
    por_tipo = _df_prospectos.get("tipo_fii", pd.Series(dtype=str)).value_counts().to_dict()
    dy_med   = num_col("dy_projetado_pct").mean()
    pvp_med  = num_col("pvp_oferta").mean()
    vac_med  = num_col("vacancia_fisica_pct").mean()

    return "\n".join([
        f"PANORAMA DOS PROSPECTOS DE FII ({total} fundos analisados):",
        "",
        f"Distribuição por tipo  : {por_tipo}",
        f"DY médio projetado     : {dy_med:.2f}% a.a."  if pd.notna(dy_med)  else "DY médio: N/D",
        f"P/VP médio da oferta   : {pvp_med:.3f}"        if pd.notna(pvp_med) else "P/VP médio: N/D",
        f"Vacância física média  : {vac_med:.1f}%"       if pd.notna(vac_med) else "Vacância média: N/D",
    ])


@tool
def list_market_portfolios(instituicao: str = "") -> str:
    """
    Lista carteiras e taxas de renda fixa recomendadas pelas corretoras
    (XP, BTG, Rico, Genial, etc.) extraídas da internet.
    Parâmetro opcional: instituicao (ex: 'XP', 'BTG') para filtrar por corretora.
    Use SEMPRE que o usuário perguntar sobre taxas de mercado ou o que concorrentes estão oferecendo.
    """
    if not _df_renda_fixa.empty:
        df = _df_renda_fixa.copy()
        if instituicao:
            df = df[
                df.get("institution", pd.Series(dtype=str))
                .fillna("").str.lower()
                .str.contains(_clean(instituicao))
            ]
        if df.empty:
            return f"Nenhuma carteira encontrada para '{instituicao}'."

        cols = [c for c in [
            "institution", "reference_date", "asset_issuer",
            "index_type", "gross_rate", "maturity_date", "tax_exempt",
        ] if c in df.columns]
        return f"Taxas recomendadas de mercado ({len(df)} ativos):\n\n{df[cols].to_markdown(index=False)}"

    # Fallback: JSONs individuais na pasta portfolios/
    portfolio_dir = DATA_DIR / "portfolios"
    jsons = list(portfolio_dir.glob("*.json")) if portfolio_dir.exists() else []
    if not jsons:
        return (
            "Nenhuma carteira disponível. "
            "Execute web_tax_extractor.py para popular os dados."
        )

    linhas = ["CARTEIRAS RECOMENDADAS DE MERCADO:"]
    for f in jsons:
        with open(f, encoding="utf-8") as fp:
            c = json.load(fp)
        if instituicao and _clean(instituicao) not in _clean(c.get("institution", "")):
            continue
        linhas.append(f"\n🏛️ {c['institution']} — {c.get('reference_date','')}")
        linhas.append(f"   Estratégia: {c.get('strategy_summary','')}")
        for i, t in enumerate(c.get("assets", []), 1):
            isento = " [IR ISENTO]" if t.get("tax_exempt") else ""
            linhas.append(
                f"  {i:2d}. {t['asset_issuer']}{isento}"
                f" | {t['gross_rate']}"
                f" | venc. {t['maturity_date']}"
            )
    return "\n".join(linhas)


@tool
def compare_fii_vs_renda_fixa() -> str:
    """
    Compara o DY médio dos FIIs com as taxas de renda fixa recomendadas pelas corretoras
    e os benchmarks do Banco Central (CDI, IPCA).
    Use quando o usuário perguntar se vale a pena investir em FII ou renda fixa.
    """
    linhas = ["COMPARAÇÃO: FII vs RENDA FIXA\n"]

    if not _df_prospectos.empty:
        dy_fii = pd.to_numeric(
            _df_prospectos.get("dy_projetado_pct", pd.Series(dtype=str))
            .str.replace(",", ".", regex=False)
            .str.replace("%", "", regex=False)
            .str.strip(),
            errors="coerce",
        ).mean()
        if pd.notna(dy_fii):
            linhas.append(f"FII — DY médio projetado (ofertas primárias): {dy_fii:.2f}% a.a.")

    if not _df_renda_fixa.empty and "gross_rate" in _df_renda_fixa.columns:
        linhas.append("\nRENDA FIXA (taxas recomendadas pelas corretoras):")
        sample = _df_renda_fixa[
            ["institution", "asset_issuer", "index_type", "gross_rate", "tax_exempt"]
        ].head(8)
        linhas.append(sample.to_markdown(index=False))

    if _macro:
        linhas.append(
            f"\nBENCHMARK (Banco Central):\n"
            f"- CDI    : {_macro.get('cdi_daily','N/D')}% a.a.\n"
            f"- IPCA 12m: {_macro.get('ipca_12m','N/D')}%"
        )

    return "\n".join(linhas) if len(linhas) > 1 else "Dados insuficientes para comparação."


# ── System Prompt ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
Você é o BTG Intelligence Partner — analista sênior de crédito e inteligência \
de mercado do BTG Pactual.

FONTES DE DADOS REAIS DISPONÍVEIS (use-as antes de qualquer resposta numérica):
1. market_macro_indicators  → Selic, CDI, IPCA do Banco Central
2. cvm_market_summary       → Panorama geral de emissões da CVM
3. search_cvm_offers        → Busca de ofertas específicas na CVM
4. search_prospectos_fii    → Prospectos de FII (DY, P/VP, vacância, LTV, tipo)
5. fii_market_stats         → Estatísticas gerais da base de FII
6. list_market_portfolios   → Taxas recomendadas pelas corretoras (XP, BTG, Rico…)
7. compare_fii_vs_renda_fixa → Comparação FII vs renda fixa com benchmark

REGRAS ABSOLUTAS:
- NUNCA responda com dados numéricos sem chamar uma tool primeiro.
- NUNCA invente taxas, yields, volumes ou nomes de fundos.
- Sempre repasse tabelas Markdown das tools integralmente, sem resumir.
- Responda em Português do Brasil com tom técnico e objetivo.
- Seja direto: sem frases como "Vou pesquisar para você".

MAPEAMENTO PERGUNTA → TOOL:
- Macro, Selic, CDI, IPCA          → market_macro_indicators
- Panorama CVM, volume, emissões   → cvm_market_summary
- Oferta específica, banco, emissor → search_cvm_offers
- FII específico, DY, P/VP, tijolo  → search_prospectos_fii
- Visão geral FII, médias           → fii_market_stats
- Taxas de corretoras, concorrentes → list_market_portfolios
- FII vs renda fixa, comparação     → compare_fii_vs_renda_fixa
"""


# ── Agente ─────────────────────────────────────────────────────────────────

_agent = None

def get_agent():
    global _agent
    if _agent is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise EnvironmentError("GROQ_API_KEY não configurada no .env")
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
        _agent = create_react_agent(llm, [
            market_macro_indicators,
            cvm_market_summary,
            search_cvm_offers,
            search_prospectos_fii,
            fii_market_stats,
            list_market_portfolios,
            compare_fii_vs_renda_fixa,
        ], prompt=SYSTEM_PROMPT)
    return _agent


# ── FastAPI ────────────────────────────────────────────────────────────────

app = FastAPI(title="BTG Intelligence API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class ChatResponse(BaseModel):
    response: str
    sources_used: list[str] = []


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    agent = get_agent()

    # Monta histórico (últimas 6 trocas para contexto)
    messages = [
        (m["role"], m["content"])
        for m in req.history[-6:]
    ]
    messages.append(("user", req.message))

    # Roda o agente síncrono numa thread separada
    # Evita bloquear o event loop do FastAPI durante chamadas longas ao Groq
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        partial(agent.invoke, {"messages": messages}),
    )

    # ── Extrai a resposta final ────────────────────────────────────────────
    # O LangGraph devolve uma lista de mensagens; a última AIMessage sem
    # tool_calls pendentes é a resposta final para o usuário.
    response_text = ""
    for msg in reversed(result["messages"]):
        if msg.__class__.__name__ != "AIMessage":
            continue
        tool_calls = getattr(msg, "tool_calls", None)
        has_pending = bool(tool_calls)          # lista não vazia = ainda chamando tool
        has_text    = bool(str(msg.content).strip())
        if has_text and not has_pending:
            response_text = msg.content
            break

    # ── Extrai quais tools foram usadas ───────────────────────────────────
    sources: list[str] = []
    for msg in result["messages"]:
        cls = msg.__class__.__name__
        if cls == "ToolMessage":
            name = getattr(msg, "name", "") or getattr(msg, "tool_name", "")
            if name and name not in sources:
                sources.append(name)
        elif cls == "AIMessage":
            for tc in getattr(msg, "tool_calls", []) or []:
                name = tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", "")
                if name and name not in sources:
                    sources.append(name)

    return ChatResponse(
        response=response_text or "Não foi possível gerar uma resposta.",
        sources_used=sources,
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "data": {
            "cvm_offers":  len(_df_cvm),
            "prospectos":  len(_df_prospectos),
            "renda_fixa":  len(_df_renda_fixa),
            "macro":       bool(_macro),
        },
    }


if __name__ == "__main__":
    uvicorn.run("market_agent:app", host="0.0.0.0", port=8000, reload=True)