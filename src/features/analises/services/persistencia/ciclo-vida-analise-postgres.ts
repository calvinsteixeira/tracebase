import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'

import type {
  DetalhesFalhaAnalise,
  FalhaAnalise,
  RepositorioCicloVidaAnalise,
  ResultadoAquisicaoProcessamento,
  SnapshotCicloVidaAnalise,
} from './ciclo-vida-analise'

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

export function criarCicloVidaAnalisePostgres(pool: Pool): RepositorioCicloVidaAnalise {
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
