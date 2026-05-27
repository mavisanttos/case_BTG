'use client'

import { Shield, User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
        {/* Logo Section */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-lg bg-primary/10 p-2">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-foreground">BTG PACTUAL</span>
              <span className="hidden text-muted-foreground sm:inline">|</span>
              <span className="hidden text-sm font-medium text-primary sm:inline">Análise de Ofertas Primárias</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
