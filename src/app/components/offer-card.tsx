'use client'

import { Building2, FileText, TrendingUp, ArrowRight, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ProspectoExtraido } from '@/lib/types'
import { extractTicker, getSegment, parseNumeric } from '@/lib/types'
import { cn } from '@/lib/utils'

interface OfferCardProps {
  prospecto: ProspectoExtraido
  onSelect: () => void
  macro?: { selic_meta: string; cdi_daily: string; ipca_12m: string }
}

// Escala de Cores Corporativas BTG para bordas e badges
function getScoreColorClass(score: number | null) {
  if (score === null) return 'border-slate-800 bg-slate-900/10 text-slate-400'
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

/**
 * Calculador de Taxa Real Projetada
 * Combina a taxa do prospecto (ex: "IPCA + 6.5%") com os indicadores diários da CVM/Banco Central.
 */
function calcularTaxaReal(dyProjetado: string | null, macro: { selic_meta: string; cdi_daily: string; ipca_12m: string } | undefined): { taxaReal: string, bruta: string } {
  const bruta = dyProjetado || 'N/D'
  if (!dyProjetado) return { taxaReal: 'N/D', bruta }

  const text = dyProjetado.toUpperCase().replace(',', '.')
  const ipcaNum = parseFloat(macro?.ipca_12m || '4.50')
  const cdiNum = parseFloat(macro?.cdi_daily || '10.65')

  // Extrai o percentual flutuante declarado
  const matchFloat = text.match(/([\d.]+)/)
  const spread = matchFloat ? parseFloat(matchFloat[1]) : 0

  if (text.includes('IPCA')) {
    return { taxaReal: `${(ipcaNum + spread).toFixed(2)}% a.a.`, bruta }
  }
  if (text.includes('CDI')) {
    // Ex: "110% CDI" ou "CDI + 1.5%"
    if (text.includes('+')) {
      return { taxaReal: `${(cdiNum + spread).toFixed(2)}% a.a.`, bruta }
    }
    return { taxaReal: `${(cdiNum * (spread / 100)).toFixed(2)}% a.a.`, bruta }
  }

  // Fallback: se for taxa flat (ex: "11.8") exibe como está
  if (!isNaN(spread) && spread > 0) {
    return { taxaReal: `${spread.toFixed(2)}% a.a.`, bruta }
  }

  return { taxaReal: bruta, bruta }
}

export function OfferCard({ prospecto, onSelect, macro }: OfferCardProps) {
  const ticker = extractTicker(prospecto.arquivo_pdf)
  const segment = getSegment(prospecto.tipo_fii)
  const score = parseNumeric(prospecto.score_oferta)
  const scoreColorClass = getScoreColorClass(score)
  const scoreLabel = getScoreLabel(score)

  const pvp = parseNumeric(prospecto.pvp_oferta)
  
  // Nome do Emissor real e limpo para o cabeçalho
  const emissorNome = (prospecto as any).nome_emissor || 'Emissor Não Informado'

  // Projeta a taxa real ponderando os indicadores macro
  const { taxaReal, bruta } = calcularTaxaReal(prospecto.dy_projetado_pct, macro)

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-card transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 flex flex-col justify-between h-[360px]">
      
      {/* Score Badge Redondo Premium */}
      <div className="absolute right-4 top-4 z-10">
        <div className={cn('flex h-12 w-12 flex-col items-center justify-center rounded-xl border font-mono shadow-md', scoreColorClass)}>
          <span className="text-[10px] uppercase font-bold opacity-60">Score</span>
          <span className="text-base font-bold -mt-1">{score !== null ? score.toFixed(0) : '?'}</span>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between">
        {/* Cabeçalho Invertido: Emissor Gigante + Prospecto no Subtítulo */}
        <div className="pr-14">
          <div className="mb-2.5 flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'text-xs font-semibold px-2 py-0.5',
                segment === 'Tijolo'
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-btg-success/50 bg-btg-success/10 text-btg-success'
              )}
            >
              {segment === 'Tijolo' ? (
                <Building2 className="mr-1 h-3 w-3" />
              ) : (
                <FileText className="mr-1 h-3 w-3" />
              )}
              {segment}
            </Badge>
            {prospecto.numero_emissao && (
              <span className="text-xs text-muted-foreground font-mono">{prospecto.numero_emissao}ª Emissão</span>
            )}
          </div>

          {/* Nome do Emissor como elemento principal da interface */}
          <h3 className="text-base font-bold text-foreground leading-tight group-hover:text-primary transition-colors line-clamp-2 min-h-[40px] flex items-center">
            {emissorNome}
          </h3>
          
          <p className="text-xs text-slate-500 font-mono mt-1">
            Requerimento: {prospecto.arquivo_pdf?.replace('.pdf', '')} {ticker ? `(${ticker})` : ''}
          </p>
        </div>

        {/* Nível de Risco Badge */}
        <div className="my-3">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border', scoreColorClass)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"></span>
            {scoreLabel}
          </span>
        </div>

        {/* Métricas Chave do Card */}
        <div className="grid grid-cols-3 gap-2 text-center my-3">
          <div className="rounded-lg bg-secondary/30 p-2 border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase font-mono">Preço</p>
            <p className="text-xs font-bold text-foreground mt-0.5 truncate">{formatCurrency(prospecto.preco_emissao)}</p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-2 border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase font-mono">P/VP</p>
            <p className="text-xs font-bold text-foreground mt-0.5">{pvp !== null ? pvp.toFixed(2) : 'N/D'}</p>
          </div>
          <div className="rounded-lg bg-emerald-500/5 p-2 border border-emerald-500/20">
            <p className="text-[10px] text-emerald-400 uppercase font-mono font-bold">Taxa Real</p>
            <p className="text-xs font-bold text-emerald-400 mt-0.5 truncate">{taxaReal}</p>
            <span className="text-[8px] text-muted-foreground block truncate">Bruta: {bruta}</span>
          </div>
        </div>

        {/* Botão de Ação */}
        <Button
          onClick={onSelect}
          className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-semibold text-xs py-1.5"
        >
          Análise Detalhada
          <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  )
}