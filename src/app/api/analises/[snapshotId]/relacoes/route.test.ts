import { describe, expect, it, vi } from 'vitest'

import { obterRepositorioExploracaoAnaliseServidor } from '@/features/analises/services/composicao-exploracao-analise-servidor'
import type { RepositorioLeituraExploracao } from '@/features/analises/services/exploracao-analise'

import { GET } from './route'

vi.mock('@/features/analises/services/composicao-exploracao-analise-servidor', () => ({ obterRepositorioExploracaoAnaliseServidor: vi.fn() }))

const id = '11111111-1111-4111-8111-111111111111'
const repositorio: RepositorioLeituraExploracao = {
  obterArquivosSnapshotConcluido: async () => [],
  obterRelacoesArquivoSnapshotConcluido: async () => ({ arquivo: { caminho: 'src/a.ts', linguagem: 'typescript' }, importa: [{ caminho: 'src/b.ts', quantidadeImports: 2 }], importadoPor: [], limitacoes: [{ codigo: 'COMMONJS_NAO_SUPORTADO', categoria: 'limitacao' }] }),
}

describe('GET /api/analises/[snapshotId]/relacoes', () => {
  it('retorna relações consolidadas e diagnósticos seguros', async () => {
    vi.mocked(obterRepositorioExploracaoAnaliseServidor).mockReturnValue(repositorio)
    const resposta = await GET(new Request(`http://localhost/api/analises/${id}/relacoes?arquivo=src/a.ts`), { params: Promise.resolve({ snapshotId: id }) })
    expect(resposta.status).toBe(200)
    const corpo = await resposta.json()
    expect(corpo.arquivo).toEqual({ caminho: 'src/a.ts', nome: 'a.ts', linguagem: 'typescript' })
    expect(corpo.importa).toEqual([{ caminho: 'src/b.ts', quantidadeImports: 2 }])
    expect(JSON.stringify(corpo)).not.toMatch(/conteudo|blob|lease|id_fato|mensagem|stack/i)
  })

  it('exige o arquivo e devolve erro seguro', async () => {
    vi.mocked(obterRepositorioExploracaoAnaliseServidor).mockReturnValue(repositorio)
    const resposta = await GET(new Request(`http://localhost/api/analises/${id}/relacoes`), { params: Promise.resolve({ snapshotId: id }) })
    expect(resposta.status).toBe(400)
    expect((await resposta.json()).erro.codigo).toBe('ARQUIVO_OBRIGATORIO')
  })
})
