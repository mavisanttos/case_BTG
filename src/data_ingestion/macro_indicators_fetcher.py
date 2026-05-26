#!/usr/bin/env python3
"""
Fetch daily macroeconomic indicators (Selic, CDI, IPCA) directly from the Brazilian Central Bank API (SGS).

Usage:
    python src/data_ingestion/macro_indicators_fetcher.py
"""

import json
import requests
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_DIR = PROJECT_ROOT / "data" / "macro"
OUTPUT_FILE = OUTPUT_DIR / "daily_indicators.json"

# Códigos oficiais das séries temporais do Banco Central (SGS)
SERIES_CODES = {
    "selic_meta": 432,       # Taxa Selic Meta definida pelo COPOM (% a.a.)
    "cdi_daily": 12,         # Taxa DI/CDI acumulada diária (% a.a.)
    "ipca_12m": 13522,       # IPCA acumulado nos últimos 12 meses (%)
}

def fetch_bcb_series(series_id: int) -> float:
    """Busca o valor mais recente de uma série do Banco Central."""
    # Puxa apenas o último registro disponível para economizar internet
    url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series_id}/dados/ultimos/1?formato=json"
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if data and len(data) > 0:
            # O BC retorna o valor como string (ex: "10.50"), convertemos para float
            return float(data[0]["valor"])
    except Exception as e:
        print(f"❌ Erro ao buscar série {series_id}: {e}")
    return 0.0

def main():
    print("🏛️ Buscando indicadores macroeconômicos no Banco Central...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    indicators = {}
    
    for name, code in SERIES_CODES.items():
        print(f"   📥 Carregando {name} (Código: {code})...")
        value = fetch_bcb_series(code)
        indicators[name] = value
        print(f"   → {name}: {value}%")
        
    # Salva o resultado em um arquivo JSON organizado
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(indicators, f, indent=4, ensure_ascii=False)
        
    print(f"\n✅ Indicadores salvos com sucesso em: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()