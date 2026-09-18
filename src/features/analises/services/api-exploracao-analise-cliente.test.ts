import { afterEach, describe, expect, it, vi } from 'vitest'

import { buscarArvoreAnalise, buscarRelacoesAnalise, ErroExploracaoAnaliseCliente } from './api-exploracao-analise-cliente'
import { analisesQueryKeys } from './analises-query-keys'

afterEach(() => vi.restoreAllMocks())

describe('cliente da exploração', () => {
  it('monta as URLs codificando escopo e arquivo', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ escopo: 'src/features', itens: [] }), { status: 200 }))

    await buscarArvoreAnalise('snapshot/seguro', 'src/100%')
    await buscarRelacoesAnalise('snapshot/seguro', 'src/a file.ts')

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/analises/snapshot%2Fseguro/arvore?caminho=src%2F100%25')
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/analises/snapshot%2Fseguro/relacoes?arquivo=src%2Fa%20file.ts')
  })

  it('preserva códigos seguros devolvidos pelas APIs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ erro: { codigo: 'CAMINHO_NAO_ENCONTRADO', mensagem: 'segura' } }), { status: 404 }))

    await expect(buscarArvoreAnalise('id', 'src')).rejects.toMatchObject({ codigo: 'CAMINHO_NAO_ENCONTRADO', status: 404 } satisfies Partial<ErroExploracaoAnaliseCliente>)
  })

  it('usa snapshot e path nas chaves de cache', () => {
    expect(analisesQueryKeys.arvore('id-a', null)).toEqual(['analises', 'id-a', 'arvore', 'raiz'])
    expect(analisesQueryKeys.arvore('id-a', 'src')).toEqual(['analises', 'id-a', 'arvore', 'src'])
    expect(analisesQueryKeys.relacoes('id-a', 'src/a.ts')).toEqual(['analises', 'id-a', 'relacoes', 'src/a.ts'])
    expect(analisesQueryKeys.relacoes('id-b', 'src/a.ts')).not.toEqual(analisesQueryKeys.relacoes('id-a', 'src/a.ts'))
  })
})
