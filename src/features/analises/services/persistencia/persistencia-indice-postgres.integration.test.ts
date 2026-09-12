import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ArquivoDoSnapshot, IndiceAnalise } from '../../analises.types'
import { criarCicloVidaAnalisePostgres } from './ciclo-vida-analise-postgres'
import { criarRepositorioPersistenciaIndicePostgres } from './persistencia-indice-postgres'
import type { EntradaPersistenciaIndice } from './persistencia-indice'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://tracebase:tracebase_local@localhost:5432/tracebase?sslmode=disable'
const pool = new Pool({ connectionString: databaseUrl })
const ciclo = criarCicloVidaAnalisePostgres(pool)
const persistencia = criarRepositorioPersistenciaIndicePostgres(pool)
const url = 'https://github.com/tracebase/persistencia-indice-integracao'
const agora = '2026-09-13T13:00:00.000Z'
const expiraEm = '2026-09-13T13:10:00.000Z'

beforeAll(async () => {
  const tabelas = await pool.query<{ historico: string | null; legado: string | null }>(
    `
      SELECT
        to_regclass('supabase_migrations.schema_migrations') AS historico,
        to_regclass('public.schema_migrations') AS legado
    `,
  )

  expect(tabelas.rows[0]?.historico).toBe('supabase_migrations.schema_migrations')
  expect(tabelas.rows[0]?.legado).toBeNull()
})

afterAll(async () => {
  await pool.query('DELETE FROM repositorios WHERE url = $1', [url])
  await pool.end()
})

describe('persistência transacional do índice PostgreSQL', () => {
  it('faz round-trip completo, preserva blobs e permite recuperar pelo repositório e commit', async () => {
    const preparado = await prepararSnapshot('a'.repeat(40))
    const entrada = criarEntrada(preparado.snapshot, preparado.leaseId)

    const resultado = await persistencia.salvarEConcluir(entrada)

    expect(resultado).toEqual({
      tipo: 'persistido',
      indice: { indice: entrada.indice, arquivos: entrada.arquivos },
    })
    const recuperado = await persistencia.buscarPorSnapshotConcluido(preparado.snapshot.idPublico)
    expect(recuperado?.indice).toEqual(entrada.indice)
    expect(recuperado?.arquivos).toEqual(entrada.arquivos)
    expect(await persistencia.buscarPorRepositorioECommit({ url, commitSha: 'a'.repeat(40) }))
      .toEqual({ indice: entrada.indice, arquivos: entrada.arquivos })
    expect(
      await pool.query(
        `SELECT caminho, blob_sha FROM arquivos_indice ai
         INNER JOIN indices_estruturais i ON i.id = ai.indice_id
         INNER JOIN snapshots s ON s.id = i.snapshot_id
         WHERE s.id_publico = $1::uuid ORDER BY ai.id`,
        [preparado.snapshot.idPublico],
      ),
    ).toMatchObject({
      rows: [
        { caminho: 'src/entrada.ts', blob_sha: '1'.repeat(40) },
        { caminho: 'src/interno.ts', blob_sha: '2'.repeat(40) },
        { caminho: 'src/externo.ts', blob_sha: '3'.repeat(40) },
      ],
    })
  })

  it('conclui uma única vez e não duplica nem altera índice concluído', async () => {
    const preparado = await prepararSnapshot('b'.repeat(40))
    const entrada = criarEntrada(preparado.snapshot, preparado.leaseId)

    await persistencia.salvarEConcluir(entrada)
    const repetido = await persistencia.salvarEConcluir({
      ...entrada,
      indice: { ...entrada.indice, parcial: false },
    })

    expect(repetido).toEqual({
      tipo: 'ja_concluido',
      indice: { indice: entrada.indice, arquivos: entrada.arquivos },
    })
    const contagem = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM indices_estruturais i
       INNER JOIN snapshots s ON s.id = i.snapshot_id WHERE s.id_publico = $1::uuid`,
      [preparado.snapshot.idPublico],
    )
    expect(contagem.rows[0]?.total).toBe('1')
  })

  it('insere fatos em múltiplos lotes e mantém o round-trip completo', async () => {
    const preparado = await prepararSnapshot('0'.repeat(40))
    const entrada = criarEntrada(preparado.snapshot, preparado.leaseId, false, 120)

    const resultado = await persistencia.salvarEConcluir(entrada)

    expect(resultado).toEqual({
      tipo: 'persistido',
      indice: { indice: entrada.indice, arquivos: entrada.arquivos },
    })
    expect(await persistencia.buscarPorSnapshotConcluido(preparado.snapshot.idPublico))
      .toEqual({ indice: entrada.indice, arquivos: entrada.arquivos })
  })

  it('faz rollback integral quando uma inserção do índice falha', async () => {
    const preparado = await prepararSnapshot('c'.repeat(40))
    const trigger = 'tracebase_teste_bloquear_relacao'
    const funcao = 'tracebase_teste_bloquear_relacao()'

    await pool.query(`
      CREATE OR REPLACE FUNCTION ${funcao} RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'falha controlada do teste';
      END;
      $$;
    `)
    await pool.query(`
      CREATE TRIGGER ${trigger}
      BEFORE INSERT ON relacoes_importacao_indice
      FOR EACH ROW EXECUTE FUNCTION ${funcao};
    `)

    try {
      await expect(
        persistencia.salvarEConcluir(criarEntrada(preparado.snapshot, preparado.leaseId)),
      ).rejects.toThrow('falha controlada do teste')
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON relacoes_importacao_indice`)
      await pool.query(`DROP FUNCTION IF EXISTS ${funcao}`)
    }

    const contagem = await pool.query<{ indices: string; arquivos: string }>(
      `
        SELECT
          (SELECT COUNT(*)::text FROM indices_estruturais i
           INNER JOIN snapshots s ON s.id = i.snapshot_id WHERE s.id_publico = $1::uuid) AS indices,
          (SELECT COUNT(*)::text FROM arquivos_indice ai
           INNER JOIN indices_estruturais i ON i.id = ai.indice_id
           INNER JOIN snapshots s ON s.id = i.snapshot_id WHERE s.id_publico = $1::uuid) AS arquivos
      `,
      [preparado.snapshot.idPublico],
    )
    expect(contagem.rows[0]).toEqual({ indices: '0', arquivos: '0' })
    expect(await ciclo.buscarPorIdPublico(preparado.snapshot.idPublico)).toMatchObject({
      estado: 'processando',
      tentativa: 1,
      leaseId: preparado.leaseId,
    })
  })

  it('diferencia tentativa desatualizada, lease inválido e estado incompatível', async () => {
    const preparado = await prepararSnapshot('d'.repeat(40))
    const entrada = criarEntrada(preparado.snapshot, preparado.leaseId)

    await expect(
      persistencia.buscarPorSnapshotConcluido(preparado.snapshot.idPublico),
    ).resolves.toBeNull()

    await expect(persistencia.salvarEConcluir({ ...entrada, tentativa: 0 })).resolves.toEqual({
      tipo: 'tentativa_desatualizada',
    })
    await expect(persistencia.salvarEConcluir({ ...entrada, leaseId: '00000000-0000-4000-8000-000000000000' }))
      .resolves.toEqual({ tipo: 'lease_invalido' })
    await expect(
      persistencia.salvarEConcluir({
        ...entrada,
        agora: '2026-09-13T13:11:00.000Z',
      }),
    ).resolves.toEqual({ tipo: 'lease_invalido' })

    const reassumido = await ciclo.adquirirProcessamento({
      idPublico: preparado.snapshot.idPublico,
      tentativa: 1,
      agora: '2026-09-13T13:12:00.000Z',
      leaseExpiraEm: '2026-09-13T13:20:00.000Z',
    })
    if (reassumido.tipo !== 'adquirido') throw new Error('O lease deveria ter sido reassumido.')
    await expect(
      persistencia.salvarEConcluir({
        ...entrada,
        agora: '2026-09-13T13:12:00.000Z',
      }),
    ).resolves.toEqual({ tipo: 'lease_invalido' })

    const entradaAtual = criarEntrada(reassumido.snapshot, reassumido.lease.id)
    await persistencia.salvarEConcluir(entradaAtual)
    await expect(persistencia.salvarEConcluir(entradaAtual)).resolves.toMatchObject({
      tipo: 'ja_concluido',
    })
  })

  it('mantém índices de commits diferentes isolados mesmo com os mesmos ids e caminhos', async () => {
    const primeiro = await prepararSnapshot('e'.repeat(40))
    const segundo = await prepararSnapshot('f'.repeat(40))
    await persistencia.salvarEConcluir(criarEntrada(primeiro.snapshot, primeiro.leaseId))
    await persistencia.salvarEConcluir(criarEntrada(segundo.snapshot, segundo.leaseId))

    const um = await persistencia.buscarPorRepositorioECommit({ url, commitSha: 'e'.repeat(40) })
    const dois = await persistencia.buscarPorRepositorioECommit({ url, commitSha: 'f'.repeat(40) })
    expect(um?.arquivos[0]?.caminho).toBe(dois?.arquivos[0]?.caminho)
    expect(um?.indice.snapshot.idPublico).not.toBe(dois?.indice.snapshot.idPublico)
  })

  it('rejeita referências internas entre snapshots diferentes e combinações de destino inválidas', async () => {
    const primeiro = await prepararSnapshot('1'.repeat(40))
    const segundo = await prepararSnapshot('2'.repeat(40))
    await persistencia.salvarEConcluir(criarEntrada(primeiro.snapshot, primeiro.leaseId))
    await persistencia.salvarEConcluir(criarEntrada(segundo.snapshot, segundo.leaseId, true))

    const ids = await pool.query<{ snapshot_id: string; arquivo_id: string }>(
      `
        SELECT i.snapshot_id::text AS snapshot_id, ai.id_fato AS arquivo_id
        FROM indices_estruturais i
        INNER JOIN snapshots s ON s.id = i.snapshot_id
        INNER JOIN arquivos_indice ai ON ai.indice_id = i.id
        WHERE s.id_publico = $1::uuid AND ai.id_fato = $2
      `,
      [primeiro.snapshot.idPublico, 'arquivo:src/entrada.ts'],
    )
    const segundoId = await pool.query<{ caminho: string }>(
      `
        SELECT ai.caminho FROM arquivos_indice ai
        INNER JOIN indices_estruturais i ON i.id = ai.indice_id
        INNER JOIN snapshots s ON s.id = i.snapshot_id
        WHERE s.id_publico = $1::uuid AND ai.caminho = $2
      `,
      [segundo.snapshot.idPublico, 'src/apenas-no-segundo.ts'],
    )

    await expect(
      pool.query(
        `INSERT INTO relacoes_importacao_indice
          (snapshot_id, id_fato, tipo, arquivo_origem_id, destino_tipo, destino_caminho,
           destino_especificador, destino_expressao, evidencia_caminho,
           evidencia_inicio_linha, evidencia_inicio_coluna, evidencia_fim_linha, evidencia_fim_coluna)
         VALUES ($1, $2, 'importa', $3, 'interno', $4, NULL, NULL, $5, 1, 1, 1, 4)`,
        [
          ids.rows[0]?.snapshot_id,
          'relacao:cruzada',
          ids.rows[0]?.arquivo_id,
          segundoId.rows[0]?.caminho,
          'src/entrada.ts',
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' })

    await expect(
      pool.query(
        `INSERT INTO relacoes_importacao_indice
          (snapshot_id, id_fato, tipo, arquivo_origem_id, destino_tipo, destino_caminho,
           destino_especificador, destino_expressao, evidencia_caminho,
           evidencia_inicio_linha, evidencia_inicio_coluna, evidencia_fim_linha, evidencia_fim_coluna)
         VALUES ($1, $2, 'importa', $3, 'externo', 'src/entrada.ts', NULL, NULL, $4, 1, 1, 1, 4)`,
        [ids.rows[0]?.snapshot_id, 'relacao:destino-invalido', ids.rows[0]?.arquivo_id, 'src/entrada.ts'],
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('protege a ordem das evidências em símbolos, exports, imports e diagnósticos', async () => {
    const preparado = await prepararSnapshot('3'.repeat(40))
    const entrada = criarEntrada(preparado.snapshot, preparado.leaseId)
    await persistencia.salvarEConcluir(entrada)
    const ids = await pool.query<{ snapshot_id: string }>(
      `SELECT id::text AS snapshot_id FROM snapshots WHERE id_publico = $1::uuid`,
      [preparado.snapshot.idPublico],
    )
    const snapshotId = ids.rows[0]?.snapshot_id
    const arquivoId = 'arquivo:src/entrada.ts'

    const casos = [
      `INSERT INTO simbolos_indice
        (snapshot_id, id_fato, arquivo_id, nome, tipo, evidencia_caminho,
         evidencia_inicio_linha, evidencia_inicio_coluna, evidencia_fim_linha, evidencia_fim_coluna)
       VALUES ($1, 'simbolo:ordem-invalida', $2, 'x', 'funcao', 'src/entrada.ts', 4, 5, 4, 4)`,
      `INSERT INTO exportacoes_indice
        (snapshot_id, id_fato, arquivo_origem_id, nome_exportado, tipo, evidencia_caminho,
         evidencia_inicio_linha, evidencia_inicio_coluna, evidencia_fim_linha, evidencia_fim_coluna)
       VALUES ($1, 'exportacao:ordem-invalida', $2, 'x', 'nomeada', 'src/entrada.ts', 4, 5, 4, 4)`,
      `INSERT INTO relacoes_importacao_indice
        (snapshot_id, id_fato, tipo, arquivo_origem_id, destino_tipo, destino_especificador,
         evidencia_caminho, evidencia_inicio_linha, evidencia_inicio_coluna, evidencia_fim_linha, evidencia_fim_coluna)
       VALUES ($1, 'relacao:ordem-invalida', 'importa', $2, 'externo', 'react', 'src/entrada.ts', 4, 5, 4, 4)`,
      `INSERT INTO diagnosticos_indice
        (snapshot_id, id_fato, codigo, categoria, arquivo_origem_id, evidencia_caminho,
         evidencia_inicio_linha, evidencia_inicio_coluna, evidencia_fim_linha, evidencia_fim_coluna)
       VALUES ($1, 'diagnostico:ordem-invalida', 'COMMONJS_NAO_SUPORTADO', 'limitacao', $2, 'src/entrada.ts', 4, 5, 4, 4)`,
    ]

    for (const sql of casos) {
      await expect(pool.query(sql, [snapshotId, arquivoId])).rejects.toMatchObject({
        code: '23514',
      })
    }
  })

  it('não persiste conteúdo-fonte, AST, tokens ou stack trace', async () => {
    const tabelas = [
      'indices_estruturais',
      'arquivos_indice',
      'simbolos_indice',
      'exportacoes_indice',
      'relacoes_importacao_indice',
      'diagnosticos_indice',
    ]
    const colunas = await pool.query<{ column_name: string }>(
      `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      `,
      [tabelas],
    )
    expect(colunas.rows.map((linha) => linha.column_name).join(' ')).not.toMatch(
      /conteudo|content|ast|token|stack|fonte/i,
    )
  })
})

async function prepararSnapshot(commitSha: string) {
  const snapshot = await ciclo.criarOuReutilizar({
    repositorio: {
      url,
      proprietario: 'Tracebase',
      nome: 'Persistencia-Indice-Integracao',
    },
    commitSha,
    referencia: 'main',
    agora,
  })
  const adquirido = await ciclo.adquirirProcessamento({
    idPublico: snapshot.idPublico,
    tentativa: 1,
    agora,
    leaseExpiraEm: expiraEm,
  })
  if (adquirido.tipo !== 'adquirido') throw new Error('A aquisição deveria ter sido concluída.')
  return { snapshot: adquirido.snapshot, leaseId: adquirido.lease.id }
}

function criarEntrada(
  snapshot: Awaited<ReturnType<typeof prepararSnapshot>>['snapshot'],
  leaseId: string,
  incluirArquivoExtra = false,
  quantidadeSimbolos = 1,
): EntradaPersistenciaIndice {
  const arquivos = criarArquivosDoSnapshot(incluirArquivoExtra)
  return {
    snapshotIdPublico: snapshot.idPublico,
    tentativa: snapshot.tentativa,
    leaseId,
    agora,
    arquivos,
    indice: criarIndice(snapshot, incluirArquivoExtra, quantidadeSimbolos),
  }
}

function criarArquivosDoSnapshot(incluirArquivoExtra: boolean): ArquivoDoSnapshot[] {
  const arquivos = [
    { caminho: 'src/entrada.ts', blobSha: '1'.repeat(40) },
    { caminho: 'src/interno.ts', blobSha: '2'.repeat(40) },
    { caminho: 'src/externo.ts', blobSha: '3'.repeat(40) },
  ]
  if (incluirArquivoExtra) {
    arquivos.push({ caminho: 'src/apenas-no-segundo.ts', blobSha: '4'.repeat(40) })
  }
  return arquivos
}

function criarIndice(
  snapshot: Awaited<ReturnType<typeof prepararSnapshot>>['snapshot'],
  incluirArquivoExtra = false,
  quantidadeSimbolos = 1,
): IndiceAnalise {
  const entrada = 'arquivo:src/entrada.ts'
  const interno = 'arquivo:src/interno.ts'
  const externo = 'arquivo:src/externo.ts'
  const evidencia = (caminhoArquivo: string, linha: number) => ({
    caminhoArquivo,
    inicio: { linha, coluna: 2 },
    fim: { linha, coluna: 18 },
  })
  const arquivos = [
    { id: entrada, caminho: 'src/entrada.ts', tipo: 'typescript' as const },
    { id: interno, caminho: 'src/interno.ts', tipo: 'javascript' as const },
    { id: externo, caminho: 'src/externo.ts', tipo: 'typescript' as const },
  ]
  if (incluirArquivoExtra) {
    arquivos.push({ id: 'arquivo:src/apenas-no-segundo.ts', caminho: 'src/apenas-no-segundo.ts', tipo: 'typescript' })
  }

  return {
    snapshot: {
      idPublico: snapshot.idPublico,
      repositorio: snapshot.repositorio,
      commitSha: snapshot.commitSha,
      referencia: snapshot.referencia,
    },
    arquivos,
    simbolos: Array.from({ length: quantidadeSimbolos }, (_, indice) => ({
      id: indice === 0 ? 'simbolo:entrada' : `simbolo:entrada-${indice}`,
      arquivoId: entrada,
      nome: indice === 0 ? 'entrada' : `entrada${indice}`,
      tipo: 'funcao' as const,
      evidencia: evidencia('src/entrada.ts', indice + 2),
    })),
    exportacoes: [
      {
        id: 'exportacao:interna', arquivoOrigemId: entrada, nomeExportado: 'interna',
        tipo: 'nomeada', nomeLocal: 'interna', destino: { tipo: 'interno', caminhoArquivo: 'src/interno.ts' },
        evidencia: evidencia('src/entrada.ts', 3),
      },
      {
        id: 'exportacao:externa', arquivoOrigemId: entrada, nomeExportado: 'useMemo',
        tipo: 'reexportacao', destino: { tipo: 'externo', especificador: 'react' },
        evidencia: evidencia('src/entrada.ts', 4),
      },
    ],
    relacoesImportacao: [
      {
        id: 'relacao:interna', tipo: 'importa', arquivoOrigemId: entrada,
        destino: { tipo: 'interno', caminhoArquivo: 'src/interno.ts' }, evidencia: evidencia('src/entrada.ts', 5),
      },
      {
        id: 'relacao:externa', tipo: 'importa', arquivoOrigemId: entrada,
        destino: { tipo: 'externo', especificador: 'react' }, evidencia: evidencia('src/entrada.ts', 6),
      },
      {
        id: 'relacao:nao-resolvida', tipo: 'importa', arquivoOrigemId: externo,
        destino: { tipo: 'nao-resolvido', especificador: './dinamico', expressao: "'./' + modulo" },
        evidencia: evidencia('src/externo.ts', 7),
      },
    ],
    diagnosticos: [{
      id: 'diagnostico:entrada', codigo: 'COMMONJS_NAO_SUPORTADO', categoria: 'limitacao',
      arquivoOrigemId: entrada, evidencia: evidencia('src/entrada.ts', 8),
    }],
    parcial: true,
  }
}
