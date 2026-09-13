'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { analisesQueryKeys } from '../services/analises-query-keys'
import {
  ErroApiAnaliseCliente,
  iniciarAnalise,
  tentarNovamente,
  type ResumoStatusAnaliseCliente,
} from '../services/api-analises-cliente'
import {
  adicionarAnaliseRecente,
  lerAnalisesRecentes,
} from '../services/analises-recentes'
import { obterChaveMensagemErro } from '../services/mensagens-erros-analise'
import { AnaliseAtual } from './analise-atual'
import { AnalisesRecentes } from './analises-recentes'
import { NovaAnaliseFormulario } from './nova-analise-formulario'

export function AcompanhamentoAnalises() {
  const queryClient = useQueryClient()
  const tErros = useTranslations('erros')
  const [idsRecentes, setIdsRecentes] = useState<string[] | null>(null)
  const [idAtual, setIdAtual] = useState<string | null>(null)
  const [erroInicio, setErroInicio] = useState<string | null>(null)
  const [tentandoId, setTentandoId] = useState<string | null>(null)
  const [errosRetry, setErrosRetry] = useState<Record<string, ErroApiAnaliseCliente>>({})
  const [anuncio, setAnuncio] = useState('')

  useEffect(() => {
    queueMicrotask(() => setIdsRecentes(lerAnalisesRecentes()))
  }, [])

  const criacao = useMutation({
    mutationFn: iniciarAnalise,
    onSuccess: guardarResumo,
    onError: (erro: ErroApiAnaliseCliente) => {
      if (erro.resumo) {
        guardarResumo(erro.resumo)
      } else {
        setErroInicio(tErros(obterChaveMensagemErro(erro.codigo)))
      }
    },
  })

  const retry = useMutation({
    mutationFn: ({ snapshotId, tentativa }: { snapshotId: string; tentativa: number }) => tentarNovamente(snapshotId, tentativa),
    onMutate: ({ snapshotId }) => {
      setTentandoId(snapshotId)
      setErrosRetry((atuais) => removerErroRetry(atuais, snapshotId))
    },
    onSuccess: (resumo, { snapshotId }) => {
      setErrosRetry((atuais) => removerErroRetry(atuais, snapshotId))
      guardarResumo(resumo)
    },
    onError: (erro: ErroApiAnaliseCliente, { snapshotId }) => {
      if (erro.resumo) guardarResumo(erro.resumo)
      setErrosRetry((atuais) => ({ ...atuais, [snapshotId]: erro }))
    },
    onSettled: () => setTentandoId(null),
  })

  function guardarResumo(resumo: ResumoStatusAnaliseCliente) {
    queryClient.setQueryData(analisesQueryKeys.status(resumo.idPublico), resumo)
    setIdAtual(resumo.idPublico)
    setIdsRecentes((ids) => [resumo.idPublico, ...(ids ?? []).filter((id) => id !== resumo.idPublico)].slice(0, 10))
    adicionarAnaliseRecente(resumo.idPublico)
    setErroInicio(null)
  }

  return (
    <div className="w-full max-w-5xl">
      <NovaAnaliseFormulario
        onIniciar={(url) => {
          setErroInicio(null)
          criacao.mutate(url)
        }}
        iniciando={criacao.isPending}
        erroInicio={erroInicio}
      />

      {idAtual && (
        <AnaliseAtual
          snapshotId={idAtual}
          onTentarNovamente={(tentativa) => retry.mutate({ snapshotId: idAtual, tentativa })}
          tentandoNovamente={tentandoId === idAtual}
          erroNovaTentativa={errosRetry[idAtual]}
          onAnuncio={setAnuncio}
        />
      )}

      <AnalisesRecentes
        ids={idsRecentes ?? []}
        idAtual={idAtual}
        onTentarNovamente={(snapshotId, tentativa) => retry.mutate({ snapshotId, tentativa })}
        tentandoId={tentandoId}
        errosRetry={errosRetry}
        carregando={idsRecentes === null}
        onAnuncio={setAnuncio}
        onRemover={(ids) => setIdsRecentes((atuais) => (atuais ?? []).filter((id) => !ids.includes(id)))}
      />

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {anuncio}
      </div>
    </div>
  )
}

function removerErroRetry(erros: Record<string, ErroApiAnaliseCliente>, snapshotId: string) {
  const restantes = { ...erros }
  delete restantes[snapshotId]
  return restantes
}
