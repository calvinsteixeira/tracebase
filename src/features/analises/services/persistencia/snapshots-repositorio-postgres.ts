import type { Pool } from 'pg'

import type {
  RepositorioSnapshots,
  SnapshotParaPersistir,
  SnapshotPersistido,
} from './snapshots-repositorio'

interface LinhaRepositorio {
  id: string
}

interface LinhaSnapshot {
  id: string
  criado_em: Date
}

export function criarRepositorioSnapshotsPostgres(pool: Pool): RepositorioSnapshots {
  return {
    async salvar(snapshot) {
      const cliente = await pool.connect()

      try {
        await cliente.query('BEGIN')

        const repositorio = await cliente.query<LinhaRepositorio>(
          `
            INSERT INTO repositorios (url, proprietario, nome)
            VALUES ($1, $2, $3)
            ON CONFLICT (url) DO UPDATE
              SET proprietario = EXCLUDED.proprietario,
                  nome = EXCLUDED.nome
            RETURNING id::text AS id
          `,
          [
            snapshot.repositorio.url,
            snapshot.repositorio.proprietario,
            snapshot.repositorio.nome,
          ],
        )

        const resultado = await cliente.query<LinhaSnapshot>(
          `
            INSERT INTO snapshots (repositorio_id, commit_sha, referencia)
            VALUES ($1, $2, $3)
            ON CONFLICT (repositorio_id, commit_sha) DO UPDATE
              SET referencia = EXCLUDED.referencia
            RETURNING id::text AS id, criado_em
          `,
          [repositorio.rows[0].id, snapshot.snapshot.commitSha, snapshot.snapshot.referencia],
        )

        await cliente.query('COMMIT')
        return mapearSnapshotPersistido(snapshot, resultado.rows[0])
      } catch (erro) {
        await cliente.query('ROLLBACK')
        throw erro
      } finally {
        cliente.release()
      }
    },

    async buscarPorRepositorioECommit(repositorio, commitSha) {
      const resultado = await pool.query<
        LinhaSnapshot & {
          repositorio_url: string
          proprietario: string
          nome: string
          referencia: string
        }
      >(
        `
          SELECT
            s.id::text AS id,
            s.criado_em,
            s.referencia,
            r.url AS repositorio_url,
            r.proprietario,
            r.nome
          FROM snapshots s
          INNER JOIN repositorios r ON r.id = s.repositorio_id
          WHERE LOWER(r.proprietario) = LOWER($1)
            AND LOWER(r.nome) = LOWER($2)
            AND s.commit_sha = $3
        `,
        [repositorio.proprietario, repositorio.nome, commitSha],
      )
      const linha = resultado.rows[0]

      if (!linha) return null

      return {
        repositorio: {
          url: linha.repositorio_url,
          proprietario: linha.proprietario,
          nome: linha.nome,
        },
        snapshot: {
          commitSha,
          referencia: linha.referencia,
        },
        id: linha.id,
        criadoEm: linha.criado_em.toISOString(),
      }
    },
  }
}

function mapearSnapshotPersistido(
  snapshot: SnapshotParaPersistir,
  linha: LinhaSnapshot,
): SnapshotPersistido {
  return {
    ...snapshot,
    id: linha.id,
    criadoEm: linha.criado_em.toISOString(),
    repositorio: {
      ...snapshot.repositorio,
      url: snapshot.repositorio.url,
    },
  }
}
