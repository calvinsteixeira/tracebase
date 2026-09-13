export const urlLocalPadrao =
  'postgresql://tracebase:tracebase_local@localhost:5432/tracebase?sslmode=disable'

export function obterConfiguracao(ambiente) {
  const url = ambiente.DATABASE_URL || urlLocalPadrao
  const analisada = new URL(url)

  return {
    url,
    banco: decodeURIComponent(analisada.pathname.slice(1)) || ambiente.POSTGRES_DB || 'tracebase',
    usuario: decodeURIComponent(analisada.username) || ambiente.POSTGRES_USER || 'tracebase',
  }
}

export function criarAmbienteAplicacao(ambiente, configuracao) {
  return { ...ambiente, DATABASE_URL: configuracao.url }
}
