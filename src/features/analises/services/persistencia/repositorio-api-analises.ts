import type {
  DadosCriacaoSnapshotAnalise,
  RepositorioCicloVidaAnalise,
  ResumoStatusAnalise,
  SolicitacaoAnalise,
  SnapshotCicloVidaAnalise,
} from './ciclo-vida-analise'

export interface RepositorioApiAnalises {
  buscarSolicitacao(requestId: string): Promise<SolicitacaoAnalise | null>
  criarOuReutilizarComSolicitacao(input: DadosCriacaoSnapshotAnalise & {
    requestId: string
    urlNormalizada: string
  }): Promise<{
    snapshot: SnapshotCicloVidaAnalise
    solicitacao: SolicitacaoAnalise
    publicar: boolean
    resultado: 'criada' | 'repetida' | 'conflito'
  }>
  iniciarNovaTentativaComSolicitacao(input: {
    requestId: string
    idPublico: string
    tentativaEsperada: number
    agora: string
  }): Promise<{
    snapshot: SnapshotCicloVidaAnalise | null
    solicitacao: SolicitacaoAnalise | null
    publicar: boolean
    resultado: 'criada' | 'repetida' | 'conflito' | 'tentativa_desatualizada'
  }>
  obterResumoStatus(input: {
    idPublico: string
    agora: string
    limiteAguardandoMs: number
    limiteDemoradaMs: number
  }): Promise<ResumoStatusAnalise | null>
  registrarFalhaAgendamento: RepositorioCicloVidaAnalise['registrarFalhaAgendamento']
}

export type RepositorioCicloVidaAnaliseCompleto = RepositorioCicloVidaAnalise & RepositorioApiAnalises
