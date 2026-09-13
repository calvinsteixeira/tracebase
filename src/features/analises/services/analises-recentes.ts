const CHAVE_ANALISES_RECENTES = 'tracebase:analises-recentes:v1'
const LIMITE_ANALISES_RECENTES = 10
const UUID_PUBLICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function lerAnalisesRecentes(storage?: Storage): string[] {
  try {
    const armazenamento = storage ?? obterStorage()
    if (!armazenamento) return []
    const valor = JSON.parse(armazenamento.getItem(CHAVE_ANALISES_RECENTES) ?? 'null')
    if (!Array.isArray(valor)) return []
    return normalizarIds(valor)
  } catch {
    return []
  }
}

export function adicionarAnaliseRecente(idPublico: string, storage?: Storage) {
  if (!UUID_PUBLICO.test(idPublico)) return

  try {
    const armazenamento = storage ?? obterStorage()
    if (!armazenamento) return
    const ids = normalizarIds([idPublico, ...lerAnalisesRecentes(armazenamento)])
    armazenamento.setItem(CHAVE_ANALISES_RECENTES, JSON.stringify(ids.slice(0, LIMITE_ANALISES_RECENTES)))
  } catch {
    // O acompanhamento em memória continua funcionando sem persistência local.
  }
}

export function removerAnalisesRecentes(idsRemover: string[], storage?: Storage) {
  if (idsRemover.length === 0) return

  try {
    const armazenamento = storage ?? obterStorage()
    if (!armazenamento) return
    const removidos = new Set(idsRemover)
    const ids = lerAnalisesRecentes(armazenamento).filter((id) => !removidos.has(id))
    armazenamento.setItem(CHAVE_ANALISES_RECENTES, JSON.stringify(ids))
  } catch {
    // Storage indisponível não deve interromper a tela.
  }
}

function normalizarIds(valor: unknown[]): string[] {
  return [...new Set(valor.filter((id): id is string => typeof id === 'string' && UUID_PUBLICO.test(id)))].slice(0, LIMITE_ANALISES_RECENTES)
}

function obterStorage() {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
