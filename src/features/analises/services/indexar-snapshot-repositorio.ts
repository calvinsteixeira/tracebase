import type {
  ArquivoFonte,
  ConfiguracaoProjeto,
  IndiceAnalise,
  Repositorio,
  SnapshotAnalise,
} from '../analises.types'
import type { ArquivoArvoreGitHub } from './github/github-repositorio.types'
import { filtrarArquivosElegiveis } from './politica-elegibilidade-repositorio'
import {
  ErroFonteRepositorio,
  type FonteDeRepositorio,
} from './fonte-repositorio'

export interface LimitesConteudoRepositorio {
  quantidadeMaximaArquivosElegiveis: number
  tamanhoMaximoArquivoBytes: number
  tamanhoMaximoTotalBytes: number
}

export interface EntradaIndexacaoSnapshot {
  repositorio: Repositorio
  snapshot: SnapshotAnalise
  arquivos: ArquivoArvoreGitHub[]
}

export interface SolicitarIndexacaoSnapshot {
  entrada: EntradaIndexacaoSnapshot
  fonte: FonteDeRepositorio
  indexador: (input: {
    snapshot: SnapshotAnalise
    arquivosFonte: ArquivoFonte[]
    configuracao?: ConfiguracaoProjeto
  }) => IndiceAnalise
  limites: LimitesConteudoRepositorio
}

export async function indexarSnapshotRepositorio({
  entrada,
  fonte,
  indexador,
  limites,
}: SolicitarIndexacaoSnapshot): Promise<IndiceAnalise> {
  const arquivosElegiveis = filtrarArquivosElegiveis(entrada.arquivos)

  if (arquivosElegiveis.length > limites.quantidadeMaximaArquivosElegiveis) {
    throw new ErroFonteRepositorio('QUANTIDADE_ARQUIVOS')
  }

  const arquivosFonte = (await fonte.obterArquivos({
    repositorio: entrada.repositorio,
    commitSha: entrada.snapshot.commitSha,
    arquivos: arquivosElegiveis.map((arquivo) => ({
      caminho: arquivo.caminho,
      blobSha: arquivo.sha,
      ...(arquivo.tamanhoBytes === undefined
        ? {}
        : { tamanhoBytes: arquivo.tamanhoBytes }),
    })),
  })).sort((primeiro, segundo) => primeiro.caminho.localeCompare(segundo.caminho))

  validarLimitesReais(arquivosFonte, limites)

  const configuracao = fonte.obterConfiguracao
    ? await fonte.obterConfiguracao({
        repositorio: entrada.repositorio,
        commitSha: entrada.snapshot.commitSha,
        arquivos: entrada.arquivos.filter(
          (arquivo) =>
            arquivo.caminho === 'tsconfig.json' || arquivo.caminho === 'jsconfig.json',
        ).map((arquivo) => ({
          caminho: arquivo.caminho,
          blobSha: arquivo.sha,
          ...(arquivo.tamanhoBytes === undefined
            ? {}
            : { tamanhoBytes: arquivo.tamanhoBytes }),
        })),
      })
    : undefined

  return indexador({
    snapshot: entrada.snapshot,
    arquivosFonte,
    ...(configuracao ? { configuracao } : {}),
  })
}

function validarLimitesReais(
  arquivosFonte: ArquivoFonte[],
  limites: LimitesConteudoRepositorio,
) {
  if (arquivosFonte.length > limites.quantidadeMaximaArquivosElegiveis) {
    throw new ErroFonteRepositorio('QUANTIDADE_ARQUIVOS')
  }

  let tamanhoTotal = 0

  for (const arquivo of arquivosFonte) {
    const tamanho = new TextEncoder().encode(arquivo.conteudo).byteLength

    if (tamanho > limites.tamanhoMaximoArquivoBytes) {
      throw new ErroFonteRepositorio('TAMANHO_ARQUIVO')
    }

    tamanhoTotal += tamanho
  }

  if (tamanhoTotal > limites.tamanhoMaximoTotalBytes) {
    throw new ErroFonteRepositorio('TAMANHO_TOTAL')
  }
}
