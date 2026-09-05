'use client'

import { useTranslations } from 'next-intl'

import type { ResumoSnapshotRepositorio } from '../services/criar-snapshot-repositorio'

interface ResumoRepositorioProps {
  resumo: ResumoSnapshotRepositorio
}

export function ResumoRepositorio({ resumo }: ResumoRepositorioProps) {
  const t = useTranslations('resumo')

  return (
    <section
      aria-labelledby="resumo-snapshot-titulo"
      className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="mb-6">
        <p className="text-sm font-medium text-primary">{t('titulo')}</p>
        <h2 id="resumo-snapshot-titulo" className="mt-2 text-2xl font-semibold tracking-tight">
          {resumo.repositorio.proprietario}/{resumo.repositorio.nome}
        </h2>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
          <dt className="text-sm text-muted-foreground">{t('branch')}</dt>
          <dd className="mt-1 font-medium">{resumo.snapshot.referencia}</dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
          <dt className="text-sm text-muted-foreground">{t('arquivos')}</dt>
          <dd className="mt-1 font-medium">{resumo.quantidadeArquivosElegiveis}</dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/40 p-4 sm:col-span-2">
          <dt className="text-sm text-muted-foreground">{t('commit')}</dt>
          <dd className="mt-1 break-all font-mono text-sm">{resumo.snapshot.commitSha}</dd>
        </div>
      </dl>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-sm font-medium">{t('proximoPasso')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('proximoPassoDescricao')}</p>
        <p className="mt-3 text-xs text-muted-foreground">{t('idSnapshot')}</p>
      </div>
    </section>
  )
}
