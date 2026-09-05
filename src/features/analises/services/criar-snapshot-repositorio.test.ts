import { describe, expect, it } from 'vitest'

import type { FonteRepositorioGitHub } from './github/github-repositorio.types'
import {
  criarSnapshotRepositorio,
  filtrarArquivosElegiveis,
} from './criar-snapshot-repositorio'
import { analisarUrlRepositorio } from './validar-url-repositorio'

const resumoFonte = {
  proprietario: 'calvinsteixeira',
  nome: 'tracebase',
  url: 'https://github.com/calvinsteixeira/tracebase',
  referencia: 'main',
  commitSha: 'a'.repeat(40),
  arquivos: [
    { caminho: 'src/app/page.tsx', tamanhoBytes: 1200 },
    { caminho: 'src/lib/client.js', tamanhoBytes: 800 },
    { caminho: 'README.md', tamanhoBytes: 400 },
    { caminho: 'node_modules/pkg/index.js', tamanhoBytes: 400 },
    { caminho: 'dist/index.js', tamanhoBytes: 400 },
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
        { caminho: 'src/app/page.tsx' },
        { caminho: 'src/lib/client.JS' },
        { caminho: 'README.md' },
        { caminho: 'node_modules/pkg/index.js' },
        { caminho: '.next/server/app.js' },
      ]).map((arquivo) => arquivo.caminho),
    ).toEqual(['src/app/page.tsx', 'src/lib/client.JS'])
  })
})

describe('criarSnapshotRepositorio', () => {
  it('resolve o resumo e conta somente os arquivos elegíveis', async () => {
    const fonte: FonteRepositorioGitHub = {
      obterResumoRepositorio: async () => resumoFonte,
    }

    await expect(
      criarSnapshotRepositorio('https://github.com/calvinsteixeira/tracebase', fonte),
    ).resolves.toEqual({
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
    })
  })

  it('rejeita repositório sem arquivo elegível', async () => {
    const fonte: FonteRepositorioGitHub = {
      obterResumoRepositorio: async () => ({ ...resumoFonte, arquivos: [] }),
    }

    await expect(
      criarSnapshotRepositorio('https://github.com/dono/repositorio', fonte),
    ).rejects.toMatchObject({ codigo: 'SEM_ARQUIVOS_ELEGIVEIS' })
  })

  it('aplica o limite de arquivos sem escolher valor de produto', async () => {
    const fonte: FonteRepositorioGitHub = {
      obterResumoRepositorio: async () => resumoFonte,
    }

    await expect(
      criarSnapshotRepositorio('https://github.com/dono/repositorio', fonte, {
        quantidadeMaximaArquivosElegiveis: 1,
      }),
    ).rejects.toMatchObject({ codigo: 'LIMITE_EXCEDIDO' })
  })
})
