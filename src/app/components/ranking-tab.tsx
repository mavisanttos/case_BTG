'use client'

import { useState, useMemo } from 'react'
import { Search, Filter, ShieldAlert, Building2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { OfferCard } from './offer-card'
import type { ProspectoExtraido } from '@/lib/types'
import { extractTicker, parseNumeric } from '@/lib/types'

interface RankingTabProps {
  prospectos: ProspectoExtraido[]
  onSelectOffer: (offer: ProspectoExtraido) => void
  macro?: { selic_meta: string; cdi_daily: string; ipca_12m: string } // Adicionado prop de indicadores macro
}

export function RankingTab({ prospectos, onSelectOffer, macro }: RankingTabProps) {
  const [search, setSearch] = useState('')
  const [risk, setRisk] = useState('all')
  const [segment, setSegment] = useState('all')

  const filteredOffers = useMemo(() => {
    return prospectos
      .filter((prospecto) => {
        const ticker = extractTicker(prospecto.arquivo_pdf)
        // Busca pelo nome do emissor ou pelo número do prospecto/ticker
        const nomeEmissor = (prospecto as any).nome_emissor || prospecto.arquivo_pdf || ''
        
        const matchesSearch =
          ticker.toLowerCase().includes(search.toLowerCase()) ||
          nomeEmissor.toLowerCase().includes(search.toLowerCase())
        
        const score = parseNumeric(prospecto.score_oferta) ?? 0
        
        // Lógica do Filtro de Risco (Score BTG)
        let matchesRisk = true
        if (risk === 'baixo') matchesRisk = score >= 80
        else if (risk === 'medio') matchesRisk = score >= 60 && score < 80
        else if (risk === 'alto') matchesRisk = score < 60

        // Lógica do Filtro de Segmento (Tijolo / Papel)
        const prospectoSegment = (prospecto.tipo_fii || '').toLowerCase()
        const matchesSegment = segment === 'all' || prospectoSegment.includes(segment.toLowerCase())
        
        return matchesSearch && matchesRisk && matchesSegment
      })
      .sort((a, b) => {
        const scoreA = parseNumeric(a.score_oferta) ?? 0
        const scoreB = parseNumeric(b.score_oferta) ?? 0
        return scoreB - scoreA
      })
  }, [prospectos, search, risk, segment])

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Busca */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome do Emissor ou Requerimento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-secondary border-border/50"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>{filteredOffers.length} ofertas encontradas</span>
        </div>
      </div>

      {/* Filtros Fixos e Aparentes */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/50 bg-card p-4 md:grid-cols-2">
        {/* Filtro de Risco */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            Nível de Risco (Score BTG)
          </label>
          <Select value={risk} onValueChange={setRisk}>
            <SelectTrigger className="bg-secondary border-border/50">
              <SelectValue placeholder="Todos os riscos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Níveis</SelectItem>
              <SelectItem value="baixo">Risco Baixo (Score ≥ 80)</SelectItem>
              <SelectItem value="medio">Risco Médio (Score 60 a 79)</SelectItem>
              <SelectItem value="alto">Risco Alto (Score &lt; 60)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filtro de Segmento */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Building2 className="h-4 w-4" />
            Segmento
          </label>
          <Select value={segment} onValueChange={setSegment}>
            <SelectTrigger className="bg-secondary border-border/50">
              <SelectValue placeholder="Todos os segmentos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Segmentos</SelectItem>
              <SelectItem value="tijolo">Tijolo</SelectItem>
              <SelectItem value="papel">Papel</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid de Ofertas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredOffers.map((prospecto) => (
          <OfferCard 
            key={prospecto.arquivo_pdf} 
            prospecto={prospecto} 
            onSelect={() => onSelectOffer(prospecto)}
            macro={macro} // Passando indicadores do dia para o calculador interno do Card
          />
        ))}
      </div>

      {filteredOffers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma oferta encontrada</h3>
          <p className="text-sm text-muted-foreground">
            {prospectos.length === 0 
              ? 'Não há dados no banco de dados ainda.' 
              : 'Tente ajustar os filtros de busca para encontrar emissores diferentes.'}
          </p>
        </div>
      )}
    </div>
  )
}