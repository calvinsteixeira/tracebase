'use client'

import { ChevronLeft, FileCode2, Folder, LoaderCircle, RotateCw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { ArvoreAnalise, ItemArvoreAnalise } from '../services/exploracao-analise'

interface NavegadorArquivosProps {
  arvore: ArvoreAnalise | undefined
  caminho: string | null
  isLoading: boolean
  isError: boolean
  onAbrirPasta: (caminho: string) => void
  onAbrirArquivo: (caminho: string) => void
  onVoltar: () => void
  onTentarNovamente: () => void
}

export function NavegadorArquivos({ arvore, caminho, isLoading, isError, onAbrirPasta, onAbrirArquivo, onVoltar, onTentarNovamente }: NavegadorArquivosProps) {
  const t = useTranslations('resultadoAnalise.exploracao')

  return (
    <section aria-labelledby="explorador-arquivos-titulo" className="flex min-h-[32rem] flex-col rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('arquivos')}</p>
          <h2 id="explorador-arquivos-titulo" className="mt-2 truncate text-xl font-semibold tracking-tight">{caminho ?? t('escopoRaiz')}</h2>
        </div>
        {caminho ? (
          <button type="button" onClick={onVoltar} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronLeft aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">{t('voltarPasta')}</span>
          </button>
        ) : null}
      </div>

      <div className="flex-1 pt-4" aria-live="polite">
        {isLoading ? <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />{t('carregandoArquivos')}</div> : null}
        {isError ? <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center"><p className="text-sm text-muted-foreground">{t('erroArquivos')}</p><button type="button" onClick={onTentarNovamente} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RotateCw aria-hidden="true" className="size-4" />{t('tentarNovamente')}</button></div> : null}
        {!isLoading && !isError && arvore && arvore.itens.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">{t('pastaVazia')}</p> : null}
        {!isLoading && !isError && arvore && arvore.itens.length > 0 ? <ul className="space-y-1" aria-label={t('arquivos')}>{arvore.itens.map((item) => <Item key={`${item.tipo}:${item.caminho}`} item={item} onAbrirPasta={onAbrirPasta} onAbrirArquivo={onAbrirArquivo} t={t} />)}</ul> : null}
      </div>
    </section>
  )
}

function Item({ item, onAbrirPasta, onAbrirArquivo, t }: { item: ItemArvoreAnalise; onAbrirPasta: (caminho: string) => void; onAbrirArquivo: (caminho: string) => void; t: (key: string, values?: Record<string, string | number>) => string }) {
  const pasta = item.tipo === 'pasta'
  return (
    <li>
      <button type="button" onClick={() => pasta ? onAbrirPasta(item.caminho) : onAbrirArquivo(item.caminho)} className="group flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {pasta ? <Folder aria-hidden="true" className="size-4 shrink-0 text-primary" /> : <FileCode2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate font-mono text-[0.8rem]">{item.nome}</span>
        {pasta ? <span className="text-xs tabular-nums text-muted-foreground">{item.quantidadeArquivos}</span> : null}
        <span className="sr-only">{pasta ? t('abrirPasta', { nome: item.nome }) : t('abrirArquivo', { nome: item.nome })}</span>
      </button>
    </li>
  )
}
