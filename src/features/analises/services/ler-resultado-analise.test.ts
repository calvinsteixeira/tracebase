import { describe, expect, it, vi } from 'vitest'

import { lerResultadoAnalise } from './ler-resultado-analise'

const resumo = {
  idPublico: '11111111-1111-4111-8111-111111111111',
  repositorio: { url: 'https://github.com/dono/projeto', proprietario: 'dono', nome: 'projeto' },
  commitSha: 'a'.repeat(40),
  referencia: 'main',
  estado: 'concluido' as const,
  etapa: 'persistencia' as const,
  tentativa: 1,
  tentativaIniciadaEm: '2026-09-17T10:00:00.000Z',
  ultimaAtividadeEm: '2026-09-17T10:01:00.000Z',
  atualizadoEm: '2026-09-17T10:01:00.000Z',
  finalizadoEm: '2026-09-17T10:01:00.000Z',
  demorada: false,
  falha: null,
  contagens: { arquivos: 2, simbolos: 1, exportacoes: 1, relacoesImportacao: 0, diagnosticos: 0 },
}

describe('lerResultadoAnalise', () => {
  it('devolve a visão segura de um snapshot existente', async () => {
    const obterResumoStatus = vi.fn().mockResolvedValue({ ...resumo, falha: { codigo: 'ERRO_INTERNO', categoria: 'transitoria', mensagem: 'token secreto', detalhes: { stack: 'stack secreto' }, ocorridoEm: resumo.atualizadoEm } })

    await expect(lerResultadoAnalise(resumo.idPublico, { repositorio: { obterResumoStatus } })).resolves.toEqual({
      idPublico: resumo.idPublico,
      repositorio: { proprietario: 'dono', nome: 'projeto' },
      referencia: 'main',
      commitSha: resumo.commitSha,
      estado: 'concluido',
      falhaCodigo: 'ERRO_INTERNO',
      atualizadoEm: resumo.atualizadoEm,
      contagens: resumo.contagens,
    })
    const visao = await lerResultadoAnalise(resumo.idPublico, { repositorio: { obterResumoStatus } })
    expect(JSON.stringify(visao)).not.toContain('token secreto')
    expect(JSON.stringify(visao)).not.toContain('stack secreto')
    expect(obterResumoStatus).toHaveBeenCalledWith(expect.objectContaining({ idPublico: resumo.idPublico }))
  })

  it('devolve nulo para identificador inválido ou snapshot inexistente', async () => {
    const obterResumoStatus = vi.fn().mockResolvedValue(null)
    const dependencias = { repositorio: { obterResumoStatus } }

    await expect(lerResultadoAnalise('nao-e-uuid', dependencias)).resolves.toBeNull()
    await expect(lerResultadoAnalise(resumo.idPublico, dependencias)).resolves.toBeNull()
    expect(obterResumoStatus).toHaveBeenCalledTimes(1)
  })

  it('usa os limites configurados pela política compartilhada', async () => {
    vi.stubEnv('TRACEBASE_SCHEDULE_TIMEOUT_MS', '1234')
    vi.stubEnv('TRACEBASE_SLOW_ANALYSIS_MS', '5678')
    const obterResumoStatus = vi.fn().mockResolvedValue(resumo)

    await lerResultadoAnalise(resumo.idPublico, { repositorio: { obterResumoStatus } })

    expect(obterResumoStatus).toHaveBeenCalledWith(expect.objectContaining({
      limiteAguardandoMs: 1234,
      limiteDemoradaMs: 5678,
    }))
    vi.unstubAllEnvs()
  })
})
