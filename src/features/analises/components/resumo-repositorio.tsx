'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { CheckCircle2, CircleAlert, Info } from 'lucide-react'

import type { ResultadoElegibilidadeRepositorio } from '../services/criar-snapshot-repositorio'

interface ResultadoElegibilidadeProps {
  resultado: ResultadoElegibilidadeRepositorio
  onIniciar?: () => void
  iniciando?: boolean
  erroInicio?: string | null
}

export function ResultadoElegibilidade({ resultado, onIniciar, iniciando = false, erroInicio = null }: ResultadoElegibilidadeProps) {
  const t = useTranslations('elegibilidade')
  const formatador = useFormatter()
  const visual = obterVisualStatus(resultado.status)

  const formatarTamanho = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return formatador.number(bytes / (1024 * 1024), {
        maximumFractionDigits: 1,
        style: 'unit',
        unit: 'megabyte',
        unitDisplay: 'short',
      })
    }

    return formatador.number(bytes / 1024, {
      maximumFractionDigits: 1,
      style: 'unit',
      unit: 'kilobyte',
      unitDisplay: 'short',
    })
  }

  const detalhe = resultado.detalhe
  const mensagemDetalhe =
    detalhe?.criterio === 'sem-arquivos'
      ? t('detalhes.semArquivos')
      : detalhe?.criterio === 'tamanho-desconhecido'
        ? t('detalhes.tamanhoDesconhecido', {
            maximo: formatarTamanho(resultado.limites.tamanhoMaximoTotalBytes),
          })
        : detalhe?.criterio === 'quantidade-arquivos'
          ? t('detalhes.quantidadeArquivos', {
              encontrado: detalhe.encontrado ?? 0,
              maximo: detalhe.maximo ?? 0,
            })
          : detalhe?.criterio === 'tamanho-arquivo'
            ? t('detalhes.tamanhoArquivo', {
                caminho: detalhe.caminho ?? '',
                encontrado: formatarTamanho(detalhe.encontrado ?? 0),
                maximo: formatarTamanho(detalhe.maximo ?? 0),
              })
            : detalhe?.criterio === 'tamanho-total'
              ? t('detalhes.tamanhoTotal', {
                  encontrado: formatarTamanho(detalhe.encontrado ?? 0),
                  maximo: formatarTamanho(detalhe.maximo ?? 0),
                })
              : null
  const statusLabel = t(`status.${resultado.status}`)

  return (
    <section
      aria-labelledby="resultado-elegibilidade-titulo"
      className={`mt-8 rounded-2xl border bg-card p-6 shadow-sm ${visual.container}`}
    >
      <div className="mb-6">
        <div className={`flex items-center gap-3 rounded-xl border p-4 ${visual.statusContainer}`}>
          <visual.IconeStatus aria-hidden="true" className={`size-5 shrink-0 ${visual.statusText}`} />
          <p className={`text-sm font-semibold ${visual.statusText}`}>{statusLabel}</p>
        </div>
        <h2 id="resultado-elegibilidade-titulo" className="mt-2 text-2xl font-semibold tracking-tight">
          {resultado.repositorio.proprietario}/{resultado.repositorio.nome}
        </h2>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
          <dt className="text-sm text-muted-foreground">{t('branch')}</dt>
          <dd className="mt-1 font-medium">{resultado.snapshot.referencia}</dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
          <dt className="text-sm text-muted-foreground">{t('arquivos')}</dt>
          <dd className="mt-1 font-medium">
            {t('arquivosValor', {
              encontrado: resultado.quantidadeArquivosElegiveis,
              maximo: resultado.limites.quantidadeMaximaArquivosElegiveis,
            })}
          </dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/40 p-4 sm:col-span-2">
          <dt className="text-sm text-muted-foreground">{t('tamanhoTotal')}</dt>
          <dd className="mt-1 font-medium">
            {resultado.tamanhoTotalBytes === null
              ? t('tamanhoDesconhecido', {
                  maximo: formatarTamanho(resultado.limites.tamanhoMaximoTotalBytes),
                })
              : t('tamanhoTotalValor', {
                  encontrado: formatarTamanho(resultado.tamanhoTotalBytes),
                  maximo: formatarTamanho(resultado.limites.tamanhoMaximoTotalBytes),
                })}
          </dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/40 p-4 sm:col-span-2">
          <dt className="text-sm text-muted-foreground">{t('commit')}</dt>
          <dd className="mt-1 break-all font-mono text-sm">{resultado.snapshot.commitSha}</dd>
        </div>
      </dl>

      {mensagemDetalhe && (
        <div className={`mt-6 rounded-xl border p-4 text-sm ${visual.detail}`}>
          {mensagemDetalhe}
        </div>
      )}

      {resultado.status === 'elegivel' && onIniciar && (
        <button
          type="button"
          onClick={onIniciar}
          disabled={iniciando}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
        >
          {iniciando ? t('iniciando') : t('iniciar')}
        </button>
      )}

      {erroInicio && (
        <p role="alert" aria-live="assertive" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {erroInicio}
        </p>
      )}
    </section>
  )
}

function obterVisualStatus(status: ResultadoElegibilidadeRepositorio['status']) {
  if (status === 'elegivel') {
    return {
      IconeStatus: CheckCircle2,
      container: 'border-primary/40',
      statusContainer: 'border-primary/30 bg-primary/10',
      statusText: 'text-primary',
      detail: 'border-primary/30 bg-primary/10 text-primary',
    }
  }

  if (status === 'nao-elegivel') {
    return {
      IconeStatus: CircleAlert,
      container: 'border-warning/40',
      statusContainer: 'border-warning/30 bg-warning/10',
      statusText: 'text-warning',
      detail: 'border-warning/30 bg-warning/10 text-warning',
    }
  }

  return {
    IconeStatus: Info,
    container: 'border-border',
    statusContainer: 'border-border bg-muted/50',
    statusText: 'text-muted-foreground',
    detail: 'border-border bg-muted/50 text-muted-foreground',
  }
}
