import { describe, expect, it } from 'vitest'

import type { RepositorioLeituraExploracao } from './exploracao-analise'
import { lerRelacoesAnalise } from './ler-relacoes-analise'

const id = '11111111-1111-4111-8111-111111111111'

describe('lerRelacoesAnalise', () => {
  it('devolve relações internas e limitações seguras sem dados internos', async () => {
    const repositorio: Pick<RepositorioLeituraExploracao, 'obterRelacoesArquivoSnapshotConcluido'> = {
      obterRelacoesArquivoSnapshotConcluido: async () => ({ tipo: 'encontrada', relacoes: {
        arquivo: { caminho: 'src/a.ts', linguagem: 'typescript' },
        importa: [{ caminho: 'src/b.ts', quantidadeImports: 2 }],
        importadoPor: [{ caminho: 'src/c.ts', quantidadeImports: 1 }],
        limitacoes: [{ codigo: 'ERRO_SINTATICO', categoria: 'sintaxe' }],
      } }),
    }

    const resultado = await lerRelacoesAnalise(id, 'src/a.ts', repositorio)
    expect(resultado).toEqual({
      arquivo: { caminho: 'src/a.ts', nome: 'a.ts', linguagem: 'typescript' },
      importa: [{ caminho: 'src/b.ts', quantidadeImports: 2 }],
      importadoPor: [{ caminho: 'src/c.ts', quantidadeImports: 1 }],
      limitacoes: [{ codigo: 'ERRO_SINTATICO', categoria: 'sintaxe' }],
    })
    expect(JSON.stringify(resultado)).not.toMatch(/conteudo|blob|stack|lease|id_fato/i)
  })

  it('mapeia snapshot indisponível e arquivo inexistente separadamente', async () => {
    const snapshotIndisponivel: Pick<RepositorioLeituraExploracao, 'obterRelacoesArquivoSnapshotConcluido'> = {
      obterRelacoesArquivoSnapshotConcluido: async () => ({ tipo: 'snapshot_indisponivel' }),
    }
    const arquivoInexistente: Pick<RepositorioLeituraExploracao, 'obterRelacoesArquivoSnapshotConcluido'> = {
      obterRelacoesArquivoSnapshotConcluido: async () => ({ tipo: 'arquivo_inexistente' }),
    }

    await expect(lerRelacoesAnalise(id, 'src/a.ts', snapshotIndisponivel)).rejects.toMatchObject({ codigo: 'SNAPSHOT_NAO_ENCONTRADO' })
    await expect(lerRelacoesAnalise(id, 'src/a.ts', arquivoInexistente)).rejects.toMatchObject({ codigo: 'CAMINHO_NAO_ENCONTRADO' })
  })
})
