import type { CodigoFalhaAnalise, ResumoStatusAnalise } from './persistencia/ciclo-vida-analise'
import type { RepositorioApiAnalises } from './persistencia/repositorio-api-analises'
import { obterLimiteAguardandoSemAtividadeMs, obterLimiteAnaliseDemoradaMs } from './politica-tempo-analise'

const UUID_PUBLICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface DependenciasLeituraResultadoAnalise {
  repositorio: Pick<RepositorioApiAnalises, 'obterResumoStatus'>
  agora?: () => string
  limiteAguardandoMs?: number
  limiteDemoradaMs?: number
}

export interface VisaoResultadoAnalise {
  idPublico: string
  repositorio: { proprietario: string; nome: string }
  referencia: string
  commitSha: string
  estado: ResumoStatusAnalise['estado']
  falhaCodigo: CodigoFalhaAnalise | null
  atualizadoEm: string
  contagens: ResumoStatusAnalise['contagens']
}

export async function lerResultadoAnalise(
  snapshotId: string,
  dependencias: DependenciasLeituraResultadoAnalise,
): Promise<VisaoResultadoAnalise | null> {
  if (!UUID_PUBLICO.test(snapshotId)) return null

  const resumo = await dependencias.repositorio.obterResumoStatus({
    idPublico: snapshotId,
    agora: (dependencias.agora ?? (() => new Date().toISOString()))(),
    limiteAguardandoMs: dependencias.limiteAguardandoMs ?? obterLimiteAguardandoSemAtividadeMs(),
    limiteDemoradaMs: dependencias.limiteDemoradaMs ?? obterLimiteAnaliseDemoradaMs(),
  })

  return resumo ? mapearVisaoResultadoAnalise(resumo) : null
}

function mapearVisaoResultadoAnalise(resumo: ResumoStatusAnalise): VisaoResultadoAnalise {
  return {
    idPublico: resumo.idPublico,
    repositorio: { proprietario: resumo.repositorio.proprietario, nome: resumo.repositorio.nome },
    referencia: resumo.referencia,
    commitSha: resumo.commitSha,
    estado: resumo.estado,
    falhaCodigo: resumo.falha?.codigo ?? null,
    atualizadoEm: resumo.atualizadoEm,
    contagens: resumo.contagens,
  }
}
