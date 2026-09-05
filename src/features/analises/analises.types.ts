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
    }

export interface RelacaoImportacao {
  id: string
  tipo: 'importa'
  arquivoOrigemId: string
  destino: DestinoImportacao
  evidencia: Evidencia
}

export interface IndiceAnalise {
  snapshot: SnapshotAnalise
  arquivos: ArquivoAnalisado[]
  simbolos: SimboloAnalisado[]
  relacoesImportacao: RelacaoImportacao[]
}
