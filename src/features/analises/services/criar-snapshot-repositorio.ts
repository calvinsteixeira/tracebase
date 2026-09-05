import type { FonteRepositorioGitHub } from './github/github-repositorio.types'
import {
  avaliarElegibilidadeRepositorio,
  LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
  type AvaliacaoElegibilidadeRepositorio,
  type LimitesElegibilidadeRepositorio,
} from './politica-elegibilidade-repositorio'
import { analisarUrlRepositorio } from './validar-url-repositorio'

export {
  analisarUrlRepositorio,
  ErroAnaliseRepositorio,
} from './validar-url-repositorio'
export type { CodigoErroAnalise } from './validar-url-repositorio'
export {
  avaliarElegibilidadeRepositorio,
  filtrarArquivosElegiveis,
  LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
} from './politica-elegibilidade-repositorio'
export type {
  AvaliacaoElegibilidadeRepositorio,
  CriterioElegibilidade,
  DetalheElegibilidade,
  LimitesElegibilidadeRepositorio,
  StatusElegibilidade,
} from './politica-elegibilidade-repositorio'

export interface ResultadoElegibilidadeRepositorio extends AvaliacaoElegibilidadeRepositorio {
  repositorio: {
    url: string
    proprietario: string
    nome: string
  }
  snapshot: {
    commitSha: string
    referencia: string
  }
  limites: LimitesElegibilidadeRepositorio
}

export function obterLimitesElegibilidadeRepositorio(): LimitesElegibilidadeRepositorio {
  return {
    quantidadeMaximaArquivosElegiveis: lerLimite(
      'TRACEBASE_MAX_ELIGIBLE_FILES',
      LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO.quantidadeMaximaArquivosElegiveis,
    ),
    tamanhoMaximoArquivoBytes: lerLimite(
      'TRACEBASE_MAX_FILE_BYTES',
      LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO.tamanhoMaximoArquivoBytes,
    ),
    tamanhoMaximoTotalBytes: lerLimite(
      'TRACEBASE_MAX_TOTAL_BYTES',
      LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO.tamanhoMaximoTotalBytes,
    ),
  }
}

export async function verificarElegibilidadeRepositorio(
  url: string,
  fonte: FonteRepositorioGitHub,
  limites: LimitesElegibilidadeRepositorio = obterLimitesElegibilidadeRepositorio(),
): Promise<ResultadoElegibilidadeRepositorio> {
  const referencia = analisarUrlRepositorio(url)
  const resumo = await fonte.obterResumoRepositorio(referencia.proprietario, referencia.nome)
  const avaliacao = avaliarElegibilidadeRepositorio(resumo.arquivos, limites)

  return {
    ...avaliacao,
    repositorio: {
      url: resumo.url,
      proprietario: resumo.proprietario,
      nome: resumo.nome,
    },
    snapshot: {
      commitSha: resumo.commitSha,
      referencia: resumo.referencia,
    },
    limites,
  }
}

function lerLimite(nome: string, valorPadrao: number) {
  const valor = process.env[nome]

  if (!valor) {
    return valorPadrao
  }

  const limite = Number(valor)

  return Number.isInteger(limite) && limite > 0 ? limite : valorPadrao
}
