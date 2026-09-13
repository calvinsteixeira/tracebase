import { randomUUID } from 'node:crypto'

import type { IndicePersistido } from './persistencia-indice'
import type {
  DadosCriacaoSnapshotAnalise,
  FalhaAnaliseParaRegistro,
  SolicitacaoAnalise,
  ResumoStatusAnalise,
  SnapshotCicloVidaAnalise,
} from './ciclo-vida-analise'
import type { RepositorioCicloVidaAnaliseCompleto } from './repositorio-api-analises'

export interface EstadoCicloVidaAnaliseEmMemoria {
  snapshots: Map<string, SnapshotCicloVidaAnalise>
  chaves: Map<string, string>
  indices: Map<string, IndicePersistido>
  solicitacoes: Map<string, SolicitacaoAnalise>
}

export function criarEstadoCicloVidaAnaliseEmMemoria(): EstadoCicloVidaAnaliseEmMemoria {
  return {
    snapshots: new Map(),
    chaves: new Map(),
    indices: new Map(),
    solicitacoes: new Map(),
  }
}

export function criarCicloVidaAnaliseEmMemoria(
  estado = criarEstadoCicloVidaAnaliseEmMemoria(),
): RepositorioCicloVidaAnaliseCompleto {
  const { snapshots, chaves, solicitacoes, indices } = estado

  return {
    async criarOuReutilizar(input) {
      const chave = criarChave(input)
      const idExistente = chaves.get(chave)
      const existente = idExistente ? snapshots.get(idExistente) : undefined

      if (existente) return clonarSnapshot(existente)

      const snapshot: SnapshotCicloVidaAnalise = {
        idPublico: randomUUID(),
        repositorio: { ...input.repositorio },
        commitSha: input.commitSha,
        referencia: input.referencia,
        estado: 'aguardando',
        etapa: null,
        tentativa: 1,
        tentativaIniciadaEm: null,
        ultimaAtividadeEm: null,
        atualizadoEm: input.agora,
        finalizadoEm: null,
        leaseId: null,
        leaseExpiraEm: null,
        falha: null,
      }

      snapshots.set(snapshot.idPublico, snapshot)
      chaves.set(chave, snapshot.idPublico)
      return clonarSnapshot(snapshot)
    },

    async buscarPorIdPublico(idPublico) {
      const snapshot = snapshots.get(idPublico)
      return snapshot ? clonarSnapshot(snapshot) : null
    },

    async adquirirProcessamento(input) {
      const snapshot = snapshots.get(input.idPublico)
      if (!snapshot) return { tipo: 'inexistente' }
      if (snapshot.estado === 'concluido') return { tipo: 'concluido' }
      if (snapshot.tentativa !== input.tentativa) {
        return { tipo: 'tentativa_desatualizada' }
      }
      if (input.leaseExpiraEm <= input.agora) return { tipo: 'estado_incompativel' }

      const leaseVencido =
        snapshot.estado === 'processando' &&
        snapshot.leaseExpiraEm !== null &&
        snapshot.leaseExpiraEm <= input.agora
      if (snapshot.estado === 'processando' && !leaseVencido) {
        return { tipo: 'ocupado' }
      }
      if (snapshot.estado !== 'aguardando' && !leaseVencido) {
        return { tipo: 'estado_incompativel' }
      }

      const leaseId = randomUUID()
      snapshot.estado = 'processando'
      snapshot.etapa ??= 'preparacao'
      snapshot.tentativaIniciadaEm ??= input.agora
      snapshot.ultimaAtividadeEm = input.agora
      snapshot.atualizadoEm = input.agora
      snapshot.finalizadoEm = null
      snapshot.leaseId = leaseId
      snapshot.leaseExpiraEm = input.leaseExpiraEm
      const snapshotClonado = clonarSnapshot(snapshot)
      return {
        tipo: 'adquirido',
        snapshot: snapshotClonado,
        lease: {
          id: leaseId,
          expiraEm: input.leaseExpiraEm,
        },
      }
    },

    async renovarLease(input) {
      const snapshot = snapshots.get(input.idPublico)
      if (!leaseValido(snapshot, input)) return null
      if (input.leaseExpiraEm <= input.agora) return null

      snapshot.ultimaAtividadeEm = input.agora
      snapshot.atualizadoEm = input.agora
      snapshot.leaseExpiraEm = input.leaseExpiraEm
      return clonarSnapshot(snapshot)
    },

    async atualizarEtapa(input) {
      const snapshot = snapshots.get(input.idPublico)
      if (!leaseValido(snapshot, input)) return null

      snapshot.etapa = input.etapa
      snapshot.ultimaAtividadeEm = input.agora
      snapshot.atualizadoEm = input.agora
      return clonarSnapshot(snapshot)
    },

    async registrarFalhaAgendamento(input) {
      const snapshot = snapshots.get(input.idPublico)
      if (
        !snapshot ||
        snapshot.tentativa !== input.tentativa ||
        snapshot.estado !== 'aguardando'
      ) {
        return null
      }

      aplicarFalha(snapshot, input)
      return clonarSnapshot(snapshot)
    },

    async registrarFalhaProcessamento(input) {
      const snapshot = snapshots.get(input.idPublico)
      if (!leaseValido(snapshot, input)) return null

      aplicarFalha(snapshot, input)
      return clonarSnapshot(snapshot)
    },

    async iniciarNovaTentativa(input) {
      const snapshot = snapshots.get(input.idPublico)
      if (
        !snapshot ||
        snapshot.estado !== 'falha' ||
        snapshot.tentativa !== input.tentativaEsperada
      ) {
        return null
      }

      snapshot.estado = 'aguardando'
      snapshot.etapa = null
      snapshot.tentativa += 1
      snapshot.tentativaIniciadaEm = null
      snapshot.ultimaAtividadeEm = null
      snapshot.atualizadoEm = input.agora
      snapshot.finalizadoEm = null
      snapshot.leaseId = null
      snapshot.leaseExpiraEm = null
      snapshot.falha = null
      return clonarSnapshot(snapshot)
    },

    async buscarSolicitacao(requestId) {
      const solicitacao = solicitacoes.get(requestId)
      return solicitacao ? clonarSolicitacao(solicitacao) : null
    },

    criarOuReutilizarComSolicitacao(input) {
      const existente = solicitacoes.get(input.requestId)
      if (existente) {
        const snapshot = snapshots.get(existente.snapshotId)
        if (!snapshot) throw new Error('Solicitação aponta para snapshot inexistente.')
        return Promise.resolve({
          snapshot: clonarSnapshot(snapshot),
          solicitacao: clonarSolicitacao(existente),
          publicar: false,
          resultado: existente.urlNormalizada === input.urlNormalizada && existente.operacao === 'criacao'
            ? 'repetida'
            : 'conflito',
        })
      }

      const jaTinhaSolicitacao = [...solicitacoes.values()].some((item) => {
        const snapshot = snapshots.get(item.snapshotId)
        return snapshot?.repositorio.url === input.repositorio.url && snapshot.commitSha === input.commitSha
      })
      const chave = criarChave(input)
      const existenteId = chaves.get(chave)
      let snapshot = existenteId ? snapshots.get(existenteId) : undefined
      if (!snapshot) {
        const novoSnapshot = criarSnapshot(input)
        snapshot = novoSnapshot
        snapshots.set(novoSnapshot.idPublico, novoSnapshot)
        chaves.set(chave, novoSnapshot.idPublico)
      }
      if (!snapshot) throw new Error('Não foi possível criar snapshot.')
      const solicitacao: SolicitacaoAnalise = {
        requestId: input.requestId,
        operacao: 'criacao',
        snapshotId: snapshot.idPublico,
        urlNormalizada: input.urlNormalizada,
        tentativaEsperada: null,
        tentativaResultante: snapshot.tentativa,
        criadoEm: input.agora,
      }
      solicitacoes.set(input.requestId, solicitacao)
      return Promise.resolve({
        snapshot: clonarSnapshot(snapshot),
        solicitacao: clonarSolicitacao(solicitacao),
        publicar: snapshot.estado === 'aguardando' && !jaTinhaSolicitacao,
        resultado: 'criada' as const,
      })
    },

    iniciarNovaTentativaComSolicitacao(input) {
      const existente = solicitacoes.get(input.requestId)
      if (existente) {
        const snapshot = snapshots.get(existente.snapshotId)
        if (!snapshot) return Promise.resolve({ snapshot: null, solicitacao: null, publicar: false, resultado: 'tentativa_desatualizada' as const })
        return Promise.resolve({
          snapshot: clonarSnapshot(snapshot),
          solicitacao: clonarSolicitacao(existente),
          publicar: false,
          resultado: existente.operacao === 'retry' && existente.snapshotId === input.idPublico && existente.tentativaEsperada === input.tentativaEsperada ? 'repetida' as const : 'conflito' as const,
        })
      }

      const snapshot = snapshots.get(input.idPublico)
      if (!snapshot || snapshot.estado !== 'falha' || snapshot.tentativa !== input.tentativaEsperada) return Promise.resolve({ snapshot: null, solicitacao: null, publicar: false, resultado: 'tentativa_desatualizada' as const })
      snapshot.estado = 'aguardando'
      snapshot.etapa = null
      snapshot.tentativa += 1
      snapshot.tentativaIniciadaEm = null
      snapshot.ultimaAtividadeEm = null
      snapshot.atualizadoEm = input.agora
      snapshot.finalizadoEm = null
      snapshot.leaseId = null
      snapshot.leaseExpiraEm = null
      snapshot.falha = null
      const solicitacao: SolicitacaoAnalise = {
        requestId: input.requestId,
        operacao: 'retry',
        snapshotId: snapshot.idPublico,
        urlNormalizada: null,
        tentativaEsperada: input.tentativaEsperada,
        tentativaResultante: snapshot.tentativa,
        criadoEm: input.agora,
      }
      solicitacoes.set(input.requestId, solicitacao)
      return Promise.resolve({ snapshot: clonarSnapshot(snapshot), solicitacao: clonarSolicitacao(solicitacao), publicar: true, resultado: 'criada' as const })
    },

    async obterResumoStatus(input) {
      const snapshot = snapshots.get(input.idPublico)
      if (!snapshot) return null
      const ultimaAtividade = snapshot.ultimaAtividadeEm ?? snapshot.atualizadoEm
      const demorada = snapshot.estado === 'processando' &&
        snapshot.tentativaIniciadaEm !== null &&
        Date.parse(input.agora) - Date.parse(snapshot.tentativaIniciadaEm) >= input.limiteDemoradaMs
      const agendamentoInterrompido = snapshot.estado === 'aguardando' &&
        Date.parse(input.agora) - Date.parse(ultimaAtividade) >= input.limiteAguardandoMs
      if (agendamentoInterrompido) {
        aplicarFalha(snapshot, {
          agora: input.agora,
          falha: {
            codigo: 'AGENDAMENTO_INTERROMPIDO',
            categoria: 'transitoria',
            mensagem: 'Não foi possível iniciar o processamento desta análise.',
          },
        })
      }
      const indice = indices.get(snapshot.idPublico)
      return mapearResumo(snapshot, indice, demorada)
    },
  }
}

function mapearResumo(snapshot: SnapshotCicloVidaAnalise, indice: IndicePersistido | undefined, demorada: boolean): ResumoStatusAnalise {
  return {
    idPublico: snapshot.idPublico,
    repositorio: { ...snapshot.repositorio },
    commitSha: snapshot.commitSha,
    referencia: snapshot.referencia,
    estado: snapshot.estado,
    etapa: snapshot.etapa,
    tentativa: snapshot.tentativa,
    tentativaIniciadaEm: snapshot.tentativaIniciadaEm,
    ultimaAtividadeEm: snapshot.ultimaAtividadeEm,
    atualizadoEm: snapshot.atualizadoEm,
    finalizadoEm: snapshot.finalizadoEm,
    demorada,
    falha: snapshot.falha ? { ...snapshot.falha, detalhes: snapshot.falha.detalhes ? { ...snapshot.falha.detalhes } : null } : null,
    contagens: indice ? {
      arquivos: indice.indice.arquivos.length,
      simbolos: indice.indice.simbolos.length,
      exportacoes: indice.indice.exportacoes.length,
      relacoesImportacao: indice.indice.relacoesImportacao.length,
      diagnosticos: indice.indice.diagnosticos.length,
    } : null,
  }
}

function clonarSolicitacao(solicitacao: SolicitacaoAnalise): SolicitacaoAnalise {
  return { ...solicitacao }
}

function criarSnapshot(input: DadosCriacaoSnapshotAnalise): SnapshotCicloVidaAnalise {
  return {
    idPublico: randomUUID(),
    repositorio: { ...input.repositorio },
    commitSha: input.commitSha,
    referencia: input.referencia,
    estado: 'aguardando',
    etapa: null,
    tentativa: 1,
    tentativaIniciadaEm: null,
    ultimaAtividadeEm: null,
    atualizadoEm: input.agora,
    finalizadoEm: null,
    leaseId: null,
    leaseExpiraEm: null,
    falha: null,
  }
}

function aplicarFalha(
  snapshot: SnapshotCicloVidaAnalise,
  input: {
    agora: string
    falha: FalhaAnaliseParaRegistro
  },
) {
  snapshot.estado = 'falha'
  snapshot.ultimaAtividadeEm = input.agora
  snapshot.atualizadoEm = input.agora
  snapshot.finalizadoEm = input.agora
  snapshot.leaseId = null
  snapshot.leaseExpiraEm = null
  snapshot.falha = {
    ...input.falha,
    detalhes: input.falha.detalhes ?? null,
    ocorridoEm: input.agora,
  }
}

function leaseValido(
  snapshot: SnapshotCicloVidaAnalise | undefined,
  input: { tentativa: number; leaseId: string; agora: string },
): snapshot is SnapshotCicloVidaAnalise {
  return Boolean(
    snapshot &&
      snapshot.estado === 'processando' &&
      snapshot.tentativa === input.tentativa &&
      snapshot.leaseId === input.leaseId &&
      snapshot.leaseExpiraEm !== null &&
      snapshot.leaseExpiraEm > input.agora,
  )
}

function criarChave(input: Pick<DadosCriacaoSnapshotAnalise, 'repositorio' | 'commitSha'>) {
  return `${input.repositorio.proprietario.toLowerCase()}/${input.repositorio.nome.toLowerCase()}:${input.commitSha}`
}

function clonarSnapshot(snapshot: SnapshotCicloVidaAnalise): SnapshotCicloVidaAnalise {
  return {
    ...snapshot,
    repositorio: { ...snapshot.repositorio },
    falha: snapshot.falha
      ? {
          ...snapshot.falha,
          detalhes: snapshot.falha.detalhes
            ? { ...snapshot.falha.detalhes }
            : null,
        }
      : null,
  }
}
