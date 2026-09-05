import type {
  ArquivoDoSnapshot,
  ArquivoFonte,
  Repositorio,
} from '../analises.types'

export interface FonteDeRepositorio {
  obterArquivos(input: {
    repositorio: Repositorio
    commitSha: string
    arquivos: ArquivoDoSnapshot[]
  }): Promise<ArquivoFonte[]>
}

export type CodigoErroFonteRepositorio =
  | 'BLOB_AUSENTE'
  | 'RESPOSTA_INVALIDA'
  | 'ENCODING_NAO_SUPORTADO'
  | 'BASE64_INVALIDO'
  | 'SHA_BLOB_INCORRETO'
  | 'TEMPO_ESGOTADO'
  | 'FONTE_INDISPONIVEL'
  | 'QUANTIDADE_ARQUIVOS'
  | 'TAMANHO_ARQUIVO'
  | 'TAMANHO_TOTAL'

export class ErroFonteRepositorio extends Error {
  constructor(readonly codigo: CodigoErroFonteRepositorio) {
    super(codigo)
    this.name = 'ErroFonteRepositorio'
  }
}
