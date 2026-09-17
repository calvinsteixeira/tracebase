'use client'

import { GitBranch, ScanSearch } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ThemeToggle } from './theme-toggle'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const t = useTranslations('shell')

  return (
    <div className="min-h-screen text-foreground">
      <a href="#conteudo-principal" className="fixed left-4 top-3 z-50 -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition focus:translate-y-0">
        {t('pularConteudo')}
      </a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <a href="#nova-analise" className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
            <span className="relative flex size-9 items-center justify-center rounded-xl bg-foreground text-background shadow-sm transition-transform group-hover:-rotate-3">
              <ScanSearch aria-hidden="true" className="size-[1.125rem]" />
            </span>
            <span className="text-[1.05rem] font-semibold tracking-[-0.03em]">{t('marca')}</span>
          </a>

          <nav aria-label={t('navegacao')} className="ml-auto hidden items-center gap-1 sm:flex">
            <form action="/" method="get">
              <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t('novaAnalise')}
              </button>
            </form>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:ml-2">
            <div className="hidden items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground lg:flex">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              {t('operacional')}
            </div>
            <div className="hidden items-center gap-2 px-2 text-xs text-muted-foreground sm:flex">
              <GitBranch aria-hidden="true" className="size-[1.125rem]" />
              <span className="hidden md:inline">{t('repositoriosPublicos')}</span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="conteudo-principal" className="mx-auto min-h-[calc(100vh-4.5rem)] w-full max-w-7xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
        {children}
      </main>
    </div>
  )
}
