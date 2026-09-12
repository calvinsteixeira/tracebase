import { describe, expect, it } from 'vitest'

import { criarRepositorioSnapshotsEmMemoria } from './snapshots-repositorio-memoria'

const snapshot = {
  repositorio: {
    url: 'https://github.com/Tracebase/Exemplo',
    proprietario: 'Tracebase',
    nome: 'Exemplo',
  },
  snapshot: {
    commitSha: 'a'.repeat(40),
    referencia: 'main',
  },
}

describe('repositório de snapshots em memória', () => {
  it('salva e localiza um snapshot pelo repositório e commit', async () => {
    const repositorio = criarRepositorioSnapshotsEmMemoria()

    const salvo = await repositorio.salvar(snapshot)
    const encontrado = await repositorio.buscarPorRepositorioECommit(
      { proprietario: 'tracebase', nome: 'exemplo' },
      snapshot.snapshot.commitSha,
    )

    expect(encontrado).toEqual(salvo)
  })

  it('mantém commits diferentes isolados e atualiza o registro existente', async () => {
    const repositorio = criarRepositorioSnapshotsEmMemoria()
    const atualizado = await repositorio.salvar({
      ...snapshot,
      snapshot: { ...snapshot.snapshot, referencia: 'trunk' },
    })
    const outroCommit = await repositorio.salvar({
      ...snapshot,
      snapshot: { commitSha: 'b'.repeat(40), referencia: 'main' },
    })

    expect(atualizado.idPublico).not.toBe(outroCommit.idPublico)
    expect(
      await repositorio.buscarPorRepositorioECommit(
        snapshot.repositorio,
        snapshot.snapshot.commitSha,
      ),
    ).toMatchObject({ snapshot: { referencia: 'trunk' } })
    expect(
      await repositorio.buscarPorRepositorioECommit(
        snapshot.repositorio,
        'c'.repeat(40),
      ),
    ).toBeNull()
  })
})
