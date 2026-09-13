'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { useStatusAnalises } from '../hooks/use-analises'
import { ErroApiAnaliseCliente, type ResumoStatusAnaliseCliente } from '../services/api-analises-cliente'
import { removerAnalisesRecentes } from '../services/analises-recentes'
import { obterChaveMensagemErro } from '../services/mensagens-erros-analise'
import { CartaoAcompanhamentoAnalise } from './cartao-acompanhamento-analise'

interface AnalisesRecentesProps {
  ids: string[]
  idAtual: string | null
  onTentarNovamente: (snapshotId: string, tentativa: number) => void
  tentandoId: string | null
  errosRetry: Record<string, ErroApiAnaliseCliente>
  carregando: boolean
  onRemover: (ids: string[]) => void
  onAnuncio?: (anuncio: string) => void
}

export function AnalisesRecentes({ ids, idAtual, onTentarNovamente, tentandoId, errosRetry, carregando, onRemover, onAnuncio }: AnalisesRecentesProps) {
  const t = useTranslations('analises')
  const tErros = useTranslations('erros')
  const eventosAnunciados = useRef(new Set<string>())
  const baselineInicializado = useRef(false)
  const idsVisiveis = ids.filter((id) => id !== idAtual)
  const consultas = useStatusAnalises(idsVisiveis)

  useEffect(() => {
    const inexistentes = consultas
      .filter((consulta) => consulta.error instanceof ErroApiAnaliseCliente && consulta.error.codigo === 'SNAPSHOT_NAO_ENCONTRADO')
      .map((consulta) => {
        const indice = consultas.indexOf(consulta)
        return idsVisiveis[indice]
      })
      .filter((id): id is string => Boolean(id))

    if (inexistentes.length > 0) {
      removerAnalisesRecentes(inexistentes)
      onRemover(inexistentes)
    }
  }, [consultas, idsVisiveis, onRemover])

  useEffect(() => {
    const eventos = consultas.flatMap((consulta, indice) => {
      const snapshotId = idsVisiveis[indice]
      if (consulta.error instanceof ErroApiAnaliseCliente) {
        return [{ chave: `${snapshotId}:atualizacao:${consulta.error.codigo}`, mensagem: `${t('falhaAtualizacao')} ${tErros(obterChaveMensagemErro(consulta.error.codigo))}` }]
      }
      if (consulta.data?.estado === 'falha' && consulta.data.falha) {
        return [{ chave: `${snapshotId}:falha:${consulta.data.falha.codigo}`, mensagem: `${t('anuncio.falha')} ${tErros(obterChaveMensagemErro(consulta.data.falha.codigo))}` }]
      }
      return []
    })

    if (carregando || consultas.some((consulta) => consulta.isPending)) return

    if (!baselineInicializado.current) {
      for (const evento of eventos) eventosAnunciados.current.add(evento.chave)
      baselineInicializado.current = true
      return
    }

    for (const evento of eventos) {
      if (!eventosAnunciados.current.has(evento.chave)) {
        onAnuncio?.(evento.mensagem)
        eventosAnunciados.current.add(evento.chave)
      }
    }
  }, [carregando, consultas, idsVisiveis, onAnuncio, t, tErros])

  return (
    <section aria-labelledby="analises-recentes-titulo" className="mt-12">
      <div className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">{t('acompanhamento')}</p>
        <h2 id="analises-recentes-titulo" className="mt-2 text-2xl font-semibold tracking-tight">{t('recentes.titulo')}</h2>
      </div>

      {carregando ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {t('recentes.carregando')}
        </div>
      ) : ids.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          {t('recentes.vazia')}
        </div>
      ) : idsVisiveis.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{t('recentes.vazia')}</p>
      ) : (
        <div className="grid gap-4">
          {consultas.map((consulta, indice) => {
            const erro = consulta.error instanceof ErroApiAnaliseCliente ? consulta.error : null
            const resumo = consulta.data as ResumoStatusAnaliseCliente | undefined
            return (
              <CartaoAcompanhamentoAnalise
                key={idsVisiveis[indice]}
                resumo={resumo}
                carregando={consulta.isPending}
                erroAtualizacao={erro}
                onAtualizar={() => void consulta.refetch()}
                onTentarNovamente={resumo ? (tentativa) => onTentarNovamente(resumo.idPublico, tentativa) : undefined}
                tentandoNovamente={tentandoId === idsVisiveis[indice]}
                erroNovaTentativa={errosRetry[idsVisiveis[indice]]}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
