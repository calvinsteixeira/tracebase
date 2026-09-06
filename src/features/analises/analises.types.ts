export type TipoArquivoFonte = 'javascript' | 'typescript'

export interface Repositorio {
  id: string
  url: string
  proprietario: string
  nome: string
}

export interface SnapshotAnalise {
  id: string
  repositorioId: string
  commitSha: string
  referencia: string
}

export interface ArquivoFonte {
  caminho: string
  conteudo: string
}

export interface ConfiguracaoProjeto {
  caminho: 'tsconfig.json' | 'jsconfig.json'
  conteudo: string
}

export interface ArquivoDoSnapshot {
  caminho: string
  blobSha: string
  tamanhoBytes?: number
}

export interface ArquivoAnalisado {
  id: string
  caminho: string
  tipo: TipoArquivoFonte
}

export type TipoSimbolo = 'funcao' | 'classe' | 'constante' | 'componente' | 'interface' | 'tipo'

export interface SimboloAnalisado {
  id: string
  arquivoId: string
  nome: string
  tipo: TipoSimbolo
  evidencia: Evidencia
}

export interface PosicaoCodigo {
  linha: number
  coluna: number
}

export interface Evidencia {
  caminhoArquivo: string
  inicio: PosicaoCodigo
  fim: PosicaoCodigo
}

export type DestinoImportacao =
  | {
      tipo: 'interno'
      caminhoArquivo: string
    }
  | {
      tipo: 'externo'
      especificador: string
    }
  | {
      tipo: 'nao-resolvido'
      especificador: string
      expressao?: string
    }

export interface RelacaoImportacao {
  id: string
  tipo: 'importa'
  arquivoOrigemId: string
  destino: DestinoImportacao
  evidencia: Evidencia
}

export type TipoExportacao = 'nomeada' | 'padrao' | 'reexportacao'

export interface ExportacaoAnalisada {
  id: string
  arquivoOrigemId: string
  nomeExportado: string
  tipo: TipoExportacao
  nomeLocal?: string
  destino?: DestinoImportacao
  evidencia: Evidencia
}

export type CodigoDiagnostico =
  | 'ERRO_SINTATICO'
  | 'COMMONJS_NAO_SUPORTADO'
  | 'IMPORT_DINAMICO_NAO_RESOLVIDO'
  | 'CONFIGURACAO_ALIASES_INVALIDA'
  | 'CONFIGURACAO_EXTENDS_NAO_SUPORTADO'

export type CategoriaDiagnostico = 'sintaxe' | 'limitacao'

export interface DiagnosticoAnalise {
  id: string
  codigo: CodigoDiagnostico
  categoria: CategoriaDiagnostico
  arquivoOrigemId?: string
  evidencia: Evidencia
}

export interface IndiceAnalise {
  snapshot: SnapshotAnalise
  arquivos: ArquivoAnalisado[]
  exportacoes: ExportacaoAnalisada[]
  simbolos: SimboloAnalisado[]
  relacoesImportacao: RelacaoImportacao[]
  diagnosticos: DiagnosticoAnalise[]
  parcial: boolean
}
