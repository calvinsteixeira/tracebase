import { describe, expect, it, vi } from 'vitest'

import {
  criarConsumidorProcessamentoAnalise,
  criarExecutorLocalProcessamento,
  type RelogioProcessamentoAnalise,
  type TemporizadorProcessamentoAnalise,
} from './consumidor-processamento-analise'
import { ErroConfiguracaoIndexacao } from './indexador/indexador-imports'
import {
  ErroFonteRepositorio,
  type ArquivoArvoreRepositorio,
  type FonteDeRepositorioComArvore,
} from './fonte-repositorio'
import {
  criarCicloVidaAnaliseEmMemoria,
  criarEstadoCicloVidaAnaliseEmMemoria,
} from './persistencia/ciclo-vida-analise-memoria'
import { criarRepositorioPersistenciaIndiceEmMemoria } from './persistencia/persistencia-indice-memoria'

const repositorio = {
  url: 'https://github.com/dono/repositorio',
  proprietario: 'dono',
  nome: 'repositorio',
}
const commitSha = 'a'.repeat(40)
const agoraInicial = '2026-09-12T12:00:00.000Z'
const limites = {
  quantidadeMaximaArquivosElegiveis: 250,
  tamanhoMaximoArquivoBytes: 512 * 1024,
  tamanhoMaximoTotalBytes: 5 * 1024 * 1024,
}

describe('consumidor de processamento de análise', () => {
  it('processa o commit persistido, salva o índice e conclui o snapshot', async () => {
    const ambiente = await criarAmbiente()
    const resultado = await ambiente.consumidor.processar(ambiente.mensagem)

    expect(resultado.tipo).toBe('concluido')
    expect(ambiente.fonte.obterArvore).toHaveBeenCalledWith({
      repositorio,
      commitSha,
    })
    expect(ambiente.fonte.obterArquivos).toHaveBeenCalledWith(
      expect.objectContaining({ commitSha }),
    )

    const snapshot = await ambiente.cicloVida.buscarPorIdPublico(ambiente.snapshotId)
    const persistido = await ambiente.persistencia.buscarPorSnapshotConcluido(ambiente.snapshotId)
    expect(snapshot?.estado).toBe('concluido')
    expect(persistido?.arquivos).toEqual([
      { caminho: 'src/index.ts', blobSha: 'b'.repeat(40) },
    ])
    expect(persistido?.indice.arquivos.map((arquivo) => arquivo.caminho)).toEqual([
      'src/index.ts',
    ])
  })

  it('continua usando a árvore do commit salvo mesmo quando a branch avança', async () => {
    const ambiente = await criarAmbiente()
    ambiente.fonte.obterArvore = vi.fn(async ({ commitSha: recebido }) => {
      expect(recebido).toBe(commitSha)
      return ambiente.arvore
    })

    const resultado = await ambiente.consumidor.processar(ambiente.mensagem)

    expect(resultado.tipo).toBe('concluido')
    expect(ambiente.fonte.obterArvore).not.toHaveBeenCalledWith(
      expect.objectContaining({ commitSha: 'f'.repeat(40) }),
    )
  })

  it('não processa uma mensagem duplicada enquanto o lease está ativo', async () => {
    const ambiente = await criarAmbiente()
    let liberar!: () => void
    const entrou = Promise.resolve()
    const bloqueio = new Promise<void>((resolve) => {
      liberar = resolve
    })
    ambiente.fonte.obterArvore = vi.fn(async () => {
      await entrou
      await bloqueio
      return ambiente.arvore
    })

    const primeiro = ambiente.consumidor.processar(ambiente.mensagem)
    await entrou
    await expect(ambiente.consumidor.processar(ambiente.mensagem)).resolves.toEqual({
      tipo: 'ocupado',
    })

    liberar()
    await expect(primeiro).resolves.toMatchObject({ tipo: 'concluido' })
    expect(ambiente.fonte.obterArvore).toHaveBeenCalledTimes(1)
  })

  it('trata conclusão repetida, tentativa antiga, inexistência e estado incompatível', async () => {
    const concluido = await criarAmbiente()
    await concluido.consumidor.processar(concluido.mensagem)
    await expect(concluido.consumidor.processar(concluido.mensagem)).resolves.toEqual({
      tipo: 'ja_concluido',
    })
    expect(concluido.fonte.obterArvore).toHaveBeenCalledTimes(1)

    const antigo = await criarAmbiente()
    await expect(
      antigo.consumidor.processar({ ...antigo.mensagem, tentativa: 2 }),
    ).resolves.toEqual({ tipo: 'tentativa_desatualizada' })

    const inexistente = await criarAmbiente(false)
    await expect(
      inexistente.consumidor.processar({ snapshotId: crypto.randomUUID(), tentativa: 1 }),
    ).resolves.toEqual({ tipo: 'inexistente' })

    const incompatível = await criarAmbiente()
    incompatível.fonte.obterArvore = vi.fn(async () => {
      throw new ErroFonteRepositorio('FONTE_INDISPONIVEL')
    })
    await incompatível.consumidor.processar(incompatível.mensagem)
    await expect(incompatível.consumidor.processar(incompatível.mensagem)).resolves.toEqual({
      tipo: 'estado_incompativel',
    })
  })

  it('renova o heartbeat com relógio falso e encerra todos os timers', async () => {
    const ambiente = await criarAmbiente()
    const timers = criarTimers()
    let agora = Date.parse(agoraInicial)
    const relogio: RelogioProcessamentoAnalise = {
      agora: () => new Date(agora).toISOString(),
    }
    const consumidor = criarConsumidorProcessamentoAnalise({
      cicloVida: ambiente.cicloVida,
      persistencia: ambiente.persistencia,
      fonte: ambiente.fonte,
      relogio,
      temporizador: timers,
    })

    let liberar!: () => void
    const bloqueio = new Promise<void>((resolve) => {
      liberar = resolve
    })
    ambiente.fonte.obterArvore = vi.fn(async () => {
      await bloqueio
      return ambiente.arvore
    })

    const processamento = consumidor.processar(ambiente.mensagem)
    await Promise.resolve()
    agora += 20_000
    await timers.dispararIntervalos()

    const durante = await ambiente.cicloVida.buscarPorIdPublico(ambiente.snapshotId)
    expect(durante?.leaseExpiraEm).toBe(new Date(agora + 60_000).toISOString())
    expect(timers.ativos()).toBe(2)

    liberar()
    await expect(processamento).resolves.toMatchObject({ tipo: 'concluido' })
    expect(timers.ativos()).toBe(0)
  })

  it('persiste as etapas na ordem dos marcos reais', async () => {
    const ambiente = await criarAmbiente()
    const etapas: string[] = []
    const cicloVida = {
      ...ambiente.cicloVida,
      atualizarEtapa: vi.fn(async (input: Parameters<typeof ambiente.cicloVida.atualizarEtapa>[0]) => {
        etapas.push(input.etapa)
        return ambiente.cicloVida.atualizarEtapa(input)
      }),
    }
    const consumidor = criarConsumidorProcessamentoAnalise({
      cicloVida,
      persistencia: ambiente.persistencia,
      fonte: ambiente.fonte,
    })

    await expect(consumidor.processar(ambiente.mensagem)).resolves.toMatchObject({
      tipo: 'concluido',
    })
    expect(etapas).toEqual(['preparacao', 'obtencao_arquivos', 'indexacao', 'persistencia'])
  })

  it('impede que um consumidor antigo altere o snapshot depois de perder o lease', async () => {
    const ambiente = await criarAmbiente()
    const timersAntigo = criarTimers()
    const timersNovo = criarTimers()
    let agora = Date.parse(agoraInicial)
    const relogio: RelogioProcessamentoAnalise = {
      agora: () => new Date(agora).toISOString(),
    }
    let liberar!: () => void
    const bloqueio = new Promise<void>((resolve) => {
      liberar = resolve
    })
    let chamadas = 0
    ambiente.fonte.obterArvore = vi.fn(async () => {
      chamadas += 1
      if (chamadas === 1) await bloqueio
      return ambiente.arvore
    })
    const antigo = criarConsumidorProcessamentoAnalise({
      cicloVida: ambiente.cicloVida,
      persistencia: ambiente.persistencia,
      fonte: ambiente.fonte,
      relogio,
      temporizador: timersAntigo,
    })
    const novo = criarConsumidorProcessamentoAnalise({
      cicloVida: ambiente.cicloVida,
      persistencia: ambiente.persistencia,
      fonte: ambiente.fonte,
      relogio,
      temporizador: timersNovo,
    })

    const processamentoAntigo = antigo.processar(ambiente.mensagem)
    await vi.waitFor(() => expect(chamadas).toBe(1))
    agora += 61_000
    await expect(novo.processar(ambiente.mensagem)).resolves.toMatchObject({ tipo: 'concluido' })

    liberar()
    await expect(processamentoAntigo).resolves.toEqual({ tipo: 'lease_perdido' })
    expect((await ambiente.cicloVida.buscarPorIdPublico(ambiente.snapshotId))?.estado).toBe('concluido')
  })

  it('impede conclusão após o timeout absoluto e registra uma falha segura', async () => {
    const ambiente = await criarAmbiente()
    const timers = criarTimers()
    let liberar!: () => void
    const bloqueio = new Promise<void>((resolve) => {
      liberar = resolve
    })
    ambiente.fonte.obterArvore = vi.fn(async () => {
      await bloqueio
      return ambiente.arvore
    })
    const processamento = criarConsumidorProcessamentoAnalise({
      cicloVida: ambiente.cicloVida,
      persistencia: ambiente.persistencia,
      fonte: ambiente.fonte,
      temporizador: timers,
      duracaoMaximaMs: 100,
    }).processar(ambiente.mensagem)

    await Promise.resolve()
    await timers.dispararTimeouts(100)
    await expect(processamento).resolves.toMatchObject({
      tipo: 'falha_registrada',
      falha: { codigo: 'TEMPO_ESGOTADO', categoria: 'transitoria' },
    })

    liberar()
    const snapshot = await ambiente.cicloVida.buscarPorIdPublico(ambiente.snapshotId)
    expect(snapshot?.estado).toBe('falha')
    await expect(
      ambiente.persistencia.buscarPorSnapshotConcluido(ambiente.snapshotId),
    ).resolves.toBeNull()
  })

  it.each([
    ['fonte', new ErroFonteRepositorio('FONTE_INDISPONIVEL'), 'FONTE_INDISPONIVEL'],
    ['limite', new ErroFonteRepositorio('TAMANHO_TOTAL'), 'LIMITE_REPOSITORIO'],
  ])('classifica a falha conhecida de %s', async (_nome, erro, codigo) => {
    const ambiente = await criarAmbiente()
    ambiente.fonte.obterArvore = vi.fn(async () => {
      throw erro
    })

    await expect(ambiente.consumidor.processar(ambiente.mensagem)).resolves.toMatchObject({
      tipo: 'falha_registrada',
      falha: { codigo },
    })
  })

  it('classifica configuração inválida como falha determinística', async () => {
    const ambiente = await criarAmbiente()
    const consumidor = criarConsumidorProcessamentoAnalise({
      cicloVida: ambiente.cicloVida,
      persistencia: ambiente.persistencia,
      fonte: ambiente.fonte,
      indexador: () => {
        throw new ErroConfiguracaoIndexacao('CONFIGURACAO_NAO_SUPORTADA')
      },
    })

    await expect(consumidor.processar(ambiente.mensagem)).resolves.toMatchObject({
      tipo: 'falha_registrada',
      falha: { codigo: 'CONFIGURACAO_INVALIDA', categoria: 'deterministica' },
    })
  })

  it('não persiste detalhes internos de uma exceção desconhecida', async () => {
    const ambiente = await criarAmbiente()
    ambiente.fonte.obterArvore = vi.fn(async () => {
      throw new Error('token secreto e stack interna')
    })

    await ambiente.consumidor.processar(ambiente.mensagem)
    const snapshot = await ambiente.cicloVida.buscarPorIdPublico(ambiente.snapshotId)
    expect(snapshot?.falha).toMatchObject({
      codigo: 'ERRO_INTERNO',
      mensagem: 'Não foi possível concluir a análise.',
    })
    expect(JSON.stringify(snapshot?.falha)).not.toContain('token secreto')
  })

  it('classifica uma falha do adaptador de persistência', async () => {
    const ambiente = await criarAmbiente()
    const persistencia = {
      ...ambiente.persistencia,
      salvarEConcluir: vi.fn(async () => {
        throw new Error('falha interna do banco')
      }),
    }
    const consumidor = criarConsumidorProcessamentoAnalise({
      cicloVida: ambiente.cicloVida,
      persistencia,
      fonte: ambiente.fonte,
    })

    await expect(consumidor.processar(ambiente.mensagem)).resolves.toMatchObject({
      tipo: 'falha_registrada',
      falha: { codigo: 'ERRO_PERSISTENCIA', categoria: 'transitoria' },
    })
  })

  it('faz o executor local chamar o mesmo consumidor', async () => {
    const processar = vi.fn().mockResolvedValue({ tipo: 'ocupado' as const })
    const executor = criarExecutorLocalProcessamento({ processar })
    const mensagem = { snapshotId: crypto.randomUUID(), tentativa: 1 }

    await expect(executor.executar(mensagem)).resolves.toEqual({ tipo: 'ocupado' })
    expect(processar).toHaveBeenCalledWith(mensagem)
  })
})

async function criarAmbiente(criarSnapshot = true) {
  const estado = criarEstadoCicloVidaAnaliseEmMemoria()
  const cicloVida = criarCicloVidaAnaliseEmMemoria(estado)
  const persistencia = criarRepositorioPersistenciaIndiceEmMemoria(estado)
  const arvore: ArquivoArvoreRepositorio[] = [
    { caminho: 'README.md', sha: 'c'.repeat(40), tamanhoBytes: 10 },
    { caminho: 'src/index.ts', sha: 'b'.repeat(40), tamanhoBytes: 28 },
  ]
  const fonte: FonteDeRepositorioComArvore = {
    obterArvore: vi.fn(async () => arvore),
    obterArquivos: vi.fn(async ({ arquivos }: Parameters<FonteDeRepositorioComArvore['obterArquivos']>[0]) =>
      arquivos.map((arquivo) => ({
        caminho: arquivo.caminho,
        conteudo: 'export const valor = 1',
      })),
    ),
  }

  const snapshot = criarSnapshot
    ? await cicloVida.criarOuReutilizar({
        repositorio,
        commitSha,
        referencia: 'main',
        agora: agoraInicial,
      })
    : null
  const snapshotId = snapshot?.idPublico ?? crypto.randomUUID()

  return {
    cicloVida,
    persistencia,
    fonte,
    arvore,
    snapshotId,
    mensagem: { snapshotId, tentativa: 1 },
    consumidor: criarConsumidorProcessamentoAnalise({
      cicloVida,
      persistencia,
      fonte,
      limites,
    }),
  }
}

function criarTimers() {
  const registros: Array<{
    tipo: 'timeout' | 'interval'
    atraso: number
    callback: () => void
    ativo: boolean
  }> = []
  const timers: TemporizadorProcessamentoAnalise & {
    dispararTimeouts(atraso: number): Promise<void>
    dispararIntervalos(): Promise<void>
    ativos(): number
  } = {
    setTimeout(callback, atraso) {
      const registro = { tipo: 'timeout' as const, atraso, callback, ativo: true }
      registros.push(registro)
      return registro
    },
    clearTimeout(id) {
      ;(id as (typeof registros)[number]).ativo = false
    },
    setInterval(callback, atraso) {
      const registro = { tipo: 'interval' as const, atraso, callback, ativo: true }
      registros.push(registro)
      return registro
    },
    clearInterval(id) {
      ;(id as (typeof registros)[number]).ativo = false
    },
    async dispararTimeouts(atraso) {
      for (const registro of registros.filter((item) => item.ativo && item.tipo === 'timeout' && item.atraso === atraso)) {
        registro.callback()
      }
      await Promise.resolve()
    },
    async dispararIntervalos() {
      for (const registro of registros.filter((item) => item.ativo && item.tipo === 'interval')) {
        registro.callback()
      }
      await Promise.resolve()
      await Promise.resolve()
    },
    ativos: () => registros.filter((registro) => registro.ativo).length,
  }
  return timers
}
