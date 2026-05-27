// Database types based on Supabase schema

export interface IndicadoresMacro {
  id: number
  selic_meta: string | null
  cdi_daily: string | null
  ipca_12m: string | null
}

export interface ProspectoExtraido {
  arquivo_pdf: string
  preco_emissao: string | null
  valor_patrimonial_cota: string | null
  pvp_oferta: string | null
  dy_projetado_pct: string | null
  taxa_administracao: string | null
  taxa_performance: string | null
  custo_total_oferta_pct: string | null
  montante_total: string | null
  montante_minimo: string | null
  lote_base: string | null
  lote_adicional: string | null
  numero_cotas_ofertadas: string | null
  numero_emissao: string | null
  prazo_oferta_dias: string | null
  cronograma_resumido: string | null
  condicao_encerramento_antecipado: string | null
  direito_preferencia: string | null
  regime_distribuicao: string | null
  data_primeiro_rendimento: string | null
  tipo_fii: string | null
  tipo_ativo_alvo: string | null
  localizacao_geografica: string | null
  destinacao_recursos: string | null
  pipeline_ativos: string | null
  vacancia_fisica_pct: string | null
  vacancia_financeira_pct: string | null
  prazo_medio_contratos: string | null
  tipo_contrato: string | null
  indexador_predominante: string | null
  maior_inquilino_pct: string | null
  hedge_cambial: string | null
  ltv_medio_pct: string | null
  indexador_carteira_papel: string | null
  maior_devedor_pct: string | null
  rating_medio_cris: string | null
  garantias_cri: string | null
  rendimentos_ultimos_12m: string | null
  cotacao_mercado_ref: string | null
  patrimonio_liquido_atual: string | null
  pvp_historico_medio: string | null
  fatores_risco_principais: string | null
  concentracao_geografica: string | null
  concentracao_indexador: string | null
  link_oferta_cvm: string | null
  link_pdf_download: string | null
  score_oferta: string | null
}

// Helper function to extract ticker from arquivo_pdf
export function extractTicker(arquivoPdf: string): string {
  // Extract ticker from filename like "prospecto_XPML11.pdf" or "XPML11_prospecto.pdf"
  const match = arquivoPdf.match(/([A-Z]{4}\d{2})/i)
  return match ? match[1].toUpperCase() : arquivoPdf.replace('.pdf', '').toUpperCase()
}

// Helper function to parse numeric values
export function parseNumeric(value: string | null): number | null {
  if (!value) return null
  const cleaned = value.replace(/[R$%,\s]/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

// Helper function to format currency
export function formatCurrency(value: number | null): string {
  if (value === null) return 'N/D'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

// Helper function to format percentage
export function formatPercentage(value: string | null): string {
  if (!value) return 'N/D'
  const num = parseNumeric(value)
  if (num === null) return value
  return `${num.toFixed(2)}%`
}

// Helper function to get score color
export function getScoreColor(score: string | null): 'green' | 'yellow' | 'red' {
  const numScore = parseNumeric(score)
  if (numScore === null) return 'yellow'
  if (numScore >= 7) return 'green'
  if (numScore >= 5) return 'yellow'
  return 'red'
}

// Helper function to get segment from tipo_fii
export function getSegment(tipoFii: string | null): string {
  if (!tipoFii) return 'Outros'
  const lower = tipoFii.toLowerCase()
  if (lower.includes('tijolo') || lower.includes('laje') || lower.includes('logístic') || lower.includes('shopping')) {
    return 'Tijolo'
  }
  if (lower.includes('papel') || lower.includes('cri') || lower.includes('recebíveis')) {
    return 'Papel'
  }
  if (lower.includes('híbrido') || lower.includes('fof') || lower.includes('fundos')) {
    return 'Híbrido'
  }
  return 'Outros'
}
