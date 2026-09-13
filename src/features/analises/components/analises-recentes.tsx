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
  tentandoIds: Set<string>
  errosRetry: Record<string, ErroApiAnaliseCliente>
  carregando: boolean
  onRemover: (ids: string[]) => void
  onAnuncio?: (anuncio: string) => void
}

type EventoAcessibilidade = {
  chave: string
  mensagem: string
  tipo: 'atualizacao' | 'falha'
  snapshotId: string
}

export function AnalisesRecentes({ ids, idAtual, onTentarNovamente, tentandoIds, errosRetry, carregando, onRemover, onAnuncio }: AnalisesRecentesProps) {
  const t = useTranslations('analises')
  const tErros = useTranslations('erros')
  const eventosAnunciados = useRef(new Set<string>())
  const errosAtualizacaoAtivos = useRef(new Map<string, string>())
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
    const eventos = consultas.flatMap<EventoAcessibilidade>((consulta, indice) => {
      const snapshotId = idsVisiveis[indice]
      if (consulta.error instanceof ErroApiAnaliseCliente) {
        return [{ chave: `${snapshotId}:atualizacao:${consulta.error.codigo}`, mensagem: `${t('falhaAtualizacao')} ${tErros(obterChaveMensagemErro(consulta.error.codigo))}`, tipo: 'atualizacao', snapshotId }]
      }
      if (consulta.data?.estado === 'falha' && consulta.data.falha) {
        const { codigo, ocorridoEm } = consulta.data.falha
        return [{ chave: `${snapshotId}:falha:${consulta.data.tentativa}:${codigo}:${ocorridoEm ?? ''}`, mensagem: `${t('anuncio.falha')} ${tErros(obterChaveMensagemErro(codigo))}`, tipo: 'falha', snapshotId }]
      }
      return []
    })

    if (carregando || consultas.some((consulta) => consulta.isPending)) return

    if (!baselineInicializado.current) {
      for (const evento of eventos) {
        eventosAnunciados.current.add(evento.chave)
        if (evento.tipo === 'atualizacao') errosAtualizacaoAtivos.current.set(evento.snapshotId, evento.chave)
      }
      baselineInicializado.current = true
      return
    }

    const snapshotsComErro = new Set(eventos.filter((evento) => evento.tipo === 'atualizacao').map((evento) => evento.snapshotId))
    for (const snapshotId of errosAtualizacaoAtivos.current.keys()) {
      if (!snapshotsComErro.has(snapshotId)) errosAtualizacaoAtivos.current.delete(snapshotId)
    }

    for (const evento of eventos) {
      if (evento.tipo === 'atualizacao' && errosAtualizacaoAtivos.current.get(evento.snapshotId) !== evento.chave) {
        errosAtualizacaoAtivos.current.set(evento.snapshotId, evento.chave)
        eventosAnunciados.current.delete(evento.chave)
      }
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
                tentandoNovamente={tentandoIds.has(idsVisiveis[indice])}
                erroNovaTentativa={errosRetry[idsVisiveis[indice]]}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
