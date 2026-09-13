import { obterApiAnalisesServidor } from '@/features/analises/services/composicao-analises-servidor'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ snapshotId: string }> }) {
  return obterApiAnalisesServidor().status((await params).snapshotId)
}
