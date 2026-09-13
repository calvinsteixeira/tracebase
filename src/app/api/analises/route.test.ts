import { describe, expect, it, vi } from 'vitest'

import { POST } from './elegibilidade/route'

describe('POST /api/analises/elegibilidade', () => {
  it('valida a URL no servidor antes de consultar o GitHub', async () => {
    const buscar = vi.fn()
    vi.stubGlobal('fetch', buscar)

    const resposta = await POST(
      new Request('http://localhost/api/analises', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://gitlab.com/dono/repositorio' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    expect(resposta.status).toBe(400)
    expect(await resposta.json()).toEqual({
      erro: {
        codigo: 'URL_INVALIDA',
        mensagem: 'Informe uma URL canônica de repositório público do GitHub.',
      },
    })
    expect(buscar).not.toHaveBeenCalled()
  })

  it('devolve o contrato seguro de elegibilidade sem incluir dados de autenticação', async () => {
    const respostas = [
      {
        full_name: 'dono/repositorio',
        html_url: 'https://github.com/dono/repositorio',
        private: false,
        default_branch: 'main',
      },
      { sha: 'f'.repeat(40) },
      {
        truncated: false,
      tree: [{ path: 'src/index.ts', type: 'blob', size: 100 }],
      },
    ]
    const buscar = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify(respostas.shift()), { status: 200 })
    })
    vi.stubGlobal('fetch', buscar)

    const resposta = await POST(
      new Request('http://localhost/api/analises', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://github.com/dono/repositorio' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({
      status: 'elegivel',
      repositorio: {
        url: 'https://github.com/dono/repositorio',
        proprietario: 'dono',
        nome: 'repositorio',
      },
      snapshot: { commitSha: 'f'.repeat(40), referencia: 'main' },
      quantidadeArquivosElegiveis: 1,
      tamanhoTotalBytes: 100,
      detalhe: null,
      limites: {
        quantidadeMaximaArquivosElegiveis: 250,
        tamanhoMaximoArquivoBytes: 512 * 1024,
        tamanhoMaximoTotalBytes: 5 * 1024 * 1024,
      },
    })
    expect(JSON.stringify(buscar.mock.calls)).not.toContain('GITHUB_TOKEN')
  })

  it.each([
    [404, 'REPOSITORIO_INDISPONIVEL'],
    [429, 'LIMITE_GITHUB'],
    [503, 'GITHUB_INDISPONIVEL'],
  ] as const)('preserva erro conhecido do GitHub (%s)', async (status, codigo) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('{}', { status })))

    const resposta = await POST(new Request('http://localhost/api/analises/elegibilidade', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://github.com/dono/repositorio' }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(resposta.status).toBe(status)
    expect((await resposta.json()).erro.codigo).toBe(codigo)
  })

  it('preserva verificação inconclusiva como 422', async () => {
    const respostas = [
      { full_name: 'dono/repositorio', html_url: 'https://github.com/dono/repositorio', private: false, default_branch: 'main' },
      { sha: 'f'.repeat(40) },
      { truncated: true, tree: [] },
    ]
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(JSON.stringify(respostas.shift()), { status: 200 })))

    const resposta = await POST(new Request('http://localhost/api/analises/elegibilidade', {
      method: 'POST', body: JSON.stringify({ url: 'https://github.com/dono/repositorio' }), headers: { 'Content-Type': 'application/json' },
    }))

    expect(resposta.status).toBe(422)
    expect((await resposta.json()).erro.codigo).toBe('VERIFICACAO_INCONCLUSIVA')
  })

  it('preserva repositório privado como 404', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ private: true }), { status: 200 })))

    const resposta = await POST(new Request('http://localhost/api/analises/elegibilidade', {
      method: 'POST', body: JSON.stringify({ url: 'https://github.com/dono/repositorio' }), headers: { 'Content-Type': 'application/json' },
    }))

    expect(resposta.status).toBe(404)
    expect((await resposta.json()).erro.codigo).toBe('REPOSITORIO_PRIVADO')
  })
})
