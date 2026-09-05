import type {
  FonteRepositorioGitHub,
  ResumoFonteRepositorioGitHub,
} from './github/github-repositorio.types'
import { analisarUrlRepositorio } from './validar-url-repositorio'
import { ErroAnaliseRepositorio } from './validar-url-repositorio'

export {
  analisarUrlRepositorio,
  ErroAnaliseRepositorio,
} from './validar-url-repositorio'
export type { CodigoErroAnalise } from './validar-url-repositorio'

export interface ResumoSnapshotRepositorio {
  repositorio: {
    url: string
    proprietario: string
    nome: string
  }
  snapshot: {
    commitSha: string
    referencia: string
  }
  quantidadeArquivosElegiveis: number
}

export interface LimitesAnaliseRepositorio {
  quantidadeMaximaArquivosElegiveis?: number
  tamanhoMaximoArquivoBytes?: number
  tamanhoMaximoTotalBytes?: number
}

export function obterLimitesAnaliseRepositorio(): LimitesAnaliseRepositorio {
  return {
    quantidadeMaximaArquivosElegiveis: lerLimite('TRACEBASE_MAX_ELIGIBLE_FILES'),
    tamanhoMaximoArquivoBytes: lerLimite('TRACEBASE_MAX_FILE_BYTES'),
    tamanhoMaximoTotalBytes: lerLimite('TRACEBASE_MAX_TOTAL_BYTES'),
  }
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

const limitesSemValoresDeProduto: LimitesAnaliseRepositorio = {}

export function criarSnapshotRepositorio(
  url: string,
  fonte: FonteRepositorioGitHub,
  limites: LimitesAnaliseRepositorio = limitesSemValoresDeProduto,
): Promise<ResumoSnapshotRepositorio> {
  const referencia = analisarUrlRepositorio(url)

  return fonte
    .obterResumoRepositorio(referencia.proprietario, referencia.nome)
    .then((resumo) => {
      const arquivosElegiveis = filtrarArquivosElegiveis(resumo.arquivos)
      validarLimites({ ...resumo, arquivos: arquivosElegiveis }, limites)

      const quantidadeArquivosElegiveis = arquivosElegiveis.length

      if (quantidadeArquivosElegiveis === 0) {
        throw new ErroAnaliseRepositorio(
          'SEM_ARQUIVOS_ELEGIVEIS',
          'Este repositório não parece ser um projeto JavaScript ou TypeScript: não encontramos arquivos .js, .jsx, .ts ou .tsx.',
        )
      }

      return {
        repositorio: {
          url: resumo.url,
          proprietario: resumo.proprietario,
          nome: resumo.nome,
        },
        snapshot: {
          commitSha: resumo.commitSha,
          referencia: resumo.referencia,
        },
        quantidadeArquivosElegiveis,
      }
    })
}

function validarLimites(
  resumo: ResumoFonteRepositorioGitHub,
  limites: LimitesAnaliseRepositorio,
) {
  if (
    limites.quantidadeMaximaArquivosElegiveis !== undefined &&
    resumo.arquivos.length > limites.quantidadeMaximaArquivosElegiveis
  ) {
    throw new ErroAnaliseRepositorio(
      'LIMITE_EXCEDIDO',
      'O repositório excede o limite de arquivos desta análise.',
    )
  }

  const tamanhosConhecidos = resumo.arquivos
    .map((arquivo) => arquivo.tamanhoBytes)
    .filter((tamanho): tamanho is number => tamanho !== undefined)
  const tamanhoTotal = tamanhosConhecidos.reduce((total, tamanho) => total + tamanho, 0)
  const tamanhoMaximoArquivoBytes = limites.tamanhoMaximoArquivoBytes

  if (
    tamanhoMaximoArquivoBytes !== undefined &&
    tamanhosConhecidos.some((tamanho) => tamanho > tamanhoMaximoArquivoBytes)
  ) {
    throw new ErroAnaliseRepositorio(
      'LIMITE_EXCEDIDO',
      'O repositório possui um arquivo acima do limite desta análise.',
    )
  }

  if (
    limites.tamanhoMaximoTotalBytes !== undefined &&
    tamanhoTotal > limites.tamanhoMaximoTotalBytes
  ) {
    throw new ErroAnaliseRepositorio(
      'LIMITE_EXCEDIDO',
      'O repositório excede o limite total desta análise.',
    )
  }
}

export function filtrarArquivosElegiveis(
  arquivos: ResumoFonteRepositorioGitHub['arquivos'],
) {
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

function lerLimite(nome: string) {
  const valor = process.env[nome]

  if (!valor) {
    return undefined
  }

  const limite = Number(valor)

  return Number.isInteger(limite) && limite > 0 ? limite : undefined
}
