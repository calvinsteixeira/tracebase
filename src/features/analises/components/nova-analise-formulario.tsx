'use client'

import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { CodigoErroAnalise, ResumoSnapshotRepositorio } from '../services/criar-snapshot-repositorio'
import { analisarUrlRepositorio } from '../services/validar-url-repositorio'
import { ResumoRepositorio } from './resumo-repositorio'

interface ErroRespostaApi {
  erro?: {
    codigo?: CodigoErroAnalise
  }
}

class ErroAnaliseClient extends Error {
  constructor(readonly codigo: CodigoErroAnalise) {
    super(codigo)
  }
}

export function NovaAnaliseFormulario() {
  const t = useTranslations('home')
  const [url, setUrl] = useState('')
  const [erroCodigo, setErroCodigo] = useState<CodigoErroAnalise | null>(null)
  const [resumo, setResumo] = useState<ResumoSnapshotRepositorio | null>(null)
  const mutation = useMutation({
    mutationFn: analisarRepositorio,
    onSuccess: (novoResumo) => {
      setErroCodigo(null)
      setResumo(novoResumo)
    },
    onError: (erro: ErroAnaliseClient) => setErroCodigo(erro.codigo),
  })

  const mensagemErro = erroCodigo ? t(`erros.${erroCodigo}`) : null

  function enviarFormulario(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResumo(null)
    setErroCodigo(null)
    mutation.mutate(url)
  }

  function alterarUrl(valor: string) {
    setUrl(valor)
    setErroCodigo(null)
  }

  return (
    <section id="nova-analise" className="w-full max-w-3xl">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{t('eyebrow')}</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{t('titulo')}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{t('descricao')}</p>
      </div>

      <form onSubmit={enviarFormulario} className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-2">
          <label htmlFor="repositorio-url" className="text-sm font-medium">
            {t('urlLabel')}
          </label>
          <input
            id="repositorio-url"
            name="url"
            type="url"
            required
            value={url}
            onChange={(event) => alterarUrl(event.target.value)}
            placeholder={t('urlPlaceholder')}
            aria-describedby="repositorio-orientacao"
            className="flex h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <p id="repositorio-orientacao" className="text-sm text-muted-foreground">{t('orientacao')}</p>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
        >
          {mutation.isPending ? t('analisando') : t('analisar')}
        </button>

        {mutation.isPending && (
          <p role="status" aria-live="polite" className="mt-4 text-center text-sm text-muted-foreground">
            {t('carregando')}
          </p>
        )}

        {mensagemErro && (
          <p role="alert" aria-live="assertive" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {mensagemErro}
          </p>
        )}
      </form>

      {resumo && <ResumoRepositorio resumo={resumo} />}
    </section>
  )
}

async function analisarRepositorio(url: string): Promise<ResumoSnapshotRepositorio> {
  try {
    analisarUrlRepositorio(url)
  } catch (erro) {
    if (erro instanceof Error && 'codigo' in erro) {
      throw new ErroAnaliseClient(erro.codigo as CodigoErroAnalise)
    }

    throw new ErroAnaliseClient('URL_INVALIDA')
  }

  try {
    const resposta = await fetch('/api/analises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim() }),
    })
    const corpo = (await resposta.json()) as ResumoSnapshotRepositorio | ErroRespostaApi

    if (!resposta.ok) {
      const codigo = 'erro' in corpo ? corpo.erro?.codigo : undefined

      throw new ErroAnaliseClient(codigo ?? 'GITHUB_INDISPONIVEL')
    }

    return corpo as ResumoSnapshotRepositorio
  } catch (erro) {
    if (erro instanceof ErroAnaliseClient) {
      throw erro
    }

    throw new ErroAnaliseClient('GITHUB_INDISPONIVEL')
  }
}
