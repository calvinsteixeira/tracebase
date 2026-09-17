'use client'

import { useMutation } from '@tanstack/react-query'
import { ArrowRight, GitBranch, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import type { CodigoErroApiAnaliseCliente } from '../services/api-analises-cliente'
import { ErroApiAnaliseCliente, verificarElegibilidade } from '../services/api-analises-cliente'
import type { ResultadoElegibilidadeRepositorio } from '../services/criar-snapshot-repositorio'
import { LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO } from '../services/politica-elegibilidade-repositorio'
import { ResultadoElegibilidade } from './resumo-repositorio'

interface NovaAnaliseFormularioProps {
  onIniciar?: (url: string) => void
  onResultado?: (resultado: ResultadoElegibilidadeRepositorio) => void
  onVerificacaoIniciada?: () => void
  mostrarResultado?: boolean
  compacto?: boolean
  iniciando?: boolean
  erroInicio?: string | null
}

export function NovaAnaliseFormulario({
  onIniciar,
  onResultado,
  onVerificacaoIniciada,
  mostrarResultado = true,
  compacto = false,
  iniciando = false,
  erroInicio = null,
}: NovaAnaliseFormularioProps = {}) {
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
      onResultado?.(novoResumo)
    },
    onError: (erro: ErroApiAnaliseCliente) => setErroCodigo(erro.codigo),
  })

  const mensagemErro = erroCodigo ? tErros(erroCodigo) : null

  function enviarFormulario(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResultado(null)
    setErroCodigo(null)
    onVerificacaoIniciada?.()
    mutation.mutate(url)
  }

  function alterarUrl(valor: string) {
    setUrl(valor)
    setErroCodigo(null)
  }

  return (
    <section id="nova-analise" className={`relative scroll-mt-28 ${compacto ? 'mx-auto max-w-3xl' : ''}`}>
      <div className="max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <span className="h-px w-5 bg-primary" />
          {t('eyebrow')}
        </div>
        {compacto ? (
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.04em] text-balance sm:text-4xl">{t('titulo')}</h2>
        ) : (
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-balance sm:text-5xl lg:text-[3.65rem]">{t('titulo')}</h1>
        )}
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{t('descricao')}</p>
      </div>

      <form onSubmit={enviarFormulario} className="mt-9 rounded-2xl border border-border/80 bg-card p-4 shadow-[0_20px_60px_-42px_var(--foreground)] sm:p-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="repositorio-url" className="text-sm font-semibold">
            {t('urlLabel')}
            </label>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-3.5 text-primary" />
              {t('somentePublicos')}
            </span>
          </div>
          <div className="group relative rounded-xl bg-muted p-1 transition focus-within:bg-accent/70 sm:flex">
            <GitBranch aria-hidden="true" className="pointer-events-none absolute left-4 top-8 size-5 -translate-y-1/2 text-muted-foreground sm:left-5 sm:top-1/2" />
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
              className="h-14 w-full rounded-lg border border-transparent bg-background pl-12 pr-4 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 sm:pr-48"
            />
            <button
              type="submit"
              disabled={mutation.isPending}
              className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 sm:absolute sm:right-2 sm:top-2 sm:mt-0 sm:w-auto"
            >
              {mutation.isPending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : <ArrowRight aria-hidden="true" className="size-4" />}
              {mutation.isPending ? t('verificando') : t('verificar')}
            </button>
          </div>
          <p id="repositorio-orientacao" className="max-w-3xl pt-1 text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
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

        {mutation.isPending && (
          <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
            {t('carregando')}
          </p>
        )}

        {mensagemErro && (
          <p id="repositorio-url-erro" role="alert" aria-live="assertive" className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            {mensagemErro}
          </p>
        )}
      </form>

      {mostrarResultado && resultado && (
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
