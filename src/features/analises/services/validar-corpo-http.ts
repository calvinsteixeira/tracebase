import { ErroApiAnalises } from './erros-api-analises'

export async function lerCorpoObjeto(request: Request): Promise<Record<string, unknown>> {
  let corpo: unknown

  try {
    corpo = await request.json()
  } catch {
    throw new ErroApiAnalises('REQUISICAO_INVALIDA')
  }

  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroApiAnalises('REQUISICAO_INVALIDA')
  }

  return corpo as Record<string, unknown>
}

export function exigirUrlDoCorpo(corpo: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(corpo, 'url') || typeof corpo.url !== 'string') {
    throw new ErroApiAnalises('REQUISICAO_INVALIDA')
  }

  return corpo.url
}
