'use client'

import { useState, useMemo } from 'react'
import {
  Wallet, Target, Sparkles, TrendingUp, Shield, Zap,
  DollarSign, PiggyBank, Loader2, AlertTriangle, Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts'
import type { ProspectoExtraido } from '@/lib/types'

interface OptimizerTabProps {
  prospectos: ProspectoExtraido[]
}

interface AssetScore {
  prospecto: any
  name: string
  segment: 'Tijolo' | 'Papel' | 'Híbrido'
  ticker: string
  dy: number
  pvp: number
  score_btg: number
  vacancia: number
  ltv: number
  // Scores calculados (0–10)
  score_retorno: number    // DY alto = maior retorno
  score_seguranca: number  // score BTG + P/VP + baixa vacância/LTV
  score_risco: number      // inverso: vacância alta, LTV alto, PVP extremo = risco alto
  // Peso final calculado pelo motor de alocação
  peso_final: number
}

interface PortfolioAllocation {
  name: string
  segment: 'Tijolo' | 'Papel' | 'Híbrido'
  value: number
  percentage: number
  ticker: string
  score_btg: number
  dy: number
  score_retorno: number
  score_seguranca: number
  score_risco: number
  justificativa: string
}

// ── Configuração dos perfis ────────────────────────────────────────────────
// Cada perfil define os pesos das dimensões na função de utilidade do ativo
// e os limites macro de alocação tijolo/papel
const PERFIS = {
  conservative: {
    label: 'Conservador',
    icon: Shield,
    color: '#22c55e',
    // Quanto cada dimensão pesa na escolha do ativo (soma = 1)
    w_seguranca: 0.60,
    w_retorno:   0.20,
    w_risco:     0.20,   // penaliza risco (subtraído)
    // Alocação macro: tijolo/papel base por objetivo
    tijolo_base: 0.35,
    papel_base:  0.65,
    // Diversificação: mínimo de ativos por segmento
    min_tijolo: 1,
    min_papel:  2,
    max_ativos: 4,
    // Concentração máxima por ativo
    max_peso_ativo: 0.30,
  },
  moderate: {
    label: 'Moderado',
    icon: Target,
    color: '#38bdf8',
    w_seguranca: 0.40,
    w_retorno:   0.35,
    w_risco:     0.25,
    tijolo_base: 0.50,
    papel_base:  0.50,
    min_tijolo: 2,
    min_papel:  2,
    max_ativos: 5,
    max_peso_ativo: 0.35,
  },
  aggressive: {
    label: 'Arrojado',
    icon: Zap,
    color: '#f59e0b',
    w_seguranca: 0.20,
    w_retorno:   0.55,
    w_risco:     0.25,
    tijolo_base: 0.65,
    papel_base:  0.35,
    min_tijolo: 2,
    min_papel:  1,
    max_ativos: 5,
    max_peso_ativo: 0.40,
  },
} as const

type RiskProfile = keyof typeof PERFIS
type Objective = 'income' | 'capital' | 'balanced'

// ── Helpers ────────────────────────────────────────────────────────────────
function getProp(obj: any, key: string): any {
  if (!obj) return null
  return obj[key.toLowerCase()] ?? obj[key] ?? obj[key.toUpperCase()] ?? null
}

function safeNum(val: any): number {
  if (!val) return 0
  if (typeof val === 'number') return val
  const n = parseFloat(String(val).replace(',', '.').replace(/[^\d.-]/g, ''))
  return isNaN(n) ? 0 : n
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

// Normaliza um valor para escala 0–10, dado min e max do universo
function normalize(val: number, min: number, max: number): number {
  if (max === min) return 5
  return clamp(((val - min) / (max - min)) * 10, 0, 10)
}

// ── Motor de Scoring e Alocação ────────────────────────────────────────────
function calcularScores(prospectos: any[]): AssetScore[] {
  const ativos = prospectos.map(p => ({
    prospecto: p,
    name:      getProp(p, 'nome_emissor') || getProp(p, 'arquivo_pdf')?.replace('.pdf','') || 'Fundo',
    segment:   (String(getProp(p, 'tipo_fii') || '').toLowerCase().includes('papel') ? 'Papel'
                : String(getProp(p, 'tipo_fii') || '').toLowerCase().includes('hibrido') ? 'Híbrido'
                : 'Tijolo') as 'Tijolo' | 'Papel' | 'Híbrido',
    ticker:    getProp(p, 'arquivo_pdf')?.replace('.pdf','') || '',
    dy:        safeNum(getProp(p, 'dy_projetado_pct')),
    pvp:       safeNum(getProp(p, 'pvp_oferta')) || 1,
    score_btg: safeNum(getProp(p, 'score_oferta')),
    vacancia:  safeNum(getProp(p, 'vacancia_fisica_pct')),
    ltv:       safeNum(getProp(p, 'ltv_medio_pct')),
    score_retorno:  0,
    score_seguranca: 0,
    score_risco:    0,
    peso_final: 0,
  }))

  if (!ativos.length) return []

  // Normaliza cada dimensão no universo disponível
  const dys      = ativos.map(a => a.dy)
  const pvps     = ativos.map(a => a.pvp)
  const scores   = ativos.map(a => a.score_btg)
  const vacancias = ativos.map(a => a.vacancia)
  const ltvs     = ativos.map(a => a.ltv)

  const [minDy, maxDy]     = [Math.min(...dys),      Math.max(...dys)]
  const [minPvp, maxPvp]   = [Math.min(...pvps),     Math.max(...pvps)]
  const [minScore, maxScore] = [Math.min(...scores), Math.max(...scores)]
  const [minVac, maxVac]   = [Math.min(...vacancias), Math.max(...vacancias)]
  const [minLtv, maxLtv]   = [Math.min(...ltvs),     Math.max(...ltvs)]

  return ativos.map(a => {
    // Score de retorno: DY alto = 10
    const score_retorno = normalize(a.dy, minDy, maxDy)

    // Score de segurança:
    //   score BTG alto = bom
    //   P/VP próximo de 1 (0.9–1.05) = ideal (muito abaixo ou acima penaliza)
    const pvp_ideal = 10 - normalize(Math.abs(a.pvp - 0.98), 0, 0.5) * 10
    const score_seguranca = (
      normalize(a.score_btg, minScore, maxScore) * 0.5 +
      clamp(pvp_ideal, 0, 10)                         * 0.5
    )

    // Score de risco: vacância alta e LTV alto = risco alto = 10
    //   (para conservador isso é PENALIZADO; para arrojado é ACEITO)
    const vac_score = a.segment === 'Papel' ? 5 : normalize(a.vacancia, minVac, maxVac)
    const ltv_score = a.segment === 'Tijolo' ? 5 : normalize(a.ltv, minLtv, maxLtv)
    const score_risco = (vac_score * 0.5 + ltv_score * 0.5)

    return { ...a, score_retorno, score_seguranca, score_risco }
  })
}

function calcularUtilidade(ativo: AssetScore, perfil: typeof PERFIS[RiskProfile]): number {
  // Conservador: maximiza segurança, penaliza risco
  // Arrojado: maximiza retorno, tolera risco
  // O risco é subtraído ponderado — arrojado aceita mais risco por retorno
  return (
    ativo.score_retorno  * perfil.w_retorno +
    ativo.score_seguranca * perfil.w_seguranca -
    ativo.score_risco    * (perfil.w_risco * (1 - perfil.w_retorno))
  )
}

function alocarCarteira(
  ativos: AssetScore[],
  riskProfile: RiskProfile,
  objective: Objective,
  capital: number
): PortfolioAllocation[] {
  const perfil = PERFIS[riskProfile]

  // Ajuste macro tijolo/papel pelo objetivo
  let tijoloW = perfil.tijolo_base
  let papelW  = perfil.papel_base
  if (objective === 'income')  { tijoloW -= 0.10; papelW  += 0.10 }
  if (objective === 'capital') { tijoloW += 0.10; papelW  -= 0.10 }

  const tijoloAtivos = ativos.filter(a => a.segment === 'Tijolo' || a.segment === 'Híbrido')
  const papelAtivos  = ativos.filter(a => a.segment === 'Papel')

  // Calcula utilidade de cada ativo e ordena
  const tijoloRanked = tijoloAtivos
    .map(a => ({ ...a, utilidade: calcularUtilidade(a, perfil) }))
    .sort((a, b) => b.utilidade - a.utilidade)

  const papelRanked = papelAtivos
    .map(a => ({ ...a, utilidade: calcularUtilidade(a, perfil) }))
    .sort((a, b) => b.utilidade - a.utilidade)

  // Seleciona os melhores respeitando mínimos e máximo de ativos
  const tijoloSel = tijoloRanked.slice(0, Math.max(perfil.min_tijolo,
    Math.min(3, tijoloRanked.length)))
  const papelSel  = papelRanked.slice(0, Math.max(perfil.min_papel,
    Math.min(3, papelRanked.length)))

  const selecionados = [...tijoloSel, ...papelSel].slice(0, perfil.max_ativos)

  if (!selecionados.length) return []

  // Alocação dentro de cada segmento proporcional à utilidade
  // com cap de max_peso_ativo para evitar concentração excessiva
  function distribuirPeso(grupo: typeof tijoloSel, capitalSegmento: number) {
    if (!grupo.length) return []
    const totalUtil = grupo.reduce((s, a) => s + Math.max(a.utilidade, 0.1), 0)
    const pesos = grupo.map(a => Math.max(a.utilidade, 0.1) / totalUtil)

    // Aplica cap por ativo e redistribui excesso
    const capped = pesos.map(p => Math.min(p, perfil.max_peso_ativo))
    const totalCapped = capped.reduce((s, p) => s + p, 0)
    const normalized = capped.map(p => p / totalCapped)

    return grupo.map((ativo, i) => ({
      ...ativo,
      peso_no_segmento: normalized[i],
      value: capitalSegmento * normalized[i],
      percentage: (capitalSegmento * normalized[i] / capital) * 100,
    }))
  }

  const tijoloCapital = capital * tijoloW
  const papelCapital  = capital * papelW

  const tijoloAlloc = distribuirPeso(
    selecionados.filter(a => a.segment !== 'Papel'),
    tijoloCapital
  )
  const papelAlloc = distribuirPeso(
    selecionados.filter(a => a.segment === 'Papel'),
    papelCapital
  )

  const toAllocation = (a: any): PortfolioAllocation => {
    // Gera justificativa legível baseada nos scores reais
    const perfNome = perfil.label
    let just = ''
    if (a.score_seguranca >= 7)
      just = `Alta segurança (${a.score_seguranca.toFixed(1)}/10) — adequado para perfil ${perfNome.toLowerCase()}.`
    else if (a.score_retorno >= 7)
      just = `DY elevado (${a.dy.toFixed(1)}% a.a.) com risco compatível com perfil ${perfNome.toLowerCase()}.`
    else
      just = `Equilíbrio entre retorno (${a.dy.toFixed(1)}%) e segurança (${a.score_seguranca.toFixed(1)}/10).`

    return {
      name:           a.name,
      segment:        a.segment,
      value:          a.value,
      percentage:     a.percentage,
      ticker:         a.ticker,
      score_btg:      a.score_btg,
      dy:             a.dy,
      score_retorno:  a.score_retorno,
      score_seguranca: a.score_seguranca,
      score_risco:    a.score_risco,
      justificativa:  just,
    }
  }

  return [...tijoloAlloc, ...papelAlloc].map(toAllocation)
}

// ── Componente ─────────────────────────────────────────────────────────────
const COLORS_SEG = { Tijolo: '#38bdf8', Papel: '#22c55e', 'Híbrido': '#a78bfa' }

export function OptimizerTab({ prospectos }: OptimizerTabProps) {
  const [capital,     setCapital]     = useState('200000')
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('moderate')
  const [objective,   setObjective]   = useState<Objective>('balanced')
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [result, setResult] = useState<{
    allocations: PortfolioAllocation[]
    tijoloPercentage: number
    papelPercentage:  number
    monthlyIncome:    number
    yearlyYield:      number
    radarData:        any[]
  } | null>(null)

  const ativos = useMemo(() => calcularScores(prospectos), [prospectos])

  const handleOptimize = () => {
    setIsOptimizing(true)
    setTimeout(() => {
      const capitalValue = parseFloat(capital.replace(/\D/g, '')) || 200_000
      const allocations = alocarCarteira(ativos, riskProfile, objective, capitalValue)

      const tijoloPercentage = Math.round(
        allocations.filter(a => a.segment !== 'Papel')
          .reduce((s, a) => s + a.percentage, 0)
      )
      const papelPercentage = 100 - tijoloPercentage
      const avgYield = allocations.reduce((s, a) => s + a.dy * (a.percentage / 100), 0)
      const monthlyIncome = (capitalValue * (avgYield / 100)) / 12

      // Dados para o radar de perfil da carteira
      const radarData = [
        { dim: 'Retorno',    value: allocations.reduce((s,a) => s + a.score_retorno   * (a.percentage/100), 0) * 10 },
        { dim: 'Segurança',  value: allocations.reduce((s,a) => s + a.score_seguranca * (a.percentage/100), 0) * 10 },
        { dim: 'Diversif.',  value: Math.min(allocations.length * 20, 100) },
        { dim: 'Liquidez',   value: tijoloPercentage > 60 ? 70 : 85 },
        { dim: 'Isenção IR', value: allocations.filter(a => a.segment === 'Papel').length > 0 ? 90 : 40 },
      ]

      setResult({ allocations, tijoloPercentage, papelPercentage, monthlyIncome, yearlyYield: avgYield, radarData })
      setIsOptimizing(false)
    }, 1200)
  }

  const perfilAtual = PERFIS[riskProfile]
  const PerfilIcon  = perfilAtual.icon

  const pieData = result ? [
    { name: 'Tijolo / Híbrido', value: result.tijoloPercentage },
    { name: 'Papel',            value: result.papelPercentage  },
  ] : []

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

      {/* ── Painel de Input ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/50 bg-card p-6 flex flex-col gap-6">
        <h3 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Target className="h-6 w-6 text-primary" />
          Parâmetros de Otimização
        </h3>

        {/* Capital */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Wallet className="h-4 w-4" /> Valor para Investir
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">R$</span>
            <Input
              type="text"
              value={capital}
              onChange={e => setCapital(e.target.value.replace(/\D/g, ''))}
              className="pl-10 bg-secondary border-border/50 text-lg font-bold font-mono"
            />
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {formatBRL(parseFloat(capital) || 0)}
          </p>
        </div>

        {/* Perfil de risco */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <AlertTriangle className="h-4 w-4" /> Perfil de Risco
          </label>
          <Select value={riskProfile} onValueChange={v => setRiskProfile(v as RiskProfile)}>
            <SelectTrigger className="bg-secondary border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="conservative">🛡️ Conservador — prioriza segurança e renda estável</SelectItem>
              <SelectItem value="moderate">⚖️ Moderado — equilíbrio risco/retorno</SelectItem>
              <SelectItem value="aggressive">⚡ Arrojado — aceita mais risco por maior retorno</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Objetivo */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TrendingUp className="h-4 w-4" /> Objetivo Principal
          </label>
          <Select value={objective} onValueChange={v => setObjective(v as Objective)}>
            <SelectTrigger className="bg-secondary border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="income">💰 Renda Mensal — foco em dividendos (mais Papel)</SelectItem>
              <SelectItem value="capital">📈 Valorização — foco em crescimento (mais Tijolo)</SelectItem>
              <SelectItem value="balanced">⚖️ Equilibrado — crescimento + renda</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Legenda do motor de alocação */}
        <div className="rounded-lg bg-secondary/40 border border-border/30 p-3 space-y-1.5">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Info className="h-3 w-3" /> Como a alocação é calculada
          </p>
          <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
            <div className="text-center p-1.5 rounded bg-secondary">
              <div className="font-bold text-sky-400">Segurança</div>
              <div className="text-muted-foreground">{Math.round(perfilAtual.w_seguranca * 100)}%</div>
            </div>
            <div className="text-center p-1.5 rounded bg-secondary">
              <div className="font-bold text-emerald-400">Retorno</div>
              <div className="text-muted-foreground">{Math.round(perfilAtual.w_retorno * 100)}%</div>
            </div>
            <div className="text-center p-1.5 rounded bg-secondary">
              <div className="font-bold text-amber-400">Risco</div>
              <div className="text-muted-foreground">{Math.round(perfilAtual.w_risco * 100)}%</div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Cada ativo recebe peso proporcional à sua utilidade calculada. 
            Concentração máxima por ativo: {Math.round(perfilAtual.max_peso_ativo * 100)}%.
          </p>
        </div>

        <Button
          onClick={handleOptimize}
          disabled={isOptimizing || prospectos.length === 0}
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
          size="lg"
        >
          {isOptimizing ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Calculando alocação ótima...</>
          ) : (
            <><Sparkles className="h-5 w-5" /> Gerar Carteira Recomendada</>
          )}
        </Button>

        {prospectos.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Aguardando sincronização de prospectos...
          </p>
        )}
      </div>

      {/* ── Painel de Resultados ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/50 bg-card p-6 overflow-y-auto max-h-[780px]">
        <h3 className="mb-4 flex items-center justify-between text-xl font-semibold text-foreground">
          <span className="flex items-center gap-2">
            <PiggyBank className="h-6 w-6 text-btg-gold" />
            Sugestão de Alocação
          </span>
          {result && (
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              Portfólio Gerado
            </span>
          )}
        </h3>

        {result && result.allocations.length > 0 ? (
          <div className="space-y-5">

            {/* Macro alocação + radar */}
            <div className="grid grid-cols-2 gap-3">
              {/* Pie */}
              <div className="flex flex-col items-center">
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50}
                           paddingAngle={5} dataKey="value">
                        {pieData.map((entry, i) => (
                          <Cell key={i}
                            fill={i === 0 ? '#38bdf8' : '#22c55e'}
                            stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0c121e', border: '1px solid #1e2a3a', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(v: number) => `${v}%`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-1 font-mono text-xs">
                  <div className="flex justify-between items-center bg-secondary/40 px-2 py-1 rounded border border-border/30">
                    <span className="text-sky-400 font-bold">Tijolo/Híbrido</span>
                    <span className="text-white font-bold">{result.tijoloPercentage}%</span>
                  </div>
                  <div className="flex justify-between items-center bg-secondary/40 px-2 py-1 rounded border border-border/30">
                    <span className="text-emerald-400 font-bold">Papel</span>
                    <span className="text-white font-bold">{result.papelPercentage}%</span>
                  </div>
                </div>
              </div>

              {/* Radar de perfil da carteira */}
              <div className="h-44">
                <p className="text-[10px] text-muted-foreground font-mono text-center mb-1 uppercase tracking-wider">Perfil da Carteira</p>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={result.radarData}>
                    <PolarGrid stroke="#1e2a3a" />
                    <PolarAngleAxis dataKey="dim" tick={{ fill: '#64748b', fontSize: 9 }} />
                    <Radar dataKey="value" stroke={perfilAtual.color} fill={perfilAtual.color} fillOpacity={0.25} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Lista de ativos com scores visíveis */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-muted-foreground uppercase font-mono tracking-wider">
                Ativos Selecionados
              </p>
              {result.allocations.map((alloc, i) => (
                <div key={i}
                  className="rounded-lg bg-secondary/30 border border-border/30 p-3 hover:border-primary/30 transition-colors space-y-2">
                  {/* Linha 1: nome + valor */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-2 w-2 rounded-full shrink-0 mt-1"
                           style={{ backgroundColor: COLORS_SEG[alloc.segment] }} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate" title={alloc.name}>
                          {alloc.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {alloc.segment} · {alloc.percentage.toFixed(1)}% do aporte
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-primary font-mono text-sm">{formatBRL(alloc.value)}</p>
                      <p className="text-[10px] text-emerald-400 font-mono">DY {alloc.dy.toFixed(1)}%</p>
                    </div>
                  </div>

                  {/* Linha 2: barra de scores (retorno / segurança / risco) */}
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                    {[
                      { label: 'Retorno',   val: alloc.score_retorno,   color: '#22c55e' },
                      { label: 'Segurança', val: alloc.score_seguranca, color: '#38bdf8' },
                      { label: 'Risco',     val: alloc.score_risco,     color: '#f59e0b' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="space-y-0.5">
                        <div className="flex justify-between">
                          <span style={{ color }} className="font-bold">{label}</span>
                          <span className="text-muted-foreground">{val.toFixed(1)}</span>
                        </div>
                        <div className="h-1 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                               style={{ width: `${val * 10}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Linha 3: justificativa */}
                  <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/20 pt-1.5">
                    {alloc.justificativa}
                  </p>
                </div>
              ))}
            </div>

            {/* Resumo financeiro */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex justify-between items-center">
              <div>
                <span className="text-xs text-emerald-400 font-mono font-bold uppercase tracking-wider block mb-1">
                  Rendimento Mensal Projetado
                </span>
                <p className="text-2xl font-bold text-white font-mono">
                  {formatBRL(result.monthlyIncome)}
                  <span className="text-xs text-slate-400 font-sans font-normal"> /mês</span>
                </p>
              </div>
              <div className="text-right">
                <DollarSign className="h-8 w-8 text-emerald-400 opacity-80 mb-1 inline-block" />
                <p className="text-[10px] text-slate-400 font-mono block">
                  Yield Médio Ponderado: {result.yearlyYield.toFixed(2)}% a.a.
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {result.allocations.length} ativo(s) · máx. {Math.round(PERFIS[riskProfile].max_peso_ativo * 100)}% por ativo
                </p>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <Sparkles className="mb-4 h-12 w-12 text-slate-700" />
            <p className="text-sm text-muted-foreground max-w-[260px]">
              Configure o perfil do investidor e clique em{' '}
              <span className="text-primary font-semibold">Gerar Carteira</span>.
              O motor calculará a alocação ótima para cada ativo.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}