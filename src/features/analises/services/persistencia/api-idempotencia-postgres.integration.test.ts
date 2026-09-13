import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { criarCicloVidaAnalisePostgres } from './ciclo-vida-analise-postgres'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://tracebase:tracebase_local@localhost:5432/tracebase?sslmode=disable',
})
const ciclo = criarCicloVidaAnalisePostgres(pool)
const url = 'https://github.com/tracebase/api-idempotencia-integracao'
const base = {
  repositorio: { url, proprietario: 'tracebase', nome: 'api-idempotencia-integracao' },
  commitSha: 'f'.repeat(40), referencia: 'main', agora: '2026-09-12T18:00:00.000Z',
}

beforeAll(async () => {
  const resultado = await pool.query<{ tabela: string | null }>(`SELECT to_regclass('public.solicitacoes_analise') AS tabela`)
  expect(resultado.rows[0]?.tabela).toBe('solicitacoes_analise')
})

afterAll(async () => {
  await pool.query('DELETE FROM repositorios WHERE url = $1', [url])
  await pool.end()
})

describe('idempotência da API no PostgreSQL', () => {
  it('decide uma única criação para chamadas concorrentes com o mesmo requestId', async () => {
    const entradas = Array.from({ length: 8 }, () => ciclo.criarOuReutilizarComSolicitacao({
      ...base, requestId: '77777777-7777-4777-8777-777777777777', urlNormalizada: url,
    }))
    const resultados = await Promise.all(entradas)
    const ids = new Set(resultados.map((resultado) => resultado?.snapshot.idPublico))

    expect(ids.size).toBe(1)
    expect(resultados.filter((resultado) => resultado?.resultado === 'criada')).toHaveLength(1)
    const contagem = await pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM solicitacoes_analise WHERE request_id = $1::uuid`, ['77777777-7777-4777-8777-777777777777'])
    expect(contagem.rows[0]?.total).toBe('1')
  })

  it('não incrementa duas vezes uma nova tentativa concorrente', async () => {
    const criado = await ciclo.criarOuReutilizar({ ...base, commitSha: 'e'.repeat(40) })
    await ciclo.registrarFalhaAgendamento({
      idPublico: criado.idPublico, tentativa: 1, agora: base.agora,
      falha: { codigo: 'PUBLICACAO_RECUSADA', categoria: 'transitoria', mensagem: 'fila recusou' },
    })
    const resultados = await Promise.all([
      ciclo.iniciarNovaTentativaComSolicitacao({ requestId: '88888888-8888-4888-8888-888888888888', idPublico: criado.idPublico, tentativaEsperada: 1, agora: '2026-09-12T18:00:01.000Z' }),
      ciclo.iniciarNovaTentativaComSolicitacao({ requestId: '99999999-9999-4999-8999-999999999999', idPublico: criado.idPublico, tentativaEsperada: 1, agora: '2026-09-12T18:00:01.000Z' }),
    ])
    const snapshot = await ciclo.buscarPorIdPublico(criado.idPublico)

    expect(resultados.filter((resultado) => resultado?.resultado === 'criada')).toHaveLength(1)
    expect(snapshot?.tentativa).toBe(2)
  })

  it('marca espera sem atividade como falha recuperável e retorna apenas o resumo', async () => {
    const criado = await ciclo.criarOuReutilizar({ ...base, commitSha: 'd'.repeat(40) })
    const antes = await ciclo.obterResumoStatus({ idPublico: criado.idPublico, agora: '2026-09-12T18:00:30.000Z', limiteAguardandoMs: 60_000, limiteDemoradaMs: 30_000 })
    expect(antes?.estado).toBe('aguardando')
    const resumo = await ciclo.obterResumoStatus({ idPublico: criado.idPublico, agora: '2026-09-12T18:01:01.000Z', limiteAguardandoMs: 60_000, limiteDemoradaMs: 30_000 })

    expect(resumo).toMatchObject({ estado: 'falha', demorada: false, falha: { codigo: 'AGENDAMENTO_INTERROMPIDO' } })
    expect(resumo).not.toHaveProperty('leaseId')
    expect(resumo).not.toHaveProperty('indice')
  })

  it('sinaliza processamento demorado desde o início mesmo após heartbeat', async () => {
    const criado = await ciclo.criarOuReutilizar({ ...base, commitSha: '1'.repeat(40), agora: '2026-09-12T20:00:00.000Z' })
    const adquirido = await ciclo.adquirirProcessamento({ idPublico: criado.idPublico, tentativa: 1, agora: '2026-09-12T20:00:00.000Z', leaseExpiraEm: '2026-09-12T20:02:00.000Z' })
    if (adquirido.tipo !== 'adquirido') throw new Error('A análise deveria ser adquirida.')
    await ciclo.renovarLease({ idPublico: criado.idPublico, tentativa: 1, leaseId: adquirido.lease.id, agora: '2026-09-12T20:00:20.000Z', leaseExpiraEm: '2026-09-12T20:02:20.000Z' })

    const resumo = await ciclo.obterResumoStatus({ idPublico: criado.idPublico, agora: '2026-09-12T20:00:31.000Z', limiteAguardandoMs: 60_000, limiteDemoradaMs: 30_000 })

    expect(resumo).toMatchObject({ estado: 'processando', demorada: true })
  })
})
