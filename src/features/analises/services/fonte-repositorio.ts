import type {
  ArquivoDoSnapshot,
  ArquivoFonte,
  ConfiguracaoProjeto,
  Repositorio,
} from '../analises.types'

export interface FonteDeRepositorio {
  obterArquivos(input: {
    repositorio: Repositorio
    commitSha: string
    arquivos: ArquivoDoSnapshot[]
  }): Promise<ArquivoFonte[]>
  obterConfiguracao?(input: {
    repositorio: Repositorio
    commitSha: string
    arquivos: ArquivoDoSnapshot[]
  }): Promise<ConfiguracaoProjeto | undefined>
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
  | 'CONFIGURACAO_INDISPONIVEL'
  | 'CONFIGURACAO_TAMANHO'
  | 'CONFIGURACAO_INVALIDA'
  | 'CONFIGURACAO_NAO_SUPORTADA'

export const TAMANHO_MAXIMO_CONFIGURACAO_BYTES = 512 * 1024

export class ErroFonteRepositorio extends Error {
  constructor(readonly codigo: CodigoErroFonteRepositorio) {
    super(codigo)
    this.name = 'ErroFonteRepositorio'
  }
}
