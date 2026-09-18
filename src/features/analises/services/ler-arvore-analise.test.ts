import { describe, expect, it, vi } from 'vitest'

import type { RepositorioLeituraExploracao } from './exploracao-analise'
import { lerArvoreAnalise } from './ler-arvore-analise'

const id = '11111111-1111-4111-8111-111111111111'

describe('lerArvoreAnalise', () => {
  it('pede ao adapter somente a projeção do escopo informado', async () => {
    const arvore = { escopo: 'src', itens: [{ tipo: 'arquivo' as const, caminho: 'src/a.ts', nome: 'a.ts', linguagem: 'typescript' as const }] }
    const obterArvoreSnapshotConcluido = vi.fn().mockResolvedValue({ tipo: 'encontrada', arvore })
    const repositorio: Pick<RepositorioLeituraExploracao, 'obterArvoreSnapshotConcluido'> = { obterArvoreSnapshotConcluido }

    await expect(lerArvoreAnalise(id, 'src', repositorio)).resolves.toEqual(arvore)
    expect(obterArvoreSnapshotConcluido).toHaveBeenCalledWith(id, 'src')
  })

  it('não permite exploração de snapshot indisponível ou caminho inexistente', async () => {
    const repositorio: Pick<RepositorioLeituraExploracao, 'obterArvoreSnapshotConcluido'> = {
      obterArvoreSnapshotConcluido: vi.fn().mockResolvedValueOnce({ tipo: 'snapshot_indisponivel' }).mockResolvedValueOnce({ tipo: 'caminho_inexistente' }),
    }
    await expect(lerArvoreAnalise(id, null, repositorio)).rejects.toMatchObject({ codigo: 'SNAPSHOT_NAO_ENCONTRADO' })
    await expect(lerArvoreAnalise(id, 'src', repositorio)).rejects.toMatchObject({ codigo: 'CAMINHO_NAO_ENCONTRADO' })
  })
})
