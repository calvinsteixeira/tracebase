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

export interface DadosSnapshotAnalise {
  repositorio: {
    url: string
    proprietario: string
    nome: string
  }
  commitSha: string
  referencia: string
  agora: string
}

export interface SnapshotAnalise {
  idPublico: string
  repositorio: DadosSnapshotAnalise['repositorio']
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

export interface RepositorioCicloVidaAnalise {
  criarOuReutilizar(input: DadosSnapshotAnalise): Promise<SnapshotAnalise>
  buscarPorIdPublico(idPublico: string): Promise<SnapshotAnalise | null>
  adquirirProcessamento(input: {
    idPublico: string
    tentativa: number
    agora: string
    leaseExpiraEm: string
  }): Promise<SnapshotAnalise | null>
  renovarLease(input: {
    idPublico: string
    tentativa: number
    leaseId: string
    agora: string
    leaseExpiraEm: string
  }): Promise<SnapshotAnalise | null>
  atualizarEtapa(input: {
    idPublico: string
    tentativa: number
    leaseId: string
    etapa: EtapaAnalise
    agora: string
  }): Promise<SnapshotAnalise | null>
  registrarFalhaAgendamento(input: {
    idPublico: string
    tentativa: number
    agora: string
    falha: FalhaAnaliseParaRegistro
  }): Promise<SnapshotAnalise | null>
  registrarFalhaProcessamento(input: {
    idPublico: string
    tentativa: number
    leaseId: string
    agora: string
    falha: FalhaAnaliseParaRegistro
  }): Promise<SnapshotAnalise | null>
  iniciarNovaTentativa(input: {
    idPublico: string
    agora: string
  }): Promise<SnapshotAnalise | null>
}
