import { obterApiAnalisesServidor } from '@/features/analises/services/composicao-analises-servidor'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ snapshotId: string }> }) {
  return obterApiAnalisesServidor().retry((await params).snapshotId, request)
}
