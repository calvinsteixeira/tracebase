import { describe, expect, it } from 'vitest'

import type { FonteRepositorioGitHub } from './github/github-repositorio.types'
import {
  LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
  filtrarArquivosElegiveis,
  avaliarElegibilidadeRepositorio,
  verificarElegibilidadeRepositorio,
} from './criar-snapshot-repositorio'
import { analisarUrlRepositorio } from './validar-url-repositorio'

const resumoFonte = {
  proprietario: 'calvinsteixeira',
  nome: 'tracebase',
  url: 'https://github.com/calvinsteixeira/tracebase',
  referencia: 'main',
  commitSha: 'a'.repeat(40),
  arquivos: [
    { caminho: 'src/app/page.tsx', sha: 'b'.repeat(40), tamanhoBytes: 1200 },
    { caminho: 'src/lib/client.js', sha: 'c'.repeat(40), tamanhoBytes: 800 },
    { caminho: 'README.md', sha: 'd'.repeat(40), tamanhoBytes: 400 },
    { caminho: 'node_modules/pkg/index.js', sha: 'e'.repeat(40), tamanhoBytes: 400 },
    { caminho: 'dist/index.js', sha: 'f'.repeat(40), tamanhoBytes: 400 },
  ],
}

describe('analisarUrlRepositorio', () => {
  it('converte uma URL canônica em proprietário e nome', () => {
    expect(analisarUrlRepositorio('https://github.com/dono/repositorio')).toEqual({
      proprietario: 'dono',
      nome: 'repositorio',
    })
  })

  it.each([
    'http://github.com/dono/repositorio',
    'https://gitlab.com/dono/repositorio',
    'https://github.com/dono/repositorio.git',
    'https://github.com/dono/repositorio/tree/main',
    'https://github.com/dono/repositorio?tab=readme',
    'https://github.com/dono/repositorio/',
    'não é uma URL',
  ])('rejeita URL fora do formato canônico: %s', (url) => {
    expect(() => analisarUrlRepositorio(url)).toThrow(
      'Informe uma URL canônica de repositório público do GitHub.',
    )
  })
})

describe('filtrarArquivosElegiveis', () => {
  it('mantém apenas JS/TS e ignora diretórios gerados', () => {
    expect(
      filtrarArquivosElegiveis([
        { caminho: 'src/app/page.tsx', sha: '1'.repeat(40) },
        { caminho: 'src/lib/client.JS', sha: '2'.repeat(40) },
        { caminho: 'README.md', sha: '3'.repeat(40) },
        { caminho: 'node_modules/pkg/index.js', sha: '4'.repeat(40) },
        { caminho: '.next/server/app.js', sha: '5'.repeat(40) },
      ]).map((arquivo) => arquivo.caminho),
    ).toEqual(['src/app/page.tsx', 'src/lib/client.JS'])
  })
})

describe('verificarElegibilidadeRepositorio', () => {
  it('retorna elegível e conta somente os arquivos JS/TS do repositório misto', async () => {
    const fonte: FonteRepositorioGitHub = {
      obterResumoRepositorio: async () => resumoFonte,
    }

    await expect(
      verificarElegibilidadeRepositorio('https://github.com/calvinsteixeira/tracebase', fonte),
    ).resolves.toEqual({
      status: 'elegivel',
      repositorio: {
        url: resumoFonte.url,
        proprietario: 'calvinsteixeira',
        nome: 'tracebase',
      },
      snapshot: {
        commitSha: 'a'.repeat(40),
        referencia: 'main',
      },
      quantidadeArquivosElegiveis: 2,
      tamanhoTotalBytes: 2000,
      detalhe: null,
      limites: LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
    })
  })

  it('retorna não elegível quando não há arquivos JS/TS', () => {
    expect(
      avaliarElegibilidadeRepositorio(
        [{ caminho: 'README.md', sha: '6'.repeat(40), tamanhoBytes: 400 }],
        LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
      ),
    ).toEqual({
      status: 'nao-elegivel',
      quantidadeArquivosElegiveis: 0,
      tamanhoTotalBytes: 0,
      detalhe: { criterio: 'sem-arquivos', encontrado: 0, maximo: null },
    })
  })

  it('informa o excesso do limite de quantidade de arquivos', () => {
    const arquivos = Array.from({ length: 251 }, (_, indice) => ({
      caminho: `src/arquivo-${indice}.ts`,
      sha: `${indice}`.repeat(40),
      tamanhoBytes: 1,
    }))

    expect(
      avaliarElegibilidadeRepositorio(arquivos, LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO),
    ).toMatchObject({
      status: 'nao-elegivel',
      quantidadeArquivosElegiveis: 251,
      detalhe: {
        criterio: 'quantidade-arquivos',
        encontrado: 251,
        maximo: 250,
      },
    })
  })

  it('informa o excesso do limite por arquivo', () => {
    expect(
      avaliarElegibilidadeRepositorio(
        [{ caminho: 'src/grande.ts', sha: '7'.repeat(40), tamanhoBytes: 524289 }],
        LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
      ),
    ).toMatchObject({
      status: 'nao-elegivel',
      detalhe: {
        criterio: 'tamanho-arquivo',
        encontrado: 524289,
        maximo: 524288,
        caminho: 'src/grande.ts',
      },
    })
  })

  it('informa o excesso do limite total', () => {
    const arquivos = Array.from({ length: 11 }, (_, indice) => ({
      caminho: `src/arquivo-${indice}.ts`,
      sha: `${indice}`.repeat(40),
      tamanhoBytes: 512 * 1024,
    }))

    expect(
      avaliarElegibilidadeRepositorio(arquivos, LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO),
    ).toMatchObject({
      status: 'nao-elegivel',
      tamanhoTotalBytes: 11 * 512 * 1024,
      detalhe: {
        criterio: 'tamanho-total',
        encontrado: 11 * 512 * 1024,
        maximo: 5 * 1024 * 1024,
      },
    })
  })

  it('retorna verificação inconclusiva sem inventar tamanho desconhecido', () => {
    expect(
      avaliarElegibilidadeRepositorio(
        [{ caminho: 'src/desconhecido.ts', sha: '8'.repeat(40) }],
        LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
      ),
    ).toEqual({
      status: 'inconclusiva',
      quantidadeArquivosElegiveis: 1,
      tamanhoTotalBytes: null,
      detalhe: {
        criterio: 'tamanho-desconhecido',
        encontrado: null,
        maximo: 5 * 1024 * 1024,
      },
    })
  })
})
