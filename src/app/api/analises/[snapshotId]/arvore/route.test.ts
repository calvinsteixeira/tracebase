import { describe, expect, it, vi } from 'vitest'

import { obterRepositorioExploracaoAnaliseServidor } from '@/features/analises/services/composicao-exploracao-analise-servidor'
import { ErroExploracaoAnalise, type RepositorioLeituraExploracao } from '@/features/analises/services/exploracao-analise'

import { GET } from './route'

vi.mock('@/features/analises/services/composicao-exploracao-analise-servidor', () => ({ obterRepositorioExploracaoAnaliseServidor: vi.fn() }))

const id = '11111111-1111-4111-8111-111111111111'
const repositorio: RepositorioLeituraExploracao = {
  obterArquivosSnapshotConcluido: async () => [{ caminho: 'src/a.ts', linguagem: 'typescript' }, { caminho: 'src/lib/b.js', linguagem: 'javascript' }],
  obterRelacoesArquivoSnapshotConcluido: async () => null,
}

describe('GET /api/analises/[snapshotId]/arvore', () => {
  it('retorna somente a árvore pública', async () => {
    vi.mocked(obterRepositorioExploracaoAnaliseServidor).mockReturnValue(repositorio)
    const resposta = await GET(new Request(`http://localhost/api/analises/${id}/arvore?caminho=src`), { params: Promise.resolve({ snapshotId: id }) })
    expect(resposta.status).toBe(200)
    const corpo = await resposta.json()
    expect(corpo).toEqual({ escopo: 'src', itens: [{ tipo: 'pasta', caminho: 'src/lib', nome: 'lib', quantidadeArquivos: 1 }, { tipo: 'arquivo', caminho: 'src/a.ts', nome: 'a.ts', linguagem: 'typescript' }] })
    expect(JSON.stringify(corpo)).not.toMatch(/conteudo|blob|lease|id_fato|stack/i)
  })

  it('devolve erro seguro para caminho inválido', async () => {
    vi.mocked(obterRepositorioExploracaoAnaliseServidor).mockReturnValue(repositorio)
    const resposta = await GET(new Request(`http://localhost/api/analises/${id}/arvore?caminho=../privado`), { params: Promise.resolve({ snapshotId: id }) })
    expect(resposta.status).toBe(400)
    expect((await resposta.json()).erro.codigo).toBe('CAMINHO_INVALIDO')
  })

  it('mapeia snapshot indisponível para o formato seguro existente', async () => {
    vi.mocked(obterRepositorioExploracaoAnaliseServidor).mockReturnValue({ ...repositorio, obterArquivosSnapshotConcluido: async () => { throw new ErroExploracaoAnalise('SNAPSHOT_NAO_ENCONTRADO') } })
    const resposta = await GET(new Request(`http://localhost/api/analises/${id}/arvore`), { params: Promise.resolve({ snapshotId: id }) })
    expect(resposta.status).toBe(404)
    expect((await resposta.json()).erro.codigo).toBe('SNAPSHOT_NAO_ENCONTRADO')
  })
})
