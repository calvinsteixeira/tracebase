import {
  indexarSnapshotRepositorio,
  type LimitesConteudoRepositorio,
  type SolicitarIndexacaoSnapshot,
} from './indexar-snapshot-repositorio'
import { indexarImports } from './indexador/indexador-imports'
import {
  filtrarArquivosElegiveis,
  LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
} from './politica-elegibilidade-repositorio'
import {
  classificarFalhaAnalise,
  ErroControleProcessamento,
  ErroPersistenciaProcessamento,
} from './classificar-falha-analise'
import type {
  EtapaAnalise,
  FalhaAnalise,
  RepositorioCicloVidaAnalise,
  ResultadoAquisicaoProcessamento,
  SnapshotCicloVidaAnalise,
} from './persistencia/ciclo-vida-analise'
import type {
  IndicePersistido,
  RepositorioPersistenciaIndice,
  ResultadoPersistenciaIndice,
} from './persistencia/persistencia-indice'
import type { IndiceAnalise } from '../analises.types'
import type { FonteDeRepositorioComArvore } from './fonte-repositorio'

export interface MensagemProcessamentoAnalise {
  snapshotId: string
  tentativa: number
}

export type ResultadoProcessamentoAnalise =
  | { tipo: 'concluido'; indice: IndicePersistido }
  | { tipo: 'ja_concluido' }
  | { tipo: 'ocupado' }
  | { tipo: 'tentativa_desatualizada' }
  | { tipo: 'inexistente' }
  | { tipo: 'estado_incompativel' }
  | { tipo: 'falha_registrada'; falha: FalhaAnalise }
  | { tipo: 'lease_perdido' }

export interface RelogioProcessamentoAnalise {
  agora(): string
}

export interface TemporizadorProcessamentoAnalise {
  setTimeout(callback: () => void, atrasoMs: number): unknown
  clearTimeout(id: unknown): void
  setInterval(callback: () => void, atrasoMs: number): unknown
  clearInterval(id: unknown): void
}

export interface OpcoesConsumidorProcessamentoAnalise {
  cicloVida: RepositorioCicloVidaAnalise
  persistencia: RepositorioPersistenciaIndice
  fonte: FonteDeRepositorioComArvore
  indexar?: (input: SolicitarIndexacaoSnapshot) => Promise<IndiceAnalise>
  indexador?: SolicitarIndexacaoSnapshot['indexador']
  limites?: LimitesConteudoRepositorio
  relogio?: RelogioProcessamentoAnalise
  temporizador?: TemporizadorProcessamentoAnalise
  leaseDuracaoMs?: number
  renovacaoLeaseMs?: number
  duracaoMaximaMs?: number
}

export interface ConsumidorProcessamentoAnalise {
  processar(mensagem: MensagemProcessamentoAnalise): Promise<ResultadoProcessamentoAnalise>
}

const relogioPadrao: RelogioProcessamentoAnalise = {
  agora: () => new Date().toISOString(),
}

const temporizadorPadrao: TemporizadorProcessamentoAnalise = {
  setTimeout: (callback, atrasoMs) => setTimeout(callback, atrasoMs),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  setInterval: (callback, atrasoMs) => setInterval(callback, atrasoMs),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
}

export function criarConsumidorProcessamentoAnalise(
  opcoes: OpcoesConsumidorProcessamentoAnalise,
): ConsumidorProcessamentoAnalise {
  const relogio = opcoes.relogio ?? relogioPadrao
  const temporizador = opcoes.temporizador ?? temporizadorPadrao
  const indexar = opcoes.indexar ?? ((input) => indexarSnapshotRepositorio(input))
  const indexador = opcoes.indexador ?? indexarImports
  const limites = opcoes.limites ?? LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO
  const leaseDuracaoMs = opcoes.leaseDuracaoMs ?? 60_000
  const renovacaoLeaseMs = opcoes.renovacaoLeaseMs ?? 20_000
  const duracaoMaximaMs = opcoes.duracaoMaximaMs ?? 4 * 60_000

  return {
    async processar(mensagem) {
      const agora = relogio.agora()
      const inicio = dataParaMs(agora)
      const prazoFinal = inicio + duracaoMaximaMs
      const aquisicao = await opcoes.cicloVida.adquirirProcessamento({
        idPublico: mensagem.snapshotId,
        tentativa: mensagem.tentativa,
        agora,
        leaseExpiraEm: dataParaIso(inicio + leaseDuracaoMs),
      })

      if (aquisicao.tipo !== 'adquirido') return mapearAquisicao(aquisicao)

      let prazoEsgotado = false
      let leasePerdido = false
      let encerrado = false
      let renovacaoEmAndamento: Promise<void> | undefined

      const renovar = () => {
        if (encerrado || prazoEsgotado || leasePerdido || renovacaoEmAndamento) return

        const agoraRenovacao = relogio.agora()
        if (dataParaMs(agoraRenovacao) >= prazoFinal) {
          prazoEsgotado = true
          return
        }

        renovacaoEmAndamento = opcoes.cicloVida
          .renovarLease({
            idPublico: mensagem.snapshotId,
            tentativa: mensagem.tentativa,
            leaseId: aquisicao.lease.id,
            agora: agoraRenovacao,
            leaseExpiraEm: dataParaIso(dataParaMs(agoraRenovacao) + leaseDuracaoMs),
          })
          .then((snapshot) => {
            if (!snapshot) leasePerdido = true
          })
          .catch(() => {
            leasePerdido = true
          })
          .finally(() => {
            renovacaoEmAndamento = undefined
          })
      }

      const timerHeartbeat = temporizador.setInterval(renovar, renovacaoLeaseMs)
      const buscarConclusaoConfirmada = async (): Promise<
        Extract<ResultadoProcessamentoAnalise, { tipo: 'concluido' | 'ja_concluido' }> | null
      > => {
        const estadoAtual = await opcoes.cicloVida.buscarPorIdPublico(mensagem.snapshotId)
        if (estadoAtual?.estado !== 'concluido') return null

        const indiceConcluido = await opcoes.persistencia.buscarPorSnapshotConcluido(
          mensagem.snapshotId,
        )
        return indiceConcluido
          ? { tipo: 'concluido', indice: indiceConcluido }
          : { tipo: 'ja_concluido' }
      }

      try {
        const resultado = await comPrazo(
          () => executarPipeline({
            cicloVida: opcoes.cicloVida,
            persistencia: opcoes.persistencia,
            fonte: opcoes.fonte,
            indexar,
            indexador,
            limites,
            mensagem,
            aquisicao,
            relogio,
            prazoExpiraEm: dataParaIso(prazoFinal),
            garantirAtivo: () => {
              if (prazoEsgotado || leasePerdido || dataParaMs(relogio.agora()) >= prazoFinal) {
                prazoEsgotado ||= dataParaMs(relogio.agora()) >= prazoFinal
                throw new ErroControleProcessamento(prazoEsgotado ? 'TEMPO_ESGOTADO' : 'LEASE_PERDIDO')
              }
            },
          }),
          Math.max(0, prazoFinal - dataParaMs(relogio.agora())),
          temporizador,
          () => {
            prazoEsgotado = true
          },
        )

        if ('tipo' in resultado) return resultado
        return { tipo: 'concluido', indice: resultado }
      } catch (erro) {
        if (erro instanceof ErroControleProcessamento && erro.codigo === 'LEASE_PERDIDO') {
          return (await buscarConclusaoConfirmada()) ?? { tipo: 'lease_perdido' }
        }

        const falha = classificarFalhaAnalise(erro)
        const snapshotComFalha = await opcoes.cicloVida.registrarFalhaProcessamento({
          idPublico: mensagem.snapshotId,
          tentativa: mensagem.tentativa,
          leaseId: aquisicao.lease.id,
          agora: relogio.agora(),
          falha,
        })

        if (!snapshotComFalha) {
          return (await buscarConclusaoConfirmada()) ?? { tipo: 'lease_perdido' }
        }
        return {
          tipo: 'falha_registrada',
          falha: snapshotComFalha.falha ?? {
            ...falha,
            detalhes: falha.detalhes ?? null,
            ocorridoEm: snapshotComFalha.atualizadoEm,
          },
        }
      } finally {
        encerrado = true
        temporizador.clearInterval(timerHeartbeat)
      }
    },
  }
}

export function criarExecutorLocalProcessamento(
  consumidor: ConsumidorProcessamentoAnalise,
) {
  return {
    executar: (mensagem: MensagemProcessamentoAnalise) => consumidor.processar(mensagem),
  }
}

async function executarPipeline({
  cicloVida,
  persistencia,
  fonte,
  indexar,
  indexador,
  limites,
  mensagem,
  aquisicao,
  relogio,
  prazoExpiraEm,
  garantirAtivo,
}: {
  cicloVida: RepositorioCicloVidaAnalise
  persistencia: RepositorioPersistenciaIndice
  fonte: FonteDeRepositorioComArvore
  indexar: (input: SolicitarIndexacaoSnapshot) => Promise<IndiceAnalise>
  indexador: SolicitarIndexacaoSnapshot['indexador']
  limites: LimitesConteudoRepositorio
  mensagem: MensagemProcessamentoAnalise
  aquisicao: Extract<ResultadoAquisicaoProcessamento, { tipo: 'adquirido' }>
  relogio: RelogioProcessamentoAnalise
  prazoExpiraEm: string
  garantirAtivo: () => void
  }): Promise<IndicePersistido | ResultadoProcessamentoAnalise> {
  const { snapshot, lease } = aquisicao
  garantirAtivo()
  await atualizarEtapa(cicloVida, snapshot, lease.id, 'preparacao', relogio, garantirAtivo)
  await atualizarEtapa(cicloVida, snapshot, lease.id, 'obtencao_arquivos', relogio, garantirAtivo)

  const arvore = await fonte.obterArvore({
    repositorio: snapshot.repositorio,
    commitSha: snapshot.commitSha,
  })
  garantirAtivo()

  const indice = await indexar({
    entrada: {
      repositorio: snapshot.repositorio,
      snapshot: {
        idPublico: snapshot.idPublico,
        repositorio: snapshot.repositorio,
        commitSha: snapshot.commitSha,
        referencia: snapshot.referencia,
      },
      arquivos: arvore,
    },
    fonte,
    indexador,
    limites,
    antesDeIndexar: async () => {
      await atualizarEtapa(cicloVida, snapshot, lease.id, 'indexacao', relogio, garantirAtivo)
    },
  })

  await atualizarEtapa(cicloVida, snapshot, lease.id, 'persistencia', relogio, garantirAtivo)
  garantirAtivo()

  let persistido: ResultadoPersistenciaIndice
  try {
    persistido = await persistencia.salvarEConcluir({
      snapshotIdPublico: mensagem.snapshotId,
      tentativa: mensagem.tentativa,
      leaseId: lease.id,
      agora: relogio.agora(),
      prazoExpiraEm,
      indice,
      arquivos: filtrarArquivosElegiveis(arvore)
        .map((arquivo) => ({
          caminho: arquivo.caminho,
          blobSha: arquivo.sha,
        })),
    })
  } catch {
    throw new ErroPersistenciaProcessamento()
  }

  return mapearPersistencia(persistido)
}

async function atualizarEtapa(
  cicloVida: RepositorioCicloVidaAnalise,
  snapshot: SnapshotCicloVidaAnalise,
  leaseId: string,
  etapa: EtapaAnalise,
  relogio: RelogioProcessamentoAnalise,
  garantirAtivo: () => void,
) {
  garantirAtivo()
  const atualizado = await cicloVida.atualizarEtapa({
    idPublico: snapshot.idPublico,
    tentativa: snapshot.tentativa,
    leaseId,
    etapa,
    agora: relogio.agora(),
  })
  if (!atualizado) throw new ErroControleProcessamento('LEASE_PERDIDO')
}

function mapearAquisicao(
  resultado: Exclude<ResultadoAquisicaoProcessamento, { tipo: 'adquirido' }>,
): Exclude<ResultadoProcessamentoAnalise, { tipo: 'concluido' | 'falha_registrada' | 'lease_perdido' }> {
  return resultado.tipo === 'concluido' ? { tipo: 'ja_concluido' } : resultado
}

function mapearPersistencia(
  resultado: ResultadoPersistenciaIndice,
): IndicePersistido | Exclude<ResultadoProcessamentoAnalise, { tipo: 'concluido' | 'falha_registrada' | 'lease_perdido' }> {
  if (resultado.tipo === 'persistido') return resultado.indice
  if (resultado.tipo === 'ja_concluido') return { tipo: 'ja_concluido' }
  if (resultado.tipo === 'lease_invalido') throw new ErroControleProcessamento('LEASE_PERDIDO')
  if (resultado.tipo === 'prazo_expirado') throw new ErroControleProcessamento('TEMPO_ESGOTADO')
  return { tipo: resultado.tipo }
}

async function comPrazo<T>(
  trabalho: () => Promise<T>,
  duracaoMs: number,
  temporizador: TemporizadorProcessamentoAnalise,
  aoEsgotar: () => void,
) {
  let timer: unknown
  const timeout = new Promise<never>((_, rejeitar) => {
    timer = temporizador.setTimeout(() => {
      aoEsgotar()
      rejeitar(new ErroControleProcessamento('TEMPO_ESGOTADO'))
    }, duracaoMs)
  })

  try {
    return await Promise.race([trabalho(), timeout])
  } finally {
    if (timer !== undefined) temporizador.clearTimeout(timer)
  }
}

function dataParaMs(valor: string) {
  const ms = Date.parse(valor)
  if (!Number.isFinite(ms)) throw new Error('Relógio retornou uma data inválida.')
  return ms
}

function dataParaIso(ms: number) {
  return new Date(ms).toISOString()
}
