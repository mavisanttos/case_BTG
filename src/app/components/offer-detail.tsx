'use client'

import { ArrowLeft, ExternalLink, Download, Building2, FileText, AlertTriangle, TrendingUp, Percent, DollarSign, Users, Calendar, Target, CreditCard, BarChart3, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ProspectoExtraido } from '@/lib/types'
import { extractTicker, getSegment, parseNumeric, getScoreColor } from '@/lib/types'
import { cn } from '@/lib/utils'

interface OfferDetailProps {
  offer: ProspectoExtraido
  onBack: () => void
  macro?: { selic_meta: string; cdi_daily: string; ipca_12m: string } // Adicionado prop de indicadores macro
}

function getScoreColorClass(score: number | null) {
  if (score === null) return 'border-slate-850 bg-slate-900/10 text-slate-400'
  if (score >= 80) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
  if (score >= 60) return 'border-amber-500/30 bg-amber-500/10 text-amber-400'
  return 'border-rose-500/30 bg-rose-500/10 text-rose-400'
}

function getScoreLabel(score: number | null) {
  if (score === null) return 'Sem Score'
  if (score >= 80) return 'Risco Baixo (A+)'
  if (score >= 60) return 'Risco Moderado (B)'
  return 'Risco Elevado (C)'
}

function formatCurrency(value: string | null): string {
  if (!value) return 'N/D'
  const num = parseNumeric(value)
  if (num === null) return value
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num)
}

function formatVolume(value: string | null): string {
  if (!value) return 'N/D'
  const num = parseNumeric(value)
  if (num === null) return value
  if (num >= 1000000000) {
    return `R$ ${(num / 1000000000).toFixed(2)} bi`
  }
  if (num >= 1000000) {
    return `R$ ${(num / 1000000).toFixed(0)} mi`
  }
  return formatCurrency(value)
}

function formatPercentage(value: string | null): string {
  if (!value) return 'N/D'
  const num = parseNumeric(value)
  if (num === null) return value
  return `${num.toFixed(2)}%`
}

/**
 * Calculador de Taxa Real Projetada
 * Combina a taxa bruta com os indicadores de mercado (Selic, CDI, IPCA) ao vivo.
 */
function calcularTaxaReal(dyProjetado: string | null, macro: { selic_meta: string; cdi_daily: string; ipca_12m: string } | undefined): { taxaReal: string, bruta: string } {
  const bruta = dyProjetado || 'N/D'
  if (!dyProjetado) return { taxaReal: 'N/D', bruta }

  const text = dyProjetado.toUpperCase().replace(',', '.')
  const ipcaNum = parseFloat(macro?.ipca_12m || '4.50')
  const cdiNum = parseFloat(macro?.cdi_daily || '10.65')

  const matchFloat = text.match(/([\d.]+)/)
  const spread = matchFloat ? parseFloat(matchFloat[1]) : 0

  if (text.includes('IPCA')) {
    return { taxaReal: `${(ipcaNum + spread).toFixed(2)}% a.a.`, bruta }
  }
  if (text.includes('CDI')) {
    if (text.includes('+')) {
      return { taxaReal: `${(cdiNum + spread).toFixed(2)}% a.a.`, bruta }
    }
    return { taxaReal: `${(cdiNum * (spread / 100)).toFixed(2)}% a.a.`, bruta }
  }

  if (!isNaN(spread) && spread > 0) {
    return { taxaReal: `${spread.toFixed(2)}% a.a.`, bruta }
  }

  return { taxaReal: bruta, bruta }
}

export function OfferDetail({ offer, onBack, macro }: OfferDetailProps) {
  const ticker = extractTicker(offer.arquivo_pdf)
  const segment = getSegment(offer.tipo_fii)
  const score = parseNumeric(offer.score_oferta)
  const scoreColorClass = getScoreColorClass(score)
  const scoreLabel = getScoreLabel(score)
  const isTijolo = segment === 'Tijolo'

  // Busca o nome do emissor real unificado da tabela CVM
  const emissorNome = (offer as any).nome_emissor || 'Emissor Não Informado'

  // Projeta a taxa real ponderando os indicadores macro ao vivo
  const { taxaReal, bruta } = calcularTaxaReal(offer.dy_projetado_pct, macro)

  // Parse dos fatores de risco
  const riskFactors = offer.fatores_risco_principais
    ? offer.fatores_risco_principais.split(/[;|\n]/).map(r => r.strip ? r.strip() : r.trim()).filter(Boolean)
    : []

  return (
    <div className="space-y-6">
      {/* Botão de Voltar */}
      <Button variant="ghost" onClick={onBack} className="gap-2 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Voltar ao Ranking
      </Button>

      {/* Bloco de Cabeçalho - Destaque no Emissor */}
      <div className="rounded-xl border border-border/50 bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="outline"
                className={cn(
                  'text-xs font-semibold px-2 py-0.5',
                  isTijolo
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-btg-success/50 bg-btg-success/10 text-btg-success'
                )}
              >
                {isTijolo ? <Building2 className="mr-1 h-3.5 w-3.5" /> : <FileText className="mr-1 h-3.5 w-3.5" />}
                {segment}
              </Badge>
              {offer.numero_emissao && (
                <span className="text-sm text-muted-foreground font-mono">{offer.numero_emissao}ª Emissão</span>
              )}
              {offer.regime_distribuicao && (
                <Badge variant="outline" className="text-xs font-mono">
                  {offer.regime_distribuicao}
                </Badge>
              )}
            </div>
            
            {/* Título Principal Gigante: Nome do Emissor */}
            <h1 className="text-2xl font-bold text-foreground lg:text-3xl leading-tight">
              {emissorNome}
            </h1>
            
            {/* Detalhes Secundários: Ticker e Requerimento CVM */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground font-mono">
              {ticker && (
                <span className="bg-secondary/60 px-2 py-0.5 rounded text-foreground font-bold">
                  Ticker: {ticker}
                </span>
              )}
              <span>Requerimento CVM: {offer.arquivo_pdf?.replace('.pdf', '')}</span>
            </div>

            {offer.localizacao_geografica && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {offer.localizacao_geografica}
              </p>
            )}
            <p className="text-muted-foreground">
              Volume Total da Emissão: <span className="font-semibold text-foreground font-mono">{formatVolume(offer.montante_total)}</span>
            </p>
          </div>

          {/* Plaqueta de Score BTG de Crédito */}
          <div className="flex flex-col items-center gap-2">
            <div className={cn('flex h-20 w-24 flex-col items-center justify-center rounded-xl border font-mono shadow-md', scoreColorClass)}>
              <span className="text-xs uppercase font-bold opacity-60">Score BTG</span>
              <span className="text-2xl font-extrabold -mt-1">{score !== null ? score.toFixed(0) : '?'}</span>
            </div>
            <span className={cn('rounded-full px-3 py-0.5 text-xs font-semibold border', scoreColorClass)}>
              {scoreLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Grid de Informações Financeiras e Operacionais */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        
        {/* Coluna 1 - Dados Financeiros com Taxas de Mercado */}
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <DollarSign className="h-5 w-5 text-primary" />
            Estrutura Financeira
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
              <span className="text-sm text-muted-foreground">Preço de Emissão</span>
              <span className="font-semibold text-foreground font-mono">{formatCurrency(offer.preco_emissao)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
              <span className="text-sm text-muted-foreground">Valor Patrimonial</span>
              <span className="font-semibold text-foreground font-mono">{formatCurrency(offer.valor_patrimonial_cota)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
              <span className="text-sm text-muted-foreground">P/VP</span>
              <span className="font-semibold text-foreground font-mono">{offer.pvp_oferta || 'N/D'}</span>
            </div>
            
            {/* Bloco de Taxas Reais Integrando Dados Macro */}
            <div className="flex flex-col justify-between rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
              <div className="flex justify-between items-center w-full">
                <span className="text-sm font-bold text-emerald-400">Taxa Real Projetada</span>
                <span className="font-bold text-emerald-400 font-mono text-base flex items-center gap-1">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  {taxaReal}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-1 self-end">
                Taxa declarada na CVM (Bruta): {bruta}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
              <span className="text-sm text-muted-foreground">Taxa de Administração</span>
              <span className="font-semibold text-foreground text-sm">{offer.taxa_administracao || 'N/D'}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
              <span className="text-sm text-muted-foreground">Taxa de Performance</span>
              <span className="font-semibold text-foreground text-xs text-right max-w-[160px] truncate" title={offer.taxa_performance || 'N/D'}>
                {offer.taxa_performance || 'N/D'}
              </span>
            </div>
          </div>
        </div>

        {/* Coluna 2 - Métricas Operacionais / Crédito */}
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            {isTijolo ? (
              <>
                <Building2 className="h-5 w-5 text-primary" />
                Métricas de Tijolo
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5 text-primary" />
                Métricas de Papel
              </>
            )}
          </h3>
          <div className="space-y-4">
            {isTijolo ? (
              <>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Percent className="h-4 w-4" />
                    Vacância Física
                  </span>
                  <span className="font-semibold text-foreground font-mono">{formatPercentage(offer.vacancia_fisica_pct)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Percent className="h-4 w-4" />
                    Vacância Financeira
                  </span>
                  <span className="font-semibold text-foreground font-mono">{formatPercentage(offer.vacancia_financeira_pct)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Prazo Médio Contratos
                  </span>
                  <span className="font-semibold text-foreground font-mono text-sm">{offer.prazo_medio_contratos || 'N/D'}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Maior Inquilino
                  </span>
                  <span className="font-semibold text-foreground text-right text-xs max-w-[150px] truncate" title={offer.maior_inquilino_pct || 'N/D'}>
                    {offer.maior_inquilino_pct || 'N/D'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    Indexador Predominante
                  </span>
                  <span className="font-semibold text-foreground">{offer.indexador_predominante || 'N/D'}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="h-4 w-4" />
                    LTV Médio da Carteira
                  </span>
                  <span className="font-semibold text-foreground font-mono">{formatPercentage(offer.ltv_medio_pct)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    Composição Indexador
                  </span>
                  <span className="font-semibold text-foreground text-xs text-right max-w-[150px] truncate" title={offer.indexador_carteira_papel || 'N/D'}>
                    {offer.indexador_carteira_papel || 'N/D'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Maior Devedor
                  </span>
                  <span className="font-semibold text-foreground text-xs text-right max-w-[150px] truncate" title={offer.maior_devedor_pct || 'N/D'}>
                    {offer.maior_devedor_pct || 'N/D'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Target className="h-4 w-4" />
                    Rating Médio CRIs
                  </span>
                  <span className="font-semibold text-emerald-400">{offer.rating_medio_cris || 'N/D'}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    Garantias Lastro CRI
                  </span>
                  <span className="font-semibold text-foreground text-[10px] text-right max-w-[150px] truncate" title={offer.garantias_cri || 'N/D'}>
                    {offer.garantias_cri || 'N/D'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Coluna 3 - Recursos & Pipeline */}
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Target className="h-5 w-5 text-primary" />
            Destinação & Portfólio
          </h3>
          <div className="space-y-4">
            <div className="rounded-lg bg-secondary/50 p-4 border border-border/30">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">Destinação de Recursos</p>
              <p className="text-xs leading-relaxed text-slate-300 line-clamp-4">{offer.destinacao_recursos || 'Não informado'}</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 border border-border/30">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">Pipeline de Ativos</p>
              <p className="text-xs leading-relaxed text-slate-300 line-clamp-3">{offer.pipeline_ativos || 'Não informado'}</p>
            </div>
            {offer.cronograma_resumido && (
              <div className="rounded-lg bg-secondary/50 p-3 border border-border/30 font-mono text-[11px] text-slate-400">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cronograma Provisório</p>
                <p className="leading-tight">{offer.cronograma_resumido}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fatores de Risco Regulatórios */}
      {riskFactors.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Fatores de Risco Identificados
          </h3>
          <div className="flex flex-wrap gap-2">
            {riskFactors.map((risk, index) => (
              <Badge
                key={index}
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-400 font-medium text-[11px] py-1 px-2.5"
              >
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5 text-amber-400 animate-pulse" />
                {risk}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Botões de Download e Links */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {offer.link_pdf_download && (
          <Button 
            asChild
            className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
          >
            <a href={offer.link_pdf_download} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" />
              Ver Prospecto Oficial (PDF)
            </a>
          </Button>
        )}
        {offer.link_oferta_cvm && (
          <Button 
            asChild
            variant="outline" 
            className="flex-1 gap-2 font-bold border-border/60"
          >
            <a href={offer.link_oferta_cvm} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Visualizar Oferta no Portal da CVM
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}