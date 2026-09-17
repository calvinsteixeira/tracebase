'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { useStatusAnalise } from '../hooks/use-analises'
import { ErroApiAnaliseCliente } from '../services/api-analises-cliente'
import { obterChaveMensagemErro } from '../services/mensagens-erros-analise'
import { CartaoAcompanhamentoAnalise } from './cartao-acompanhamento-analise'

interface AnaliseAtualProps {
  snapshotId: string
  onTentarNovamente: (tentativa: number) => void
  tentandoNovamente: boolean
  erroNovaTentativa?: ErroApiAnaliseCliente | null
  onAnuncio?: (anuncio: string) => void
}

export function AnaliseAtual({ snapshotId, onTentarNovamente, tentandoNovamente, erroNovaTentativa, onAnuncio }: AnaliseAtualProps) {
  const t = useTranslations('analises')
  const tErros = useTranslations('erros')
  const consulta = useStatusAnalise(snapshotId)
  const erro = consulta.error instanceof ErroApiAnaliseCliente ? consulta.error : null
  const estado = consulta.data?.estado
  const codigoFalha = consulta.data?.falha?.codigo
  const codigoErroAtualizacao = erro?.codigo

  useEffect(() => {
    if (!estado) return
    const anuncio = codigoFalha && estado === 'falha'
      ? `${t(`anuncio.${estado}`)} ${tErros(obterChaveMensagemErro(codigoFalha))}`
      : t(`anuncio.${estado}`)
    onAnuncio?.(anuncio)
  }, [codigoFalha, estado, onAnuncio, t, tErros])

  useEffect(() => {
    if (!codigoErroAtualizacao) return
    onAnuncio?.(`${t('falhaAtualizacao')} ${tErros(obterChaveMensagemErro(codigoErroAtualizacao))}`)
  }, [codigoErroAtualizacao, onAnuncio, t, tErros])

  return (
    <section aria-labelledby="analise-atual-titulo" className="lg:mt-9">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('tempoReal')}</p>
          <h2 id="analise-atual-titulo" className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{t('analiseAtual')}</h2>
        </div>
        <span className="relative mb-2 flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40 motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
      </div>
      <CartaoAcompanhamentoAnalise
        resumo={consulta.data}
        carregando={consulta.isPending}
        erroAtualizacao={erro}
        onAtualizar={() => void consulta.refetch()}
        onTentarNovamente={onTentarNovamente}
        tentandoNovamente={tentandoNovamente}
        erroNovaTentativa={erroNovaTentativa}
      />
    </section>
  )
}
