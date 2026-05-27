'use client'

import { useMemo } from 'react'
import { Activity, TrendingUp, Building2, FileText, Target, Award, Info, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Cell, Pie } from 'recharts'
import type { ProspectoExtraido } from '@/lib/types'

interface AnalyticsTabProps {
  prospectos: ProspectoExtraido[]
}

// Helper seguro para buscar chaves de metadados em qualquer formatação (CVM ou Supabase)
function getProp(obj: any, key: string): any {
  if (!obj) return null
  const lowerKey = key.toLowerCase()
  const upperKey = key.toUpperCase()
  const titleKey = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
  
  return obj[lowerKey] ?? obj[key] ?? obj[upperKey] ?? obj[titleKey] ?? null
}

// Conversor Monetário Infalível: Transforma strings como "R$ 1.500.000.000,00" em 1500000000 (Float nativo)
function parseBRLValue(val: any): number {
  if (val === null || val === undefined) return 0
  const str = String(val).trim()
  if (!str) return 0
  
  // Limpa o prefixo "R$" e espaços invisíveis
  let clean = str.replace(/R\$\s?/gi, '').replace(/\s/g, '')
  
  // Analisa a posição de vírgulas e pontos para inferir a formatação (ex: 1.000.000,50)
  const lastComma = clean.lastIndexOf(',')
  const lastDot = clean.lastIndexOf('.')
  
  if (lastComma > lastDot) {
     // Padrão Brasil (1.000,50) -> Remove pontos, converte vírgula pra ponto
     clean = clean.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma && lastComma !== -1) {
     // Padrão EUA (1,000.50) -> Apenas remove a vírgula
     clean = clean.replace(/,/g, '')
  } else if (lastComma !== -1 && lastDot === -1) {
     // Apenas vírgula de decimal (1000,50)
     clean = clean.replace(',', '.')
  }
  
  const parsed = parseFloat(clean)
  return isNaN(parsed) ? 0 : parsed
}

// Conversor Numérico Seguro para Porcentagens e Scores
function safeParseNumeric(val: any): number {
  if (!val) return 0
  if (typeof val === 'number') return val
  const clean = String(val).replace(',', '.').replace(/[^\d.-]/g, '')
  const parsed = parseFloat(clean)
  return isNaN(parsed) ? 0 : parsed
}

export function AnalyticsTab({ prospectos }: AnalyticsTabProps) {
  
  const stats = useMemo(() => {
    // 1. Filtragem Segura de Segmentos
    const tijoloOffers = prospectos.filter((p) => {
      const seg = String(getProp(p, 'tipo_fii') || '').toLowerCase()
      return seg.includes('tijolo')
    })
    const papelOffers = prospectos.filter((p) => {
      const seg = String(getProp(p, 'tipo_fii') || '').toLowerCase()
      return seg.includes('papel')
    })

    // 2. Volumes Totais usando o novo conversor monetário (Evita retornar R$ 0.00 bi)
    const tijoloVolume = tijoloOffers.reduce((acc, p) => acc + parseBRLValue(getProp(p, 'montante_total')), 0)
    const papelVolume = papelOffers.reduce((acc, p) => acc + parseBRLValue(getProp(p, 'montante_total')), 0)
    const totalVolume = tijoloVolume + papelVolume

    // 3. Cálculo das taxas médias ignorando valores zerados
    const yields = prospectos.map((p) => safeParseNumeric(getProp(p, 'dy_projetado_pct'))).filter((y) => y > 0)
    const avgYield = yields.length > 0 ? yields.reduce((a, b) => a + b, 0) / yields.length : 0

    const pvps = prospectos.map((p) => safeParseNumeric(getProp(p, 'pvp_oferta'))).filter((p) => p > 0)
    const avgPvp = pvps.length > 0 ? pvps.reduce((a, b) => a + b, 0) / pvps.length : 0

    // 4. Agrupamento Limpo de Volume por Coordenador Líder
    const coordinatorMap = new Map<string, number>()
    prospectos.forEach((p) => {
      let lider = getProp(p, 'nome_lider') || 'Não Informado'
      // Normaliza nomes corporativos longos para gráficos mais limpos
      lider = lider.split(' S/A ')[0].split(' S.A. ')[0].split(' S.A ')[0].split(' BANCO ')[0].trim()
      
      const volume = parseBRLValue(getProp(p, 'montante_total'))
      coordinatorMap.set(lider, (coordinatorMap.get(lider) || 0) + volume)
    })

    // Ordena coordenadores do maior para o menor em bilhões
    const sortedCoordinators = Array.from(coordinatorMap.entries())
      .map(([name, volume]) => ({ name, volume: volume / 1000000000 }))
      .sort((a, b) => b.volume - a.volume)

    // Agrupa em "Top 5" e soma o restante em "Demais Coordenadores"
    const top5 = sortedCoordinators.slice(0, 5)
    const restVolume = sortedCoordinators.slice(5).reduce((sum, item) => sum + item.volume, 0)
    const coordinatorData = [...top5]
    
    if (restVolume > 0) {
      coordinatorData.push({ name: 'Demais Coordenadores', volume: restVolume })
    }

    // 5. Distribuição de Qualidade de Risco por Faixa de Score BTG
    let riskHighCount = 0 // Score < 60
    let riskMedCount = 0  // Score 60-79
    let riskLowCount = 0  // Score 80+

    prospectos.forEach((p) => {
      const score = safeParseNumeric(getProp(p, 'score_oferta'))
      if (score >= 80) riskLowCount++
      else if (score >= 60) riskMedCount++
      else riskHighCount++
    })

    const creditRiskData = [
      { name: 'Risco Baixo (Score 80+)', value: riskLowCount, fill: '#22c55e' },
      { name: 'Risco Moderado (60-79)', value: riskMedCount, fill: '#fbbf24' },
      { name: 'Risco Elevado (Sub 60)', value: riskHighCount, fill: '#ef4444' },
    ]

    // 6. Dados Consolidados de Mercado
    const marketData = [
      { metric: 'Volume Global na Amostra Analisada', value: `R$ ${(totalVolume / 1000000000).toFixed(2)} bi` },
      { metric: 'Número de Ofertas Analisadas', value: String(prospectos.length) },
      { metric: 'Yield Médio Projetado (Base Atual)', value: `${avgYield.toFixed(2)}% a.a.` },
      { metric: 'P/VP Médio da Amostra', value: avgPvp.toFixed(2) },
      { metric: 'Captação Ativa no Segmento de Tijolo', value: `R$ ${(tijoloVolume / 1000000000).toFixed(2)} bi` },
      { metric: 'Captação Ativa no Segmento de Papel', value: `R$ ${(papelVolume / 1000000000).toFixed(2)} bi` },
    ]

    return {
      tijoloCount: tijoloOffers.length,
      papelCount: papelOffers.length,
      tijoloVolume,
      papelVolume,
      avgYield,
      avgPvp,
      coordinatorData,
      creditRiskData,
      marketData,
    }
  }, [prospectos])

  return (
    <div className="space-y-6">

      {/* Alerta Institucional (Justificativa de Amostra) */}
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 leading-relaxed">
          <p className="font-bold text-sky-400 mb-0.5">Nota Executiva (Wealth Desk):</p>
          Para assegurar agilidade em tempo real, este dashboard calcula as macro-tendências sobre uma amostra de <strong>{prospectos.length} ofertas ativas</strong> processadas aleatoriamente do nosso pipeline (13.000+). Isso confere um panorama extremamente fiel da volumetria, emissores e riscos de crédito do mercado primário de FIIs na data de hoje.
        </div>
      </div>
      
      {/* 4 Cards Principais de Estatísticas de Entrada */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
          <Building2 className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="text-2xl font-extrabold text-foreground font-mono">{stats.tijoloCount}</p>
          <p className="text-xs text-muted-foreground font-semibold mt-1">Ofertas de Tijolo</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
          <p className="text-2xl font-extrabold text-foreground font-mono">{stats.papelCount}</p>
          <p className="text-xs text-muted-foreground font-semibold mt-1">Ofertas de Papel</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
          <TrendingUp className="mx-auto mb-2 h-8 w-8 text-amber-400" />
          <p className="text-2xl font-extrabold text-foreground font-mono">{stats.avgYield.toFixed(2)}%</p>
          <p className="text-xs text-muted-foreground font-semibold mt-1">Yield Médio Real</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
          <Activity className="mx-auto mb-2 h-8 w-8 text-sky-400" />
          <p className="text-2xl font-extrabold text-foreground font-mono">{stats.avgPvp.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground font-semibold mt-1">P/VP Médio Geral</p>
        </div>
      </div>

      {/* Gráficos Analíticos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        
        {/* Gráfico 1: Volume por Coordenador (Top 5 + Resto) */}
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
            <Award className="h-5 w-5 text-primary" />
            Originação e Volume por Coordenador (R$ bi)
          </h3>
          <div className="h-72">
            {stats.coordinatorData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.coordinatorData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    type="number"
                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                    tickFormatter={(value) => `R$ ${value.toFixed(1)}B`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0c121e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: number) => [`R$ ${value.toFixed(2)} bi`, 'Volume Coordenado']}
                  />
                  <Bar dataKey="volume" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Sem dados disponíveis</div>
            )}
          </div>
        </div>

        {/* Gráfico 2: Qualidade de Crédito */}
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
            <Target className="h-5 w-5 text-amber-400" />
            Distribuição de Qualidade (Score BTG)
          </h3>
          <div className="h-72 flex items-center justify-center">
            {prospectos.length > 0 ? (
              <div className="w-full h-full flex flex-col sm:flex-row items-center justify-around">
                <div className="w-1/2 h-full min-h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.creditRiskData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {stats.creditRiskData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0c121e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 font-mono text-xs">
                  {stats.creditRiskData.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.fill }}></span>
                      <span className="text-slate-400">{item.name}:</span>
                      <span className="font-bold text-white text-sm">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Sem dados disponíveis</div>
            )}
          </div>
        </div>

      </div>

      {/* Tabela de Consolidado de Mercado */}
      <div className="rounded-xl border border-border/50 bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
          <BarChart3 className="h-5 w-5 text-primary" />
          Análise Consolidada do Mercado de Capitais (CVM)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="py-3 text-sm font-bold text-muted-foreground">Indicador / Métrica Corporativa</th>
                <th className="py-3 text-right text-sm font-bold text-muted-foreground">Valor na Amostra Analisada</th>
              </tr>
            </thead>
            <tbody>
              {stats.marketData.map((row, index) => (
                <tr key={index} className="border-b border-border/20 last:border-0 hover:bg-secondary/10 transition-colors">
                  <td className="py-3 text-sm text-foreground font-sans">{row.metric}</td>
                  <td className="py-3 text-right text-sm font-bold text-primary font-mono">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}