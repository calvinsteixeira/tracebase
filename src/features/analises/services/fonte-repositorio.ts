import type {
  ArquivoDoSnapshot,
  ArquivoFonte,
  ConfiguracaoProjeto,
  Repositorio,
} from '../analises.types'

export interface ArquivoArvoreRepositorio {
  caminho: string
  sha: string
  tamanhoBytes?: number
}

export type ReferenciaRepositorio = Pick<
  Repositorio,
  'url' | 'proprietario' | 'nome'
>

export interface FonteDeRepositorio {
  obterArquivos(input: {
    repositorio: ReferenciaRepositorio
    commitSha: string
    arquivos: ArquivoDoSnapshot[]
  }): Promise<ArquivoFonte[]>
  obterConfiguracao?(input: {
    repositorio: ReferenciaRepositorio
    commitSha: string
    arquivos: ArquivoDoSnapshot[]
  }): Promise<ConfiguracaoProjeto | undefined>
}

export interface FonteDeRepositorioComArvore extends FonteDeRepositorio {
  obterArvore(input: {
    repositorio: ReferenciaRepositorio
    commitSha: string
  }): Promise<ArquivoArvoreRepositorio[]>
}

export type CodigoErroFonteRepositorio =
  | 'BLOB_AUSENTE'
  | 'RESPOSTA_INVALIDA'
  | 'ENCODING_NAO_SUPORTADO'
  | 'BASE64_INVALIDO'
  | 'SHA_BLOB_INCORRETO'
  | 'TEMPO_ESGOTADO'
  | 'LIMITE_GITHUB'
  | 'FONTE_INDISPONIVEL'
  | 'QUANTIDADE_ARQUIVOS'
  | 'TAMANHO_ARQUIVO'
  | 'TAMANHO_TOTAL'
  | 'CONFIGURACAO_INDISPONIVEL'
  | 'CONFIGURACAO_TAMANHO'
  | 'CONFIGURACAO_INVALIDA'
  | 'CONFIGURACAO_NAO_SUPORTADA'
  | 'ERRO_INTERNO'

export const TAMANHO_MAXIMO_CONFIGURACAO_BYTES = 512 * 1024

export class ErroFonteRepositorio extends Error {
  constructor(readonly codigo: CodigoErroFonteRepositorio) {
    super(codigo)
    this.name = 'ErroFonteRepositorio'
  }
}
