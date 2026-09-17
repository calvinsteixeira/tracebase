'use client'

import { useMutation } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import type { CodigoErroApiAnaliseCliente } from '../services/api-analises-cliente'
import { ErroApiAnaliseCliente, verificarElegibilidade } from '../services/api-analises-cliente'
import type { ResultadoElegibilidadeRepositorio } from '../services/criar-snapshot-repositorio'
import { LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO } from '../services/politica-elegibilidade-repositorio'
import { ResultadoElegibilidade } from './resumo-repositorio'

interface NovaAnaliseFormularioProps {
  onIniciar?: (url: string) => void
  iniciando?: boolean
  erroInicio?: string | null
}

export function NovaAnaliseFormulario({ onIniciar, iniciando = false, erroInicio = null }: NovaAnaliseFormularioProps = {}) {
  const t = useTranslations('home')
  const tErros = useTranslations('erros')
  const formatador = useFormatter()
  const [url, setUrl] = useState('')
  const [erroCodigo, setErroCodigo] = useState<CodigoErroApiAnaliseCliente | null>(null)
  const [resultado, setResultado] = useState<ResultadoElegibilidadeRepositorio | null>(null)
  const mutation = useMutation({
    mutationFn: verificarElegibilidade,
    onSuccess: (novoResumo) => {
      setErroCodigo(null)
      setResultado(novoResumo)
    },
    onError: (erro: ErroApiAnaliseCliente) => setErroCodigo(erro.codigo),
  })

  const mensagemErro = erroCodigo ? tErros(erroCodigo) : null

  function enviarFormulario(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResultado(null)
    setErroCodigo(null)
    mutation.mutate(url)
  }

  function alterarUrl(valor: string) {
    setUrl(valor)
    setErroCodigo(null)
  }

  return (
    <section id="nova-analise" className="relative w-full max-w-4xl">
      <div className="max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          {t('eyebrow')}
        </div>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-6xl">{t('titulo')}</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{t('descricao')}</p>
      </div>

      <form onSubmit={enviarFormulario} className="mt-10 rounded-3xl border border-border bg-card/90 p-5 shadow-[0_24px_80px_-35px_var(--primary)] backdrop-blur sm:p-7">
        <div className="space-y-2">
          <label htmlFor="repositorio-url" className="text-sm font-semibold">
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
            aria-invalid={Boolean(mensagemErro)}
            aria-describedby={`repositorio-orientacao${mensagemErro ? ' repositorio-url-erro' : ''}`}
            className="flex h-14 w-full rounded-2xl border border-input bg-background/80 px-4 text-sm outline-none transition placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
          />
          <p id="repositorio-orientacao" className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {t('orientacao', {
              quantidade: LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO.quantidadeMaximaArquivosElegiveis,
              arquivo: formatador.number(
                LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO.tamanhoMaximoArquivoBytes / 1024,
                { style: 'unit', unit: 'kilobyte', unitDisplay: 'short' },
              ),
              total: formatador.number(
                LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO.tamanhoMaximoTotalBytes /
                  (1024 * 1024),
                { style: 'unit', unit: 'megabyte', unitDisplay: 'short' },
              ),
            })}
          </p>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-60"
        >
          {mutation.isPending ? t('verificando') : t('verificar')}
        </button>

        {mutation.isPending && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('carregando')}
          </p>
        )}

        {mensagemErro && (
          <p id="repositorio-url-erro" role="alert" aria-live="assertive" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {mensagemErro}
          </p>
        )}
      </form>

      {resultado && (
        <ResultadoElegibilidade
          resultado={resultado}
          onIniciar={onIniciar ? () => onIniciar(resultado.repositorio.url) : undefined}
          iniciando={iniciando}
          erroInicio={erroInicio}
        />
      )}
    </section>
  )
}
