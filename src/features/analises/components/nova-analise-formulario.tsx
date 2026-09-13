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

  const mensagemErro = erroCodigo ? t(`erros.${erroCodigo}`) : null

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
            aria-invalid={Boolean(mensagemErro)}
            aria-describedby={`repositorio-orientacao${mensagemErro ? ' repositorio-url-erro' : ''}`}
            className="flex h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <p id="repositorio-orientacao" className="text-sm text-muted-foreground">
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
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
        >
          {mutation.isPending ? t('verificando') : t('verificar')}
        </button>

        {mutation.isPending && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('carregando')}
          </p>
        )}

        {mensagemErro && (
          <p id="repositorio-url-erro" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
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
