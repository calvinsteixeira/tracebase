import { Activity, GitBranch, LayoutDashboard, ScanSearch } from 'lucide-react'
import type { ReactNode } from 'react'

import { ThemeToggle } from './theme-toggle'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <ScanSearch aria-hidden="true" className="size-5" />
          </div>
          <div>
            <p className="font-heading text-lg font-semibold tracking-tight">Tracebase</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Code intelligence</p>
          </div>
        </div>

        <nav aria-label="Navegação principal" className="flex-1 space-y-1 px-3 py-6">
          <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
          <a href="#nova-analise" className="flex min-h-11 items-center gap-3 rounded-xl bg-sidebar-accent px-3 text-sm font-medium text-sidebar-accent-foreground transition hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <LayoutDashboard aria-hidden="true" className="size-4" />
            Nova análise
          </a>
          <a href="#analises-recentes-titulo" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <Activity aria-hidden="true" className="size-4" />
            Acompanhamento
          </a>
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 p-3">
            <div className="flex size-8 items-center justify-center rounded-lg border border-sidebar-border bg-background text-muted-foreground">
              <GitBranch aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">Repositórios públicos</p>
              <p className="text-[11px] text-muted-foreground">Análises rastreáveis</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 border-b border-border/70 bg-background/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-8 lg:px-12">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ScanSearch aria-hidden="true" className="size-4" />
              </div>
              <span className="font-heading font-semibold">Tracebase</span>
            </div>
            <div className="hidden text-sm text-muted-foreground lg:block">Workspace / <span className="text-foreground">Análises</span></div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:flex">
                <span className="size-1.5 rounded-full bg-primary" />
                Sistema operacional
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-[1440px] px-4 py-8 sm:px-8 sm:py-12 lg:px-12">
          {children}
        </main>
      </div>
    </div>
  )
}
