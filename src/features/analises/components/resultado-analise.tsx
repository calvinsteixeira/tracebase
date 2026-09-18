import { CheckCircle2, CircleAlert, Clock3, GitBranch } from 'lucide-react'
import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'

import type { VisaoResultadoAnalise } from '../services/ler-resultado-analise'
import { obterChaveMensagemErro } from '../services/mensagens-erros-analise'
import { ExploradorAnalise } from './explorador-analise'

interface ResultadoAnaliseProps {
  resumo: VisaoResultadoAnalise
}

export async function ResultadoAnalise({ resumo }: ResultadoAnaliseProps) {
  const t = await getTranslations('resultadoAnalise')
  const tErros = await getTranslations('erros')
  const formatador = await getFormatter()
  const concluida = resumo.estado === 'concluido'
  const falhou = resumo.estado === 'falha'

  return (
    <div className="w-full max-w-[90rem]">
      <header className="border-b border-border/70 pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('eyebrow')}</p>
            <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-4xl">
              {resumo.repositorio.proprietario}/{resumo.repositorio.nome}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
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
          <section aria-labelledby="detalhe-titulo" className="mt-4 rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('detalhe.eyebrow')}</p>
                <h2 id="detalhe-titulo" className="mt-2 text-xl font-semibold">{t('detalhe.titulo')}</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-right">{t('detalhe.descricao')}</p>
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Item label={t('resumo.arquivos')} value={String(resumo.contagens?.arquivos ?? 0)} />
              <Item label={t('resumo.simbolos')} value={String(resumo.contagens?.simbolos ?? 0)} />
              <Item label={t('resumo.exportacoes')} value={String(resumo.contagens?.exportacoes ?? 0)} />
              <Item label={t('resumo.diagnosticos')} value={String(resumo.contagens?.diagnosticos ?? 0)} />
              <Item label={t('resumo.atualizado')} value={formatador.dateTime(new Date(resumo.atualizadoEm), { dateStyle: 'medium', timeStyle: 'short' })} />
            </dl>
          </section>
          <section aria-labelledby="exploracao-principal-titulo" className="mt-5">
            <div className="mb-3 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('visualizacao.eyebrow')}</p>
                <h2 id="exploracao-principal-titulo" className="mt-2 text-2xl font-semibold tracking-tight">{t('visualizacao.titulo')}</h2>
              </div>
              <p className="text-sm text-muted-foreground sm:text-right">{t('visualizacao.relacoesEncontradas', { quantidade: resumo.contagens?.relacoesImportacao ?? 0 })}</p>
            </div>
            <ExploradorAnalise snapshotId={resumo.idPublico} />
          </section>
        </>
      ) : (
        <section aria-labelledby="estado-titulo" className="mt-8 max-w-2xl rounded-3xl border border-border bg-card p-6 sm:p-8">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Clock3 aria-hidden="true" className="size-5" /></div>
          <h2 id="estado-titulo" className="mt-6 text-2xl font-semibold">{falhou ? t('indisponivel.falhaTitulo') : t('indisponivel.andamentoTitulo')}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {falhou && resumo.falhaCodigo ? tErros(obterChaveMensagemErro(resumo.falhaCodigo)) : t('indisponivel.andamentoDescricao')}
          </p>
          <Link href={`/?analise=${encodeURIComponent(resumo.idPublico)}`} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25">
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
