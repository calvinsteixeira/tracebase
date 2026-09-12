import { describe, expect, it } from 'vitest'

import type { DadosSnapshotAnalise } from './ciclo-vida-analise'
import { criarCicloVidaAnaliseEmMemoria } from './ciclo-vida-analise-memoria'

const base: DadosSnapshotAnalise = {
  repositorio: {
    url: 'https://github.com/tracebase/exemplo',
    proprietario: 'Tracebase',
    nome: 'Exemplo',
  },
  commitSha: 'a'.repeat(40),
  referencia: 'main',
  agora: '2026-09-12T12:00:00.000Z',
}

const expiracaoInicial = '2026-09-12T12:01:00.000Z'

describe('ciclo de vida da análise em memória', () => {
  it('cria snapshot com UUID público imprevisível e reutiliza por repositório e commit', async () => {
    const repositorio = criarCicloVidaAnaliseEmMemoria()

    const primeiro = await repositorio.criarOuReutilizar(base)
    const reutilizado = await repositorio.criarOuReutilizar({
      ...base,
      referencia: 'develop',
      agora: '2026-09-12T12:00:01.000Z',
    })
    const outroCommit = await repositorio.criarOuReutilizar({
      ...base,
      commitSha: 'b'.repeat(40),
    })

    expect(primeiro.idPublico).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(primeiro.idPublico).not.toBe('1')
    expect(reutilizado).toEqual(primeiro)
    expect(outroCommit.idPublico).not.toBe(primeiro.idPublico)
    expect(await repositorio.buscarPorIdPublico(primeiro.idPublico)).toEqual(primeiro)
    expect(reutilizado).not.toHaveProperty('idInterno')
  })

  it('resolve criações concorrentes no mesmo snapshot para um único registro', async () => {
    const repositorio = criarCicloVidaAnaliseEmMemoria()

    const resultados = await Promise.all(
      Array.from({ length: 20 }, () => repositorio.criarOuReutilizar(base)),
    )

    expect(new Set(resultados.map((resultado) => resultado.idPublico)).size).toBe(1)
  })

  it('registra falha de agendamento somente na tentativa atual ainda aguardando', async () => {
    const repositorio = criarCicloVidaAnaliseEmMemoria()
    const criado = await repositorio.criarOuReutilizar({
      ...base,
      commitSha: 'b'.repeat(40),
    })

    await expect(
      repositorio.registrarFalhaAgendamento({
        idPublico: criado.idPublico,
        tentativa: 0,
        agora: '2026-09-12T12:00:01.000Z',
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
      agora: '2026-09-12T12:00:02.000Z',
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
        agora: '2026-09-12T12:00:03.000Z',
        leaseExpiraEm: expiracaoInicial,
      }),
    ).toBeNull()
  })

  it('faz aquisição e falha de agendamento concorrerem com um único vencedor', async () => {
    const repositorio = criarCicloVidaAnaliseEmMemoria()
    const adquiridoPrimeiro = await repositorio.criarOuReutilizar({
      ...base,
      commitSha: 'c'.repeat(40),
    })
    const resultadosComAquisiçãoPrimeiro = await Promise.all([
      repositorio.adquirirProcessamento({
        idPublico: adquiridoPrimeiro.idPublico,
        tentativa: 1,
        agora: '2026-09-12T12:00:10.000Z',
        leaseExpiraEm: expiracaoInicial,
      }),
      repositorio.registrarFalhaAgendamento({
        idPublico: adquiridoPrimeiro.idPublico,
        tentativa: 1,
        agora: '2026-09-12T12:00:10.000Z',
        falha: {
          codigo: 'FONTE_INDISPONIVEL',
          categoria: 'transitoria',
          mensagem: 'A fila não aceitou o agendamento.',
        },
      }),
    ])

    expect(resultadosComAquisiçãoPrimeiro.filter(Boolean)).toHaveLength(1)
    expect((await repositorio.buscarPorIdPublico(adquiridoPrimeiro.idPublico))?.estado).toBe(
      'processando',
    )

    const falhaPrimeiro = await repositorio.criarOuReutilizar({
      ...base,
      commitSha: 'd'.repeat(40),
    })
    const resultadosComFalhaPrimeiro = await Promise.all([
      repositorio.registrarFalhaAgendamento({
        idPublico: falhaPrimeiro.idPublico,
        tentativa: 1,
        agora: '2026-09-12T12:00:10.000Z',
        falha: {
          codigo: 'FONTE_INDISPONIVEL',
          categoria: 'transitoria',
          mensagem: 'A fila não aceitou o agendamento.',
        },
      }),
      repositorio.adquirirProcessamento({
        idPublico: falhaPrimeiro.idPublico,
        tentativa: 1,
        agora: '2026-09-12T12:00:10.000Z',
        leaseExpiraEm: expiracaoInicial,
      }),
    ])

    expect(resultadosComFalhaPrimeiro.filter(Boolean)).toHaveLength(1)
    expect((await repositorio.buscarPorIdPublico(falhaPrimeiro.idPublico))?.estado).toBe('falha')
  })

  it('permite somente um consumidor na aquisição concorrente da tentativa atual', async () => {
    const repositorio = criarCicloVidaAnaliseEmMemoria()
    const criado = await repositorio.criarOuReutilizar(base)

    const resultados = await Promise.all(
      Array.from({ length: 2 }, () =>
        repositorio.adquirirProcessamento({
          idPublico: criado.idPublico,
          tentativa: 1,
          agora: '2026-09-12T12:00:10.000Z',
          leaseExpiraEm: expiracaoInicial,
        }),
      ),
    )
    const adquiridos = resultados.filter((resultado) => resultado !== null)

    expect(adquiridos).toHaveLength(1)
    expect(adquiridos[0]).toMatchObject({
      estado: 'processando',
      etapa: 'preparacao',
      tentativa: 1,
    })
  })

  it('bloqueia lease válido e permite assumir lease vencido', async () => {
    const repositorio = criarCicloVidaAnaliseEmMemoria()
    const criado = await repositorio.criarOuReutilizar(base)
    const adquirido = await repositorio.adquirirProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T12:00:10.000Z',
      leaseExpiraEm: expiracaoInicial,
    })

    await expect(
      repositorio.adquirirProcessamento({
        idPublico: criado.idPublico,
        tentativa: 1,
        agora: '2026-09-12T12:00:30.000Z',
        leaseExpiraEm: '2026-09-12T12:02:00.000Z',
      }),
    ).resolves.toBeNull()

    const reassumido = await repositorio.adquirirProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T12:02:00.000Z',
      leaseExpiraEm: '2026-09-12T12:03:00.000Z',
    })

    expect(reassumido?.leaseId).toBeTruthy()
    expect(reassumido?.leaseId).not.toBe(adquirido?.leaseId)
    expect(reassumido?.tentativaIniciadaEm).toBe('2026-09-12T12:00:10.000Z')
  })

  it('recusa tentativa anterior e qualquer operação com lease antigo', async () => {
    const repositorio = criarCicloVidaAnaliseEmMemoria()
    const criado = await repositorio.criarOuReutilizar(base)
    const primeiro = await repositorio.adquirirProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T12:00:10.000Z',
      leaseExpiraEm: expiracaoInicial,
    })
    const segundo = await repositorio.adquirirProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T12:02:00.000Z',
      leaseExpiraEm: '2026-09-12T12:03:00.000Z',
    })

    expect(primeiro?.leaseId).toBeTruthy()
    expect(segundo?.leaseId).toBeTruthy()
    await expect(
      repositorio.renovarLease({
        idPublico: criado.idPublico,
        tentativa: 1,
        leaseId: primeiro?.leaseId ?? '',
        agora: '2026-09-12T12:02:01.000Z',
        leaseExpiraEm: '2026-09-12T12:04:00.000Z',
      }),
    ).resolves.toBeNull()
    await expect(
      repositorio.atualizarEtapa({
        idPublico: criado.idPublico,
        tentativa: 1,
        leaseId: primeiro?.leaseId ?? '',
        etapa: 'indexacao',
        agora: '2026-09-12T12:02:01.000Z',
      }),
    ).resolves.toBeNull()
    await expect(
      repositorio.registrarFalhaProcessamento({
        idPublico: criado.idPublico,
        tentativa: 1,
        leaseId: primeiro?.leaseId ?? '',
        agora: '2026-09-12T12:02:01.000Z',
        falha: {
          codigo: 'ERRO_INTERNO',
          categoria: 'transitoria',
          mensagem: 'falha segura',
        },
      }),
    ).resolves.toBeNull()

    await expect(
      repositorio.adquirirProcessamento({
        idPublico: criado.idPublico,
        tentativa: 0,
        agora: '2026-09-12T12:02:01.000Z',
        leaseExpiraEm: '2026-09-12T12:04:00.000Z',
      }),
    ).resolves.toBeNull()
    expect((await repositorio.buscarPorIdPublico(criado.idPublico))?.leaseId).toBe(
      segundo?.leaseId,
    )
  })

  it('renova lease, atualiza etapa e registra somente falha estruturada segura', async () => {
    const repositorio = criarCicloVidaAnaliseEmMemoria()
    const criado = await repositorio.criarOuReutilizar(base)
    const adquirido = await repositorio.adquirirProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T12:00:10.000Z',
      leaseExpiraEm: expiracaoInicial,
    })
    const renovado = await repositorio.renovarLease({
      idPublico: criado.idPublico,
      tentativa: 1,
      leaseId: adquirido?.leaseId ?? '',
      agora: '2026-09-12T12:00:20.000Z',
      leaseExpiraEm: '2026-09-12T12:02:00.000Z',
    })
    const atualizado = await repositorio.atualizarEtapa({
      idPublico: criado.idPublico,
      tentativa: 1,
      leaseId: adquirido?.leaseId ?? '',
      etapa: 'obtencao_arquivos',
      agora: '2026-09-12T12:00:30.000Z',
    })
    const falhou = await repositorio.registrarFalhaProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      leaseId: adquirido?.leaseId ?? '',
      agora: '2026-09-12T12:00:40.000Z',
      falha: {
        codigo: 'FONTE_INDISPONIVEL',
        categoria: 'transitoria',
        mensagem: 'Não foi possível obter a fonte.',
        detalhes: { recurso: 'blob', status: 503 },
      },
    })

    expect(renovado).toMatchObject({
      estado: 'processando',
      ultimaAtividadeEm: '2026-09-12T12:00:20.000Z',
      leaseExpiraEm: '2026-09-12T12:02:00.000Z',
    })
    expect(atualizado).toMatchObject({ etapa: 'obtencao_arquivos' })
    expect(falhou).toMatchObject({
      estado: 'falha',
      etapa: 'obtencao_arquivos',
      leaseId: null,
      leaseExpiraEm: null,
      falha: {
        codigo: 'FONTE_INDISPONIVEL',
        categoria: 'transitoria',
        mensagem: 'Não foi possível obter a fonte.',
        detalhes: { recurso: 'blob', status: 503 },
        ocorridoEm: '2026-09-12T12:00:40.000Z',
      },
    })
    expect(falhou).not.toHaveProperty('stack')
    expect(falhou).not.toHaveProperty('respostaExterna')
  })

  it('reinicia manualmente uma falha uma única vez e limpa a execução anterior', async () => {
    const repositorio = criarCicloVidaAnaliseEmMemoria()
    const criado = await repositorio.criarOuReutilizar(base)
    const adquirido = await repositorio.adquirirProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      agora: '2026-09-12T12:00:10.000Z',
      leaseExpiraEm: expiracaoInicial,
    })
    await repositorio.registrarFalhaProcessamento({
      idPublico: criado.idPublico,
      tentativa: 1,
      leaseId: adquirido?.leaseId ?? '',
      agora: '2026-09-12T12:00:20.000Z',
      falha: {
        codigo: 'CONFIGURACAO_INVALIDA',
        categoria: 'deterministica',
        mensagem: 'Configuração inválida.',
      },
    })

    const resultados = await Promise.all(
      Array.from({ length: 2 }, () =>
        repositorio.iniciarNovaTentativa({
          idPublico: criado.idPublico,
          agora: '2026-09-12T12:01:00.000Z',
        }),
      ),
    )
    const reiniciados = resultados.filter((resultado) => resultado !== null)

    expect(reiniciados).toHaveLength(1)
    expect(reiniciados[0]).toMatchObject({
      estado: 'aguardando',
      etapa: null,
      tentativa: 2,
      tentativaIniciadaEm: null,
      ultimaAtividadeEm: null,
      finalizadoEm: null,
      leaseId: null,
      leaseExpiraEm: null,
      falha: null,
    })
    expect(
      await repositorio.adquirirProcessamento({
        idPublico: criado.idPublico,
        tentativa: 1,
        agora: '2026-09-12T12:01:01.000Z',
        leaseExpiraEm: '2026-09-12T12:02:00.000Z',
      }),
    ).toBeNull()
    expect(reiniciados[0]?.tentativa).toBe(2)
  })

  it('não expõe uma operação para concluir sem persistência integral do índice', () => {
    const repositorio = criarCicloVidaAnaliseEmMemoria()

    expect(repositorio).not.toHaveProperty('concluir')
  })
})
