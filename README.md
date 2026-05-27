# BTG - Análise Inteligente de Ofertas Primárias (CVM)

Este projeto consiste em uma plataforma de inteligência artificial desenvolvida para consolidar, analisar e otimizar a alocação de capital em ofertas primárias de Fundos de Investimento Imobiliário (FIIs), baseando-se nos dados oficiais da CVM (Resolução 160) e indicadores macroeconômicos reais.

O sistema conta com um ecossistema de agentes autônomos (via LangChain e LangGraph) que lêem documentos de prospectos, avaliam o risco de crédito corporativo e interagem com assessores de investimentos através de um chat corporativo interpretativo.

---

## Fluxo de Informação (Arquitetura de Dados)

O diagrama abaixo ilustra como os dados trafegam pelo sistema, desde a captura nas fontes públicas até a entrega de valor no front-end e no cérebro do Chatbot:

```text
 [ Fontes Externas ]       (Portal CVM)                                      (APIs Macroeconômicas)
                                 │                                                      │
                                 ▼                                                      ▼
 [ data_ingestion ]    cvm_downloader.py                                 macro_indicators_fetcher.py
                       fetch_cvm_prospectus.py                                         │
                                 │                                                      │
                                 ▼                                                      ▼
 [ Armazenamento ]     /data/cvm/ (PDFs e CSVs)            ◄───►                  /data/macro/
                                 │                                                      |
                                 ▼                                                      | 
 [ Processamento ]    prospect_agent.py  ──► (Extração por IA com Gemini)              |
                                 │                                                      ▼
                                 ▼
 [ Banco de Dados ]    sync_supabase.py                 ──►                  [ SUPABASE (Nuvem) ]
                                                         │
                               ┌──────────────────────────┴──────────────────────────┐
                               ▼                                                     ▼
      [ Camada Cliente ]  [ Web App (Next.js) ]                             [ Back-End (FastAPI) ]
                          • Dashboard Analítico                             • market_agent.py (LangChain)
                          • Otimizador de Portfólio                         • Ferramentas ReAct (`@tool`)
```

- **Ingestão:** Os scripts em `data_ingestion` raspam e baixam as tabelas e PDFs da CVM, além de capturar taxas macroeconômicas (Selic, IPCA).
- **Extração & Moderação:** O `prospect_agent` analisa os PDFs originais. Para evitar o estouro de limite de requisições e tokens em modelos gratuitos, o script `generate_mock_prospectus.py` entra em ação para mocar com inteligência dados estruturados realistas sobre a base massiva de FIIs, durante a fase de desenvolvimento (MVP).
- **Sincronização:** O script `sync_supabase.py` limpa, valida e injeta os dados unificados na nuvem do Supabase.
- **Consumo Duplo:** O banco de dados alimenta a interface visual do Next.js e serve de base de conhecimento empírica para o agente de chat via chamadas de ferramentas (Function Calling).

---

## Estrutura de Pastas

A organização modular do projeto divide as responsabilidades de captura, inteligência artificial e visualização:

```
├── data/                       # Armazenamento local temporário (Ignorado no Git)
│   ├── cvm/                    # Contém os PDFs brutos e as 2 tabelas CSV da CVM
│   └── macro/                  # Contém os dados macroeconômicos consolidados
├── src/
│   ├── agents/                 # Camada de Inteligência Artificial e Agentes
│   │   ├── market_agent.py     # Cérebro do Chatbot (Orquestração LangChain/LangGraph)
│   │   └── prospect_agent.py   # Agente extrator e analista de PDFs/Prospectos
│   ├── app/                    # Web App Front-end (Next.js / v0 / Tailwind)
│   │   ├── components/         # Componentes React (analytics-tab, optimizer-tab)
│   │   └── lib/                # Conexões, queries do Supabase e helpers de tipos
│   └── data_ingestion/         # Pipeline de Ingestão e ETL (Python)
│       ├── cvm_downloader.py           # Download automatizado de PDFs da CVM
│       ├── fetch_cvm_prospectus.py     # Captura das tabelas cadastrais da CVM
│       ├── generate_mock_prospectus.py # Emulador de extração para escala (Prevenção de limite de API)
│       ├── macro_indicators_fetcher.py # Coleta de indicadores exógenos (CDI, Selic, IPCA)
│       └── sync_supabase.py            # Script de carga e sincronização com o banco
├── .env                        # Variáveis de ambiente (Chaves de API e Supabase)
├── .gitignore                  # Regras de exclusão de arquivos (Ignora /data e .env)
└── requirements.txt            # Dependências do ecossistema Python
```

---

## Funcionalidades Principais

**Dashboard Analítico Macro:** Consolidação de bilhões em volume financeiro de ofertas de Tijolo e Papel, mapeamento automático de Coordenadores Líderes e distribuição real do Score de Crédito das emissões.

**Otimizador de Portfólio Dinâmico:** Algoritmo que lê o patrimônio do cliente, o perfil de risco e o objetivo, e realiza o Stock Picking inteligente:

- **Conservador:** Prioriza a segurança através do Score BTG.
- **Arrojado:** Busca a maximização do retorno através do Dividend Yield.
- **Moderado:** Aplica balanço ponderado risco-retorno.

**BTG Intelligence Partner (Chatbot):** Agente de conversação corporativa dotado de ferramentas ReAct para comparar ativos, extrair riscos exógenos e redigir pareceres para o comitê interno de investimentos.

---

## Agentes de Inteligência Artificial

**Prospect Agent (`prospect_agent.py`):** Utiliza LLMs e leitores estruturados para quebrar a complexidade jurídica e textual de prospectos primários com centenas de páginas, transformando dados brutos em variáveis cruciais (ex: Alavancagem, Fatores de risco principais, Captação mínima/máxima).

**Market Agent (`market_agent.py`):** Construído sobre o LangChain e LangGraph, ele opera em arquitetura ReAct. O agente não "alucina" dados de mercado; ele invoca dinamicamente ferramentas de consulta (`search_fii_offers`, `compare_fii_offers`) para trazer insights matemáticos em tempo real ao usuário.

---

## Tecnologias e Ferramentas

- **Back-End / AI Core:** Python 3.10+, LangChain, LangGraph, Groq Cloud (Llama 3.3 70B), Google Gemini 2.5 Flash, FastAPI, Uvicorn.
- **Front-End:** Next.js (React 18), Tailwind CSS, Lucide Icons, Recharts (Gráficos Interativos).
- **Banco de Dados & Infra:** Supabase (PostgreSQL nativo).

---

## Como Rodar o Projeto

### 1. Configuração do Ambiente (`.env`)

Crie um arquivo `.env` na raiz do projeto contendo as credenciais de acesso:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-chave-publica-anon-key
GOOGLE_API_KEY=sua-chave-do-gemini
GROQ_API_KEY=sua-chave-do-groq
```

### 2. Executando o Pipeline de Dados (Python)

Para reconstruir a base local (caso não queira baixar os 13.000 PDFs manualmente da CVM e estourar suas cotas de tokens gratuitas de IA), execute a pipeline nesta ordem:

```bash
# Instale as dependências do back-end
pip install -r requirements.txt

# 1. Busca indicadores macroeconômicos e estruturais
python src/data_ingestion/macro_indicators_fetcher.py

# 2. Baixa as tabelas cadastrais de ofertas da CVM
python src/data_ingestion/cvm_downloader.py

# 3. (Opcional) Download físico dos PDFs dos prospectos (usa Playwright)
python src/data_ingestion/fetch_cvm_prospectus.py

# 4. Sincroniza e faz o upload em lote de toda a base consolidada para o Supabase
python src/data_ingestion/sync_supabase.py
```

### 3. Iniciando o Servidor API do Agente de Chat (Back-End)

Para dar vida ao Chatbot e disponibilizar os endpoints de IA via API Rest, execute o comando abaixo (com a raiz no Python Path):

```bash
# Certifique-se de que o arquivo principal expõe a instância FastAPI (ex: main.py)
uvicorn src.agents.market_agent:app --reload --port 8000
```

### 4. Iniciando a Interface Visual (Front-End Next.js)

Abra uma nova janela de terminal e ligue a aplicação cliente:

```bash
# Navegue até a pasta do app
cd src/app

# Instale os pacotes e inicie o servidor Next.js
pnpm install
pnpm dev
```

Acesse o navegador em `http://localhost:3000` para operar o painel integrado.

---

## Apresentação

Para visualizar a apresentação final do projeto, acesse o link: [Apresentação](https://www.figma.com/slides/PuWnR2EIphCmF3gYuUd46E)

---

Aluna: Maria Vitória dos Santos