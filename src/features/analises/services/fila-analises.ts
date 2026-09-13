import type { MensagemProcessamentoAnalise, ResultadoProcessamentoAnalise } from './consumidor-processamento-analise'

export interface FilaDeAnalises {
  publicar(input: { mensagem: MensagemProcessamentoAnalise; chaveIdempotencia: string }): Promise<void>
}

export interface ExecutorAnaliseLocal {
  executar(mensagem: MensagemProcessamentoAnalise): Promise<ResultadoProcessamentoAnalise>
}

export function criarFilaLocalAnalises(executor: ExecutorAnaliseLocal): FilaDeAnalises {
  return {
    async publicar({ mensagem }) {
      void executor.executar(mensagem).catch(() => undefined)
    },
  }
}
