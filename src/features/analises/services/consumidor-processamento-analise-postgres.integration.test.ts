import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  criarConsumidorProcessamentoAnalise,
  type MensagemProcessamentoAnalise,
  type TemporizadorProcessamentoAnalise,
} from './consumidor-processamento-analise'
import type {
  ArquivoArvoreRepositorio,
  FonteDeRepositorioComArvore,
} from './fonte-repositorio'
import { criarCicloVidaAnalisePostgres } from './persistencia/ciclo-vida-analise-postgres'
import { criarRepositorioPersistenciaIndicePostgres } from './persistencia/persistencia-indice-postgres'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://tracebase:tracebase_local@localhost:5432/tracebase?sslmode=disable'
const pool = new Pool({ connectionString: databaseUrl })
const cicloVida = criarCicloVidaAnalisePostgres(pool)
const persistencia = criarRepositorioPersistenciaIndicePostgres(pool)
const url = 'https://github.com/tracebase/consumidor-local-integracao'
const repositorio = {
  url,
  proprietario: 'Tracebase',
  nome: 'Consumidor-Local-Integracao',
}
const arvore: ArquivoArvoreRepositorio[] = [
  { caminho: 'src/entrada.ts', sha: '1'.repeat(40), tamanhoBytes: 32 },
  { caminho: 'README.md', sha: '2'.repeat(40), tamanhoBytes: 10 },
]

beforeAll(async () => {
  const tabelas = await pool.query<{ snapshots: string | null; indices: string | null }>(
    `SELECT to_regclass('public.snapshots') AS snapshots, to_regclass('public.indices_estruturais') AS indices`,
  )
  expect(tabelas.rows[0]).toEqual({ snapshots: 'snapshots', indices: 'indices_estruturais' })
})

afterAll(async () => {
  await pool.query('DELETE FROM repositorios WHERE url LIKE $1', [`${url}%`])
  await pool.end()
})

describe('consumidor de processamento PostgreSQL', () => {
  it('executa o fluxo completo pelo commit salvo e recupera índice e blob SHA', async () => {
    const commitSha = 'a'.repeat(40)
    const snapshot = await cicloVida.criarOuReutilizar({
      repositorio,
      commitSha,
      referencia: 'main',
      agora: '2026-09-12T14:00:00.000Z',
    })
    const fonte = criarFonte()
    const consumidor = criarConsumidorProcessamentoAnalise({
      cicloVida,
      persistencia,
      fonte,
    })

    const resultado = await consumidor.processar(mensagem(snapshot.idPublico, snapshot.tentativa))

    expect(resultado.tipo).toBe('concluido')
    expect(fonte.obterArvore).toHaveBeenCalledWith({ repositorio, commitSha })
    expect(fonte.obterArvore).not.toHaveBeenCalledWith(
      expect.objectContaining({ commitSha: 'b'.repeat(40) }),
    )
    expect(fonte.obterArquivos).toHaveBeenCalledWith(
      expect.objectContaining({ commitSha }),
    )

    const recuperado = await persistencia.buscarPorSnapshotConcluido(snapshot.idPublico)
    expect(recuperado?.arquivos).toEqual([
      { caminho: 'src/entrada.ts', blobSha: '1'.repeat(40) },
    ])
    expect((await cicloVida.buscarPorIdPublico(snapshot.idPublico))?.estado).toBe('concluido')
  })

  it('faz duas mensagens simultâneas compartilharem a aquisição atômica', async () => {
    const commitSha = 'c'.repeat(40)
    const snapshot = await cicloVida.criarOuReutilizar({
      repositorio: { ...repositorio, url: `${url}/simultaneo` },
      commitSha,
      referencia: 'main',
      agora: '2026-09-12T14:05:00.000Z',
    })
    let liberar!: () => void
    const bloqueio = new Promise<void>((resolve) => {
      liberar = resolve
    })
    let chamadas = 0
    const fonte = criarFonte()
    fonte.obterArvore = vi.fn(async () => {
      chamadas += 1
      if (chamadas === 1) await bloqueio
      return arvore
    })
    const opcoes = { cicloVida, persistencia, fonte }
    const primeiro = criarConsumidorProcessamentoAnalise(opcoes)
    const segundo = criarConsumidorProcessamentoAnalise(opcoes)
    const mensagemAtual = mensagem(snapshot.idPublico, snapshot.tentativa)

    const processamento = primeiro.processar(mensagemAtual)
    await vi.waitFor(() => expect(chamadas).toBe(1))
    await expect(segundo.processar(mensagemAtual)).resolves.toEqual({ tipo: 'ocupado' })

    liberar()
    await expect(processamento).resolves.toMatchObject({ tipo: 'concluido' })
    expect(chamadas).toBe(1)
    await expect(segundo.processar(mensagemAtual)).resolves.toEqual({ tipo: 'ja_concluido' })
  })

  it('faz timeout durante a persistência gerar somente falha e rollback no PostgreSQL', async () => {
    let sinalizarPersistenciaIniciada!: () => void
    const persistenciaIniciada = new Promise<void>((resolve) => {
      sinalizarPersistenciaIniciada = resolve
    })
    let liberarPersistencia!: () => void
    const persistenciaBloqueada = new Promise<void>((resolve) => {
      liberarPersistencia = resolve
    })
    const poolBloqueado = criarPoolComAtualizacaoFinalBloqueada(
      sinalizarPersistenciaIniciada,
      persistenciaBloqueada,
      pool,
    )
    const cicloBloqueado = criarCicloVidaAnalisePostgres(poolBloqueado)
    const persistenciaBloqueadaPorPrazo = criarRepositorioPersistenciaIndicePostgres(poolBloqueado)
    const relogioBancoInicial = await obterRelogioBanco()
    const base = Date.parse(relogioBancoInicial)
    const agora = new Date(base).toISOString()
    const prazoExpiraEm = new Date(base + 500).toISOString()
    const snapshot = await cicloBloqueado.criarOuReutilizar({
      repositorio: { ...repositorio, url: `${url}/timeout-persistencia` },
      commitSha: '9'.repeat(40),
      referencia: 'main',
      agora,
    })
    const fonte = criarFonte()
    const consumidor = criarConsumidorProcessamentoAnalise({
      cicloVida: cicloBloqueado,
      persistencia: persistenciaBloqueadaPorPrazo,
      fonte,
      relogio: { agora: () => agora },
      temporizador: criarTemporizadorIntegracao(),
      duracaoMaximaMs: 500,
    })

    try {
      const processamento = consumidor.processar(mensagem(snapshot.idPublico, snapshot.tentativa))
      await persistenciaIniciada
      const relogioBancoDurantePersistencia = await obterRelogioBanco()
      expect(Date.parse(relogioBancoDurantePersistencia)).toBeLessThan(Date.parse(prazoExpiraEm))

      await new Promise((resolve) => setTimeout(resolve, 750))
      const relogioBancoAposPrazo = await obterRelogioBanco()
      expect(Date.parse(relogioBancoAposPrazo)).toBeGreaterThanOrEqual(Date.parse(prazoExpiraEm))
      liberarPersistencia()

      await expect(processamento).resolves.toMatchObject({
        tipo: 'falha_registrada',
        falha: { codigo: 'TEMPO_ESGOTADO', categoria: 'transitoria' },
      })
      expect(await cicloBloqueado.buscarPorIdPublico(snapshot.idPublico)).toMatchObject({
        estado: 'falha',
        falha: { codigo: 'TEMPO_ESGOTADO' },
      })
      await expect(
        persistenciaBloqueadaPorPrazo.buscarPorSnapshotConcluido(snapshot.idPublico),
      ).resolves.toBeNull()

      const fatos = await pool.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM indices_estruturais i
         INNER JOIN snapshots s ON s.id = i.snapshot_id WHERE s.id_publico = $1::uuid`,
        [snapshot.idPublico],
      )
      expect(fatos.rows[0]?.total).toBe('0')
    } finally {
      liberarPersistencia()
    }
  })
})

function criarFonte(): FonteDeRepositorioComArvore {
  return {
    obterArvore: vi.fn(async () => arvore),
    obterArquivos: vi.fn(async ({ arquivos }: Parameters<FonteDeRepositorioComArvore['obterArquivos']>[0]) =>
      arquivos.map((arquivo) => ({
        caminho: arquivo.caminho,
        conteudo: 'export const valor = 1',
      })),
    ),
  }
}

function mensagem(snapshotId: string, tentativa: number): MensagemProcessamentoAnalise {
  return { snapshotId, tentativa }
}

function criarPoolComAtualizacaoFinalBloqueada(
  sinalizar: () => void,
  bloqueio: Promise<void>,
  poolOriginal: Pool,
): Pool {
  return {
    query: poolOriginal.query.bind(poolOriginal),
    connect: async () => {
      const cliente = await poolOriginal.connect()
      const queryOriginal = cliente.query.bind(cliente) as unknown as (
        ...args: unknown[]
      ) => Promise<unknown>

      return new Proxy(cliente, {
        get(alvo, propriedade, receptor) {
          if (propriedade !== 'query') return Reflect.get(alvo, propriedade, receptor)

          return async (...args: unknown[]) => {
            const consulta = args[0]
            const sql = typeof consulta === 'string'
              ? consulta
              : consulta && typeof consulta === 'object' && 'text' in consulta
                ? String(consulta.text)
                : ''

            if (sql.includes("SET estado = 'concluido'")) {
              sinalizar()
              await bloqueio
            }

            return queryOriginal(...args)
          }
        },
      }) as unknown as PoolClient
    },
  } as unknown as Pool
}

function criarTemporizadorIntegracao(): TemporizadorProcessamentoAnalise {
  return {
    setTimeout: (callback, atraso) => setTimeout(callback, atraso),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    setInterval: (callback, atraso) => setInterval(callback, atraso),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  }
}

async function obterRelogioBanco() {
  const resultado = await pool.query<{ agora: string }>(
    `SELECT clock_timestamp()::text AS agora`,
  )
  const agora = resultado.rows[0]?.agora
  if (!agora) throw new Error('O PostgreSQL não retornou o relógio do teste.')
  return agora
}
