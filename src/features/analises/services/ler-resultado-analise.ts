import type { ResumoStatusAnalise } from './persistencia/ciclo-vida-analise'
import type { RepositorioApiAnalises } from './persistencia/repositorio-api-analises'

const UUID_PUBLICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface DependenciasLeituraResultadoAnalise {
  repositorio: Pick<RepositorioApiAnalises, 'obterResumoStatus'>
  agora?: () => string
  limiteAguardandoMs?: number
  limiteDemoradaMs?: number
}

export async function lerResultadoAnalise(
  snapshotId: string,
  dependencias: DependenciasLeituraResultadoAnalise,
): Promise<ResumoStatusAnalise | null> {
  if (!UUID_PUBLICO.test(snapshotId)) return null

  return dependencias.repositorio.obterResumoStatus({
    idPublico: snapshotId,
    agora: (dependencias.agora ?? (() => new Date().toISOString()))(),
    limiteAguardandoMs: dependencias.limiteAguardandoMs ?? 60_000,
    limiteDemoradaMs: dependencias.limiteDemoradaMs ?? 30_000,
  })
}
