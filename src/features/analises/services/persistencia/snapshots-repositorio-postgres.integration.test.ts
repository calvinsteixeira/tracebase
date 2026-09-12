import { spawnSync } from 'node:child_process'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { criarRepositorioSnapshotsPostgres } from './snapshots-repositorio-postgres'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://tracebase:tracebase_local@localhost:5432/tracebase?sslmode=disable'
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

  const historico = await pool.query<{ total: string; primeira_versao: string; ultima_versao: string }>(
    `
      SELECT
        COUNT(*)::text AS total,
        MIN(version) AS primeira_versao,
        MAX(version) AS ultima_versao
      FROM supabase_migrations.schema_migrations
    `,
  )

  expect(historico.rows[0]).toEqual({
    total: '2',
    primeira_versao: '20260905000000',
    ultima_versao: '20260912000000',
  })

  const historicoParalelo = await pool.query<{ existe: string | null }>(
    `SELECT to_regclass('public.schema_migrations') AS existe`,
  )

  expect(historicoParalelo.rows[0].existe).toBeNull()
})

afterAll(async () => {
  await pool.query('DELETE FROM repositorios WHERE url = $1', [url])
  await pool.end()
})

describe('repositório de snapshots PostgreSQL', () => {
  it('não reaplica migrations quando db:migrate é executado novamente', async () => {
    const antes = await pool.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM supabase_migrations.schema_migrations',
    )
    const resultado = spawnSync('pnpm', ['db:migrate'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
    })

    expect(resultado.status).toBe(0)

    const depois = await pool.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM supabase_migrations.schema_migrations',
    )

    expect(depois.rows[0].total).toBe(antes.rows[0].total)
  })

  it('recusa reset quando a URL aponta para um banco remoto', () => {
    const resultado = spawnSync('pnpm', ['db:reset'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://usuario:senha@db.example.com/tracebase',
      },
      encoding: 'utf8',
    })

    expect(resultado.status).not.toBe(0)
    expect(`${resultado.stdout}${resultado.stderr}`).toContain(
      'Operação permitida somente na base PostgreSQL local do Tracebase.',
    )
  })

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
