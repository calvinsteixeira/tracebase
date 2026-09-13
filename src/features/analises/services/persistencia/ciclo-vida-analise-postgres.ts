import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'

import type {
  DetalhesFalhaAnalise,
  FalhaAnalise,
  ResultadoAquisicaoProcessamento,
  ResumoStatusAnalise,
  SolicitacaoAnalise,
  SnapshotCicloVidaAnalise,
} from './ciclo-vida-analise'
import type { RepositorioCicloVidaAnaliseCompleto } from './repositorio-api-analises'

interface LinhaSnapshotCiclo {
  id_publico: string
  repositorio_url: string
  proprietario: string
  nome: string
  commit_sha: string
  referencia: string
  estado: SnapshotCicloVidaAnalise['estado']
  etapa: SnapshotCicloVidaAnalise['etapa']
  tentativa: number
  tentativa_iniciada_em: string | null
  ultima_atividade_em: string | null
  atualizado_em: string
  finalizado_em: string | null
  lease_id: string | null
  lease_expira_em: string | null
  erro_codigo: FalhaAnalise['codigo'] | null
  erro_categoria: FalhaAnalise['categoria'] | null
  erro_mensagem: string | null
  erro_detalhes: DetalhesFalhaAnalise | null
  erro_em: string | null
}

interface LinhaResultadoAquisicao extends LinhaSnapshotCiclo {
  resultado: ResultadoAquisicaoProcessamento['tipo']
}

interface LinhaSolicitacao {
  request_id: string
  operacao: 'criacao' | 'retry'
  snapshot_id: string
  url_normalizada: string | null
  tentativa_esperada: number | null
  tentativa_resultante: number
  criado_em: string
}

const selecaoSnapshot = `
  s.id_publico::text AS id_publico,
  r.url AS repositorio_url,
  r.proprietario,
  r.nome,
  s.commit_sha,
  s.referencia,
  s.estado,
  s.etapa,
  s.tentativa,
  s.tentativa_iniciada_em::text AS tentativa_iniciada_em,
  s.ultima_atividade_em::text AS ultima_atividade_em,
  s.atualizado_em::text AS atualizado_em,
  s.finalizado_em::text AS finalizado_em,
  s.lease_id::text AS lease_id,
  s.lease_expira_em::text AS lease_expira_em,
  s.erro_codigo,
  s.erro_categoria,
  s.erro_mensagem,
  s.erro_detalhes,
  s.erro_em::text AS erro_em
`

export function criarCicloVidaAnalisePostgres(pool: Pool): RepositorioCicloVidaAnaliseCompleto {
  return {
    async criarOuReutilizar(input) {
      const cliente = await pool.connect()

      try {
        await cliente.query('BEGIN')

        const repositorio = await cliente.query<{ id: string }>(
          `
            INSERT INTO repositorios (url, proprietario, nome)
            VALUES ($1, $2, $3)
            ON CONFLICT (url) DO UPDATE
              SET proprietario = EXCLUDED.proprietario,
                  nome = EXCLUDED.nome
            RETURNING id::text AS id
          `,
          [input.repositorio.url, input.repositorio.proprietario, input.repositorio.nome],
        )

        const snapshot = await cliente.query<{ id_publico: string }>(
          `
            INSERT INTO snapshots (
              repositorio_id,
              commit_sha,
              referencia,
              criado_em,
              atualizado_em
            )
            VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz)
            ON CONFLICT (repositorio_id, commit_sha) DO UPDATE
              SET referencia = snapshots.referencia
            RETURNING id_publico::text AS id_publico
          `,
          [
            repositorio.rows[0]?.id,
            input.commitSha,
            input.referencia,
            input.agora,
          ],
        )

        const resultado = await cliente.query<LinhaSnapshotCiclo>(
          `
            SELECT ${selecaoSnapshot}
            FROM snapshots s
            INNER JOIN repositorios r ON r.id = s.repositorio_id
            WHERE s.id_publico = $1::uuid
          `,
          [snapshot.rows[0]?.id_publico],
        )

        await cliente.query('COMMIT')
        return mapearSnapshot(resultado.rows[0])
      } catch (erro) {
        await cliente.query('ROLLBACK')
        throw erro
      } finally {
        cliente.release()
      }
    },

    async buscarPorIdPublico(idPublico) {
      if (!eUuid(idPublico)) return null

      const resultado = await pool.query<LinhaSnapshotCiclo>(
        `
          SELECT ${selecaoSnapshot}
          FROM snapshots s
          INNER JOIN repositorios r ON r.id = s.repositorio_id
          WHERE s.id_publico = $1::uuid
        `,
        [idPublico],
      )

      return resultado.rows[0] ? mapearSnapshot(resultado.rows[0]) : null
    },

    async adquirirProcessamento(input) {
      if (!eUuid(input.idPublico)) return { tipo: 'inexistente' }

      const leaseId = randomUUID()
      const resultado = await pool.query<LinhaResultadoAquisicao>(
        `
          WITH alvo AS (
            SELECT s.*
            FROM snapshots s
            WHERE s.id_publico = $1::uuid
            FOR UPDATE
          ), adquirido AS (
            UPDATE snapshots s
            SET estado = 'processando',
                etapa = COALESCE(s.etapa, 'preparacao'),
                tentativa_iniciada_em = COALESCE(s.tentativa_iniciada_em, $3::timestamptz),
                ultima_atividade_em = $3::timestamptz,
                atualizado_em = $3::timestamptz,
                finalizado_em = NULL,
                lease_id = $5::uuid,
                lease_expira_em = $4::timestamptz
            FROM alvo
            WHERE s.id = alvo.id
              AND s.tentativa = $2
              AND $4::timestamptz > $3::timestamptz
              AND (
                s.estado = 'aguardando'
                OR (s.estado = 'processando' AND s.lease_expira_em <= $3::timestamptz)
              )
            RETURNING s.*
          ), classificado AS (
            SELECT 'adquirido'::text AS resultado, a.*
            FROM adquirido a
            UNION ALL
            SELECT CASE
              WHEN a.estado = 'concluido' THEN 'concluido'
              WHEN a.tentativa <> $2 THEN 'tentativa_desatualizada'
              WHEN a.estado = 'processando' AND a.lease_expira_em > $3::timestamptz THEN 'ocupado'
              ELSE 'estado_incompativel'
            END AS resultado, a.*
            FROM alvo a
            WHERE NOT EXISTS (SELECT 1 FROM adquirido)
          )
          SELECT s.resultado, ${selecaoSnapshot}
          FROM classificado s
          INNER JOIN repositorios r ON r.id = s.repositorio_id
        `,
        [input.idPublico, input.tentativa, input.agora, input.leaseExpiraEm, leaseId],
      )

      return mapearResultadoAquisicao(resultado.rows[0], leaseId)
    },

    async renovarLease(input) {
      if (!eUuid(input.idPublico) || !eUuid(input.leaseId)) return null

      const resultado = await pool.query<LinhaSnapshotCiclo>(
        `
          WITH renovado AS (
            UPDATE snapshots
            SET ultima_atividade_em = $4::timestamptz,
                atualizado_em = $4::timestamptz,
                lease_expira_em = $5::timestamptz
            WHERE id_publico = $1::uuid
              AND tentativa = $2
              AND lease_id = $3::uuid
              AND estado = 'processando'
              AND lease_expira_em > $4::timestamptz
              AND $5::timestamptz > $4::timestamptz
            RETURNING *
          )
          SELECT ${selecaoSnapshot}
          FROM renovado s
          INNER JOIN repositorios r ON r.id = s.repositorio_id
        `,
        [input.idPublico, input.tentativa, input.leaseId, input.agora, input.leaseExpiraEm],
      )

      return resultado.rows[0] ? mapearSnapshot(resultado.rows[0]) : null
    },

    async atualizarEtapa(input) {
      if (!eUuid(input.idPublico) || !eUuid(input.leaseId)) return null

      const resultado = await pool.query<LinhaSnapshotCiclo>(
        `
          WITH atualizado AS (
            UPDATE snapshots
            SET etapa = $4,
                ultima_atividade_em = $5::timestamptz,
                atualizado_em = $5::timestamptz
            WHERE id_publico = $1::uuid
              AND tentativa = $2
              AND lease_id = $3::uuid
              AND estado = 'processando'
              AND lease_expira_em > $5::timestamptz
            RETURNING *
          )
          SELECT ${selecaoSnapshot}
          FROM atualizado s
          INNER JOIN repositorios r ON r.id = s.repositorio_id
        `,
        [input.idPublico, input.tentativa, input.leaseId, input.etapa, input.agora],
      )

      return resultado.rows[0] ? mapearSnapshot(resultado.rows[0]) : null
    },

    async registrarFalhaAgendamento(input) {
      if (!eUuid(input.idPublico)) return null

      const resultado = await pool.query<LinhaSnapshotCiclo>(
        `
          WITH atualizado AS (
            UPDATE snapshots
            SET estado = 'falha',
                ultima_atividade_em = $3::timestamptz,
                atualizado_em = $3::timestamptz,
                finalizado_em = $3::timestamptz,
                lease_id = NULL,
                lease_expira_em = NULL,
                erro_codigo = $4,
                erro_categoria = $5,
                erro_mensagem = $6,
                erro_detalhes = $7::jsonb,
                erro_em = $3::timestamptz
            WHERE id_publico = $1::uuid
              AND tentativa = $2
              AND estado = 'aguardando'
            RETURNING *
          )
          SELECT ${selecaoSnapshot}
          FROM atualizado s
          INNER JOIN repositorios r ON r.id = s.repositorio_id
        `,
        [
          input.idPublico,
          input.tentativa,
          input.agora,
          input.falha.codigo,
          input.falha.categoria,
          input.falha.mensagem,
          input.falha.detalhes ? JSON.stringify(input.falha.detalhes) : null,
        ],
      )

      return resultado.rows[0] ? mapearSnapshot(resultado.rows[0]) : null
    },

    async registrarFalhaProcessamento(input) {
      if (!eUuid(input.idPublico) || !eUuid(input.leaseId)) return null

      const resultado = await pool.query<LinhaSnapshotCiclo>(
        `
          WITH atualizado AS (
            UPDATE snapshots
            SET estado = 'falha',
                ultima_atividade_em = $4::timestamptz,
                atualizado_em = $4::timestamptz,
                finalizado_em = $4::timestamptz,
                lease_id = NULL,
                lease_expira_em = NULL,
                erro_codigo = $5,
                erro_categoria = $6,
                erro_mensagem = $7,
                erro_detalhes = $8::jsonb,
                erro_em = $4::timestamptz
            WHERE id_publico = $1::uuid
              AND tentativa = $2
              AND lease_id = $3::uuid
              AND estado = 'processando'
              AND lease_expira_em > $4::timestamptz
            RETURNING *
          )
          SELECT ${selecaoSnapshot}
          FROM atualizado s
          INNER JOIN repositorios r ON r.id = s.repositorio_id
        `,
        [
          input.idPublico,
          input.tentativa,
          input.leaseId,
          input.agora,
          input.falha.codigo,
          input.falha.categoria,
          input.falha.mensagem,
          input.falha.detalhes ? JSON.stringify(input.falha.detalhes) : null,
        ],
      )

      return resultado.rows[0] ? mapearSnapshot(resultado.rows[0]) : null
    },

    async iniciarNovaTentativa(input) {
      if (!eUuid(input.idPublico)) return null

      const resultado = await pool.query<LinhaSnapshotCiclo>(
        `
          WITH reiniciado AS (
            UPDATE snapshots
            SET estado = 'aguardando',
                etapa = NULL,
                tentativa = tentativa + 1,
                tentativa_iniciada_em = NULL,
                ultima_atividade_em = NULL,
                atualizado_em = $2::timestamptz,
                finalizado_em = NULL,
                lease_id = NULL,
                lease_expira_em = NULL,
                erro_codigo = NULL,
                erro_categoria = NULL,
                erro_mensagem = NULL,
                erro_detalhes = NULL,
                erro_em = NULL
            WHERE id_publico = $1::uuid
              AND estado = 'falha'
              AND tentativa = $3
            RETURNING *
          )
          SELECT ${selecaoSnapshot}
          FROM reiniciado s
          INNER JOIN repositorios r ON r.id = s.repositorio_id
        `,
        [input.idPublico, input.agora, input.tentativaEsperada],
      )

      return resultado.rows[0] ? mapearSnapshot(resultado.rows[0]) : null
    },

    async buscarSolicitacao(requestId) {
      if (!eUuid(requestId)) return null
      const resultado = await pool.query<LinhaSolicitacao>(
        `SELECT q.request_id::text, q.operacao, s.id_publico::text AS snapshot_id, q.url_normalizada,
                q.tentativa_esperada, q.tentativa_resultante, q.criado_em::text
           FROM solicitacoes_analise q JOIN snapshots s ON s.id=q.snapshot_id
          WHERE q.request_id = $1::uuid`,
        [requestId],
      )
      return resultado.rows[0] ? mapearSolicitacao(resultado.rows[0]) : null
    },

    async criarOuReutilizarComSolicitacao(input) {
      const cliente = await pool.connect()
      try {
        await cliente.query('BEGIN')
        await cliente.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.requestId])
        const solicitacaoExistente = await cliente.query<LinhaSolicitacao>(
          `SELECT q.request_id::text, q.operacao, s.id_publico::text AS snapshot_id, q.url_normalizada,
                  q.tentativa_esperada, q.tentativa_resultante, q.criado_em::text
             FROM solicitacoes_analise q JOIN snapshots s ON s.id=q.snapshot_id
            WHERE q.request_id=$1::uuid FOR UPDATE`, [input.requestId],
        )
        if (solicitacaoExistente.rows[0]) {
          const solicitacao = mapearSolicitacao(solicitacaoExistente.rows[0])
          const snapshot = await selecionarSnapshotCliente(cliente, solicitacao.snapshotId)
          await cliente.query('COMMIT')
          return { snapshot, solicitacao, publicar: false, resultado: solicitacao.operacao === 'criacao' && solicitacao.urlNormalizada === input.urlNormalizada ? 'repetida' as const : 'conflito' as const }
        }
        const repositorio = await cliente.query<{ id: string }>(
          `INSERT INTO repositorios (url, proprietario, nome) VALUES ($1, $2, $3)
           ON CONFLICT (url) DO UPDATE SET proprietario = EXCLUDED.proprietario, nome = EXCLUDED.nome
           RETURNING id::text AS id`,
          [input.repositorio.url, input.repositorio.proprietario, input.repositorio.nome],
        )
        const snapshotInserido = await cliente.query<{ id_publico: string }>(
          `INSERT INTO snapshots (repositorio_id, commit_sha, referencia, criado_em, atualizado_em)
           VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz)
           ON CONFLICT (repositorio_id, commit_sha) DO NOTHING
           RETURNING id_publico::text`,
          [repositorio.rows[0]?.id, input.commitSha, input.referencia, input.agora],
        )
        const idPublico = snapshotInserido.rows[0]?.id_publico ?? (await cliente.query<{ id_publico: string }>(
          `SELECT s.id_publico::text FROM snapshots s JOIN repositorios r ON r.id=s.repositorio_id
           WHERE r.url=$1 AND s.commit_sha=$2 FOR UPDATE`, [input.repositorio.url, input.commitSha],
        )).rows[0]?.id_publico
        const snapshot = await selecionarSnapshotCliente(cliente, idPublico)
        const solicitacaoAnterior = await cliente.query<{ existe: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM solicitacoes_analise q
            JOIN snapshots s ON s.id=q.snapshot_id WHERE s.id_publico=$1::uuid) AS existe`, [idPublico],
        )
        const insercao = await cliente.query<{ request_id: string }>(
          `INSERT INTO solicitacoes_analise
             (request_id, operacao, snapshot_id, url_normalizada, tentativa_resultante)
           VALUES ($1::uuid, 'criacao', (SELECT id FROM snapshots WHERE id_publico=$2::uuid), $3, $4)
           ON CONFLICT (request_id) DO NOTHING
           RETURNING request_id::text`,
          [input.requestId, idPublico, input.urlNormalizada, snapshot.tentativa],
        )
        if (insercao.rows[0]) {
          await cliente.query('COMMIT')
          const solicitacao = await buscarSolicitacaoCliente(cliente, input.requestId)
          if (!solicitacao) throw new Error('Solicitação não encontrada após inserção.')
          return { snapshot, solicitacao, publicar: snapshot.estado === 'aguardando' && !solicitacaoAnterior.rows[0]?.existe, resultado: 'criada' as const }
        }
        const existente = await cliente.query<LinhaSolicitacao>(
          `SELECT q.request_id::text, q.operacao, s.id_publico::text AS snapshot_id, q.url_normalizada,
                  q.tentativa_esperada, q.tentativa_resultante, q.criado_em::text
             FROM solicitacoes_analise q JOIN snapshots s ON s.id=q.snapshot_id
            WHERE q.request_id=$1::uuid`, [input.requestId],
        )
        await cliente.query('COMMIT')
        const solicitacao = mapearSolicitacao(existente.rows[0])
        return { snapshot, solicitacao, publicar: false, resultado: solicitacao.operacao === 'criacao' && solicitacao.urlNormalizada === input.urlNormalizada ? 'repetida' as const : 'conflito' as const }
      } catch (erro) {
        await cliente.query('ROLLBACK'); throw erro
      } finally { cliente.release() }
    },

    async iniciarNovaTentativaComSolicitacao(input) {
      const cliente = await pool.connect()
      try {
        await cliente.query('BEGIN')
        await cliente.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.requestId])
        const existente = await cliente.query<LinhaSolicitacao>(
          `SELECT q.request_id::text, q.operacao, s.id_publico::text AS snapshot_id, q.url_normalizada,
                  q.tentativa_esperada, q.tentativa_resultante, q.criado_em::text
             FROM solicitacoes_analise q JOIN snapshots s ON s.id=q.snapshot_id
            WHERE q.request_id=$1::uuid FOR UPDATE`, [input.requestId],
        )
        if (existente.rows[0]) {
          const solicitacao = mapearSolicitacao(existente.rows[0])
          const snapshot = await selecionarSnapshotCliente(cliente, solicitacao.snapshotId)
          await cliente.query('COMMIT')
          return { snapshot, solicitacao, publicar: false, resultado: solicitacao.operacao === 'retry' && solicitacao.snapshotId === input.idPublico && solicitacao.tentativaEsperada === input.tentativaEsperada ? 'repetida' as const : 'conflito' as const }
        }
        const atualizado = await cliente.query<LinhaSnapshotCiclo>(
          `WITH reiniciado AS (
             UPDATE snapshots SET estado='aguardando', etapa=NULL, tentativa=tentativa+1,
               tentativa_iniciada_em=NULL, ultima_atividade_em=NULL, atualizado_em=$2::timestamptz,
               finalizado_em=NULL, lease_id=NULL, lease_expira_em=NULL, erro_codigo=NULL,
               erro_categoria=NULL, erro_mensagem=NULL, erro_detalhes=NULL, erro_em=NULL
             WHERE id_publico=$1::uuid AND estado='falha' AND tentativa=$3 RETURNING *
           ) SELECT ${selecaoSnapshot} FROM reiniciado s JOIN repositorios r ON r.id=s.repositorio_id`,
          [input.idPublico, input.agora, input.tentativaEsperada],
        )
        if (!atualizado.rows[0]) { await cliente.query('ROLLBACK'); return { snapshot: null, solicitacao: null, publicar: false, resultado: 'tentativa_desatualizada' as const } }
        const snapshot = mapearSnapshot(atualizado.rows[0])
        await cliente.query<{ request_id: string }>(
          `INSERT INTO solicitacoes_analise (request_id, operacao, snapshot_id, tentativa_esperada, tentativa_resultante)
           VALUES ($1::uuid, 'retry', (SELECT id FROM snapshots WHERE id_publico=$2::uuid), $3, $4)
           RETURNING request_id::text`,
          [input.requestId, input.idPublico, input.tentativaEsperada, snapshot.tentativa],
        )
        await cliente.query('COMMIT')
        const solicitacao = await buscarSolicitacaoCliente(cliente, input.requestId)
        if (!solicitacao) throw new Error('Solicitação não encontrada após inserção.')
        return { snapshot, solicitacao, publicar: true, resultado: 'criada' as const }
      } catch (erro) { await cliente.query('ROLLBACK'); throw erro } finally { cliente.release() }
    },

    async obterResumoStatus(input) {
      if (!eUuid(input.idPublico)) return null
      const corte = new Date(Date.parse(input.agora) - input.limiteAguardandoMs).toISOString()
      const cliente = await pool.connect()
      try {
        await cliente.query('BEGIN')
        await cliente.query(
          `UPDATE snapshots SET estado='falha', ultima_atividade_em=$2::timestamptz,
             atualizado_em=$2::timestamptz, finalizado_em=$2::timestamptz,
             erro_codigo='AGENDAMENTO_INTERROMPIDO', erro_categoria='transitoria',
             erro_mensagem='Não foi possível iniciar o processamento desta análise.', erro_detalhes=NULL, erro_em=$2::timestamptz
           WHERE id_publico=$1::uuid AND estado='aguardando' AND atualizado_em <= $3::timestamptz`,
          [input.idPublico, input.agora, corte],
        )
        const resultado = await cliente.query<LinhaSnapshotCiclo & { arquivos: string; simbolos: string; exportacoes: string; relacoes: string; diagnosticos: string }>(
          `SELECT ${selecaoSnapshot},
             (SELECT COUNT(*) FROM arquivos_indice a WHERE a.snapshot_id=s.id) arquivos,
             (SELECT COUNT(*) FROM simbolos_indice x WHERE x.snapshot_id=s.id) simbolos,
             (SELECT COUNT(*) FROM exportacoes_indice x WHERE x.snapshot_id=s.id) exportacoes,
             (SELECT COUNT(*) FROM relacoes_importacao_indice x WHERE x.snapshot_id=s.id) relacoes,
             (SELECT COUNT(*) FROM diagnosticos_indice x WHERE x.snapshot_id=s.id) diagnosticos
           FROM snapshots s JOIN repositorios r ON r.id=s.repositorio_id WHERE s.id_publico=$1::uuid`, [input.idPublico],
        )
        await cliente.query('COMMIT')
        if (!resultado.rows[0]) return null
        const demorada = resultado.rows[0].estado === 'processando' &&
          resultado.rows[0].tentativa_iniciada_em !== null &&
          Date.parse(input.agora) - Date.parse(resultado.rows[0].tentativa_iniciada_em) >= input.limiteDemoradaMs
        return mapearResumoStatus(resultado.rows[0], demorada)
      } catch (erro) { await cliente.query('ROLLBACK'); throw erro } finally { cliente.release() }
    },
  }
}

async function selecionarSnapshotCliente(cliente: { query: Pool['query'] }, idPublico: string | undefined) {
  if (!idPublico) throw new Error('Snapshot não encontrado.')
  const resultado = await cliente.query<LinhaSnapshotCiclo>(`SELECT ${selecaoSnapshot} FROM snapshots s JOIN repositorios r ON r.id=s.repositorio_id WHERE s.id_publico=$1::uuid`, [idPublico])
  return mapearSnapshot(resultado.rows[0])
}

async function buscarSolicitacaoCliente(cliente: { query: Pool['query'] }, requestId: string) {
  const resultado = await cliente.query<LinhaSolicitacao>(
    `SELECT q.request_id::text, q.operacao, s.id_publico::text AS snapshot_id, q.url_normalizada,
            q.tentativa_esperada, q.tentativa_resultante, q.criado_em::text
       FROM solicitacoes_analise q JOIN snapshots s ON s.id=q.snapshot_id
      WHERE q.request_id=$1::uuid`, [requestId],
  )
  return resultado.rows[0] ? mapearSolicitacao(resultado.rows[0]) : null
}

function mapearSolicitacao(linha: LinhaSolicitacao): SolicitacaoAnalise {
  return { requestId: linha.request_id, operacao: linha.operacao, snapshotId: linha.snapshot_id, urlNormalizada: linha.url_normalizada, tentativaEsperada: linha.tentativa_esperada, tentativaResultante: linha.tentativa_resultante, criadoEm: linha.criado_em }
}

function mapearResumoStatus(linha: LinhaSnapshotCiclo & { arquivos: string; simbolos: string; exportacoes: string; relacoes: string; diagnosticos: string }, demorada: boolean): ResumoStatusAnalise {
  const snapshot = mapearSnapshot(linha)
  return {
    idPublico: snapshot.idPublico,
    repositorio: snapshot.repositorio,
    commitSha: snapshot.commitSha,
    referencia: snapshot.referencia,
    estado: snapshot.estado,
    etapa: snapshot.etapa,
    tentativa: snapshot.tentativa,
    tentativaIniciadaEm: snapshot.tentativaIniciadaEm,
    ultimaAtividadeEm: snapshot.ultimaAtividadeEm,
    atualizadoEm: snapshot.atualizadoEm,
    finalizadoEm: snapshot.finalizadoEm,
    demorada,
    falha: snapshot.falha,
    contagens: snapshot.estado === 'concluido' ? {
      arquivos: Number(linha.arquivos),
      simbolos: Number(linha.simbolos),
      exportacoes: Number(linha.exportacoes),
      relacoesImportacao: Number(linha.relacoes),
      diagnosticos: Number(linha.diagnosticos),
    } : null,
  }
}

function mapearResultadoAquisicao(
  linha: LinhaResultadoAquisicao | undefined,
  leaseId: string,
): ResultadoAquisicaoProcessamento {
  if (!linha) return { tipo: 'inexistente' }
  if (linha.resultado !== 'adquirido') return { tipo: linha.resultado }

  const snapshot = mapearSnapshot(linha)
  if (!snapshot.leaseExpiraEm) {
    throw new Error('Aquisição retornou um snapshot sem expiração de lease.')
  }

  return {
    tipo: 'adquirido',
    snapshot,
    lease: {
      id: leaseId,
      expiraEm: snapshot.leaseExpiraEm,
    },
  }
}

function mapearSnapshot(linha: LinhaSnapshotCiclo | undefined): SnapshotCicloVidaAnalise {
  if (!linha) throw new Error('Snapshot não encontrado após operação atômica.')

  const falha: FalhaAnalise | null = linha.erro_codigo
    ? {
        codigo: linha.erro_codigo,
        categoria: linha.erro_categoria ?? 'transitoria',
        mensagem: linha.erro_mensagem ?? '',
        detalhes: linha.erro_detalhes,
        ocorridoEm: linha.erro_em ?? linha.atualizado_em,
      }
    : null

  return {
    idPublico: linha.id_publico,
    repositorio: {
      url: linha.repositorio_url,
      proprietario: linha.proprietario,
      nome: linha.nome,
    },
    commitSha: linha.commit_sha,
    referencia: linha.referencia,
    estado: linha.estado,
    etapa: linha.etapa,
    tentativa: linha.tentativa,
    tentativaIniciadaEm: linha.tentativa_iniciada_em,
    ultimaAtividadeEm: linha.ultima_atividade_em,
    atualizadoEm: linha.atualizado_em,
    finalizadoEm: linha.finalizado_em,
    leaseId: linha.lease_id,
    leaseExpiraEm: linha.lease_expira_em,
    falha,
  }
}

function eUuid(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}
