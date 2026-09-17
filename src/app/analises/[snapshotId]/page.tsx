import { notFound } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { ResultadoAnalise } from '@/features/analises/components/resultado-analise'
import { obterRepositorioApiAnalisesServidor } from '@/features/analises/services/composicao-analises-servidor'
import { lerResultadoAnalise } from '@/features/analises/services/ler-resultado-analise'

export const runtime = 'nodejs'

export default async function PaginaResultadoAnalise({ params }: { params: Promise<{ snapshotId: string }> }) {
  const { snapshotId } = await params
  const resumo = await lerResultadoAnalise(snapshotId, { repositorio: obterRepositorioApiAnalisesServidor() })

  if (!resumo) notFound()

  return (
    <AppShell>
      <ResultadoAnalise resumo={resumo} />
    </AppShell>
  )
}
