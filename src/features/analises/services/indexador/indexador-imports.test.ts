import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type {
  ArquivoFonte,
  SnapshotAnalise,
} from '@/features/analises/analises.types'

import { indexarImports } from './indexador-imports'

const diretorioAtual = path.dirname(fileURLToPath(import.meta.url))
const diretorioFixture = path.resolve(
  diretorioAtual,
  '../../../../test/fixtures/repositorios/projeto-imports',
)

const snapshot: SnapshotAnalise = {
  id: 'snapshot:tracebase-fixture',
  repositorioId: 'repositorio:tracebase-fixture',
  commitSha: 'a1b2c3d4',
  referencia: 'main',
}

describe('indexarImports', () => {
  it('indexa arquivos e relações internas, externas e não resolvidas', async () => {
    const indice = indexarImports({
      snapshot,
      arquivosFonte: await lerArquivosFixture(diretorioFixture),
    })

    expect(indice.snapshot).toEqual(snapshot)
    expect(indice.arquivos.map((arquivo) => arquivo.caminho)).toEqual([
      'src/app/page.ts',
      'src/components/button.tsx',
      'src/components/card/index.ts',
      'src/lib/format-name.ts',
    ])
    expect(indice.simbolos).toEqual([])
    expect(indice.relacoesImportacao).toEqual([
      expect.objectContaining({
        tipo: 'importa',
        destino: {
          tipo: 'interno',
          caminhoArquivo: 'src/components/card/index.ts',
        },
        evidencia: expect.objectContaining({
          caminhoArquivo: 'src/app/page.ts',
          inicio: { linha: 1, coluna: 22 },
        }),
      }),
      expect.objectContaining({
        destino: {
          tipo: 'interno',
          caminhoArquivo: 'src/lib/format-name.ts',
        },
      }),
      expect.objectContaining({
        destino: {
          tipo: 'externo',
          especificador: 'node:path',
        },
      }),
      expect.objectContaining({
        destino: {
          tipo: 'nao-resolvido',
          especificador: '../missing',
        },
      }),
      expect.objectContaining({
        destino: {
          tipo: 'interno',
          caminhoArquivo: 'src/components/button.tsx',
        },
      }),
    ])
  })

  it('rejeita arquivos duplicados no mesmo snapshot', () => {
    const arquivo: ArquivoFonte = {
      caminho: 'src/app/page.ts',
      conteudo: 'export {}',
    }

    expect(() =>
      indexarImports({
        snapshot,
        arquivosFonte: [arquivo, arquivo],
      }),
    ).toThrow('O snapshot contém o arquivo duplicado "src/app/page.ts".')
  })
})

async function lerArquivosFixture(diretorio: string): Promise<ArquivoFonte[]> {
  const entradas = await readdir(diretorio, { withFileTypes: true })
  const arquivos = await Promise.all(
    entradas.map(async (entrada) => {
      const caminhoCompleto = path.join(diretorio, entrada.name)

      if (entrada.isDirectory()) {
        return lerArquivosFixture(caminhoCompleto)
      }

      const conteudo = await readFile(caminhoCompleto, 'utf8')

      return [
        {
          caminho: path
            .relative(diretorioFixture, caminhoCompleto)
            .slice(0, -4)
            .split(path.sep)
            .join('/'),
          conteudo,
        },
      ]
    }),
  )

  return arquivos.flat()
}
