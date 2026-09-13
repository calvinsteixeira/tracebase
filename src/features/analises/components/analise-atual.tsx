'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { useStatusAnalise } from '../hooks/use-analises'
import { ErroApiAnaliseCliente } from '../services/api-analises-cliente'
import { CartaoAcompanhamentoAnalise } from './cartao-acompanhamento-analise'

interface AnaliseAtualProps {
  snapshotId: string
  onTentarNovamente: (tentativa: number) => void
  tentandoNovamente: boolean
  erroNovaTentativa?: ErroApiAnaliseCliente | null
  onEstadoAtualizado?: (anuncio: string) => void
}

export function AnaliseAtual({ snapshotId, onTentarNovamente, tentandoNovamente, erroNovaTentativa, onEstadoAtualizado }: AnaliseAtualProps) {
  const t = useTranslations('analises')
  const consulta = useStatusAnalise(snapshotId)
  const erro = consulta.error instanceof ErroApiAnaliseCliente ? consulta.error : null
  const estado = consulta.data?.estado

  useEffect(() => {
    if (estado) onEstadoAtualizado?.(t(`anuncio.${estado}`))
  }, [estado, onEstadoAtualizado, t])

  return (
    <section aria-labelledby="analise-atual-titulo" className="mt-12">
      <div className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">{t('acompanhamento')}</p>
        <h2 id="analise-atual-titulo" className="mt-2 text-2xl font-semibold tracking-tight">{t('analiseAtual')}</h2>
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
