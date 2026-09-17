'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { analisesQueryKeys } from '../services/analises-query-keys'
import type { ResultadoElegibilidadeRepositorio } from '../services/criar-snapshot-repositorio'
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
import { CabecalhoWorkspaceRepositorio } from './cabecalho-workspace-repositorio'
import { type EtapaFluxoAnalise, NavegacaoFluxoAnalise } from './navegacao-fluxo-analise'
import { NovaAnaliseFormulario } from './nova-analise-formulario'
import { ResultadoElegibilidade } from './resumo-repositorio'

export function AcompanhamentoAnalises() {
  const queryClient = useQueryClient()
  const tErros = useTranslations('erros')
  const tFluxo = useTranslations('fluxo')
  const [idsRecentes, setIdsRecentes] = useState<string[] | null>(null)
  const [idAtual, setIdAtual] = useState<string | null>(null)
  const [erroInicio, setErroInicio] = useState<string | null>(null)
  const [tentandoIds, setTentandoIds] = useState<Set<string>>(() => new Set())
  const [errosRetry, setErrosRetry] = useState<Record<string, ErroApiAnaliseCliente>>({})
  const [anuncio, setAnuncio] = useState('')
  const [resultado, setResultado] = useState<ResultadoElegibilidadeRepositorio | null>(null)
  const [etapaAtual, setEtapaAtual] = useState<EtapaFluxoAnalise>('conectar')
  const [mostrandoHistorico, setMostrandoHistorico] = useState(false)

  useEffect(() => {
    queueMicrotask(() => setIdsRecentes(lerAnalisesRecentes()))
  }, [])

  const criacao = useMutation({
    mutationFn: iniciarAnalise,
    onSuccess: (resumo) => guardarResumo(resumo),
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
      setTentandoIds((atuais) => new Set(atuais).add(snapshotId))
      setErrosRetry((atuais) => removerErroRetry(atuais, snapshotId))
    },
    onSuccess: (resumo, { snapshotId }) => {
      setErrosRetry((atuais) => removerErroRetry(atuais, snapshotId))
      guardarResumo(resumo, false)
    },
    onError: (erro: ErroApiAnaliseCliente, { snapshotId }) => {
      if (erro.resumo) guardarResumo(erro.resumo, false)
      setErrosRetry((atuais) => ({ ...atuais, [snapshotId]: erro }))
    },
    onSettled: (_data, _error, { snapshotId }) => {
      setTentandoIds((atuais) => removerId(atuais, snapshotId))
    },
  })

  function guardarResumo(resumo: ResumoStatusAnaliseCliente, moverParaAcompanhamento = true) {
    queryClient.setQueryData(analisesQueryKeys.status(resumo.idPublico), resumo)
    setIdAtual(resumo.idPublico)
    setIdsRecentes((ids) => [resumo.idPublico, ...(ids ?? []).filter((id) => id !== resumo.idPublico)].slice(0, 10))
    adicionarAnaliseRecente(resumo.idPublico)
    setErroInicio(null)
    if (moverParaAcompanhamento) {
      setEtapaAtual('acompanhar')
      setMostrandoHistorico(false)
    }
  }

  function reiniciarVerificacao() {
    setResultado(null)
    setIdAtual(null)
    setErroInicio(null)
    setEtapaAtual('conectar')
  }

  function avancarFluxo() {
    if (etapaAtual === 'revisar' && resultado?.status === 'elegivel') {
      setErroInicio(null)
      criacao.mutate(resultado.repositorio.url)
    }
  }

  const podeAvancar = etapaAtual === 'revisar' && resultado?.status === 'elegivel'
  const rotuloAvancar = criacao.isPending ? tFluxo('acoes.iniciando') : tFluxo('acoes.iniciar')

  return (
    <div className="relative mx-auto w-full max-w-6xl">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-16 size-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative overflow-visible rounded-3xl border border-border/80 bg-card/80 shadow-[0_28px_90px_-60px_var(--foreground)] backdrop-blur">
        <CabecalhoWorkspaceRepositorio
          resultado={resultado}
          mostrandoHistorico={mostrandoHistorico}
          onAlternarHistorico={() => setMostrandoHistorico((atual) => !atual)}
        />

        {mostrandoHistorico ? (
          <AnalisesRecentes
            ids={idsRecentes ?? []}
            idAtual={null}
            onTentarNovamente={(snapshotId, tentativa) => retry.mutate({ snapshotId, tentativa })}
            tentandoIds={tentandoIds}
            errosRetry={errosRetry}
            carregando={idsRecentes === null}
            onAnuncio={setAnuncio}
            onRemover={(ids) => setIdsRecentes((atuais) => (atuais ?? []).filter((id) => !ids.includes(id)))}
            integrado
          />
        ) : (
          <>
            <NavegacaoFluxoAnalise
              etapaAtual={etapaAtual}
              revisaoDisponivel={Boolean(resultado)}
              acompanhamentoDisponivel={Boolean(idAtual)}
              onNavegar={setEtapaAtual}
            />

            <div className="min-h-[34rem] px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
              <div hidden={etapaAtual !== 'conectar'}>
                <NovaAnaliseFormulario
                  compacto
                  mostrarResultado={false}
                  onResultado={(novoResultado) => {
                    setResultado(novoResultado)
                    setEtapaAtual('revisar')
                  }}
                  onVerificacaoIniciada={reiniciarVerificacao}
                />
              </div>

              {resultado && (
                <div hidden={etapaAtual !== 'revisar'} className="mx-auto max-w-3xl">
                  <div className="max-w-2xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{tFluxo('revisao.eyebrow')}</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">{tFluxo('revisao.titulo')}</h2>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">{tFluxo('revisao.descricao')}</p>
                  </div>
                  <ResultadoElegibilidade resultado={resultado} erroInicio={erroInicio} />
                </div>
              )}

              {idAtual && (
                <div hidden={etapaAtual !== 'acompanhar'} className="mx-auto max-w-3xl">
                  <AnaliseAtual
                    snapshotId={idAtual}
                    onTentarNovamente={(tentativa) => retry.mutate({ snapshotId: idAtual, tentativa })}
                    tentandoNovamente={tentandoIds.has(idAtual)}
                    erroNovaTentativa={errosRetry[idAtual]}
                    onAnuncio={setAnuncio}
                  />
                </div>
              )}
            </div>

            {etapaAtual === 'revisar' && (
              <button
                type="button"
                onClick={avancarFluxo}
                disabled={!podeAvancar || criacao.isPending}
                className="group mx-5 mb-6 flex min-h-12 w-[calc(100%-2.5rem)] items-center justify-center gap-3 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 sm:mx-8 sm:w-[calc(100%-4rem)] lg:absolute lg:-right-7 lg:top-1/2 lg:mx-0 lg:mb-0 lg:size-14 lg:w-14 lg:-translate-y-1/2 lg:rounded-full lg:p-0 lg:animate-float-x"
                aria-label={rotuloAvancar}
              >
                {criacao.isPending ? <LoaderCircle aria-hidden="true" className="size-5 motion-safe:animate-spin" /> : <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-0.5" />}
                <span className="lg:sr-only">{rotuloAvancar}</span>
                <span aria-hidden="true" className="pointer-events-none absolute right-16 hidden whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2 text-xs font-medium text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 lg:block">
                  {rotuloAvancar}
                </span>
              </button>
            )}
          </>
        )}
      </div>

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

function removerId(ids: Set<string>, id: string) {
  const restantes = new Set(ids)
  restantes.delete(id)
  return restantes
}
