import { describe, expect, it, vi } from 'vitest'

import { criarFilaVercelAnalises, TOPICO_ANALISES } from './fila-vercel-analises'

describe('fila Vercel de análises', () => {
  it('publica somente a mensagem interna com tópico e chave de idempotência', async () => {
    const enviar = vi.fn(async () => ({ messageId: 'mensagem-teste' }))
    const fila = criarFilaVercelAnalises(enviar)

    await fila.publicar({
      mensagem: { snapshotId: 'snapshot-1', tentativa: 2 },
      chaveIdempotencia: 'analise:snapshot-1:2',
    })

    expect(enviar).toHaveBeenCalledWith(
      TOPICO_ANALISES,
      { snapshotId: 'snapshot-1', tentativa: 2 },
      { idempotencyKey: 'analise:snapshot-1:2' },
    )
  })
})
