import { describe, expect, it, vi } from 'vitest'

import type { ArquivoDoSnapshot, IndiceAnalise } from '../analises.types'
import { type FonteDeRepositorio } from './fonte-repositorio'
import { criarFonteRepositorioGitHub } from './github/github-repositorio-fonte'
import { indexarImports } from './indexador/indexador-imports'
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
    idPublico: 'snapshot:teste',
    repositorio: {
      url: 'https://github.com/dono/repositorio',
      proprietario: 'dono',
      nome: 'repositorio',
    },
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
      exportacoes: [],
      simbolos: [],
      relacoesImportacao: [],
      diagnosticos: [],
      parcial: false,
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

  it('aceita extensões elegíveis em caixa alta e classifica o tipo corretamente', async () => {
    const entradaComExtensoesEmCaixaAlta = {
      ...entrada,
      arquivos: [
        { caminho: 'src/client.JS', sha: '1'.repeat(40) },
        { caminho: 'src/view.JsX', sha: '2'.repeat(40) },
        { caminho: 'src/types.TS', sha: '3'.repeat(40) },
        { caminho: 'src/page.TsX', sha: '4'.repeat(40) },
      ],
    }
    const fonte: FonteDeRepositorio = {
      obterArquivos: vi.fn(async ({ arquivos }: { arquivos: Array<{ caminho: string }> }) =>
        arquivos.map((arquivo) => ({ caminho: arquivo.caminho, conteudo: 'export {}' })),
      ),
    }

    const resultado = await indexarSnapshotRepositorio({
      entrada: entradaComExtensoesEmCaixaAlta,
      fonte,
      indexador: indexarImports,
      limites,
    })

    expect(resultado.arquivos).toEqual([
      { id: 'arquivo:src/client.JS', caminho: 'src/client.JS', tipo: 'javascript' },
      { id: 'arquivo:src/page.TsX', caminho: 'src/page.TsX', tipo: 'typescript' },
      { id: 'arquivo:src/types.TS', caminho: 'src/types.TS', tipo: 'typescript' },
      { id: 'arquivo:src/view.JsX', caminho: 'src/view.JsX', tipo: 'javascript' },
    ])
  })

  it('obtém tsconfig como auxiliar sem incluí-lo nos arquivos comuns do indexador', async () => {
    const indexador = vi.fn(() => criarIndiceVazio())
    const entradaComConfiguracao = {
      ...entrada,
      arquivos: [
        ...entrada.arquivos,
        { caminho: 'tsconfig.json', sha: 't'.repeat(40), tamanhoBytes: 80 },
        { caminho: 'jsconfig.json', sha: 'j'.repeat(40), tamanhoBytes: 80 },
      ],
    }
    const fonte: FonteDeRepositorio = {
      obterArquivos: vi.fn(async ({ arquivos }: { arquivos: ArquivoDoSnapshot[] }) =>
        arquivos.map((arquivo) => ({ caminho: arquivo.caminho, conteudo: 'export {}' })),
      ),
      obterConfiguracao: vi.fn(async ({ arquivos }: { arquivos: ArquivoDoSnapshot[] }) => {
        expect(arquivos).toEqual([
          { caminho: 'tsconfig.json', blobSha: 't'.repeat(40), tamanhoBytes: 80 },
          { caminho: 'jsconfig.json', blobSha: 'j'.repeat(40), tamanhoBytes: 80 },
        ])
        return {
          caminho: 'tsconfig.json' as const,
          conteudo: '{"compilerOptions":{"baseUrl":"."}}',
        }
      }),
    }

    await indexarSnapshotRepositorio({ entrada: entradaComConfiguracao, fonte, indexador, limites })

    expect(fonte.obterArquivos).toHaveBeenCalledWith({
      repositorio: entrada.repositorio,
      commitSha: entrada.snapshot.commitSha,
      arquivos: [
        { caminho: 'src/z.ts', blobSha: 'z'.repeat(40), tamanhoBytes: 10 },
        { caminho: 'src/a.ts', blobSha: 'a'.repeat(40), tamanhoBytes: 10 },
      ],
    })
    expect(indexador).toHaveBeenCalledWith(expect.objectContaining({
      configuracao: {
        caminho: 'tsconfig.json',
        conteudo: '{"compilerOptions":{"baseUrl":"."}}',
      },
    }))
  })

  it('mantém a prioridade do tsconfig sobre o jsconfig no fluxo completo', async () => {
    const tsconfigSha = 't'.repeat(40)
    const jsconfigSha = 'j'.repeat(40)
    const buscar = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      const sha = url.split('/').pop() ?? ''
      const conteudo = sha === tsconfigSha
        ? '{"compilerOptions":{"baseUrl":"."}}'
        : 'export {}'

      return new Response(
        JSON.stringify({
          sha,
          content: Buffer.from(conteudo).toString('base64'),
          encoding: 'base64',
        }),
        { status: 200 },
      )
    })
    const fonte = criarFonteRepositorioGitHub({ buscar })
    const indexador = vi.fn(() => criarIndiceVazio())

    await indexarSnapshotRepositorio({
      entrada: {
        ...entrada,
        arquivos: [
          ...entrada.arquivos,
          { caminho: 'tsconfig.json', sha: tsconfigSha },
          { caminho: 'jsconfig.json', sha: jsconfigSha },
        ],
      },
      fonte,
      indexador,
      limites,
    })

    expect(indexador).toHaveBeenCalledWith(expect.objectContaining({
      configuracao: {
        caminho: 'tsconfig.json',
        conteudo: '{"compilerOptions":{"baseUrl":"."}}',
      },
    }))
  })

  it('revalida a quantidade depois de obter os arquivos da fonte', async () => {
    const indexador = vi.fn(() => criarIndiceVazio())
    const fonte: FonteDeRepositorio = {
      obterArquivos: vi.fn(async () =>
        Array.from({ length: 251 }, (_, indice) => ({
          caminho: `src/arquivo-${indice}.ts`,
          conteudo: 'export {}',
        })),
      ),
    }

    await expect(
      indexarSnapshotRepositorio({ entrada, fonte, indexador, limites }),
    ).rejects.toMatchObject({ codigo: 'QUANTIDADE_ARQUIVOS' })
    expect(indexador).not.toHaveBeenCalled()
  })

  it('aborta quando existe configuração, mas a fonte não consegue obtê-la', async () => {
    const indexador = vi.fn(() => criarIndiceVazio())
    const fonte: FonteDeRepositorio = {
      obterArquivos: vi.fn(async ({ arquivos }: { arquivos: Array<{ caminho: string }> }) =>
        arquivos.map((arquivo) => ({ caminho: arquivo.caminho, conteudo: 'export {}' })),
      ),
      obterConfiguracao: vi.fn(async () => undefined),
    }

    await expect(
      indexarSnapshotRepositorio({
        entrada: {
          ...entrada,
          arquivos: [...entrada.arquivos, { caminho: 'tsconfig.json', sha: 't'.repeat(40) }],
        },
        fonte,
        indexador,
        limites,
      }),
    ).rejects.toMatchObject({ codigo: 'CONFIGURACAO_INDISPONIVEL' })
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
    exportacoes: [],
    simbolos: [],
    relacoesImportacao: [],
    diagnosticos: [],
    parcial: false,
  }
}
