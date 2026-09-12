import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { criarCicloVidaAnalisePostgres } from './ciclo-vida-analise-postgres'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://tracebase:tracebase_local@localhost:5432/tracebase?sslmode=disable'
const pool = new Pool({ connectionString: databaseUrl })
const repositorio = criarCicloVidaAnalisePostgres(pool)
const url = 'https://github.com/tracebase/ciclo-vida-integracao'
const base = {
  repositorio: {
    url,
    proprietario: 'Tracebase',
    nome: 'Ciclo-Vida-Integracao',
  },
  commitSha: 'd'.repeat(40),
  referencia: 'main',
  agora: '2026-09-12T13:00:00.000Z',
}

beforeAll(async () => {
  const tabelas = await pool.query<{ snapshots: string | null }>(
    `SELECT to_regclass('public.snapshots') AS snapshots`,
  )

  expect(tabelas.rows[0]?.snapshots).toBe('snapshots')
})

afterAll(async () => {
  await pool.query('DELETE FROM repositorios WHERE url = $1', [url])
  await pool.end()
})

describe('ciclo de vida da análise PostgreSQL', () => {
  it('cria ou reutiliza atomicamente um snapshot público por repositório e commit', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 12 }, (_, indice) =>
        repositorio.criarOuReutilizar({
          ...base,
          referencia: indice % 2 === 0 ? 'main' : 'trunk',
        }),
      ),
    )
    const ids = new Set(resultados.map((resultado) => resultado.idPublico))
    const uuid = resultados[0]?.idPublico

    expect(ids.size).toBe(1)
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(uuid).not.toBe('1')

    const contagem = await pool.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM snapshots s
        INNER JOIN repositorios r ON r.id = s.repositorio_id
        WHERE r.url = $1 AND s.commit_sha = $2
      `,
      [url, base.commitSha],
    )
    expect(contagem.rows[0]?.total).toBe('1')
  })

  it('registra falha de agendamento somente na tentativa atual ainda aguardando', async () => {
    const criado = await repositorio.criarOuReutilizar({
      ...base,
      commitSha: 'a'.repeat(40),
    })

    await expect(
      repositorio.registrarFalhaAgendamento({
        idPublico: criado.idPublico,
        tentativa: 0,
        agora: '2026-09-12T13:00:01.000Z',
        falha: {
          codigo: 'FONTE_INDISPONIVEL',
          categoria: 'transitoria',
          mensagem: 'A fila não aceitou o agendamento.',
        },
      }),
    ).resolves.toBeNull()

    const falhou = await repositorio.registrarFalhaAgendamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T13:00:02.000Z',
      falha: {
        codigo: 'FONTE_INDISPONIVEL',
        categoria: 'transitoria',
        mensagem: 'A fila não aceitou o agendamento.',
      },
    })

    expect(falhou).toMatchObject({
      estado: 'falha',
      tentativa: 1,
      leaseId: null,
      falha: { codigo: 'FONTE_INDISPONIVEL' },
    })
    expect(
      await repositorio.adquirirProcessamento({
        idPublico: criado.idPublico,
        tentativa: 1,
        agora: '2026-09-12T13:00:03.000Z',
        leaseExpiraEm: '2026-09-12T13:01:00.000Z',
      }),
    ).toBeNull()
  })

  it('resolve a concorrência entre aquisição e falha de agendamento com um único vencedor', async () => {
    const criado = await repositorio.criarOuReutilizar({
      ...base,
      commitSha: 'b'.repeat(40),
    })
    const [adquirido, falhou] = await Promise.all([
      repositorio.adquirirProcessamento({
        idPublico: criado.idPublico,
        tentativa: 1,
        agora: '2026-09-12T13:05:00.000Z',
        leaseExpiraEm: '2026-09-12T13:06:00.000Z',
      }),
      repositorio.registrarFalhaAgendamento({
        idPublico: criado.idPublico,
        tentativa: 1,
        agora: '2026-09-12T13:05:00.000Z',
        falha: {
          codigo: 'FONTE_INDISPONIVEL',
          categoria: 'transitoria',
          mensagem: 'A fila não aceitou o agendamento.',
        },
      }),
    ])

    expect([adquirido, falhou].filter(Boolean)).toHaveLength(1)
    const estado = await repositorio.buscarPorIdPublico(criado.idPublico)

    if (adquirido) {
      expect(falhou).toBeNull()
      expect(estado).toMatchObject({ estado: 'processando', leaseId: adquirido.leaseId })
    } else {
      expect(falhou).toMatchObject({ estado: 'falha', leaseId: null })
      expect(estado).toMatchObject({ estado: 'falha', falha: { codigo: 'FONTE_INDISPONIVEL' } })
    }
  })

  it('permite uma única aquisição, bloqueia lease válido e assume lease expirado', async () => {
    const criado = await repositorio.criarOuReutilizar(base)
    const resultados = await Promise.all(
      Array.from({ length: 2 }, () =>
        repositorio.adquirirProcessamento({
          idPublico: criado.idPublico,
          tentativa: 1,
          agora: '2026-09-12T13:00:10.000Z',
          leaseExpiraEm: '2026-09-12T13:01:00.000Z',
        }),
      ),
    )
    const adquiridos = resultados.filter((resultado) => resultado !== null)

    expect(adquiridos).toHaveLength(1)
    expect(
      await repositorio.adquirirProcessamento({
        idPublico: criado.idPublico,
        tentativa: 1,
        agora: '2026-09-12T13:00:30.000Z',
        leaseExpiraEm: '2026-09-12T13:02:00.000Z',
      }),
    ).toBeNull()

    const reassumido = await repositorio.adquirirProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T13:02:00.000Z',
      leaseExpiraEm: '2026-09-12T13:03:00.000Z',
    })

    expect(reassumido?.leaseId).toBeTruthy()
    expect(reassumido?.leaseId).not.toBe(adquiridos[0]?.leaseId)
  })

  it('recusa tentativa anterior e lease antigo nas operações de atividade', async () => {
    const criado = await repositorio.criarOuReutilizar({
      ...base,
      commitSha: 'e'.repeat(40),
    })
    const antigo = await repositorio.adquirirProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T13:10:00.000Z',
      leaseExpiraEm: '2026-09-12T13:11:00.000Z',
    })
    const atual = await repositorio.adquirirProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T13:12:00.000Z',
      leaseExpiraEm: '2026-09-12T13:13:00.000Z',
    })

    expect(antigo?.leaseId).not.toBe(atual?.leaseId)
    await expect(
      repositorio.renovarLease({
        idPublico: criado.idPublico,
        tentativa: 1,
        leaseId: antigo?.leaseId ?? '',
        agora: '2026-09-12T13:12:10.000Z',
        leaseExpiraEm: '2026-09-12T13:14:00.000Z',
      }),
    ).resolves.toBeNull()
    await expect(
      repositorio.atualizarEtapa({
        idPublico: criado.idPublico,
        tentativa: 1,
        leaseId: antigo?.leaseId ?? '',
        etapa: 'indexacao',
        agora: '2026-09-12T13:12:10.000Z',
      }),
    ).resolves.toBeNull()
    await expect(
      repositorio.registrarFalhaProcessamento({
        idPublico: criado.idPublico,
        tentativa: 1,
        leaseId: antigo?.leaseId ?? '',
        agora: '2026-09-12T13:12:10.000Z',
        falha: {
          codigo: 'ERRO_INTERNO',
          categoria: 'transitoria',
          mensagem: 'falha antiga',
          detalhes: { tentativa: 1 },
        },
      }),
    ).resolves.toBeNull()
    expect(
      await repositorio.adquirirProcessamento({
        idPublico: criado.idPublico,
        tentativa: 0,
        agora: '2026-09-12T13:12:10.000Z',
        leaseExpiraEm: '2026-09-12T13:14:00.000Z',
      }),
    ).toBeNull()
  })

  it('persiste falha segura, permite uma retomada manual e não readquire concluído', async () => {
    const criado = await repositorio.criarOuReutilizar({
      ...base,
      commitSha: 'f'.repeat(40),
    })
    const adquirido = await repositorio.adquirirProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T13:20:00.000Z',
      leaseExpiraEm: '2026-09-12T13:21:00.000Z',
    })
    const falhou = await repositorio.registrarFalhaProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      leaseId: adquirido?.leaseId ?? '',
      agora: '2026-09-12T13:20:30.000Z',
      falha: {
        codigo: 'FONTE_INDISPONIVEL',
        categoria: 'transitoria',
        mensagem: 'Não foi possível obter os dados do repositório.',
        detalhes: { recurso: 'github', status: 503 },
      },
    })

    expect(falhou).toMatchObject({
      estado: 'falha',
      leaseId: null,
      leaseExpiraEm: null,
      falha: {
        codigo: 'FONTE_INDISPONIVEL',
        categoria: 'transitoria',
        detalhes: { recurso: 'github', status: 503 },
      },
    })
    expect(falhou).not.toHaveProperty('stack')
    expect(falhou).not.toHaveProperty('conteudoFonte')

    const tentativas = await Promise.all(
      Array.from({ length: 2 }, () =>
        repositorio.iniciarNovaTentativa({
          idPublico: criado.idPublico,
          agora: '2026-09-12T13:21:00.000Z',
        }),
      ),
    )
    expect(tentativas.filter((tentativa) => tentativa !== null)).toHaveLength(1)
    expect(tentativas.find((tentativa) => tentativa !== null)).toMatchObject({
      estado: 'aguardando',
      tentativa: 2,
      etapa: null,
      falha: null,
      leaseId: null,
    })

    await pool.query(
      `
        UPDATE snapshots
        SET estado = 'concluido',
            etapa = 'persistencia',
            atualizado_em = $2::timestamptz,
            finalizado_em = $2::timestamptz
        WHERE id_publico = $1::uuid
      `,
      [criado.idPublico, '2026-09-12T13:22:00.000Z'],
    )

    expect(
      await repositorio.adquirirProcessamento({
        idPublico: criado.idPublico,
        tentativa: 2,
        agora: '2026-09-12T13:22:01.000Z',
        leaseExpiraEm: '2026-09-12T13:23:00.000Z',
      }),
    ).toBeNull()
  })
})
