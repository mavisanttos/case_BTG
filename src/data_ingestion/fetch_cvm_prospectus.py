#!/usr/bin/env python3
"""
baixar_prospecto_cvm.py
-----------------------
Baixa o Prospecto Definitivo (ou o melhor prospecto disponível) de uma
oferta pública da CVM a partir do número da oferta.

Usa Playwright para interceptar as chamadas de rede do frontend Angular
e descobrir os endpoints corretos automaticamente.

Instalação:
    pip install playwright requests
    playwright install chromium
"""

import argparse
import io
import json
import re
import sys
import time
import unicodedata
import zipfile
from pathlib import Path
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Configurações
# ---------------------------------------------------------------------------
BASE_CVM_URL   = "https://web.cvm.gov.br/sre-publico-cvm"
OFERTA_URL     = f"{BASE_CVM_URL}/#/oferta-publica/{{oferta_id}}"
REST_BASE      = f"{BASE_CVM_URL}/rest"
DOWNLOAD_BASE  = f"{REST_BASE}/download"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Referer": BASE_CVM_URL + "/",
    "Origin":  BASE_CVM_URL,
}

# Prioridade de busca (mais específico → mais genérico)
PRIORIDADE_PROSPECTOS = [
    "prospecto definitivo",
    "prospecto preliminar",
    "prospecto",
    "lâmina",
    "lamina",
]

# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

def normalizar(texto: str) -> str:
    return (
        unicodedata.normalize("NFKD", texto)
        .encode("ascii", "ignore")
        .decode()
        .lower()
        .strip()
    )


def escolher_documento(documentos: list[dict], tipo_desejado: str | None) -> dict | None:
    if not documentos:
        return None

    def nome_doc(doc: dict) -> str:
        for chave in ("nomeDocumento", "nome", "descricao", "tipo", "name", "tipoDocumento"):
            if chave in doc:
                return str(doc[chave])
        return json.dumps(doc)  # fallback: stringify tudo

    if tipo_desejado:
        alvo = normalizar(tipo_desejado)
        for doc in documentos:
            if alvo in normalizar(nome_doc(doc)):
                return doc
        print(f"[AVISO] Tipo '{tipo_desejado}' não encontrado. Usando busca inteligente...")

    for prioridade in PRIORIDADE_PROSPECTOS:
        for doc in documentos:
            if prioridade in normalizar(nome_doc(doc)):
                return doc

    return None


def extrair_uuid(doc: dict) -> str | None:
    UUID_RE = re.compile(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        re.IGNORECASE,
    )
    for chave in ("uuid", "id", "idDocumento", "downloadId", "hashArquivo", "hash"):
        if chave in doc:
            val = str(doc[chave])
            if UUID_RE.match(val):
                return val

    for chave in ("urlDownload", "url", "link", "href"):
        if chave in doc:
            m = UUID_RE.search(str(doc[chave]))
            if m:
                return m.group(0)

    # Procura UUID em qualquer valor do dict
    for v in doc.values():
        m = UUID_RE.search(str(v))
        if m:
            return m.group(0)

    return None


def nome_doc_display(doc: dict) -> str:
    for chave in ("nomeDocumento", "nome", "descricao", "tipo", "name", "tipoDocumento"):
        if chave in doc:
            return str(doc[chave])
    return "—"


# ---------------------------------------------------------------------------
# Interceptação via Playwright
# ---------------------------------------------------------------------------

def coletar_dados_via_playwright(oferta_id: str, headless: bool) -> tuple[list[dict], str | None]:
    """
    Abre o site da CVM no Chromium, intercepta todas as chamadas REST/JSON
    e retorna (lista_documentos, api_base_detectada).
    """
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        print("[ERRO] Playwright não instalado.")
        print("       Execute: pip install playwright && playwright install chromium")
        sys.exit(1)

    documentos: list[dict] = []
    api_base_detectada: str | None = None
    respostas_json: list[tuple[str, any]] = []

    url_oferta = OFERTA_URL.format(oferta_id=oferta_id)
    print(f"[INFO] Abrindo: {url_oferta}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(
            user_agent=BROWSER_HEADERS["User-Agent"],
            locale="pt-BR",
            extra_http_headers={
                "Accept-Language": "pt-BR,pt;q=0.9",
            },
        )
        page = context.new_page()

        # Intercepta respostas JSON
        def on_response(response):
            nonlocal api_base_detectada
            url = response.url
            ct = response.headers.get("content-type", "")
            if "json" not in ct:
                return
            # Ignora arquivos de configuração Angular
            if any(x in url for x in [".js", "node_modules", "i18n", "assets"]):
                return
            try:
                body = response.json()
                respostas_json.append((url, body))
            except Exception:
                pass

        page.on("response", on_response)

        try:
            page.goto(url_oferta, timeout=30_000, wait_until="networkidle")
        except PWTimeout:
            print("[AVISO] Timeout aguardando networkidle — continuando com o que foi capturado.")

        # Espera extra para o Angular renderizar
        time.sleep(3)
        page.wait_for_timeout(2000)

        # Se ainda não tiver dados, rola a página para forçar lazy-loads
        if not respostas_json:
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(2000)

        browser.close()

    # Analisa as respostas capturadas para achar a lista de documentos
    print(f"[INFO] {len(respostas_json)} resposta(s) JSON interceptada(s).")

    for url, body in respostas_json:
        docs = _extrair_documentos_de_json(body)
        if docs:
            documentos = docs
            api_base_detectada = _extrair_base_url(url)
            print(f"[INFO] Documentos encontrados via: {url}")
            break

    # Se não achou lista, tenta todos os jsons capturados (pode estar aninhado)
    if not documentos:
        for url, body in respostas_json:
            docs = _busca_recursiva_documentos(body)
            if docs:
                documentos = docs
                api_base_detectada = _extrair_base_url(url)
                print(f"[INFO] Documentos encontrados (busca recursiva) via: {url}")
                break

    return documentos, api_base_detectada


def _extrair_documentos_de_json(body) -> list[dict]:
    """Tenta extrair a lista de documentos de uma resposta JSON."""
    chaves_lista = ("documentos", "listaDocumentos", "documentoList", "items", "data", "content")

    if isinstance(body, list) and body and isinstance(body[0], dict):
        if any(k in body[0] for k in ("uuid", "id", "nome", "nomeDocumento", "tipoDocumento")):
            return body

    if isinstance(body, dict):
        for chave in chaves_lista:
            if chave in body and isinstance(body[chave], list) and body[chave]:
                sub = body[chave]
                if isinstance(sub[0], dict):
                    return sub

    return []


def _busca_recursiva_documentos(body, depth=0) -> list[dict]:
    """Busca recursiva por lista de documentos em JSON aninhado."""
    if depth > 5:
        return []
    if isinstance(body, list) and body and isinstance(body[0], dict):
        chaves_doc = {"uuid", "id", "nome", "nomeDocumento", "tipoDocumento", "hashArquivo"}
        if chaves_doc & set(body[0].keys()):
            return body
    if isinstance(body, dict):
        for v in body.values():
            if isinstance(v, (dict, list)):
                result = _busca_recursiva_documentos(v, depth + 1)
                if result:
                    return result
    return []


def _extrair_base_url(url: str) -> str:
    parsed = urlparse(url)
    # Retorna até o penúltimo segmento do path
    partes = parsed.path.rstrip("/").split("/")
    base_path = "/".join(partes[:-1])
    return f"{parsed.scheme}://{parsed.netloc}{base_path}"


# ---------------------------------------------------------------------------
# Fallback: tentar endpoints comuns diretamente via requests
# ---------------------------------------------------------------------------

ENDPOINTS_CANDIDATOS = [
    "/oferta/{id}",
    "/oferta-distribuicao/{id}",
    "/oferta/{id}/documentos",
    "/processo/{id}",
    "/registro/{id}",
    "/registro/{id}/documentos",
    "/oferta-publica/{id}/documentos",
    "/distribuicao/{id}",
]

import requests as _req_module

def tentar_endpoints_diretos(oferta_id: str) -> list[dict]:
    """Tenta endpoints REST comuns sem precisar do browser."""
    sess = _req_module.Session()
    sess.headers.update(BROWSER_HEADERS)

    for template in ENDPOINTS_CANDIDATOS:
        url = REST_BASE + template.replace("{id}", oferta_id)
        try:
            r = sess.get(url, timeout=15)
            if r.status_code == 200:
                try:
                    body = r.json()
                    docs = _extrair_documentos_de_json(body) or _busca_recursiva_documentos(body)
                    if docs:
                        print(f"[INFO] Endpoint encontrado: {url}")
                        return docs
                except Exception:
                    pass
        except Exception:
            pass
    return []


# ---------------------------------------------------------------------------
# Download e extração do PDF
# ---------------------------------------------------------------------------

def baixar_pdf(uuid: str, oferta_id: str, pasta: Path) -> Path | None:
    import requests
    url = f"{DOWNLOAD_BASE}/{uuid}"
    print(f"[INFO] Baixando: {url}")

    sess = requests.Session()
    sess.headers.update(BROWSER_HEADERS)

    try:
        r = sess.get(url, timeout=120, stream=True)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"[ERRO] Falha no download: {e}")
        return None

    conteudo = r.content
    ct = r.headers.get("Content-Type", "")

    # PDF direto
    if "pdf" in ct or conteudo[:4] == b"%PDF":
        dest = pasta / f"prospecto_{oferta_id}.pdf"
        dest.write_bytes(conteudo)
        print(f"[OK] PDF salvo: {dest}")
        return dest

    # ZIP
    try:
        with zipfile.ZipFile(io.BytesIO(conteudo)) as zf:
            pdfs = [n for n in zf.namelist() if n.lower().endswith(".pdf")]
            if not pdfs:
                print("[AVISO] ZIP sem PDFs. Arquivos:", zf.namelist())
                dest = pasta / f"prospecto_{oferta_id}.zip"
                dest.write_bytes(conteudo)
                return dest

            # Maior PDF = prospecto principal
            pdf = max(pdfs, key=lambda n: zf.getinfo(n).file_size)
            print(f"[INFO] PDFs no ZIP: {pdfs}")
            print(f"[INFO] Extraindo: {pdf}")
            dest = pasta / f"prospecto_{oferta_id}_{Path(pdf).name}"
            dest.write_bytes(zf.read(pdf))
            print(f"[OK] PDF salvo: {dest}")
            return dest

    except zipfile.BadZipFile:
        ext = "html" if "html" in ct else "bin"
        dest = pasta / f"prospecto_{oferta_id}_raw.{ext}"
        dest.write_bytes(conteudo)
        print(f"[AVISO] Formato desconhecido salvo para diagnóstico: {dest}")
        return None


# ---------------------------------------------------------------------------
# Listar documentos
# ---------------------------------------------------------------------------

def listar_documentos(documentos: list[dict], oferta_id: str):
    if not documentos:
        print(f"Nenhum documento encontrado para a oferta {oferta_id}.")
        return
    print(f"\nDocumentos disponíveis — oferta {oferta_id}:\n")
    print(f"{'#':<4} {'Nome':<55} {'Data':<15} {'UUID/ID'}")
    print("─" * 110)
    for i, doc in enumerate(documentos, 1):
        nome = nome_doc_display(doc)
        data = next((str(doc[c]) for c in ("dataDivulgacaoCvm","data","dataPublicacao","date") if c in doc), "—")
        uid  = extrair_uuid(doc) or "—"
        print(f"{i:<4} {nome[:54]:<55} {data:<15} {uid}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    import csv # Importado aqui para não precisar mexer no topo do arquivo
    
    ap = argparse.ArgumentParser(
        description="Baixa Prospectos em lote a partir do CSV."
    )
    # A linha que pedia o "oferta_id" foi removida daqui!
    ap.add_argument("--tipo",     default=None,
                    help='Tipo de documento (ex: "Prospecto Preliminar"). Omitir = busca automática.')
    ap.add_argument("--listar",   action="store_true",
                    help="Lista os documentos disponíveis sem baixar.")
    ap.add_argument("--headless", default="true",
                    help="false = abre browser visível (útil para debug). Padrão: true")
    ap.add_argument("--no-browser", action="store_true",
                    help="Tenta apenas endpoints REST diretos (mais rápido, pode falhar).")
    args = ap.parse_args()

    headless  = args.headless.lower() != "false"

    # 1. Configuração de caminhos automática baseada na pasta do script
    script_dir = Path(__file__).resolve().parent
    pasta_cvm = script_dir.parents[1] / "data" / "cvm"
    csv_path = pasta_cvm / "modern_offers_rcvm160.csv"
    pasta_salvamento = pasta_cvm / "pdf_prospectos"
    
    pasta_salvamento.mkdir(parents=True, exist_ok=True)

    if not csv_path.exists():
        print(f"[ERRO] O arquivo CSV não foi encontrado em: {csv_path}")
        sys.exit(1)

    # 2. Lendo os números de requerimento do CSV
    ofertas = []
    with open(csv_path, mode="r", encoding="utf-8-sig") as f:
        leitor = csv.DictReader(f, delimiter=";")
        for linha in leitor:
            req = linha.get("Numero_Requerimento")
            if req and req.strip():
                ofertas.append(req.strip())

    # Removendo duplicatas (mantendo a ordem)
    ofertas = list(dict.fromkeys(ofertas))

    print(f"\n{'='*55}")
    print(f"  CVM — Downloader de Prospectos em Lote")
    print(f"  Total de Ofertas a processar: {len(ofertas)}")
    print(f"  Salvando em: {pasta_salvamento}")
    print(f"{'='*55}\n")

    # 3. Loop principal para baixar todas as ofertas do CSV
    for oferta_id in ofertas:
        print(f"\n--- Processando Oferta: {oferta_id} ---")

        # ── Estratégia 1: endpoints REST diretos (rápido) ──────────────────────
        documentos = []
        if not args.no_browser:
            print("[INFO] Tentando endpoints REST diretos...")
        documentos = tentar_endpoints_diretos(oferta_id)

        # ── Estratégia 2: Playwright (fallback) ────────────────────────────────
        if not documentos and not args.no_browser:
            print("[INFO] Endpoints diretos não funcionaram. Abrindo browser...")
            documentos, _ = coletar_dados_via_playwright(oferta_id, headless)

        if not documentos:
            print("[ERRO] Não foi possível obter os documentos automaticamente.")
            continue # Pula para a próxima oferta sem quebrar o script

        if args.listar:
            listar_documentos(documentos, oferta_id)
            continue

        # ── Escolha do documento ───────────────────────────────────────────────
        doc = escolher_documento(documentos, args.tipo)
        if not doc:
            print("[ERRO] Nenhum prospecto encontrado nos documentos.")
            continue

        print(f"[INFO] Documento selecionado: {nome_doc_display(doc)}")

        uuid = extrair_uuid(doc)
        if not uuid:
            print("[ERRO] Não foi possível extrair o UUID do documento.")
            continue

        # ── Download ───────────────────────────────────────────────────────────
        resultado = baixar_pdf(uuid, oferta_id, pasta_salvamento)
        if resultado:
            print(f"✅ Concluído! Arquivo: {resultado.resolve()}")
        else:
            print("❌ Não foi possível salvar o PDF.")

if __name__ == "__main__":
    main()