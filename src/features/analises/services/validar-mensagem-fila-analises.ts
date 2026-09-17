import type { MensagemProcessamentoAnalise } from './consumidor-processamento-analise'

export class ErroMensagemFilaAnalises extends Error {
  constructor() {
    super('Mensagem de análise inválida.')
    this.name = 'ErroMensagemFilaAnalises'
  }
}

export function validarMensagemFilaAnalises(valor: unknown): MensagemProcessamentoAnalise {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErroMensagemFilaAnalises()
  }

  const mensagem = valor as Record<string, unknown>
  if (
    typeof mensagem.snapshotId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mensagem.snapshotId) ||
    typeof mensagem.tentativa !== 'number' ||
    !Number.isInteger(mensagem.tentativa) ||
    mensagem.tentativa < 1
  ) {
    throw new ErroMensagemFilaAnalises()
  }

  return {
    snapshotId: mensagem.snapshotId,
    tentativa: mensagem.tentativa,
  }
}
