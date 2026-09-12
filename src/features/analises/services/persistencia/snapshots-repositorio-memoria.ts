import { randomUUID } from 'node:crypto'

import type {
  RepositorioSnapshots,
  SnapshotParaPersistir,
  SnapshotPersistido,
} from './snapshots-repositorio'

export function criarRepositorioSnapshotsEmMemoria(): RepositorioSnapshots {
  const snapshots = new Map<string, SnapshotPersistido>()
  return {
    async salvar(snapshot) {
      const chave = criarChave(snapshot.repositorio, snapshot.snapshot.commitSha)
      const existente = snapshots.get(chave)

      if (existente) {
        const atualizado = { ...existente, ...snapshot }
        snapshots.set(chave, atualizado)
        return atualizado
      }

      const persistido: SnapshotPersistido = {
        ...snapshot,
        idPublico: randomUUID(),
        criadoEm: new Date().toISOString(),
      }
      snapshots.set(chave, persistido)
      return persistido
    },

    async buscarPorRepositorioECommit(repositorio, commitSha) {
      return snapshots.get(criarChave(repositorio, commitSha)) ?? null
    },
  }
}

function criarChave(
  repositorio: Pick<SnapshotParaPersistir['repositorio'], 'proprietario' | 'nome'>,
  commitSha: string,
) {
  return `${repositorio.proprietario.toLowerCase()}/${repositorio.nome.toLowerCase()}:${commitSha}`
}
