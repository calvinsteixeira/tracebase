import type { Pool, PoolClient } from 'pg'

import type {
  ArquivoAnalisado,
  ArquivoDoSnapshot,
  CategoriaDiagnostico,
  CodigoDiagnostico,
  DestinoImportacao,
  DiagnosticoAnalise,
  ExportacaoAnalisada,
  Evidencia,
  IdentidadeSnapshotIndice,
  IndiceAnalise,
  RelacaoImportacao,
  SimboloAnalisado,
  TipoArquivoFonte,
  TipoExportacao,
  TipoSimbolo,
} from '../../analises.types'
import type { SnapshotCicloVidaAnalise } from './ciclo-vida-analise'
import {
  type EntradaPersistenciaIndice,
  type IndicePersistido,
  type RepositorioPersistenciaIndice,
  validarIdentidadeSnapshotIndice,
  validarEntradaPersistenciaIndice,
} from './persistencia-indice'

interface LinhaSnapshotPersistencia {
  id: string
  id_publico: string
  repositorio_url: string
  proprietario: string
  nome: string
  commit_sha: string
  referencia: string
  estado: SnapshotCicloVidaAnalise['estado']
  tentativa: number
  lease_id: string | null
  lease_expira_em: string | null
}

interface LinhaIndice {
  indice_id: string
  parcial: boolean
}

interface LinhaArquivo {
  id_fato: string
  caminho: string
  tipo: TipoArquivoFonte
  blob_sha: string
}

interface LinhaSimbolo {
  id_fato: string
  arquivo_id: string
  nome: string
  tipo: TipoSimbolo
  evidencia_caminho: string
  evidencia_inicio_linha: number
  evidencia_inicio_coluna: number
  evidencia_fim_linha: number
  evidencia_fim_coluna: number
}

interface LinhaExportacao {
  id_fato: string
  arquivo_origem_id: string
  nome_exportado: string
  tipo: TipoExportacao
  nome_local: string | null
  destino_tipo: DestinoImportacao['tipo'] | null
  destino_caminho: string | null
  destino_especificador: string | null
  destino_expressao: string | null
  evidencia_caminho: string
  evidencia_inicio_linha: number
  evidencia_inicio_coluna: number
  evidencia_fim_linha: number
  evidencia_fim_coluna: number
}

interface LinhaRelacao {
  id_fato: string
  tipo: 'importa'
  arquivo_origem_id: string
  destino_tipo: DestinoImportacao['tipo']
  destino_caminho: string | null
  destino_especificador: string | null
  destino_expressao: string | null
  evidencia_caminho: string
  evidencia_inicio_linha: number
  evidencia_inicio_coluna: number
  evidencia_fim_linha: number
  evidencia_fim_coluna: number
}

interface LinhaDiagnostico {
  id_fato: string
  codigo: CodigoDiagnostico
  categoria: CategoriaDiagnostico
  arquivo_origem_id: string | null
  evidencia_caminho: string
  evidencia_inicio_linha: number
  evidencia_inicio_coluna: number
  evidencia_fim_linha: number
  evidencia_fim_coluna: number
}

export const MAX_PARAMETROS_POR_LOTE = 500

export function criarRepositorioPersistenciaIndicePostgres(
  pool: Pool,
): RepositorioPersistenciaIndice {
  return {
    async salvarEConcluir(input) {
      validarEntradaPersistenciaIndice(input)
      const cliente = await pool.connect()

      try {
        await cliente.query('BEGIN')
        const snapshot = await obterSnapshotPorId(cliente, input.snapshotIdPublico)

        if (!snapshot) {
          await cliente.query('COMMIT')
          return { tipo: 'inexistente' }
        }

        validarIdentidadeSnapshotIndice(input.indice, snapshotParaIdentidade(snapshot))

        if (snapshot.estado === 'concluido') {
          const indice = await carregarIndice(cliente, snapshot)
          await cliente.query('COMMIT')
          return indice
            ? { tipo: 'ja_concluido', indice }
            : { tipo: 'estado_incompativel' }
        }
        if (snapshot.tentativa !== input.tentativa) {
          await cliente.query('COMMIT')
          return { tipo: 'tentativa_desatualizada' }
        }
        if (snapshot.estado !== 'processando') {
          await cliente.query('COMMIT')
          return { tipo: 'estado_incompativel' }
        }
        if (!leaseValido(snapshot, input)) {
          await cliente.query('COMMIT')
          return { tipo: 'lease_invalido' }
        }

        const indice = await inserirIndice(cliente, snapshot.id, input)
        await inserirArquivos(cliente, snapshot.id, indice, input.arquivos, input.indice)
        await inserirSimbolos(cliente, snapshot.id, input.indice)
        await inserirExportacoes(cliente, snapshot.id, input.indice)
        await inserirRelacoes(cliente, snapshot.id, input.indice)
        await inserirDiagnosticos(cliente, snapshot.id, input.indice)

        const conclusao = await cliente.query(
          `
            UPDATE snapshots
            SET estado = 'concluido',
                etapa = 'persistencia',
                ultima_atividade_em = $4::timestamptz,
                atualizado_em = $4::timestamptz,
                finalizado_em = $4::timestamptz,
                lease_id = NULL,
                lease_expira_em = NULL,
                erro_codigo = NULL,
                erro_categoria = NULL,
                erro_mensagem = NULL,
                erro_detalhes = NULL,
                erro_em = NULL
            WHERE id_publico = $1::uuid
              AND tentativa = $2
              AND lease_id = $3::uuid
              AND estado = 'processando'
              AND lease_expira_em > $4::timestamptz
            RETURNING id
          `,
          [input.snapshotIdPublico, input.tentativa, input.leaseId, input.agora],
        )

        if (conclusao.rowCount !== 1) {
          throw new Error('O lease deixou de ser válido durante a conclusão.')
        }

        await cliente.query('COMMIT')
        return {
          tipo: 'persistido',
          indice: clonarPersistido({ indice: input.indice, arquivos: input.arquivos }),
        }
      } catch (erro) {
        await cliente.query('ROLLBACK')
        throw erro
      } finally {
        cliente.release()
      }
    },

    async buscarPorSnapshotConcluido(idPublico) {
      const snapshot = await obterSnapshotPorId(pool, idPublico)
      if (!snapshot || snapshot.estado !== 'concluido') return null
      return carregarIndice(pool, snapshot)
    },

    async buscarPorRepositorioECommit(input) {
      const resultado = await pool.query<LinhaSnapshotPersistencia>(
        `
          SELECT
            s.id::text AS id,
            s.id_publico::text AS id_publico,
            r.url AS repositorio_url,
            r.proprietario,
            r.nome,
            s.commit_sha,
            s.referencia,
            s.estado,
            s.tentativa,
            s.lease_id::text AS lease_id,
            s.lease_expira_em::text AS lease_expira_em
          FROM snapshots s
          INNER JOIN repositorios r ON r.id = s.repositorio_id
          WHERE r.url = $1
            AND s.commit_sha = $2
            AND s.estado = 'concluido'
          LIMIT 1
        `,
        [input.url, input.commitSha],
      )
      const snapshot = resultado.rows[0]
      return snapshot ? carregarIndice(pool, snapshot) : null
    },
  }
}

async function obterSnapshotPorId(
  executor: Pick<Pool, 'query'>,
  idPublico: string,
): Promise<LinhaSnapshotPersistencia | null> {
  if (!eUuid(idPublico)) return null
  const resultado = await executor.query<LinhaSnapshotPersistencia>(
    `
      SELECT
        s.id::text AS id,
        s.id_publico::text AS id_publico,
        r.url AS repositorio_url,
        r.proprietario,
        r.nome,
        s.commit_sha,
        s.referencia,
        s.estado,
        s.tentativa,
        s.lease_id::text AS lease_id,
        s.lease_expira_em::text AS lease_expira_em
      FROM snapshots s
      INNER JOIN repositorios r ON r.id = s.repositorio_id
      WHERE s.id_publico = $1::uuid
      FOR UPDATE
    `,
    [idPublico],
  )
  return resultado.rows[0] ?? null
}

async function carregarIndice(
  executor: Pick<Pool | PoolClient, 'query'>,
  snapshot: LinhaSnapshotPersistencia,
): Promise<IndicePersistido | null> {
  const indiceLinhaResultado = await executor.query<LinhaIndice>(
    `SELECT id::text AS indice_id, parcial FROM indices_estruturais WHERE snapshot_id = $1::bigint`,
    [snapshot.id],
  )
  const indice = indiceLinhaResultado.rows[0]
  if (!indice) return null

  const arquivos = await executor.query<LinhaArquivo>(
    `SELECT id_fato, caminho, tipo, blob_sha FROM arquivos_indice WHERE snapshot_id = $1::bigint ORDER BY id`,
    [snapshot.id],
  )
  const simbolos = await executor.query<LinhaSimbolo>(
    `SELECT id_fato, arquivo_id, nome, tipo, evidencia_caminho, evidencia_inicio_linha, evidencia_inicio_coluna, evidencia_fim_linha, evidencia_fim_coluna FROM simbolos_indice WHERE snapshot_id = $1::bigint ORDER BY id`,
    [snapshot.id],
  )
  const exportacoes = await executor.query<LinhaExportacao>(
    `SELECT id_fato, arquivo_origem_id, nome_exportado, tipo, nome_local, destino_tipo, destino_caminho, destino_especificador, destino_expressao, evidencia_caminho, evidencia_inicio_linha, evidencia_inicio_coluna, evidencia_fim_linha, evidencia_fim_coluna FROM exportacoes_indice WHERE snapshot_id = $1::bigint ORDER BY id`,
    [snapshot.id],
  )
  const relacoes = await executor.query<LinhaRelacao>(
    `SELECT id_fato, tipo, arquivo_origem_id, destino_tipo, destino_caminho, destino_especificador, destino_expressao, evidencia_caminho, evidencia_inicio_linha, evidencia_inicio_coluna, evidencia_fim_linha, evidencia_fim_coluna FROM relacoes_importacao_indice WHERE snapshot_id = $1::bigint ORDER BY id`,
    [snapshot.id],
  )
  const diagnosticos = await executor.query<LinhaDiagnostico>(
    `SELECT id_fato, codigo, categoria, arquivo_origem_id, evidencia_caminho, evidencia_inicio_linha, evidencia_inicio_coluna, evidencia_fim_linha, evidencia_fim_coluna FROM diagnosticos_indice WHERE snapshot_id = $1::bigint ORDER BY id`,
    [snapshot.id],
  )

  const indiceResultado: IndiceAnalise = {
    snapshot: {
      idPublico: snapshot.id_publico,
      repositorio: {
        url: snapshot.repositorio_url,
        proprietario: snapshot.proprietario,
        nome: snapshot.nome,
      },
      commitSha: snapshot.commit_sha,
      referencia: snapshot.referencia,
    },
    arquivos: arquivos.rows.map((arquivo) => ({
      id: arquivo.id_fato,
      caminho: arquivo.caminho,
      tipo: arquivo.tipo,
    })),
    simbolos: simbolos.rows.map((simbolo) => ({
      id: simbolo.id_fato,
      arquivoId: simbolo.arquivo_id,
      nome: simbolo.nome,
      tipo: simbolo.tipo,
      evidencia: mapearEvidencia(simbolo),
    })),
    exportacoes: exportacoes.rows.map((exportacao) => ({
      id: exportacao.id_fato,
      arquivoOrigemId: exportacao.arquivo_origem_id,
      nomeExportado: exportacao.nome_exportado,
      tipo: exportacao.tipo,
      ...(exportacao.nome_local ? { nomeLocal: exportacao.nome_local } : {}),
      ...(exportacao.destino_tipo
        ? { destino: mapearDestino(exportacao) }
        : {}),
      evidencia: mapearEvidencia(exportacao),
    })),
    relacoesImportacao: relacoes.rows.map((relacao) => ({
      id: relacao.id_fato,
      tipo: relacao.tipo,
      arquivoOrigemId: relacao.arquivo_origem_id,
      destino: mapearDestino(relacao),
      evidencia: mapearEvidencia(relacao),
    })),
    diagnosticos: diagnosticos.rows.map((diagnostico) => ({
      id: diagnostico.id_fato,
      codigo: diagnostico.codigo,
      categoria: diagnostico.categoria,
      ...(diagnostico.arquivo_origem_id
        ? { arquivoOrigemId: diagnostico.arquivo_origem_id }
        : {}),
      evidencia: mapearEvidencia(diagnostico),
    })),
    parcial: indice.parcial,
  }

  return {
    indice: indiceResultado,
    arquivos: arquivos.rows.map((arquivo) => ({
      caminho: arquivo.caminho,
      blobSha: arquivo.blob_sha,
    })),
  }
}

async function inserirIndice(
  cliente: PoolClient,
  snapshotId: string,
  input: EntradaPersistenciaIndice,
) {
  const resultado = await cliente.query<{ id: string }>(
    `INSERT INTO indices_estruturais (snapshot_id, parcial, criado_em) VALUES ($1::bigint, $2, $3::timestamptz) RETURNING id::text AS id`,
    [snapshotId, input.indice.parcial, input.agora],
  )
  const id = resultado.rows[0]?.id
  if (!id) throw new Error('Índice não criado.')
  return id
}

function snapshotParaIdentidade(
  snapshot: LinhaSnapshotPersistencia,
): IdentidadeSnapshotIndice {
  return {
    idPublico: snapshot.id_publico,
    repositorio: {
      url: snapshot.repositorio_url,
      proprietario: snapshot.proprietario,
      nome: snapshot.nome,
    },
    commitSha: snapshot.commit_sha,
    referencia: snapshot.referencia,
  }
}

async function inserirArquivos(
  cliente: PoolClient,
  snapshotId: string,
  indiceId: string,
  arquivos: ArquivoDoSnapshot[],
  indice: IndiceAnalise,
) {
  const porCaminho = new Map(arquivos.map((arquivo) => [arquivo.caminho, arquivo]))
  const linhas = indice.arquivos.map((arquivo) => {
    const origem = porCaminho.get(arquivo.caminho)
    if (!origem) throw new Error('Arquivo do índice sem origem.')
    return [indiceId, snapshotId, arquivo.id, arquivo.caminho, arquivo.tipo, origem.blobSha]
  })
  await inserirEmLotes(
    cliente,
    'arquivos_indice',
    ['indice_id', 'snapshot_id', 'id_fato', 'caminho', 'tipo', 'blob_sha'],
    linhas,
  )
}

async function inserirSimbolos(cliente: PoolClient, snapshotId: string, indice: IndiceAnalise) {
  await inserirEmLotes(
    cliente,
    'simbolos_indice',
    ['snapshot_id', 'id_fato', 'arquivo_id', 'nome', 'tipo', 'evidencia_caminho', 'evidencia_inicio_linha', 'evidencia_inicio_coluna', 'evidencia_fim_linha', 'evidencia_fim_coluna'],
    indice.simbolos.map((simbolo) => [
      snapshotId,
      simbolo.id,
      simbolo.arquivoId,
      simbolo.nome,
      simbolo.tipo,
      ...parametrosEvidencia(simbolo.evidencia),
    ]),
  )
}

async function inserirExportacoes(cliente: PoolClient, snapshotId: string, indice: IndiceAnalise) {
  await inserirEmLotes(
    cliente,
    'exportacoes_indice',
    ['snapshot_id', 'id_fato', 'arquivo_origem_id', 'nome_exportado', 'tipo', 'nome_local', 'destino_tipo', 'destino_caminho', 'destino_especificador', 'destino_expressao', 'evidencia_caminho', 'evidencia_inicio_linha', 'evidencia_inicio_coluna', 'evidencia_fim_linha', 'evidencia_fim_coluna'],
    indice.exportacoes.map((exportacao) => [
      snapshotId,
      exportacao.id,
      exportacao.arquivoOrigemId,
      exportacao.nomeExportado,
      exportacao.tipo,
      exportacao.nomeLocal ?? null,
      ...parametrosDestino(exportacao.destino),
      ...parametrosEvidencia(exportacao.evidencia),
    ]),
  )
}

async function inserirRelacoes(cliente: PoolClient, snapshotId: string, indice: IndiceAnalise) {
  await inserirEmLotes(
    cliente,
    'relacoes_importacao_indice',
    ['snapshot_id', 'id_fato', 'tipo', 'arquivo_origem_id', 'destino_tipo', 'destino_caminho', 'destino_especificador', 'destino_expressao', 'evidencia_caminho', 'evidencia_inicio_linha', 'evidencia_inicio_coluna', 'evidencia_fim_linha', 'evidencia_fim_coluna'],
    indice.relacoesImportacao.map((relacao) => [
      snapshotId,
      relacao.id,
      relacao.tipo,
      relacao.arquivoOrigemId,
      ...parametrosDestino(relacao.destino),
      ...parametrosEvidencia(relacao.evidencia),
    ]),
  )
}

async function inserirDiagnosticos(cliente: PoolClient, snapshotId: string, indice: IndiceAnalise) {
  await inserirEmLotes(
    cliente,
    'diagnosticos_indice',
    ['snapshot_id', 'id_fato', 'codigo', 'categoria', 'arquivo_origem_id', 'evidencia_caminho', 'evidencia_inicio_linha', 'evidencia_inicio_coluna', 'evidencia_fim_linha', 'evidencia_fim_coluna'],
    indice.diagnosticos.map((diagnostico) => [
      snapshotId,
      diagnostico.id,
      diagnostico.codigo,
      diagnostico.categoria,
      diagnostico.arquivoOrigemId ?? null,
      ...parametrosEvidencia(diagnostico.evidencia),
    ]),
  )
}

type TabelaIndice =
  | 'arquivos_indice'
  | 'simbolos_indice'
  | 'exportacoes_indice'
  | 'relacoes_importacao_indice'
  | 'diagnosticos_indice'

export async function inserirEmLotes(
  cliente: Pick<PoolClient, 'query'>,
  tabela: TabelaIndice,
  colunas: readonly string[],
  linhas: readonly (readonly unknown[])[],
) {
  if (linhas.length === 0) return

  const linhasPorLote = Math.max(1, Math.floor(MAX_PARAMETROS_POR_LOTE / colunas.length))
  for (let inicio = 0; inicio < linhas.length; inicio += linhasPorLote) {
    const lote = linhas.slice(inicio, inicio + linhasPorLote)
    const valores = lote.flatMap((linha) => linha)
    const placeholders = lote
      .map((_, indiceLinha) =>
        `(${colunas.map((_, indiceColuna) => `$${indiceLinha * colunas.length + indiceColuna + 1}`).join(', ')})`,
      )
      .join(', ')

    await cliente.query(
      `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES ${placeholders}`,
      valores,
    )
  }
}

function leaseValido(snapshot: LinhaSnapshotPersistencia, input: EntradaPersistenciaIndice) {
  return snapshot.lease_id === input.leaseId &&
    snapshot.lease_expira_em !== null &&
    new Date(snapshot.lease_expira_em).getTime() > new Date(input.agora).getTime()
}

function parametrosEvidencia(evidencia: Evidencia) {
  return [
    evidencia.caminhoArquivo,
    evidencia.inicio.linha,
    evidencia.inicio.coluna,
    evidencia.fim.linha,
    evidencia.fim.coluna,
  ]
}

function parametrosDestino(destino: DestinoImportacao | undefined) {
  return destino
    ? [
        destino.tipo,
        destino.tipo === 'interno' ? destino.caminhoArquivo : null,
        destino.tipo === 'interno' ? null : destino.especificador,
        destino.tipo === 'nao-resolvido' ? destino.expressao ?? null : null,
      ]
    : [null, null, null, null]
}

function mapearDestino(linha: LinhaExportacao | LinhaRelacao): DestinoImportacao {
  if (linha.destino_tipo === 'interno') {
    return { tipo: 'interno', caminhoArquivo: linha.destino_caminho ?? '' }
  }
  if (linha.destino_tipo === 'nao-resolvido') {
    return {
      tipo: 'nao-resolvido',
      especificador: linha.destino_especificador ?? '',
      ...(linha.destino_expressao ? { expressao: linha.destino_expressao } : {}),
    }
  }
  return { tipo: 'externo', especificador: linha.destino_especificador ?? '' }
}

function mapearEvidencia(
  linha: Pick<
    LinhaSimbolo | LinhaExportacao | LinhaRelacao | LinhaDiagnostico,
    'evidencia_caminho' | 'evidencia_inicio_linha' | 'evidencia_inicio_coluna' | 'evidencia_fim_linha' | 'evidencia_fim_coluna'
  >,
): Evidencia {
  return {
    caminhoArquivo: linha.evidencia_caminho,
    inicio: { linha: linha.evidencia_inicio_linha, coluna: linha.evidencia_inicio_coluna },
    fim: { linha: linha.evidencia_fim_linha, coluna: linha.evidencia_fim_coluna },
  }
}

function clonarPersistido(persistido: IndicePersistido): IndicePersistido {
  return {
    indice: clonarIndice(persistido.indice),
    arquivos: persistido.arquivos.map((arquivo) => ({ ...arquivo })),
  }
}

function clonarIndice(indice: IndiceAnalise): IndiceAnalise {
  return {
    snapshot: { ...indice.snapshot, repositorio: { ...indice.snapshot.repositorio } },
    arquivos: indice.arquivos.map((arquivo: ArquivoAnalisado) => ({ ...arquivo })),
    simbolos: indice.simbolos.map((simbolo: SimboloAnalisado) => ({ ...simbolo, evidencia: clonarEvidencia(simbolo.evidencia) })),
    exportacoes: indice.exportacoes.map((exportacao: ExportacaoAnalisada) => ({
      ...exportacao,
      ...(exportacao.nomeLocal ? { nomeLocal: exportacao.nomeLocal } : {}),
      ...(exportacao.destino ? { destino: { ...exportacao.destino } } : {}),
      evidencia: clonarEvidencia(exportacao.evidencia),
    })),
    relacoesImportacao: indice.relacoesImportacao.map((relacao: RelacaoImportacao) => ({
      ...relacao,
      destino: { ...relacao.destino },
      evidencia: clonarEvidencia(relacao.evidencia),
    })),
    diagnosticos: indice.diagnosticos.map((diagnostico: DiagnosticoAnalise) => ({
      ...diagnostico,
      evidencia: clonarEvidencia(diagnostico.evidencia),
    })),
    parcial: indice.parcial,
  }
}

function clonarEvidencia(evidencia: Evidencia): Evidencia {
  return { ...evidencia, inicio: { ...evidencia.inicio }, fim: { ...evidencia.fim } }
}

function eUuid(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}
