'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import { useArvoreAnalise, useRelacoesAnalise } from '../hooks/use-exploracao-analise'
import { NavegadorArquivos } from './navegador-arquivos'
import { PainelRelacoes } from './painel-relacoes'

interface ExploradorAnaliseProps {
  snapshotId: string
}

export function ExploradorAnalise({ snapshotId }: ExploradorAnaliseProps) {
  const t = useTranslations('resultadoAnalise.exploracao')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const arquivoSelecionado = normalizarArquivoSelecionado(searchParams.get('arquivo'))
  const selecionarArquivo = useCallback((arquivo: string) => {
    const parametros = new URLSearchParams(searchParams.toString())
    parametros.set('arquivo', arquivo)
    router.push(`${pathname}?${parametros.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  return (
    <section aria-labelledby="exploracao-titulo" className="mt-4">
      <h2 id="exploracao-titulo" className="sr-only">{t('titulo')}</h2>
      <ExploradorConteudo key={`${snapshotId}:${arquivoSelecionado ?? 'sem-selecao'}`} snapshotId={snapshotId} arquivoSelecionado={arquivoSelecionado} onSelecionarArquivo={selecionarArquivo} t={t} />
    </section>
  )
}

function ExploradorConteudo({ snapshotId, arquivoSelecionado, onSelecionarArquivo, t }: { snapshotId: string; arquivoSelecionado: string | null; onSelecionarArquivo: (arquivo: string) => void; t: (key: string) => string }) {
  const [caminho, setCaminho] = useState<string | null>(() => pastaPai(arquivoSelecionado))
  const [modoMobile, setModoMobile] = useState<'arquivos' | 'relacoes'>(() => arquivoSelecionado ? 'relacoes' : 'arquivos')
  const arvore = useArvoreAnalise(snapshotId, caminho)
  const relacoes = useRelacoesAnalise(snapshotId, arquivoSelecionado)

  return <>
    <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-muted/30 p-1 lg:hidden">
      <button type="button" onClick={() => setModoMobile('arquivos')} aria-pressed={modoMobile === 'arquivos'} className="min-h-11 rounded-xl px-3 text-sm font-semibold transition aria-pressed:bg-card aria-pressed:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('arquivos')}</button>
      <button type="button" onClick={() => setModoMobile('relacoes')} aria-pressed={modoMobile === 'relacoes'} className="min-h-11 rounded-xl px-3 text-sm font-semibold transition aria-pressed:bg-card aria-pressed:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('relacoes')}</button>
    </div>
    <div className="grid gap-4 lg:h-[clamp(24rem,calc(100vh-28rem),36rem)] lg:min-h-0 lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)] lg:overflow-hidden">
      <div className={`${modoMobile === 'arquivos' ? 'block' : 'hidden lg:block'} min-h-0 lg:overflow-hidden`}><NavegadorArquivos arvore={arvore.data} caminho={caminho} arquivoSelecionado={arquivoSelecionado} isLoading={arvore.isLoading} isError={arvore.isError} onAbrirPasta={setCaminho} onAbrirArquivo={onSelecionarArquivo} onVoltar={() => setCaminho((atual) => pastaPai(atual))} onTentarNovamente={() => void arvore.refetch()} /></div>
      <div className={`${modoMobile === 'relacoes' ? 'block' : 'hidden lg:block'} min-h-0 lg:overflow-hidden`}><PainelRelacoes arquivo={arquivoSelecionado} relacoes={relacoes.data} isLoading={relacoes.isLoading} isError={relacoes.isError} erro={relacoes.error} onSelecionar={onSelecionarArquivo} onTentarNovamente={() => void relacoes.refetch()} />{arquivoSelecionado ? <button type="button" onClick={() => setModoMobile('arquivos')} className="mt-4 inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">{t('voltarArquivos')}</button> : null}</div>
    </div>
  </>
}

export function normalizarArquivoSelecionado(valor: string | null) {
  if (!valor || valor.startsWith('/') || valor.includes('\\') || valor.split('/').some((parte) => !parte || parte === '.' || parte === '..')) return null
  return valor
}

function pastaPai(arquivo: string | null): string | null {
  if (!arquivo || !arquivo.includes('/')) return null
  const partes = arquivo.split('/')
  partes.pop()
  return partes.join('/') || null
}
