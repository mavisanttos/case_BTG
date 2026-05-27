'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MessageSquare, X, Send, Sparkles, Bot, User,
  Database, TrendingUp, BarChart2, Loader2,
  ChevronRight, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ProspectoExtraido } from '@/lib/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]   // tools usadas pelo agente
  loading?: boolean
}

interface FloatingChatProps {
  prospectos: ProspectoExtraido[]
}

// ── Sugestões por categoria ────────────────────────────────────────────────
const SUGGESTION_GROUPS = [
  {
    label: 'FIIs',
    icon: TrendingUp,
    color: 'text-sky-400',
    items: [
      'Quais FIIs de tijolo têm o maior DY projetado?',
      'Me mostre FIIs com P/VP abaixo de 1',
      'Qual a vacância média dos FIIs de tijolo?',
    ],
  },
  {
    label: 'Renda Fixa',
    icon: BarChart2,
    color: 'text-emerald-400',
    items: [
      'Quais taxas a XP está recomendando agora?',
      'Compare os retornos de FII com renda fixa',
      'Quais títulos isentos de IR o mercado oferece?',
    ],
  },
  {
    label: 'CVM',
    icon: Database,
    color: 'text-amber-400',
    items: [
      'Resumo geral das emissões registradas na CVM',
      'Busque ofertas de FII coordenadas pelo BTG em 2025',
      'Quais indicadores macro estão disponíveis?',
    ],
  },
]

// ── Label legível das tools ────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  market_macro_indicators:    'Indicadores Macro',
  cvm_market_summary:         'Resumo CVM',
  search_cvm_offers:          'Busca CVM',
  search_prospectos_fii:      'Prospectos FII',
  fii_market_stats:           'Stats FII',
  list_market_portfolios:     'Carteiras de Mercado',
  compare_fii_vs_renda_fixa:  'FII vs Renda Fixa',
}

// ── Renderizador simples de Markdown ──────────────────────────────────────
// Converte **bold**, tabelas e listas para elementos React
function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n')

  const parseInline = (text: string, key: number) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/)
    return (
      <span key={key}>
        {parts.map((p, i) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={i} className="font-bold text-white">{p.slice(2, -2)}</strong>
            : <span key={i}>{p}</span>
        )}
      </span>
    )
  }

  // Detecta bloco de tabela Markdown
  const isTableRow = (l: string) => l.trim().startsWith('|')
  const isSeparator = (l: string) => /^\|[-| :]+\|$/.test(l.trim())

  const rendered: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Tabela
    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const headerCells = line.split('|').filter(c => c.trim())
      i += 2 // pula cabeçalho e separador
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(lines[i].split('|').filter(c => c.trim()))
        i++
      }
      rendered.push(
        <div key={`t${i}`} className="overflow-x-auto my-2">
          <table className="w-full text-[11px] font-mono border-collapse">
            <thead>
              <tr>
                {headerCells.map((h, hi) => (
                  <th key={hi} className="px-2 py-1 bg-primary/20 text-primary border border-border/40 text-left font-bold whitespace-nowrap">
                    {h.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-secondary/20' : 'bg-secondary/40'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1 border border-border/30 text-muted-foreground whitespace-nowrap">
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Cabeçalho
    if (line.startsWith('### ')) {
      rendered.push(<p key={i} className="font-bold text-primary text-xs mt-2 mb-0.5">{line.slice(4)}</p>)
    } else if (line.startsWith('## ') || line.startsWith('# ')) {
      rendered.push(<p key={i} className="font-bold text-white text-sm mt-2 mb-1">{line.replace(/^#+\s/, '')}</p>)
    }
    // Lista
    else if (line.match(/^[-•*]\s/)) {
      rendered.push(
        <div key={i} className="flex gap-1.5 items-start my-0.5">
          <span className="text-primary mt-0.5 shrink-0">·</span>
          <span>{parseInline(line.replace(/^[-•*]\s/, ''), i)}</span>
        </div>
      )
    }
    // Linha vazia
    else if (!line.trim()) {
      rendered.push(<div key={i} className="h-1.5" />)
    }
    // Texto normal
    else {
      rendered.push(<p key={i} className="leading-relaxed">{parseInline(line, i)}</p>)
    }
    i++
  }

  return <div className="text-sm text-foreground/90 space-y-0.5">{rendered}</div>
}

// ── Componente Principal ───────────────────────────────────────────────────
export function FloatingChat({ prospectos }: FloatingChatProps) {
  const [isOpen,      setIsOpen]      = useState(false)
  const [input,       setInput]       = useState('')
  const [activeGroup, setActiveGroup] = useState(0)
  const [apiStatus,   setApiStatus]   = useState<'unknown' | 'ok' | 'error'>('unknown')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        'Olá! Sou o **BTG Intelligence Partner**.\n\n' +
        'Tenho acesso às bases de dados de prospectos de FII, carteiras recomendadas do mercado, ' +
        'emissões registradas na CVM e indicadores macro do Banco Central.\n\n' +
        'Como posso ajudá-lo?',
    },
  ])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Verifica se o backend está rodando
  useEffect(() => {
    if (!isOpen) return
    fetch('/api/agent/health')
      .then(r => r.json())
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('error'))
  }, [isOpen])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text }
    const loadingId = (Date.now() + 1).toString()
    const loadingMsg: Message = { id: loadingId, role: 'assistant', content: '', loading: true }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setInput('')

    // Histórico para contexto (últimas 6 trocas)
    const history = messages
      .filter(m => !m.loading)
      .slice(-6)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/agent/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      setMessages(prev =>
        prev.map(m =>
          m.id === loadingId
            ? { ...m, content: data.response, sources: data.sources_used, loading: false }
            : m
        )
      )
      setApiStatus('ok')
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === loadingId
            ? {
                ...m,
                content:
                  '⚠️ Não consegui conectar ao servidor do agente.\n\n' +
                  'Verifique se o backend está rodando:\n' +
                  '`uvicorn chat_api:app --reload --port 8000`',
                loading: false,
              }
            : m
        )
      )
      setApiStatus('error')
    }
  }, [messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isFirstMessage = messages.length === 1

  return (
    <>
      {/* ── Botão flutuante ─────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center',
          'rounded-full shadow-lg transition-all duration-200 hover:scale-105',
          isOpen ? 'bg-secondary text-foreground' : 'bg-primary text-primary-foreground'
        )}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}

        {/* Badge de status */}
        {!isOpen && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background',
            apiStatus === 'ok'    ? 'bg-emerald-500' :
            apiStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
          )} />
        )}
      </button>

      {/* ── Janela do chat ───────────────────────────────────────────────── */}
      {isOpen && (
        <div className={cn(
          'fixed bottom-24 right-6 z-50 flex flex-col overflow-hidden',
          'rounded-2xl border border-border/50 bg-card shadow-2xl',
          'h-[580px] w-[420px]',
          'transition-all duration-200'
        )}>

          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border/50 bg-secondary/50 px-4 py-3 shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-foreground text-sm">BTG Intelligence Partner</h4>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {apiStatus === 'ok' ? (
                  <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Agente conectado · {prospectos.length} prospectos</>
                ) : apiStatus === 'error' ? (
                  <><AlertCircle className="h-3 w-3 text-red-400 animate-pulse" /> Backend offline</>
                ) : (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Verificando conexão...</>
                )}
              </div>
            </div>

            {/* Chips de fontes de dados */}
            <div className="flex gap-1 shrink-0">
              {[
                { icon: Database,    color: 'text-amber-400',   tip: 'CVM' },
                { icon: TrendingUp,  color: 'text-sky-400',     tip: 'FII' },
                { icon: BarChart2,   color: 'text-emerald-400', tip: 'RF' },
              ].map(({ icon: Icon, color, tip }) => (
                <div key={tip} title={tip}
                     className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary/60">
                  <Icon className={cn('h-3.5 w-3.5', color)} />
                </div>
              ))}
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map(msg => (
              <div key={msg.id}
                   className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>

                {msg.role === 'assistant' && (
                  <div className="flex h-7 w-7 shrink-0 mt-0.5 items-center justify-center rounded-full bg-primary/20">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}

                <div className={cn(
                  'max-w-[82%] rounded-2xl px-3.5 py-2.5',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-secondary text-foreground rounded-tl-sm'
                )}>
                  {msg.loading ? (
                    <div className="flex gap-1 items-center py-1">
                      {[0, 150, 300].map(delay => (
                        <span key={delay}
                              className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                              style={{ animationDelay: `${delay}ms` }} />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">Consultando base de dados...</span>
                    </div>
                  ) : msg.role === 'assistant' ? (
                    <>
                      <MarkdownText content={msg.content} />
                      {/* Tags das ferramentas usadas */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/20">
                          {msg.sources.map(s => (
                            <span key={s}
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
                              {TOOL_LABELS[s] || s}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm whitespace-pre-line">{msg.content}</p>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="flex h-7 w-7 shrink-0 mt-0.5 items-center justify-center rounded-full bg-btg-gold/20">
                    <User className="h-3.5 w-3.5 text-btg-gold" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Sugestões — só na primeira mensagem */}
          {isFirstMessage && (
            <div className="border-t border-border/50 px-4 py-3 shrink-0 space-y-2">
              {/* Tabs de categoria */}
              <div className="flex gap-1">
                {SUGGESTION_GROUPS.map((g, gi) => {
                  const Icon = g.icon
                  return (
                    <button key={gi}
                            onClick={() => setActiveGroup(gi)}
                            className={cn(
                              'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors',
                              activeGroup === gi
                                ? 'bg-primary/20 text-primary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                            )}>
                      <Icon className={cn('h-3 w-3', activeGroup === gi ? 'text-primary' : g.color)} />
                      {g.label}
                    </button>
                  )
                })}
              </div>

              {/* Sugestões do grupo ativo */}
              <div className="space-y-1">
                {SUGGESTION_GROUPS[activeGroup].items.map((s, si) => (
                  <button key={si}
                          onClick={() => sendMessage(s)}
                          className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5
                                     bg-secondary/40 hover:bg-primary/10 hover:text-foreground
                                     text-left text-xs text-muted-foreground transition-colors group">
                    <ChevronRight className="h-3 w-3 shrink-0 text-primary/50 group-hover:text-primary transition-colors" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border/50 p-3 shrink-0">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={apiStatus === 'error' ? 'Backend offline...' : 'Pergunte sobre FIIs, taxas, CVM...'}
                disabled={apiStatus === 'error'}
                className="flex-1 bg-secondary border-border/50 text-sm"
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || apiStatus === 'error'}
                size="icon"
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {apiStatus === 'error' && (
              <p className="text-[10px] text-red-400 mt-1.5 font-mono">
                uvicorn chat_api:app --reload --port 8000
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}