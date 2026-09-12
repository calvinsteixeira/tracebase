export type EstadoAnalise = 'aguardando' | 'processando' | 'concluido' | 'falha'

export type EtapaAnalise =
  | 'preparacao'
  | 'obtencao_arquivos'
  | 'indexacao'
  | 'persistencia'

export type CategoriaFalhaAnalise = 'transitoria' | 'deterministica'

export type CodigoFalhaAnalise =
  | 'FONTE_INDISPONIVEL'
  | 'TEMPO_ESGOTADO'
  | 'CONFIGURACAO_INVALIDA'
  | 'LIMITE_REPOSITORIO'
  | 'ERRO_PERSISTENCIA'
  | 'ERRO_INTERNO'

export type ValorDetalheFalha = string | number | boolean | null

export type DetalhesFalhaAnalise = Readonly<Record<string, ValorDetalheFalha>>

export interface FalhaAnalise {
  codigo: CodigoFalhaAnalise
  categoria: CategoriaFalhaAnalise
  mensagem: string
  detalhes: DetalhesFalhaAnalise | null
  ocorridoEm: string
}

export interface FalhaAnaliseParaRegistro {
  codigo: CodigoFalhaAnalise
  categoria: CategoriaFalhaAnalise
  mensagem: string
  detalhes?: DetalhesFalhaAnalise
}

export interface DadosCriacaoSnapshotAnalise {
  repositorio: {
    url: string
    proprietario: string
    nome: string
  }
  commitSha: string
  referencia: string
  agora: string
}

export interface SnapshotCicloVidaAnalise {
  idPublico: string
  repositorio: DadosCriacaoSnapshotAnalise['repositorio']
  commitSha: string
  referencia: string
  estado: EstadoAnalise
  etapa: EtapaAnalise | null
  tentativa: number
  tentativaIniciadaEm: string | null
  ultimaAtividadeEm: string | null
  atualizadoEm: string
  finalizadoEm: string | null
  leaseId: string | null
  leaseExpiraEm: string | null
  falha: FalhaAnalise | null
}

export type ResultadoAquisicaoProcessamento =
  | {
      tipo: 'adquirido'
      snapshot: SnapshotCicloVidaAnalise
      lease: {
        id: string
        expiraEm: string
      }
    }
  | { tipo: 'inexistente' }
  | { tipo: 'concluido' }
  | { tipo: 'tentativa_desatualizada' }
  | { tipo: 'ocupado' }
  | { tipo: 'estado_incompativel' }

export interface RepositorioCicloVidaAnalise {
  criarOuReutilizar(input: DadosCriacaoSnapshotAnalise): Promise<SnapshotCicloVidaAnalise>
  buscarPorIdPublico(idPublico: string): Promise<SnapshotCicloVidaAnalise | null>
  adquirirProcessamento(input: {
    idPublico: string
    tentativa: number
    agora: string
    leaseExpiraEm: string
  }): Promise<ResultadoAquisicaoProcessamento>
  renovarLease(input: {
    idPublico: string
    tentativa: number
    leaseId: string
    agora: string
    leaseExpiraEm: string
  }): Promise<SnapshotCicloVidaAnalise | null>
  atualizarEtapa(input: {
    idPublico: string
    tentativa: number
    leaseId: string
    etapa: EtapaAnalise
    agora: string
  }): Promise<SnapshotCicloVidaAnalise | null>
  registrarFalhaAgendamento(input: {
    idPublico: string
    tentativa: number
    agora: string
    falha: FalhaAnaliseParaRegistro
  }): Promise<SnapshotCicloVidaAnalise | null>
  registrarFalhaProcessamento(input: {
    idPublico: string
    tentativa: number
    leaseId: string
    agora: string
    falha: FalhaAnaliseParaRegistro
  }): Promise<SnapshotCicloVidaAnalise | null>
  iniciarNovaTentativa(input: {
    idPublico: string
    tentativaEsperada: number
    agora: string
  }): Promise<SnapshotCicloVidaAnalise | null>
}
