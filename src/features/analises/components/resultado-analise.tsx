import { CheckCircle2, CircleAlert, Clock3, GitBranch, Layers3, Waypoints } from 'lucide-react'
import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'

import type { ResumoStatusAnalise } from '../services/persistencia/ciclo-vida-analise'
import { obterChaveMensagemErro } from '../services/mensagens-erros-analise'

interface ResultadoAnaliseProps {
  resumo: ResumoStatusAnalise
}

export async function ResultadoAnalise({ resumo }: ResultadoAnaliseProps) {
  const t = await getTranslations('resultadoAnalise')
  const tErros = await getTranslations('erros')
  const formatador = await getFormatter()
  const concluida = resumo.estado === 'concluido'
  const falhou = resumo.estado === 'falha'

  return (
    <div className="w-full max-w-6xl">
      <header className="border-b border-border/70 pb-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('eyebrow')}</p>
            <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight sm:text-5xl">
              {resumo.repositorio.proprietario}/{resumo.repositorio.nome}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2"><GitBranch aria-hidden="true" className="size-4" />{resumo.referencia}</span>
              <span className="font-mono text-xs" title={t('commitCompleto', { commit: resumo.commitSha })}>{resumo.commitSha.slice(0, 12)}</span>
            </div>
          </div>
          <div className={`inline-flex min-h-11 w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${concluida ? 'border-primary/30 bg-primary/10 text-primary' : falhou ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-warning/30 bg-warning/10 text-warning'}`}>
            {concluida ? <CheckCircle2 aria-hidden="true" className="size-4" /> : falhou ? <CircleAlert aria-hidden="true" className="size-4" /> : <Clock3 aria-hidden="true" className="size-4" />}
            {concluida ? t('status.concluida') : t(`status.${resumo.estado}`)}
          </div>
        </div>
      </header>

      {concluida ? (
        <>
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section aria-labelledby="area-mapa-titulo" className="min-h-[420px] rounded-3xl border border-border bg-card p-6 shadow-[0_24px_80px_-48px_var(--primary)] sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('visualizacao.eyebrow')}</p>
                  <h2 id="area-mapa-titulo" className="mt-2 text-2xl font-semibold tracking-tight">{t('visualizacao.titulo')}</h2>
                </div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Waypoints aria-hidden="true" className="size-5" /></div>
              </div>
              {resumo.contagens?.relacoesImportacao ? (
                <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-primary/25 bg-primary/[0.03] p-8 text-center">
                  <div className="max-w-sm">
                    <p className="text-sm font-medium">{t('visualizacao.pronta')}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('visualizacao.relacoesEncontradas', { quantidade: resumo.contagens.relacoesImportacao })}</p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 p-8 text-center">
                  <div className="max-w-sm">
                    <Layers3 aria-hidden="true" className="mx-auto size-8 text-muted-foreground/60" />
                    <p className="mt-4 text-sm font-medium">{t('visualizacao.vaziaTitulo')}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('visualizacao.vaziaDescricao')}</p>
                  </div>
                </div>
              )}
            </section>

            <aside aria-labelledby="detalhe-titulo" className="rounded-3xl border border-border bg-card p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('detalhe.eyebrow')}</p>
              <h2 id="detalhe-titulo" className="mt-2 text-xl font-semibold">{t('detalhe.titulo')}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('detalhe.descricao')}</p>
              <dl className="mt-8 space-y-4 border-t border-border pt-5">
                <Item label={t('resumo.arquivos')} value={String(resumo.contagens?.arquivos ?? 0)} />
                <Item label={t('resumo.simbolos')} value={String(resumo.contagens?.simbolos ?? 0)} />
                <Item label={t('resumo.exportacoes')} value={String(resumo.contagens?.exportacoes ?? 0)} />
                <Item label={t('resumo.diagnosticos')} value={String(resumo.contagens?.diagnosticos ?? 0)} />
                <Item label={t('resumo.atualizado')} value={formatador.dateTime(new Date(resumo.atualizadoEm), { dateStyle: 'medium', timeStyle: 'short' })} />
              </dl>
            </aside>
          </div>
        </>
      ) : (
        <section aria-labelledby="estado-titulo" className="mt-8 max-w-2xl rounded-3xl border border-border bg-card p-6 sm:p-8">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Clock3 aria-hidden="true" className="size-5" /></div>
          <h2 id="estado-titulo" className="mt-6 text-2xl font-semibold">{falhou ? t('indisponivel.falhaTitulo') : t('indisponivel.andamentoTitulo')}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {falhou && resumo.falha ? tErros(obterChaveMensagemErro(resumo.falha.codigo)) : t('indisponivel.andamentoDescricao')}
          </p>
          <Link href="/#analises-recentes-titulo" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25">
            {t('voltarAcompanhamento')}
          </Link>
        </section>
      )}
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>
}
