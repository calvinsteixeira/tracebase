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
  'https://github.com/tracebase/exploracao-aguardando',
  'https://github.com/tracebase/exploracao-processando',
  'https://github.com/tracebase/exploracao-falha',
]
let snapshotAPublico = ''
let snapshotBPublico = ''
let snapshotAguardandoPublico = ''
let snapshotProcessandoPublico = ''
let snapshotFalhaPublico = ''

beforeAll(async () => {
  const resultado = await pool.query<{ agora: string }>('SELECT clock_timestamp()::text AS agora')
  const agora = new Date(resultado.rows[0].agora).toISOString()
  const snapshotA = await prepararSnapshot(urls[0], 'a'.repeat(40), agora)
  const snapshotB = await prepararSnapshot(urls[1], 'b'.repeat(40), agora)
  const snapshotAguardando = await criarSnapshotNaoConcluido(urls[2], 'c'.repeat(40), 'aguardando', agora)
  const snapshotProcessando = await criarSnapshotNaoConcluido(urls[3], 'd'.repeat(40), 'processando', agora)
  const snapshotFalha = await criarSnapshotNaoConcluido(urls[4], 'e'.repeat(40), 'falha', agora)
  snapshotAPublico = snapshotA.snapshot.idPublico
  snapshotBPublico = snapshotB.snapshot.idPublico
  snapshotAguardandoPublico = snapshotAguardando.idPublico
  snapshotProcessandoPublico = snapshotProcessando.idPublico
  snapshotFalhaPublico = snapshotFalha.idPublico

  await persistir(snapshotA, agora)
  await persistir(snapshotB, agora)
})

afterAll(async () => {
  await pool.query('DELETE FROM repositorios WHERE url = ANY($1::text[])', [urls])
  await pool.end()
})

describe('exploração de análise no PostgreSQL', () => {
  it('lê a árvore e mantém snapshots distintos isolados', async () => {
    const raiz = await exploracao.obterArvoreSnapshotConcluido(snapshotAPublico, null)
    expect(raiz).toEqual({ tipo: 'encontrada', arvore: { escopo: null, itens: [{ tipo: 'pasta', caminho: 'src', nome: 'src', quantidadeArquivos: 7 }] } })
    const pasta = await exploracao.obterArvoreSnapshotConcluido(snapshotAPublico, 'src')
    expect(pasta).toEqual({ tipo: 'encontrada', arvore: { escopo: 'src', itens: [{ tipo: 'pasta', caminho: 'src/100%', nome: '100%', quantidadeArquivos: 1 }, { tipo: 'pasta', caminho: 'src/100x', nome: '100x', quantidadeArquivos: 1 }, { tipo: 'pasta', caminho: 'src/comX', nome: 'comX', quantidadeArquivos: 1 }, { tipo: 'pasta', caminho: 'src/com_', nome: 'com_', quantidadeArquivos: 1 }, { tipo: 'pasta', caminho: 'src/lib', nome: 'lib', quantidadeArquivos: 1 }, { tipo: 'arquivo', caminho: 'src/a.ts', nome: 'a.ts', linguagem: 'typescript' }, { tipo: 'arquivo', caminho: 'src/uso.ts', nome: 'uso.ts', linguagem: 'typescript' }] } })
    expect(await exploracao.obterArvoreSnapshotConcluido(snapshotAPublico, 'src/100%')).toEqual({ tipo: 'encontrada', arvore: { escopo: 'src/100%', itens: [{ tipo: 'arquivo', caminho: 'src/100%/exato.ts', nome: 'exato.ts', linguagem: 'typescript' }] } })
    expect(await exploracao.obterArvoreSnapshotConcluido(snapshotAPublico, 'src/com_')).toEqual({ tipo: 'encontrada', arvore: { escopo: 'src/com_', itens: [{ tipo: 'arquivo', caminho: 'src/com_/exato.ts', nome: 'exato.ts', linguagem: 'typescript' }] } })
    expect(await exploracao.obterArvoreSnapshotConcluido(snapshotBPublico, null)).toEqual({ tipo: 'encontrada', arvore: { escopo: null, itens: [{ tipo: 'pasta', caminho: 'src', nome: 'src', quantidadeArquivos: 1 }] } })
  })

  it('não disponibiliza árvore ou relações para snapshots não concluídos', async () => {
    for (const snapshotId of [snapshotAguardandoPublico, snapshotProcessandoPublico, snapshotFalhaPublico]) {
      expect(await exploracao.obterArvoreSnapshotConcluido(snapshotId, null)).toEqual({ tipo: 'snapshot_indisponivel' })
      expect(await exploracao.obterRelacoesArquivoSnapshotConcluido(snapshotId, 'src/a.ts')).toBeNull()
    }
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

async function criarSnapshotNaoConcluido(url: string, commitSha: string, estado: 'aguardando' | 'processando' | 'falha', agora: string) {
  const snapshot = await ciclo.criarOuReutilizar({
    repositorio: { url, proprietario: 'tracebase', nome: url.split('/').at(-1)! },
    commitSha,
    referencia: 'main',
    agora,
  })
  if (estado === 'processando') {
    const adquirido = await ciclo.adquirirProcessamento({ idPublico: snapshot.idPublico, tentativa: 1, agora, leaseExpiraEm: new Date(Date.parse(agora) + 10 * 60_000).toISOString() })
    if (adquirido.tipo !== 'adquirido') throw new Error('Snapshot não adquirido no teste.')
  }
  if (estado === 'falha') {
    await ciclo.registrarFalhaAgendamento({ idPublico: snapshot.idPublico, tentativa: 1, agora, falha: { codigo: 'FONTE_INDISPONIVEL', categoria: 'transitoria', mensagem: 'falha controlada' } })
  }
  return snapshot
}

async function persistir(preparado: Awaited<ReturnType<typeof prepararSnapshot>>, agora: string) {
  const isA = preparado.snapshot.commitSha === 'a'.repeat(40)
  const arquivoA = 'arquivo-a'
  const arquivoB = 'arquivo-b'
  const arquivoUso = 'arquivo-uso'
  const arquivoOutro = 'arquivo-outro'
  const caminhos = isA ? ['src/a.ts', 'src/lib/b.js', 'src/uso.ts', 'src/100%/exato.ts', 'src/100x/nao.ts', 'src/com_/exato.ts', 'src/comX/nao.ts'] : ['src/outro.ts']
  const arquivos = caminhos.map((caminho, indice) => ({ caminho, blobSha: `${indice + 1}${String(indice + 1).repeat(39)}` }))
  const indice: IndiceAnalise = {
    snapshot: { idPublico: preparado.snapshot.idPublico, repositorio: preparado.snapshot.repositorio, commitSha: preparado.snapshot.commitSha, referencia: 'main' },
    arquivos: isA
      ? caminhos.map((caminho, indice) => ({ id: [arquivoA, arquivoB, arquivoUso, 'arquivo-percentual', 'arquivo-curinga-percentual', 'arquivo-sublinhado', 'arquivo-curinga-sublinhado'][indice], caminho, tipo: caminho.endsWith('.js') ? 'javascript' as const : 'typescript' as const }))
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
