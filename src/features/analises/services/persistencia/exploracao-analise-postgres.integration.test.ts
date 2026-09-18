import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { IndiceAnalise } from '../../analises.types'
import { criarCicloVidaAnalisePostgres } from './ciclo-vida-analise-postgres'
import { criarRepositorioLeituraExploracaoPostgres } from './exploracao-analise-postgres'
import { criarRepositorioPersistenciaIndicePostgres } from './persistencia-indice-postgres'

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://tracebase:tracebase_local@localhost:5432/tracebase?sslmode=disable'
const pool = new Pool({ connectionString: databaseUrl })
const ciclo = criarCicloVidaAnalisePostgres(pool)
const persistencia = criarRepositorioPersistenciaIndicePostgres(pool)
const exploracao = criarRepositorioLeituraExploracaoPostgres(pool)
const urls = [
  'https://github.com/tracebase/exploracao-a',
  'https://github.com/tracebase/exploracao-b',
]
let snapshotAPublico = ''
let snapshotBPublico = ''

beforeAll(async () => {
  const resultado = await pool.query<{ agora: string }>('SELECT clock_timestamp()::text AS agora')
  const agora = new Date(resultado.rows[0].agora).toISOString()
  const snapshotA = await prepararSnapshot(urls[0], 'a'.repeat(40), agora)
  const snapshotB = await prepararSnapshot(urls[1], 'b'.repeat(40), agora)
  snapshotAPublico = snapshotA.snapshot.idPublico
  snapshotBPublico = snapshotB.snapshot.idPublico

  await persistir(snapshotA, agora)
  await persistir(snapshotB, agora)
})

afterAll(async () => {
  await pool.query('DELETE FROM repositorios WHERE url = ANY($1::text[])', [urls])
  await pool.end()
})

describe('exploração de análise no PostgreSQL', () => {
  it('lê a árvore e mantém snapshots distintos isolados', async () => {
    const raiz = await exploracao.obterArquivosSnapshotConcluido(snapshotAPublico)
    expect(raiz).toEqual([
      { caminho: 'src/a.ts', linguagem: 'typescript' },
      { caminho: 'src/lib/b.js', linguagem: 'javascript' },
      { caminho: 'src/uso.ts', linguagem: 'typescript' },
    ])
    expect(raiz).not.toContainEqual({ caminho: 'src/outro.ts', linguagem: 'typescript' })
    expect(await exploracao.obterArquivosSnapshotConcluido(snapshotBPublico)).toEqual([
      { caminho: 'src/outro.ts', linguagem: 'typescript' },
    ])
  })

  it('consolida imports internos, ignora externos e não resolvidos e retorna limitações seguras', async () => {
    const relacoes = await exploracao.obterRelacoesArquivoSnapshotConcluido(snapshotAPublico, 'src/a.ts')

    expect(relacoes).toEqual({
      arquivo: { caminho: 'src/a.ts', linguagem: 'typescript' },
      importa: [{ caminho: 'src/lib/b.js', quantidadeImports: 2 }],
      importadoPor: [{ caminho: 'src/uso.ts', quantidadeImports: 1 }],
      limitacoes: [{ codigo: 'COMMONJS_NAO_SUPORTADO', categoria: 'limitacao' }],
    })
    expect(JSON.stringify(relacoes)).not.toMatch(/blob|lease|id_fato|stack|mensagem/i)
  })
})

async function prepararSnapshot(url: string, commitSha: string, agora: string) {
  const snapshot = await ciclo.criarOuReutilizar({
    repositorio: { url, proprietario: 'tracebase', nome: url.split('/').at(-1)! },
    commitSha,
    referencia: 'main',
    agora,
  })
  const leaseExpiraEm = new Date(Date.parse(agora) + 10 * 60_000).toISOString()
  const adquirido = await ciclo.adquirirProcessamento({ idPublico: snapshot.idPublico, tentativa: 1, agora, leaseExpiraEm })
  if (adquirido.tipo !== 'adquirido') throw new Error('Snapshot não adquirido no teste.')
  return { snapshot, leaseId: adquirido.lease.id, leaseExpiraEm }
}

async function persistir(preparado: Awaited<ReturnType<typeof prepararSnapshot>>, agora: string) {
  const isA = preparado.snapshot.commitSha === 'a'.repeat(40)
  const arquivoA = 'arquivo-a'
  const arquivoB = 'arquivo-b'
  const arquivoUso = 'arquivo-uso'
  const arquivoOutro = 'arquivo-outro'
  const caminhos = isA ? ['src/a.ts', 'src/lib/b.js', 'src/uso.ts'] : ['src/outro.ts']
  const arquivos = caminhos.map((caminho, indice) => ({ caminho, blobSha: `${indice + 1}${String(indice + 1).repeat(39)}` }))
  const indice: IndiceAnalise = {
    snapshot: { idPublico: preparado.snapshot.idPublico, repositorio: preparado.snapshot.repositorio, commitSha: preparado.snapshot.commitSha, referencia: 'main' },
    arquivos: isA
      ? [{ id: arquivoA, caminho: caminhos[0], tipo: 'typescript' }, { id: arquivoB, caminho: caminhos[1], tipo: 'javascript' }, { id: arquivoUso, caminho: caminhos[2], tipo: 'typescript' }]
      : [{ id: arquivoOutro, caminho: caminhos[0], tipo: 'typescript' }],
    simbolos: [],
    exportacoes: [],
    relacoesImportacao: isA ? [
      relacao('relacao-1', arquivoA, 'interno', caminhos[1], caminhos[0]),
      relacao('relacao-2', arquivoA, 'interno', caminhos[1], caminhos[0]),
      relacao('relacao-3', arquivoA, 'externo', null, caminhos[0]),
      relacao('relacao-4', arquivoA, 'nao-resolvido', null, caminhos[0]),
      relacao('relacao-5', arquivoUso, 'interno', caminhos[0], caminhos[2]),
    ] : [],
    diagnosticos: isA ? [{ id: 'diagnostico-1', codigo: 'COMMONJS_NAO_SUPORTADO', categoria: 'limitacao', arquivoOrigemId: arquivoA, evidencia: evidencia(caminhos[0]) }] : [],
    parcial: isA,
  }
  await persistencia.salvarEConcluir({ snapshotIdPublico: preparado.snapshot.idPublico, tentativa: 1, leaseId: preparado.leaseId, agora, prazoExpiraEm: preparado.leaseExpiraEm, indice, arquivos })
}

function relacao(id: string, arquivoOrigemId: string, tipo: 'interno' | 'externo' | 'nao-resolvido', destinoCaminho: string | null, caminhoArquivo: string) {
  return {
    id,
    tipo: 'importa' as const,
    arquivoOrigemId,
    destino: tipo === 'interno' ? { tipo, caminhoArquivo: destinoCaminho! } : tipo === 'externo' ? { tipo, especificador: 'react' } : { tipo, especificador: '../ausente' },
    evidencia: evidencia(caminhoArquivo),
  }
}

function evidencia(caminhoArquivo: string) {
  return { caminhoArquivo, inicio: { linha: 1, coluna: 1 }, fim: { linha: 1, coluna: 2 } }
}
