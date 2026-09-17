'use client'

import { Clock3, GitBranch, GitCommitHorizontal, History, ScanSearch } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { ResultadoElegibilidadeRepositorio } from '../services/criar-snapshot-repositorio'

interface CabecalhoWorkspaceRepositorioProps {
  resultado: ResultadoElegibilidadeRepositorio | null
  mostrandoHistorico: boolean
  onAlternarHistorico: () => void
}

export function CabecalhoWorkspaceRepositorio({ resultado, mostrandoHistorico, onAlternarHistorico }: CabecalhoWorkspaceRepositorioProps) {
  const t = useTranslations('fluxo')

  return (
    <header className="flex flex-col gap-5 border-b border-border/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
          <ScanSearch aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{resultado ? t('repositorioAtual') : t('novoWorkspace')}</p>
          <h1 className="mt-0.5 truncate text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
            {resultado ? `${resultado.repositorio.proprietario}/${resultado.repositorio.nome}` : t('tituloInicial')}
          </h1>
          {resultado && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><GitBranch aria-hidden="true" className="size-3.5" />{resultado.snapshot.referencia}</span>
              <span className="inline-flex items-center gap-1.5 font-mono"><GitCommitHorizontal aria-hidden="true" className="size-3.5" />{resultado.snapshot.commitSha.slice(0, 7)}</span>
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onAlternarHistorico}
        className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-border bg-background px-3.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
      >
        {mostrandoHistorico ? <ScanSearch aria-hidden="true" className="size-4" /> : resultado ? <Clock3 aria-hidden="true" className="size-4" /> : <History aria-hidden="true" className="size-4" />}
        {mostrandoHistorico ? t('voltarFluxo') : t('abrirHistorico')}
      </button>
    </header>
  )
}
