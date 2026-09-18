import { describe, expect, it, vi } from 'vitest'

import { obterRepositorioExploracaoAnaliseServidor } from '@/features/analises/services/composicao-exploracao-analise-servidor'
import type { RepositorioLeituraExploracao } from '@/features/analises/services/exploracao-analise'

import { GET } from './route'

vi.mock('@/features/analises/services/composicao-exploracao-analise-servidor', () => ({ obterRepositorioExploracaoAnaliseServidor: vi.fn() }))

const id = '11111111-1111-4111-8111-111111111111'
const repositorio: RepositorioLeituraExploracao = {
  obterArvoreSnapshotConcluido: async () => ({ tipo: 'encontrada', arvore: { escopo: null, itens: [] } }),
  obterRelacoesArquivoSnapshotConcluido: async () => ({ tipo: 'encontrada', relacoes: { arquivo: { caminho: 'src/a.ts', linguagem: 'typescript' }, importa: [{ caminho: 'src/b.ts', quantidadeImports: 2 }], importadoPor: [], limitacoes: [{ codigo: 'COMMONJS_NAO_SUPORTADO', categoria: 'limitacao' }] } }),
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

  it('rejeita identificador inválido sem consultar o repositório', async () => {
    const obter = vi.mocked(obterRepositorioExploracaoAnaliseServidor)
    obter.mockReturnValue(repositorio)
    const resposta = await GET(new Request('http://localhost/api/analises/invalido/relacoes?arquivo=src/a.ts'), { params: Promise.resolve({ snapshotId: 'invalido' }) })
    expect(resposta.status).toBe(400)
    expect((await resposta.json()).erro.codigo).toBe('REQUISICAO_INVALIDA')
  })

  it.each(['inexistente', 'aguardando', 'processando', 'falha'])('não expõe relações para snapshot %s', async () => {
    vi.mocked(obterRepositorioExploracaoAnaliseServidor).mockReturnValue({
      ...repositorio,
      obterRelacoesArquivoSnapshotConcluido: async () => ({ tipo: 'snapshot_indisponivel' }),
    })
    const resposta = await GET(new Request(`http://localhost/api/analises/${id}/relacoes?arquivo=src/a.ts`), { params: Promise.resolve({ snapshotId: id }) })
    expect(resposta.status).toBe(404)
    expect((await resposta.json()).erro.codigo).toBe('SNAPSHOT_NAO_ENCONTRADO')
  })

  it('diferencia arquivo inexistente dentro de snapshot concluído', async () => {
    vi.mocked(obterRepositorioExploracaoAnaliseServidor).mockReturnValue({
      ...repositorio,
      obterRelacoesArquivoSnapshotConcluido: async () => ({ tipo: 'arquivo_inexistente' }),
    })
    const resposta = await GET(new Request(`http://localhost/api/analises/${id}/relacoes?arquivo=src/inexistente.ts`), { params: Promise.resolve({ snapshotId: id }) })
    expect(resposta.status).toBe(404)
    expect((await resposta.json()).erro.codigo).toBe('CAMINHO_NAO_ENCONTRADO')
  })
})
