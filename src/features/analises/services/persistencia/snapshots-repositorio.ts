export interface SnapshotParaPersistir {
  repositorio: {
    url: string
    proprietario: string
    nome: string
  }
  snapshot: {
    commitSha: string
    referencia: string
  }
}

export interface SnapshotPersistido extends SnapshotParaPersistir {
  idPublico: string
  criadoEm: string
}

export interface RepositorioSnapshots {
  salvar(snapshot: SnapshotParaPersistir): Promise<SnapshotPersistido>
  buscarPorRepositorioECommit(
    repositorio: Pick<SnapshotParaPersistir['repositorio'], 'proprietario' | 'nome'>,
    commitSha: string,
  ): Promise<SnapshotPersistido | null>
}
