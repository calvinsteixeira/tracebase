import type { Pool } from 'pg'

import type { CodigoDiagnostico, TipoArquivoFonte } from '../../analises.types'
import type { RepositorioLeituraExploracao } from '../exploracao-analise'

interface LinhaArquivo {
  caminho: string
  linguagem: TipoArquivoFonte
}

interface LinhaRelacao {
  caminho: string
  quantidade: string
}

interface LinhaArquivoSelecionado extends LinhaArquivo {
  arquivo_id: string
}

interface LinhaLimitacao {
  codigo: CodigoDiagnostico
  categoria: 'sintaxe' | 'limitacao'
}

export function criarRepositorioLeituraExploracaoPostgres(pool: Pool): RepositorioLeituraExploracao {
  return {
    async obterArquivosSnapshotConcluido(snapshotId) {
      const snapshot = await obterIndiceSnapshotConcluido(pool, snapshotId)
      if (!snapshot) return null

      const resultado = await pool.query<LinhaArquivo>(
        `SELECT caminho, tipo AS linguagem FROM arquivos_indice WHERE snapshot_id = $1::bigint ORDER BY caminho`,
        [snapshot],
      )
      return resultado.rows
    },

    async obterRelacoesArquivoSnapshotConcluido(snapshotId, caminho) {
      const snapshot = await obterIndiceSnapshotConcluido(pool, snapshotId)
      if (!snapshot) return null

      const arquivoResultado = await pool.query<LinhaArquivoSelecionado>(
        `SELECT id_fato AS arquivo_id, caminho, tipo AS linguagem FROM arquivos_indice WHERE snapshot_id = $1::bigint AND caminho = $2`,
        [snapshot, caminho],
      )
      const arquivo = arquivoResultado.rows[0]
      if (!arquivo) return null

      const [importa, importadoPor, limitacoes] = await Promise.all([
        pool.query<LinhaRelacao>(
          `
            SELECT destino.caminho, COUNT(*)::text AS quantidade
            FROM relacoes_importacao_indice relacao
            INNER JOIN arquivos_indice origem
              ON origem.snapshot_id = relacao.snapshot_id AND origem.id_fato = relacao.arquivo_origem_id
            INNER JOIN arquivos_indice destino
              ON destino.snapshot_id = relacao.snapshot_id AND destino.caminho = relacao.destino_caminho
            WHERE relacao.snapshot_id = $1::bigint
              AND origem.caminho = $2
              AND relacao.destino_tipo = 'interno'
            GROUP BY destino.caminho
            ORDER BY destino.caminho
          `,
          [snapshot, caminho],
        ),
        pool.query<LinhaRelacao>(
          `
            SELECT origem.caminho, COUNT(*)::text AS quantidade
            FROM relacoes_importacao_indice relacao
            INNER JOIN arquivos_indice origem
              ON origem.snapshot_id = relacao.snapshot_id AND origem.id_fato = relacao.arquivo_origem_id
            INNER JOIN arquivos_indice destino
              ON destino.snapshot_id = relacao.snapshot_id AND destino.caminho = relacao.destino_caminho
            WHERE relacao.snapshot_id = $1::bigint
              AND destino.caminho = $2
              AND relacao.destino_tipo = 'interno'
            GROUP BY origem.caminho
            ORDER BY origem.caminho
          `,
          [snapshot, caminho],
        ),
        pool.query<LinhaLimitacao>(
          `
            SELECT codigo, categoria
            FROM diagnosticos_indice diagnostico
            INNER JOIN arquivos_indice arquivo
              ON arquivo.snapshot_id = diagnostico.snapshot_id AND arquivo.id_fato = diagnostico.arquivo_origem_id
            WHERE diagnostico.snapshot_id = $1::bigint AND arquivo.caminho = $2
            ORDER BY diagnostico.id
          `,
          [snapshot, caminho],
        ),
      ])

      return {
        arquivo: { caminho: arquivo.caminho, linguagem: arquivo.linguagem },
        importa: importa.rows.map(mapearRelacao),
        importadoPor: importadoPor.rows.map(mapearRelacao),
        limitacoes: limitacoes.rows,
      }
    },
  }
}

async function obterIndiceSnapshotConcluido(pool: Pool, snapshotId: string): Promise<string | null> {
  const resultado = await pool.query<{ indice_id: string }>(
    `
      SELECT snapshot.id::text AS indice_id
      FROM snapshots snapshot
      INNER JOIN indices_estruturais indice ON indice.snapshot_id = snapshot.id
      WHERE snapshot.id_publico = $1::uuid AND snapshot.estado = 'concluido'
    `,
    [snapshotId],
  )
  return resultado.rows[0]?.indice_id ?? null
}

function mapearRelacao(linha: LinhaRelacao) {
  return { caminho: linha.caminho, quantidadeImports: Number(linha.quantidade) }
}
