import { obterApiAnalisesServidor } from '@/features/analises/services/composicao-analises-servidor'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  return obterApiAnalisesServidor().criar(request)
}
