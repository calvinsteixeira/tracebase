import { send } from '@vercel/queue'

import type { FilaDeAnalises } from './fila-analises'

export const TOPICO_ANALISES = 'analises'

type EnviarMensagem = typeof send

export function criarFilaVercelAnalises(enviar: EnviarMensagem = send): FilaDeAnalises {
  return {
    async publicar({ mensagem, chaveIdempotencia }) {
      await enviar(
        TOPICO_ANALISES,
        {
          snapshotId: mensagem.snapshotId,
          tentativa: mensagem.tentativa,
        },
        { idempotencyKey: chaveIdempotencia },
      )
    },
  }
}
