export const LIMITE_AGUARDANDO_SEM_ATIVIDADE_MS = 60_000
export const LIMITE_ANALISE_DEMORADA_MS = 30_000

export function obterLimiteAguardandoSemAtividadeMs() {
  return obterLimiteConfigurado('TRACEBASE_SCHEDULE_TIMEOUT_MS', LIMITE_AGUARDANDO_SEM_ATIVIDADE_MS)
}

export function obterLimiteAnaliseDemoradaMs() {
  return obterLimiteConfigurado('TRACEBASE_SLOW_ANALYSIS_MS', LIMITE_ANALISE_DEMORADA_MS)
}

function obterLimiteConfigurado(nome: string, padrao: number) {
  const valor = Number(process.env[nome])
  return Number.isInteger(valor) && valor > 0 ? valor : padrao
}
