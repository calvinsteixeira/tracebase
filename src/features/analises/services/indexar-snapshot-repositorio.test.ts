import { describe, expect, it, vi } from 'vitest'

import type { IndiceAnalise } from '../analises.types'
import { type FonteDeRepositorio } from './fonte-repositorio'
import {
  indexarSnapshotRepositorio,
  type LimitesConteudoRepositorio,
  type SolicitarIndexacaoSnapshot,
} from './indexar-snapshot-repositorio'

const limites: LimitesConteudoRepositorio = {
  quantidadeMaximaArquivosElegiveis: 250,
  tamanhoMaximoArquivoBytes: 512 * 1024,
  tamanhoMaximoTotalBytes: 5 * 1024 * 1024,
}

const entrada = {
  repositorio: {
    id: 'repositorio:teste',
    url: 'https://github.com/dono/repositorio',
    proprietario: 'dono',
    nome: 'repositorio',
  },
  snapshot: {
    id: 'snapshot:teste',
    repositorioId: 'repositorio:teste',
    commitSha: 'c'.repeat(40),
    referencia: 'main',
  },
  arquivos: [
    { caminho: 'README.md', sha: 'r'.repeat(40), tamanhoBytes: 100 },
    { caminho: 'dist/gerado.ts', sha: 'd'.repeat(40), tamanhoBytes: 100 },
    { caminho: 'src/z.ts', sha: 'z'.repeat(40), tamanhoBytes: 10 },
    { caminho: 'src/a.ts', sha: 'a'.repeat(40), tamanhoBytes: 10 },
  ],
}

describe('indexarSnapshotRepositorio', () => {
  it('filtra arquivos, entrega o commit e os SHAs ao adapter e passa fontes ordenadas ao indexador', async () => {
    const fonte: FonteDeRepositorio = {
      obterArquivos: vi.fn(async ({ arquivos }) =>
        [...arquivos]
          .reverse()
          .map((arquivo) => ({ caminho: arquivo.caminho, conteudo: `// ${arquivo.blobSha}` })),
      ),
    }
    const indexador = vi.fn(({
      snapshot,
      arquivosFonte,
    }: Parameters<SolicitarIndexacaoSnapshot['indexador']>[0]): IndiceAnalise => ({
      snapshot,
      arquivos: arquivosFonte.map((arquivo, indice) => ({
        id: String(indice),
        caminho: arquivo.caminho,
        tipo: 'typescript',
      })),
      simbolos: [],
      relacoesImportacao: [],
    }))

    const resultado = await indexarSnapshotRepositorio({
      entrada,
      fonte,
      indexador,
      limites,
    })

    expect(fonte.obterArquivos).toHaveBeenCalledWith({
      repositorio: entrada.repositorio,
      commitSha: entrada.snapshot.commitSha,
      arquivos: [
        { caminho: 'src/z.ts', blobSha: 'z'.repeat(40), tamanhoBytes: 10 },
        { caminho: 'src/a.ts', blobSha: 'a'.repeat(40), tamanhoBytes: 10 },
      ],
    })
    expect(indexador).toHaveBeenCalledWith({
      snapshot: entrada.snapshot,
      arquivosFonte: [
        { caminho: 'src/a.ts', conteudo: `// ${'a'.repeat(40)}` },
        { caminho: 'src/z.ts', conteudo: `// ${'z'.repeat(40)}` },
      ],
    })
    expect(resultado).not.toHaveProperty('arquivos.0.conteudo')
  })

  it('revalida o limite real por arquivo antes de chamar o indexador', async () => {
    const indexador = vi.fn(() => criarIndiceVazio())
    const fonte = fonteComConteudo('a'.repeat(limites.tamanhoMaximoArquivoBytes + 1))

    await expect(
      indexarSnapshotRepositorio({ entrada, fonte, indexador, limites }),
    ).rejects.toMatchObject({ codigo: 'TAMANHO_ARQUIVO' })
    expect(indexador).not.toHaveBeenCalled()
  })

  it('revalida o limite real total antes de chamar o indexador', async () => {
    const indexador = vi.fn(() => criarIndiceVazio())
    const fonte: FonteDeRepositorio = {
      obterArquivos: vi.fn(async () =>
        Array.from({ length: 11 }, (_, indice) => ({
          caminho: `src/${indice}.ts`,
          conteudo: 'a'.repeat(limites.tamanhoMaximoArquivoBytes),
        })),
      ),
    }

    await expect(
      indexarSnapshotRepositorio({ entrada, fonte, indexador, limites }),
    ).rejects.toMatchObject({ codigo: 'TAMANHO_TOTAL' })
    expect(indexador).not.toHaveBeenCalled()
  })

  it('interrompe antes de buscar quando a quantidade preliminar excede o limite', async () => {
    const indexador = vi.fn(() => criarIndiceVazio())
    const fonte = fonteComConteudo('conteudo')
    const muitosArquivos = Array.from({ length: 251 }, (_, indice) => ({
      caminho: `src/${indice}.ts`,
      sha: String(indice).repeat(40),
    }))

    await expect(
      indexarSnapshotRepositorio({
        entrada: { ...entrada, arquivos: muitosArquivos },
        fonte,
        indexador,
        limites,
      }),
    ).rejects.toMatchObject({ codigo: 'QUANTIDADE_ARQUIVOS' })
    expect(fonte.obterArquivos).not.toHaveBeenCalled()
    expect(indexador).not.toHaveBeenCalled()
  })
})

function fonteComConteudo(conteudo: string): FonteDeRepositorio {
  return {
    obterArquivos: vi.fn(async ({ arquivos }: { arquivos: Array<{ caminho: string }> }) =>
      arquivos.map((arquivo) => ({ caminho: arquivo.caminho, conteudo })),
    ),
  }
}

function criarIndiceVazio(): IndiceAnalise {
  return {
    snapshot: entrada.snapshot,
    arquivos: [],
    simbolos: [],
    relacoesImportacao: [],
  }
}
