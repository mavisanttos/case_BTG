'use client'

import { Landmark, Zap, Flame, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { IndicadoresMacro } from '@/lib/types'

interface MacroIndicatorsProps {
  indicadores: IndicadoresMacro | null
}

const defaultIndicators = [
  { name: 'Taxa Selic Meta', value: 'Carregando...', icon: Landmark, trend: 'stable' as const },
  { name: 'Taxa DI / CDI', value: 'Carregando...', icon: Zap, trend: 'stable' as const },
  { name: 'Inflação IPCA (12m)', value: 'Carregando...', icon: Flame, trend: 'stable' as const },
]

const trendIconMap = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
}

const trendColorMap = {
  up: 'text-btg-success',
  down: 'text-btg-danger',
  stable: 'text-muted-foreground',
}

function formatPercentage(value: string | null): string {
  if (!value) return 'N/D'
  // Remove caracteres extras e formata
  const cleaned = value.replace(/[^\d.,%-]/g, '')
  if (cleaned.includes('%')) return cleaned
  return `${cleaned}%`
}

export function MacroIndicators({ indicadores }: MacroIndicatorsProps) {
  const indicators = indicadores
    ? [
        { 
          name: 'Taxa Selic Meta', 
          value: formatPercentage(indicadores.selic_meta) + ' a.a.', 
          icon: Landmark, 
          trend: 'stable' as const 
        },
        { 
          name: 'Taxa DI / CDI', 
          value: formatPercentage(indicadores.cdi_daily) + ' a.a.', 
          icon: Zap, 
          trend: 'up' as const 
        },
        { 
          name: 'Inflação IPCA (12m)', 
          value: formatPercentage(indicadores.ipca_12m), 
          icon: Flame, 
          trend: 'down' as const 
        },
      ]
    : defaultIndicators

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {indicators.map((indicator) => {
        const Icon = indicator.icon
        const TrendIcon = trendIconMap[indicator.trend]
        const trendColor = trendColorMap[indicator.trend]

        return (
          <div
            key={indicator.name}
            className="group relative overflow-hidden rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
          >
            {/* Background decoration */}
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5 transition-transform group-hover:scale-110" />
            
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{indicator.name}</p>
                  <p className="text-xl font-bold text-foreground">{indicator.value}</p>
                </div>
              </div>
              <div className={`flex items-center gap-1 ${trendColor}`}>
                <TrendIcon className="h-4 w-4" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
