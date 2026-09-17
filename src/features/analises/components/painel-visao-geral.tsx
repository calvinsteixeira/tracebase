'use client'

import { ArrowRight, GitBranch, ScanSearch, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function PainelVisaoGeral() {
  const t = useTranslations('home')

  return (
    <section aria-labelledby="visao-geral-titulo" className="flex min-h-[440px] flex-col justify-between rounded-3xl border border-border bg-card/70 p-6 shadow-[0_24px_80px_-48px_var(--primary)] backdrop-blur sm:p-8">
      <div>
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles aria-hidden="true" className="size-5" />
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('visaoGeral.eyebrow')}</p>
        <h2 id="visao-geral-titulo" className="mt-3 max-w-sm text-2xl font-semibold tracking-tight sm:text-3xl">{t('visaoGeral.titulo')}</h2>
        <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">{t('visaoGeral.descricao')}</p>
      </div>

      <ol className="mt-10 space-y-3">
        <Etapa numero="01" icone={GitBranch} texto={t('visaoGeral.etapas.conectar')} ativa />
        <Etapa numero="02" icone={ScanSearch} texto={t('visaoGeral.etapas.verificar')} />
        <Etapa numero="03" icone={ArrowRight} texto={t('visaoGeral.etapas.acompanhar')} />
      </ol>
    </section>
  )
}

function Etapa({ numero, texto, icone: Icone, ativa = false }: { numero: string; texto: string; icone: typeof GitBranch; ativa?: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${ativa ? 'border-primary/25 bg-primary/8' : 'border-border/70 bg-muted/20'}`}>
      <span className="font-mono text-xs text-muted-foreground">{numero}</span>
      <span className={ativa ? 'text-primary' : 'text-muted-foreground'}><Icone aria-hidden="true" className="size-4" /></span>
      <span className="text-sm font-medium">{texto}</span>
    </li>
  )
}
