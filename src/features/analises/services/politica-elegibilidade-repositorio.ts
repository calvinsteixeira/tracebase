import type { ArquivoArvoreGitHub } from './github/github-repositorio.types'

export const LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO = {
  quantidadeMaximaArquivosElegiveis: 250,
  tamanhoMaximoArquivoBytes: 512 * 1024,
  tamanhoMaximoTotalBytes: 5 * 1024 * 1024,
} as const

export interface LimitesElegibilidadeRepositorio {
  quantidadeMaximaArquivosElegiveis: number
  tamanhoMaximoArquivoBytes: number
  tamanhoMaximoTotalBytes: number
}

export type StatusElegibilidade = 'elegivel' | 'nao-elegivel' | 'inconclusiva'

export type CriterioElegibilidade =
  | 'sem-arquivos'
  | 'quantidade-arquivos'
  | 'tamanho-arquivo'
  | 'tamanho-total'
  | 'tamanho-desconhecido'

export interface DetalheElegibilidade {
  criterio: CriterioElegibilidade
  encontrado: number | null
  maximo: number | null
  caminho?: string
}

export interface AvaliacaoElegibilidadeRepositorio {
  status: StatusElegibilidade
  quantidadeArquivosElegiveis: number
  tamanhoTotalBytes: number | null
  detalhe: DetalheElegibilidade | null
}

const extensoesElegiveis = new Set(['.js', '.jsx', '.ts', '.tsx'])
const diretoriosGerados = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
])

export function filtrarArquivosElegiveis(arquivos: ArquivoArvoreGitHub[]) {
  return arquivos.filter((arquivo) => {
    const segmentos = arquivo.caminho.split('/')
    const nome = segmentos.at(-1)?.toLowerCase() ?? ''
    const ponto = nome.lastIndexOf('.')

    return (
      ponto >= 0 &&
      extensoesElegiveis.has(nome.slice(ponto)) &&
      !segmentos.some((segmento) => diretoriosGerados.has(segmento.toLowerCase()))
    )
  })
}

export function avaliarElegibilidadeRepositorio(
  arquivos: ArquivoArvoreGitHub[],
  limites: LimitesElegibilidadeRepositorio,
): AvaliacaoElegibilidadeRepositorio {
  const arquivosElegiveis = filtrarArquivosElegiveis(arquivos)
  const quantidadeArquivosElegiveis = arquivosElegiveis.length

  if (quantidadeArquivosElegiveis === 0) {
    return {
      status: 'nao-elegivel',
      quantidadeArquivosElegiveis,
      tamanhoTotalBytes: 0,
      detalhe: {
        criterio: 'sem-arquivos',
        encontrado: 0,
        maximo: null,
      },
    }
  }

  if (quantidadeArquivosElegiveis > limites.quantidadeMaximaArquivosElegiveis) {
    return {
      status: 'nao-elegivel',
      quantidadeArquivosElegiveis,
      tamanhoTotalBytes: obterTamanhoTotal(arquivosElegiveis),
      detalhe: {
        criterio: 'quantidade-arquivos',
        encontrado: quantidadeArquivosElegiveis,
        maximo: limites.quantidadeMaximaArquivosElegiveis,
      },
    }
  }

  const arquivoAcimaDoLimite = arquivosElegiveis.find(
    (arquivo) =>
      arquivo.tamanhoBytes !== undefined &&
      arquivo.tamanhoBytes > limites.tamanhoMaximoArquivoBytes,
  )

  if (arquivoAcimaDoLimite?.tamanhoBytes !== undefined) {
    return {
      status: 'nao-elegivel',
      quantidadeArquivosElegiveis,
      tamanhoTotalBytes: obterTamanhoTotal(arquivosElegiveis),
      detalhe: {
        criterio: 'tamanho-arquivo',
        encontrado: arquivoAcimaDoLimite.tamanhoBytes,
        maximo: limites.tamanhoMaximoArquivoBytes,
        caminho: arquivoAcimaDoLimite.caminho,
      },
    }
  }

  const tamanhoTotalConhecido = somarTamanhosConhecidos(arquivosElegiveis)

  if (tamanhoTotalConhecido > limites.tamanhoMaximoTotalBytes) {
    return {
      status: 'nao-elegivel',
      quantidadeArquivosElegiveis,
      tamanhoTotalBytes: obterTamanhoTotal(arquivosElegiveis),
      detalhe: {
        criterio: 'tamanho-total',
        encontrado: tamanhoTotalConhecido,
        maximo: limites.tamanhoMaximoTotalBytes,
      },
    }
  }

  if (arquivosElegiveis.some((arquivo) => arquivo.tamanhoBytes === undefined)) {
    return {
      status: 'inconclusiva',
      quantidadeArquivosElegiveis,
      tamanhoTotalBytes: null,
      detalhe: {
        criterio: 'tamanho-desconhecido',
        encontrado: null,
        maximo: limites.tamanhoMaximoTotalBytes,
      },
    }
  }

  return {
    status: 'elegivel',
    quantidadeArquivosElegiveis,
    tamanhoTotalBytes: tamanhoTotalConhecido,
    detalhe: null,
  }
}

function somarTamanhosConhecidos(arquivos: ArquivoArvoreGitHub[]) {
  return arquivos.reduce((total, arquivo) => total + (arquivo.tamanhoBytes ?? 0), 0)
}

function obterTamanhoTotal(arquivos: ArquivoArvoreGitHub[]) {
  if (arquivos.some((arquivo) => arquivo.tamanhoBytes === undefined)) {
    return null
  }

  return somarTamanhosConhecidos(arquivos)
}
