#!/usr/bin/env python3
"""
prospect_agent.py
-----------------
Agente de extração de Prospectos CVM usando Gemini com PDF nativo.

Estratégia principal: envia o PDF diretamente para o Gemini via File API.
O modelo lê o documento com visão nativa — tabelas, colunas e formatação
são interpretados corretamente, sem perda de estrutura pelo pdfplumber.

Fallback automático: se o upload falhar, extrai texto com pdfplumber
e envia como texto (comportamento anterior).

Instalação:
    pip install google-genai pdfplumber

Uso:
    python prospect_agent.py                 # processa PDFs novos
    python prospect_agent.py --apagar-pdfs   # apaga PDF após processar
    python prospect_agent.py --dry-run       # lista PDFs sem chamar API
    python prospect_agent.py --reprocessar   # reprocessa já processados
    python prospect_agent.py --modo texto    # força modo texto (sem upload)

Variável de ambiente:
    export GEMINI_API_KEY="AIzaSy..."
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("[ERRO] Execute: pip install google-genai")
    sys.exit(1)

try:
    import pdfplumber
    PDFPLUMBER_OK = True
except ImportError:
    PDFPLUMBER_OK = False

# ── Caminhos do projeto ────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
PDF_DIR      = PROJECT_ROOT / "data" / "cvm" / "pdf_prospectos"
CSV_OUT      = PROJECT_ROOT / "data" / "cvm" / "prospectos_extraidos.csv"

# ── Modelo ─────────────────────────────────────────────────────────────────
MODELO = "gemini-2.0-flash"
# Limite de chars no modo texto (fallback) — Gemini 2.0 Flash: 1M tokens
MAX_CHARS_TEXTO = 400_000

# ── Campos a extrair ───────────────────────────────────────────────────────
CAMPOS = {
    # Precificação e retorno
    "preco_emissao":                    "Preço de emissão por cota (R$). Ex: 'R$ 100,00'",
    "valor_patrimonial_cota":           "Valor patrimonial por cota (VP/C) na data de referência (R$)",
    "pvp_oferta":                       "P/VP = Preço de emissão ÷ VP/C. Número decimal. Ex: 0.97",
    "dy_projetado_pct":                 "DY projetado anual sobre o preço de emissão. Número decimal. Ex: 9.5",
    "taxa_administracao":               "Taxa de administração anual. Ex: '0,75% a.a.'",
    "taxa_performance":                 "Taxa de performance com benchmark. Ex: '20% sobre IFIX+2%'",
    "custo_total_oferta_pct":           "Custo total da oferta (comissões + despesas) como % do montante",

    # Estrutura da oferta
    "montante_total":                   "Montante total máximo da oferta (R$)",
    "montante_minimo":                  "Montante mínimo para não cancelamento (R$)",
    "lote_base":                        "Montante do lote base / oferta inicial (R$)",
    "lote_adicional":                   "Lote adicional ou opção de acréscimo (R$)",
    "numero_cotas_ofertadas":           "Número total de cotas ofertadas",
    "numero_emissao":                   "Número ordinal da emissão. Ex: 1, 2, 3",
    "prazo_oferta_dias":                "Prazo de duração da oferta em dias corridos",
    "cronograma_resumido":              "Datas-chave: início, encerramento, liquidação. Ex: 'Início: 10/02/2026 | Encerramento: 10/04/2026'",
    "condicao_encerramento_antecipado": "Condições para encerramento antecipado da oferta",
    "direito_preferencia":              "Cotistas têm direito de preferência? (sim/não) e prazo em dias",
    "regime_distribuicao":              "Regime: 'melhores esforços' ou 'garantia firme'",
    "data_primeiro_rendimento":         "Data prevista do primeiro pagamento de rendimentos",

    # Tipo e portfólio
    "tipo_fii":                         "Tipo de FII: tijolo, papel, híbrido ou FOF",
    "tipo_ativo_alvo":                  "Tipo de ativo principal. Ex: galpões logísticos, CRI IPCA, lajes corporativas",
    "localizacao_geografica":           "Estados/cidades dos ativos. Ex: 'SP (70%), RJ (30%)'",
    "destinacao_recursos":              "Destinação detalhada: % para aquisição, % obras, % CRI, % caixa, etc.",
    "pipeline_ativos":                  "Ativos-alvo ou pipeline: nome, localização, tipo e valor estimado",

    # Qualidade operacional — tijolo
    "vacancia_fisica_pct":              "Vacância física atual (%). null se FII de papel",
    "vacancia_financeira_pct":          "Vacância financeira atual (%). null se FII de papel",
    "prazo_medio_contratos":            "Prazo médio ponderado dos contratos de locação (anos ou meses)",
    "tipo_contrato":                    "Tipo predominante: típico, atípico, built-to-suit, sale-leaseback",
    "indexador_predominante":           "Indexador dos contratos: IPCA, IGP-M, CDI, prefixado",
    "maior_inquilino_pct":              "Maior inquilino e % da receita. Ex: 'Ambev — 28%'",
    "hedge_cambial":                    "Existe hedge cambial? (sim/não/não aplicável) e detalhes",

    # Qualidade de crédito — papel
    "ltv_medio_pct":                    "LTV médio da carteira de CRIs (%). null se FII de tijolo",
    "indexador_carteira_papel":         "Composição: % IPCA vs % CDI vs outros. null se tijolo",
    "maior_devedor_pct":                "Maior devedor/emissor de CRI e % na carteira. null se tijolo",
    "rating_medio_cris":                "Rating médio dos CRIs em carteira. null se tijolo",
    "garantias_cri":                    "Garantias dos CRIs: alienação fiduciária, fiança, aval. null se tijolo",

    # Histórico
    "rendimentos_ultimos_12m":          "Rendimentos pagos nos últimos 12 meses (R$/cota). null se 1ª emissão",
    "cotacao_mercado_ref":              "Cotação na B3 na data de referência (R$). null se 1ª emissão",
    "patrimonio_liquido_atual":         "Patrimônio líquido antes da oferta (R$). null se 1ª emissão",
    "pvp_historico_medio":              "P/VP médio histórico dos últimos 12 meses. null se 1ª emissão",

    # Risco
    "fatores_risco_principais":         "3 a 5 principais fatores de risco, separados por ' | '",
    "concentracao_geografica":          "Risco de concentração geográfica mencionado",
    "concentracao_indexador":           "Risco de concentração em único indexador mencionado",
}

# ── System prompt ──────────────────────────────────────────────────────────
SYSTEM_PROMPT = """\
Você é um analista sênior de FII (Fundos de Investimento Imobiliário) brasileiro.
Sua tarefa é extrair dados de Prospectos de Oferta Pública (CVM Resolução 160).

REGRAS — leia com atenção:
1. Extraia APENAS dados explicitamente presentes no documento. NUNCA invente ou calcule.
2. Dado não encontrado → null (valor JSON nulo, sem aspas).
3. Retorne EXCLUSIVAMENTE um objeto JSON válido. Sem texto antes ou depois. Sem markdown.
4. Monetário: string com "R$". Ex: "R$ 100,00" ou "R$ 1.500.000.000,00"
5. Percentuais simples: número decimal. Ex: 9.5 (não "9,5%")
6. Percentuais com contexto textual: string. Ex: "0,75% a.a. sobre o PL"
7. Listas: itens separados por " | " numa única string
8. FII de tijolo → campos de papel = null. FII de papel → campos de tijolo = null.

ONDE PROCURAR cada bloco no prospecto:
- Preço, VP/C, P/VP → seção "Preço de Emissão" ou tabela de características da cota
- DY projetado → seção de rentabilidade estimada ou estudo de viabilidade  
- Taxas → seção "Taxas e Encargos" ou "Remuneração do Administrador"
- Montantes e lotes → seção "Características da Oferta" ou tabela de distribuição
- Cronograma → tabela "Cronograma Tentativo"
- Destino dos recursos → seção "Destinação dos Recursos"
- Vacância, contratos → seção "Portfólio" ou "Imóveis Integrantes"
- LTV, rating, garantias → seção "Carteira" ou "Ativos Alvo" (papel)
- Fatores de risco → seção "Fatores de Risco"
- Histórico → seção "Informações sobre o Fundo" ou "Desempenho Histórico"
"""


def montar_prompt_texto(texto: str, nome: str) -> str:
    campos_desc = "\n".join(f'  "{k}": "{v}"' for k, v in CAMPOS.items())
    return (
        f"Analise o Prospecto '{nome}' abaixo e preencha o JSON:\n\n"
        f"{{\n{campos_desc}\n}}\n\n"
        f"TEXTO DO PROSPECTO:\n{texto}\n\n"
        "Retorne SOMENTE o JSON. Sem markdown."
    )


def montar_prompt_pdf(nome: str) -> str:
    campos_desc = "\n".join(f'  "{k}": "{v}"' for k, v in CAMPOS.items())
    return (
        f"Analise o Prospecto de FII '{nome}' (PDF em anexo) e preencha o JSON:\n\n"
        f"{{\n{campos_desc}\n}}\n\n"
        "Retorne SOMENTE o JSON. Sem markdown."
    )


# ── Extração de texto fallback (pdfplumber) ────────────────────────────────

ANCORAS = [re.compile(p, re.IGNORECASE) for p in [
    r"preço de emissão", r"valor patrimonial", r"pvp", r"dy projetado",
    r"taxa de administração", r"taxa de performance", r"custos da oferta",
    r"características da oferta", r"montante", r"lote", r"cronograma",
    r"direito de preferência", r"destinação dos recursos", r"portfólio",
    r"vacância", r"contratos de locação", r"inquilinos", r"ltv",
    r"loan.to.value", r"fatores de risco", r"patrimônio líquido",
    r"histórico de rendimentos", r"carteira", r"pipeline", r"garantias",
]]


def extrair_texto_pdf_fallback(caminho: Path, max_chars: int = MAX_CHARS_TEXTO) -> str:
    if not PDFPLUMBER_OK:
        print("    [ERRO] pdfplumber não instalado. Execute: pip install pdfplumber")
        return ""

    paginas = []
    try:
        with pdfplumber.open(caminho) as pdf:
            print(f"    PDF aberto: {len(pdf.pages)} páginas (modo texto)")
            for i, page in enumerate(pdf.pages):
                txt = page.extract_text() or ""
                if txt.strip():
                    paginas.append((i + 1, txt))
    except Exception as e:
        print(f"    [ERRO] pdfplumber: {e}")
        return ""

    texto_total = "\n".join(f"\n--- Página {n} ---\n{t}" for n, t in paginas)

    if len(texto_total) <= max_chars:
        return texto_total

    # Filtro inteligente: páginas com âncoras + janela de 3 páginas seguintes
    print(f"    Texto grande ({len(texto_total):,} chars). Filtrando seções relevantes...")
    indices = set()
    for i, (_, txt) in enumerate(paginas):
        t_norm = unicodedata.normalize("NFKD", txt).encode("ascii","ignore").decode().lower()
        if any(a.search(t_norm) for a in ANCORAS):
            for j in range(i, min(i + 4, len(paginas))):
                indices.add(j)

    selecionadas = [paginas[i] for i in sorted(indices)]

    # Fallback sequencial se filtro resultou em pouco texto
    if sum(len(t) for _, t in selecionadas) < 15_000:
        print("    Filtro insuficiente. Usando primeiras 60 páginas.")
        selecionadas = paginas[:60]

    texto = "\n".join(f"\n--- Página {n} ---\n{t}" for n, t in selecionadas)

    # Sempre inclui as 8 primeiras páginas para contexto geral
    primeiros_nums = {n for n, _ in selecionadas}
    inicio = "\n".join(
        f"\n--- Página {n} ---\n{t}"
        for n, t in paginas[:8] if n not in primeiros_nums
    )
    return (inicio + "\n" + texto)[:max_chars]


# ── Chamada ao Gemini ──────────────────────────────────────────────────────

def _limpar_json(raw: str) -> dict:
    """Limpa markdown residual e extrai o objeto JSON da resposta."""
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"\s*```\s*$",        "", raw, flags=re.MULTILINE)
    raw = raw.strip()
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        raw = m.group(0)
    dados = json.loads(raw)
    for k in CAMPOS:
        if k not in dados:
            dados[k] = None
    return dados


def chamar_gemini_pdf(client, caminho_pdf: Path, nome: str, max_tentativas=3) -> dict | None:
    """
    Estratégia principal: faz upload do PDF para a File API do Gemini
    e pede extração diretamente sobre o documento nativo.
    Retorna None se o upload falhar (aciona fallback).
    """
    arquivo_gemini = None
    try:
        print("    Fazendo upload do PDF para o Gemini File API...")
        arquivo_gemini = client.files.upload(
            file=str(caminho_pdf),
            config=types.UploadFileConfig(mime_type="application/pdf"),
        )

        # Aguarda o arquivo ficar ativo
        for _ in range(20):
            estado = client.files.get(name=arquivo_gemini.name)
            if estado.state.name == "ACTIVE":
                break
            time.sleep(2)
        else:
            print("    [AVISO] Arquivo não ficou ACTIVE a tempo. Usando fallback.")
            return None

        print("    PDF ativo no Gemini. Extraindo campos...")

        for tentativa in range(1, max_tentativas + 1):
            try:
                resp = client.models.generate_content(
                    model=MODELO,
                    contents=[
                        types.Content(role="user", parts=[
                            types.Part(text=SYSTEM_PROMPT + "\n\n" + montar_prompt_pdf(nome)),
                            types.Part(file_data=types.FileData(
                                file_uri=arquivo_gemini.uri,
                                mime_type="application/pdf",
                            )),
                        ]),
                    ],
                    config=types.GenerateContentConfig(
                        temperature=0.0,
                        max_output_tokens=8192,
                        response_mime_type="application/json",
                    ),
                )
                dados = _limpar_json(resp.text.strip())
                preenchidos = sum(1 for v in dados.values() if v is not None and str(v).strip() not in ("","null"))
                print(f"    Modo PDF nativo: {preenchidos}/{len(CAMPOS)} campos")
                return dados

            except json.JSONDecodeError as e:
                print(f"    [AVISO] JSON inválido tentativa {tentativa}: {e}")
                if tentativa < max_tentativas:
                    time.sleep(3 * tentativa)
            except Exception as e:
                print(f"    [AVISO] Erro Gemini tentativa {tentativa}: {e}")
                if tentativa < max_tentativas:
                    time.sleep(5 * tentativa)

    except Exception as e:
        print(f"    [AVISO] Upload falhou: {e}. Ativando fallback texto.")
        return None
    finally:
        # Sempre limpa o arquivo do Gemini para não acumular cota
        if arquivo_gemini:
            try:
                client.files.delete(name=arquivo_gemini.name)
            except Exception:
                pass

    return None


def chamar_gemini_texto(client, texto: str, nome: str, max_tentativas=3) -> dict:
    """
    Fallback: envia o texto extraído pelo pdfplumber.
    Usado quando o upload do PDF falha.
    """
    print("    Modo texto (fallback pdfplumber)...")
    prompt = SYSTEM_PROMPT + "\n\n" + montar_prompt_texto(texto, nome)

    for tentativa in range(1, max_tentativas + 1):
        try:
            resp = client.models.generate_content(
                model=MODELO,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.0,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )
            dados = _limpar_json(resp.text.strip())
            preenchidos = sum(1 for v in dados.values() if v is not None and str(v).strip() not in ("","null"))
            print(f"    Modo texto: {preenchidos}/{len(CAMPOS)} campos")
            return dados

        except json.JSONDecodeError as e:
            print(f"    [AVISO] JSON inválido tentativa {tentativa}: {e}")
            if tentativa < max_tentativas:
                time.sleep(3 * tentativa)
        except Exception as e:
            msg = str(e)
            wait = 60
            m_wait = re.search(r"try again in ([\d.]+)s", msg)
            if m_wait:
                wait = float(m_wait.group(1)) + 2
            print(f"    [AVISO] Erro API tentativa {tentativa}: {e}")
            if tentativa < max_tentativas:
                print(f"    Aguardando {wait:.0f}s...")
                time.sleep(wait)

    print("    [ERRO] Todas as tentativas falharam.")
    return {k: None for k in CAMPOS}


# ── CSV incremental ────────────────────────────────────────────────────────

def carregar_processados(csv_path: Path) -> set[str]:
    if not csv_path.exists():
        return set()
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        return {r.get("arquivo_pdf","") for r in csv.DictReader(f, delimiter=";") if r.get("arquivo_pdf")}


def salvar_linha(csv_path: Path, linha: dict, colunas: list[str]):
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    novo = not csv_path.exists()
    with open(csv_path, "a", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=colunas, delimiter=";", extrasaction="ignore")
        if novo:
            w.writeheader()
        w.writerow(linha)


# ── Pipeline por PDF ───────────────────────────────────────────────────────

def processar_pdf(
    caminho_pdf: Path,
    client,
    csv_path: Path,
    colunas: list[str],
    apagar_apos: bool = False,
    forcar_texto: bool = False,
) -> bool:
    print(f"\n  Arquivo : {caminho_pdf.name}")
    print(f"  Tamanho : {caminho_pdf.stat().st_size / 1024 / 1024:.1f} MB")

    campos = None

    # ── Estratégia 1: PDF nativo via File API ─────────────────────────────
    if not forcar_texto:
        campos = chamar_gemini_pdf(client, caminho_pdf, caminho_pdf.name)

    # ── Estratégia 2: fallback texto (pdfplumber) ─────────────────────────
    if campos is None:
        texto = extrair_texto_pdf_fallback(caminho_pdf)
        if not texto.strip():
            print("  [ERRO] Sem texto extraível. PDF pode ser scaneado.")
            return False
        campos = chamar_gemini_texto(client, texto, caminho_pdf.name)

    linha = {"arquivo_pdf": caminho_pdf.name, **{k: campos.get(k, "") or "" for k in CAMPOS}}
    salvar_linha(csv_path, linha, colunas)
    print(f"  ✓ Salvo no CSV")

    if apagar_apos:
        caminho_pdf.unlink()
        print(f"  ✓ PDF removido")

    return True


# ── CLI ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Agente de extração de Prospectos CVM → CSV")
    ap.add_argument("--apagar-pdfs",  action="store_true", help="Apaga cada PDF após processar")
    ap.add_argument("--dry-run",      action="store_true", help="Lista PDFs sem chamar API")
    ap.add_argument("--reprocessar",  action="store_true", help="Reprocessa PDFs já no CSV")
    ap.add_argument("--modo",         choices=["auto","texto"], default="auto",
                    help="auto = PDF nativo + fallback texto | texto = só pdfplumber")
    ap.add_argument("--pdf-dir",      type=Path, default=PDF_DIR)
    ap.add_argument("--csv-out",      type=Path, default=CSV_OUT)
    ap.add_argument("--pausa",        type=float, default=3.0,
                    help="Segundos entre PDFs (padrão: 3)")
    args = ap.parse_args()

    args.pdf_dir.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(args.pdf_dir.glob("*.pdf"))

    if not pdfs:
        print(f"[AVISO] Nenhum PDF em: {args.pdf_dir}")
        sys.exit(0)

    ja_processados = set() if args.reprocessar else carregar_processados(args.csv_out)
    pendentes = [p for p in pdfs if p.name not in ja_processados]

    print(f"\n{'='*60}")
    print(f"  Agente de Prospectos CVM — Gemini {MODELO}")
    print(f"  PDFs na pasta  : {len(pdfs)}")
    print(f"  Já processados : {len(ja_processados)}")
    print(f"  A processar    : {len(pendentes)}")
    print(f"  Modo           : {'texto (forçado)' if args.modo == 'texto' else 'PDF nativo + fallback'}")
    print(f"  Saída CSV      : {args.csv_out}")
    print(f"{'='*60}")

    if not pendentes:
        print("\nNada novo para processar. Use --reprocessar para forçar.")
        sys.exit(0)

    if args.dry_run:
        print("\n[DRY-RUN] PDFs pendentes:")
        for p in pendentes:
            print(f"  • {p.name}  ({p.stat().st_size/1024/1024:.1f} MB)")
        sys.exit(0)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("\n[ERRO] GEMINI_API_KEY não definida.")
        print("       Execute: export GEMINI_API_KEY='AIza...'")
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    colunas = ["arquivo_pdf"] + list(CAMPOS.keys())
    forcar_texto = (args.modo == "texto")

    sucesso = 0
    for i, pdf in enumerate(pendentes, 1):
        print(f"\n[{i}/{len(pendentes)}]", end=" ")
        ok = processar_pdf(pdf, client, args.csv_out, colunas,
                           apagar_apos=args.apagar_pdfs,
                           forcar_texto=forcar_texto)
        if ok:
            sucesso += 1
        if i < len(pendentes):
            time.sleep(args.pausa)

    print(f"\n{'='*60}")
    print(f"  Concluído: {sucesso}/{len(pendentes)} PDFs processados")
    print(f"  CSV: {args.csv_out.resolve()}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()