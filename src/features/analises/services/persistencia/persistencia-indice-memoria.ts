import type { IndiceAnalise } from '../../analises.types'
import type { SnapshotCicloVidaAnalise } from './ciclo-vida-analise'
import {
  type EntradaPersistenciaIndice,
  type RepositorioPersistenciaIndice,
  validarIdentidadeSnapshotIndice,
  validarEntradaPersistenciaIndice,
} from './persistencia-indice'
import type { EstadoCicloVidaAnaliseEmMemoria } from './ciclo-vida-analise-memoria'

export function criarRepositorioPersistenciaIndiceEmMemoria(
  estado: EstadoCicloVidaAnaliseEmMemoria,
): RepositorioPersistenciaIndice {
  return {
    async salvarEConcluir(input) {
      validarEntradaPersistenciaIndice(input)

      const snapshot = estado.snapshots.get(input.snapshotIdPublico)
      if (!snapshot) return { tipo: 'inexistente' }

      validarIdentidadeSnapshotIndice(input.indice, snapshot)

      const indiceExistente = estado.indices.get(input.snapshotIdPublico)
      if (snapshot.estado === 'concluido') {
        if (!indiceExistente) return { tipo: 'estado_incompativel' }
        return { tipo: 'ja_concluido', indice: clonarPersistido(indiceExistente) }
      }
      if (snapshot.tentativa !== input.tentativa) {
        return { tipo: 'tentativa_desatualizada' }
      }
      if (snapshot.estado !== 'processando') {
        return { tipo: 'estado_incompativel' }
      }
      if (!leaseValido(snapshot, input)) return { tipo: 'lease_invalido' }
      if (Date.parse(input.agora) >= Date.parse(input.prazoExpiraEm)) {
        return { tipo: 'prazo_expirado' }
      }

      const indice = clonarPersistido({ indice: input.indice, arquivos: input.arquivos })
      estado.indices.set(input.snapshotIdPublico, indice)
      concluirSnapshot(snapshot, input)

      return { tipo: 'persistido', indice: clonarPersistido(indice) }
    },

    async buscarPorSnapshotConcluido(idPublico) {
      const snapshot = estado.snapshots.get(idPublico)
      if (!snapshot || snapshot.estado !== 'concluido') return null

      const indice = estado.indices.get(idPublico)
      return indice ? clonarPersistido(indice) : null
    },

    async buscarPorRepositorioECommit(input) {
      for (const snapshot of estado.snapshots.values()) {
        if (
          snapshot.estado !== 'concluido' ||
          snapshot.repositorio.url !== input.url ||
          snapshot.commitSha !== input.commitSha
        ) {
          continue
        }

        const indice = estado.indices.get(snapshot.idPublico)
        if (indice) return clonarPersistido(indice)
      }

      return null
    },
  }
}

function leaseValido(
  snapshot: SnapshotCicloVidaAnalise,
  input: EntradaPersistenciaIndice,
) {
  return snapshot.leaseId === input.leaseId &&
    snapshot.leaseExpiraEm !== null &&
    snapshot.leaseExpiraEm > input.agora
}

function concluirSnapshot(
  snapshot: SnapshotCicloVidaAnalise,
  input: EntradaPersistenciaIndice,
) {
  snapshot.estado = 'concluido'
  snapshot.etapa = 'persistencia'
  snapshot.ultimaAtividadeEm = input.agora
  snapshot.atualizadoEm = input.agora
  snapshot.finalizadoEm = input.agora
  snapshot.leaseId = null
  snapshot.leaseExpiraEm = null
  snapshot.falha = null
}

function clonarPersistido(indice: {
  indice: IndiceAnalise
  arquivos: EntradaPersistenciaIndice['arquivos']
}) {
  return {
    indice: {
      snapshot: {
        ...indice.indice.snapshot,
        repositorio: { ...indice.indice.snapshot.repositorio },
      },
      arquivos: indice.indice.arquivos.map((arquivo) => ({ ...arquivo })),
      simbolos: indice.indice.simbolos.map((simbolo) => ({
        ...simbolo,
        evidencia: clonarEvidencia(simbolo.evidencia),
      })),
      exportacoes: indice.indice.exportacoes.map((exportacao) => ({
        ...exportacao,
        ...(exportacao.nomeLocal ? { nomeLocal: exportacao.nomeLocal } : {}),
        ...(exportacao.destino ? { destino: { ...exportacao.destino } } : {}),
        evidencia: clonarEvidencia(exportacao.evidencia),
      })),
      relacoesImportacao: indice.indice.relacoesImportacao.map((relacao) => ({
        ...relacao,
        destino: { ...relacao.destino },
        evidencia: clonarEvidencia(relacao.evidencia),
      })),
      diagnosticos: indice.indice.diagnosticos.map((diagnostico) => ({
        ...diagnostico,
        evidencia: clonarEvidencia(diagnostico.evidencia),
      })),
      parcial: indice.indice.parcial,
    },
    arquivos: indice.arquivos.map((arquivo) => ({ ...arquivo })),
  }
}

function clonarEvidencia(evidencia: IndiceAnalise['diagnosticos'][number]['evidencia']) {
  return {
    ...evidencia,
    inicio: { ...evidencia.inicio },
    fim: { ...evidencia.fim },
  }
}
