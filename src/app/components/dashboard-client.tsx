'use client'

import { useState } from 'react'
import { BarChart3, Target, Trophy } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/header'
import { MacroIndicators } from '@/components/macro-indicators'
import { RankingTab } from '@/components/ranking-tab'
import { OptimizerTab } from '@/components/optimizer-tab'
import { AnalyticsTab } from '@/components/analytics-tab'
import { OfferDetail } from '@/components/offer-detail'
import { FloatingChat } from '@/components/floating-chat'
import type { IndicadoresMacro, ProspectoExtraido } from '@/lib/types'

interface DashboardClientProps {
  indicadores: IndicadoresMacro | null
  prospectos: ProspectoExtraido[]
}

export function DashboardClient({ indicadores, prospectos }: DashboardClientProps) {
  const [selectedOffer, setSelectedOffer] = useState<ProspectoExtraido | null>(null)
  const [activeTab, setActiveTab] = useState('ranking')

  const handleSelectOffer = (offer: ProspectoExtraido) => {
    setSelectedOffer(offer)
  }

  const handleBackToRanking = () => {
    setSelectedOffer(null)
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        {/* Macro Indicators */}
        <div className="mb-6">
          <MacroIndicators indicadores={indicadores} />
        </div>

        {/* Main Content */}
        {selectedOffer ? (
          <OfferDetail offer={selectedOffer} onBack={handleBackToRanking} />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="h-auto w-full justify-start gap-2 bg-transparent p-0">
              <TabsTrigger
                value="ranking"
                className="gap-2 rounded-lg border border-transparent bg-secondary px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
              >
                <Trophy className="h-4 w-4" />
                Ranking Geral de Ofertas
              </TabsTrigger>
              <TabsTrigger
                value="optimizer"
                className="gap-2 rounded-lg border border-transparent bg-secondary px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
              >
                <Target className="h-4 w-4" />
                Otimizador de Portfólio
              </TabsTrigger>
              <TabsTrigger
                value="analytics"
                className="gap-2 rounded-lg border border-transparent bg-secondary px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
              >
                <BarChart3 className="h-4 w-4" />
                Dashboard Analítico & CVM
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ranking" className="mt-0">
              <RankingTab prospectos={prospectos} onSelectOffer={handleSelectOffer} />
            </TabsContent>

            <TabsContent value="optimizer" className="mt-0">
              <OptimizerTab prospectos={prospectos} />
            </TabsContent>

            <TabsContent value="analytics" className="mt-0">
              <AnalyticsTab prospectos={prospectos} />
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* Floating Chat */}
      <FloatingChat prospectos={prospectos} />
    </div>
  )
}
