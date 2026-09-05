import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { criarRepositorioSnapshotsPostgres } from './snapshots-repositorio-postgres'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://tracebase:tracebase_local@localhost:5432/tracebase'
const pool = new Pool({ connectionString: databaseUrl })
const repositorio = criarRepositorioSnapshotsPostgres(pool)
const url = `https://github.com/tracebase/integracao-${Date.now()}`
const commitSha = 'c'.repeat(40)

beforeAll(async () => {
  const tabelas = await pool.query<{ repositorios: string | null; snapshots: string | null }>(
    `
      SELECT
        to_regclass('public.repositorios') AS repositorios,
        to_regclass('public.snapshots') AS snapshots
    `,
  )

  expect(tabelas.rows[0]).toEqual({
    repositorios: 'repositorios',
    snapshots: 'snapshots',
  })
})

afterAll(async () => {
  await pool.query('DELETE FROM repositorios WHERE url = $1', [url])
  await pool.end()
})

describe('repositório de snapshots PostgreSQL', () => {
  it('salva e recupera um snapshot em uma base migrada', async () => {
    const salvo = await repositorio.salvar({
      repositorio: {
        url,
        proprietario: 'tracebase',
        nome: 'integracao',
      },
      snapshot: {
        commitSha,
        referencia: 'main',
      },
    })

    const encontrado = await repositorio.buscarPorRepositorioECommit(
      { proprietario: 'TRACEBASE', nome: 'INTEGRACAO' },
      commitSha,
    )

    expect(encontrado).toEqual(salvo)

    const contagem = await pool.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM snapshots s
        INNER JOIN repositorios r ON r.id = s.repositorio_id
        WHERE r.url = $1 AND s.commit_sha = $2
      `,
      [url, commitSha],
    )

    expect(contagem.rows[0].total).toBe('1')
  })
})
