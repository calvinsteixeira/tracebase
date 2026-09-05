'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { ResultadoElegibilidadeRepositorio } from '../services/criar-snapshot-repositorio'

interface ResultadoElegibilidadeProps {
  resultado: ResultadoElegibilidadeRepositorio
}

export function ResultadoElegibilidade({ resultado }: ResultadoElegibilidadeProps) {
  const t = useTranslations('elegibilidade')
  const formatador = useFormatter()

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
      className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="mb-6">
        <p
          role={resultado.status === 'nao-elegivel' ? 'alert' : 'status'}
          aria-live={resultado.status === 'nao-elegivel' ? 'assertive' : 'polite'}
          className="text-sm font-semibold text-primary"
        >
          {statusLabel}
        </p>
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
        <div
          role={resultado.status === 'inconclusiva' ? 'status' : 'alert'}
          aria-live={resultado.status === 'inconclusiva' ? 'polite' : 'assertive'}
          className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm"
        >
          {mensagemDetalhe}
        </div>
      )}
    </section>
  )
}
