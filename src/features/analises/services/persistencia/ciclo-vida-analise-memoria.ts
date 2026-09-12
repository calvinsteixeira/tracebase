import { randomUUID } from 'node:crypto'

import type {
  DadosSnapshotAnalise,
  FalhaAnaliseParaRegistro,
  RepositorioCicloVidaAnalise,
  SnapshotAnalise,
} from './ciclo-vida-analise'

export function criarCicloVidaAnaliseEmMemoria(): RepositorioCicloVidaAnalise {
  const snapshots = new Map<string, SnapshotAnalise>()
  const chaves = new Map<string, string>()

  return {
    async criarOuReutilizar(input) {
      const chave = criarChave(input)
      const idExistente = chaves.get(chave)
      const existente = idExistente ? snapshots.get(idExistente) : undefined

      if (existente) return clonarSnapshot(existente)

      const snapshot: SnapshotAnalise = {
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
  }
}

function aplicarFalha(
  snapshot: SnapshotAnalise,
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
  snapshot: SnapshotAnalise | undefined,
  input: { tentativa: number; leaseId: string; agora: string },
): snapshot is SnapshotAnalise {
  return Boolean(
    snapshot &&
      snapshot.estado === 'processando' &&
      snapshot.tentativa === input.tentativa &&
      snapshot.leaseId === input.leaseId &&
      snapshot.leaseExpiraEm !== null &&
      snapshot.leaseExpiraEm > input.agora,
  )
}

function criarChave(input: Pick<DadosSnapshotAnalise, 'repositorio' | 'commitSha'>) {
  return `${input.repositorio.proprietario.toLowerCase()}/${input.repositorio.nome.toLowerCase()}:${input.commitSha}`
}

function clonarSnapshot(snapshot: SnapshotAnalise): SnapshotAnalise {
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
