import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResultadoProcessamentoAnalise } from '@/features/analises/services/consumidor-processamento-analise'

const processar = vi.fn<(...args: never[]) => Promise<ResultadoProcessamentoAnalise>>()

vi.mock('@vercel/queue', () => ({
  handleCallback: vi.fn((handler: (valor: unknown) => Promise<void>) => handler),
}))

vi.mock('@/features/analises/services/composicao-analises-servidor', () => ({
  obterConsumidorProcessamentoAnaliseServidor: () => ({ processar }),
}))

import { handleCallback } from '@vercel/queue'
import { POST, processarMensagemFilaAnalises } from './route'

const mensagem = {
  snapshotId: '123e4567-e89b-12d3-a456-426614174000',
  tentativa: 1,
}

describe('consumidor privado de análises', () => {
  beforeEach(() => {
    processar.mockReset()
  })

  it('configura o callback oficial com visibilidade de 300 segundos', () => {
    expect(handleCallback).toHaveBeenCalledWith(expect.any(Function), {
      visibilityTimeoutSeconds: 300,
      retry: expect.any(Function),
    })
    expect(POST).toBeTypeOf('function')
  })

  it('processa uma mensagem válida com o consumidor existente', async () => {
    processar.mockResolvedValueOnce({ tipo: 'ocupado' })

    await expect(processarMensagemFilaAnalises(mensagem)).resolves.toBeUndefined()
    expect(processar).toHaveBeenCalledWith(mensagem)
  })

  it.each([
    null,
    [],
    { snapshotId: mensagem.snapshotId },
    { snapshotId: mensagem.snapshotId, tentativa: 0 },
    { snapshotId: 'invalido', tentativa: 1 },
  ])('rejeita payload inválido: %j', async (payload) => {
    await expect(processarMensagemFilaAnalises(payload)).rejects.toThrow('Mensagem de análise inválida.')
    expect(processar).not.toHaveBeenCalled()
  })

  it('confirma resultados seguros sem relançar', async () => {
    processar.mockResolvedValueOnce({ tipo: 'ocupado' })

    await expect(processarMensagemFilaAnalises(mensagem)).resolves.toBeUndefined()
  })

  it('relança lease perdido para permitir a reentrega pela fila', async () => {
    processar.mockResolvedValueOnce({ tipo: 'lease_perdido' })

    await expect(processarMensagemFilaAnalises(mensagem)).rejects.toThrow(
      'O processamento perdeu o lease e deve ser reentregue.',
    )
  })

  it('relança falha inesperada para permitir a reentrega', async () => {
    const falha = new Error('falha transitória de infraestrutura')
    processar.mockRejectedValueOnce(falha)

    await expect(processarMensagemFilaAnalises(mensagem)).rejects.toBe(falha)
  })
})
