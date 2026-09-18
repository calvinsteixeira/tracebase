'use client'

import { ArrowDownLeft, ArrowUpRight, FileWarning, LoaderCircle, RotateCw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { RelacaoArquivoConsolidada, RelacoesArquivo } from '../services/exploracao-analise'
import { ErroExploracaoAnaliseCliente } from '../services/api-exploracao-analise-cliente'
import { MapaRelacoes } from './mapa-relacoes'

interface PainelRelacoesProps {
  arquivo: string | null
  relacoes: RelacoesArquivo | undefined
  isLoading: boolean
  isError: boolean
  erro?: unknown
  onSelecionar: (caminho: string) => void
  onTentarNovamente: () => void
}

export function PainelRelacoes({ arquivo, relacoes, isLoading, isError, erro, onSelecionar, onTentarNovamente }: PainelRelacoesProps) {
  const t = useTranslations('resultadoAnalise.exploracao')
  if (!arquivo) return <section aria-labelledby="relacoes-titulo" className="flex min-h-[36rem] items-center justify-center rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center"><div className="max-w-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('relacoes')}</p><h2 id="relacoes-titulo" className="mt-3 text-xl font-semibold">{t('semSelecao')}</h2></div></section>
  if (isLoading) return <section aria-labelledby="relacoes-titulo" className="flex min-h-[36rem] items-center justify-center rounded-3xl border border-border bg-card p-8"><div className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />{t('carregandoRelacoes')}</div></section>
  if (isError || !relacoes) return <section aria-labelledby="relacoes-titulo" className="flex min-h-[36rem] items-center justify-center rounded-3xl border border-border bg-card p-8 text-center"><div className="max-w-sm"><p id="relacoes-titulo" className="text-sm text-muted-foreground">{erro instanceof ErroExploracaoAnaliseCliente && erro.codigo === 'SNAPSHOT_NAO_ENCONTRADO' ? t('erroSnapshot') : t('erroRelacoes')}</p><button type="button" onClick={onTentarNovamente} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RotateCw aria-hidden="true" className="size-4" />{t('tentarNovamente')}</button></div></section>

  const possuiRelacoes = relacoes.importa.length > 0 || relacoes.importadoPor.length > 0
  return (
    <section aria-labelledby="relacoes-titulo" className="space-y-3 rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('relacoes')}</p>
        <h2 id="relacoes-titulo" className="mt-2 break-all font-mono text-xl font-semibold tracking-tight">{relacoes.arquivo.caminho}</h2>
      </div>
      {possuiRelacoes ? <>
        <MapaRelacoes key={relacoes.arquivo.caminho} relacoes={relacoes} onSelecionar={onSelecionar} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label={t('legenda')}>
          <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full bg-[var(--graph-importer)] ring-1 ring-[var(--graph-importer-edge)]" />{t('importadoPor')}</span>
          <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full bg-[var(--graph-imported)] ring-1 ring-[var(--graph-imported-edge)]" />{t('importa')}</span>
          <span className="text-muted-foreground/70">{t('legenda')}: {t('importadoPor')} ← {t('arquivo')} → {t('importa')}</span>
        </div>
        <div className="grid gap-5 border-t border-border pt-5 lg:grid-cols-2">
          <ListaRelacoes titulo={t('importadoPor')} vazia={t('nenhumaEntrada')} icone={<ArrowDownLeft aria-hidden="true" className="size-4" />} relacoes={relacoes.importadoPor} onSelecionar={onSelecionar} t={t} />
          <ListaRelacoes titulo={t('importa')} vazia={t('nenhumaSaida')} icone={<ArrowUpRight aria-hidden="true" className="size-4" />} relacoes={relacoes.importa} onSelecionar={onSelecionar} t={t} />
        </div>
      </> : <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-7 text-sm text-muted-foreground">{t('semRelacoes')}</div>}
      {relacoes.limitacoes.length > 0 ? <div className="border-t border-border pt-5"><div className="flex items-center gap-2 text-sm font-semibold"><FileWarning aria-hidden="true" className="size-4 text-warning" />{t('limitacoes')}</div><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{relacoes.limitacoes.map((limitacao) => <li key={`${limitacao.codigo}:${limitacao.categoria}`}>{mensagemLimitacao(limitacao.codigo, t)}</li>)}</ul></div> : null}
    </section>
  )
}

function ListaRelacoes({ titulo, vazia, icone, relacoes, onSelecionar, t }: { titulo: string; vazia: string; icone: React.ReactNode; relacoes: RelacaoArquivoConsolidada[]; onSelecionar: (caminho: string) => void; t: (key: string, values?: Record<string, string | number>) => string }) {
  return <section aria-labelledby={`lista-${titulo}`}><h3 id={`lista-${titulo}`} className="flex items-center gap-2 text-sm font-semibold">{icone}{titulo}</h3>{relacoes.length ? <ul className="mt-3 space-y-1">{relacoes.map((relacao) => <li key={relacao.caminho}><button type="button" onClick={() => onSelecionar(relacao.caminho)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 truncate font-mono text-xs">{relacao.caminho}</span>{relacao.quantidadeImports > 1 ? <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[0.68rem] text-muted-foreground">{t('quantidadeImports', { quantidade: relacao.quantidadeImports })}</span> : null}</button></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{vazia}</p>}</section>
}

function mensagemLimitacao(codigo: string, t: (key: string) => string) {
  if (codigo === 'ERRO_SINTATICO') return t('limitacaoSintaxe')
  if (codigo === 'COMMONJS_NAO_SUPORTADO') return t('limitacaoCommonjs')
  return t('limitacaoDinamica')
}
