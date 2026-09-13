import { describe, expect, it, vi } from 'vitest'

import {
  criarFonteRepositorioGitHub,
  mapearErroFonteGitHub,
} from './github-repositorio-fonte'

describe('criarFonteRepositorioGitHub', () => {
  it('consulta repositório, branch padrão, commit e árvore sem expor o token', async () => {
    const respostas = [
      {
        full_name: 'dono/repositorio',
        html_url: 'https://github.com/dono/repositorio',
        private: false,
        default_branch: 'main',
      },
      { sha: 'b'.repeat(40) },
      {
        truncated: false,
        tree: [
          { path: 'src/index.ts', sha: 'd'.repeat(40), type: 'blob', size: 100 },
          { path: 'README.md', sha: 'e'.repeat(40), type: 'blob', size: 50 },
          { path: 'src', type: 'tree' },
        ],
      },
    ]
    const buscar = vi.fn<typeof fetch>(async () => {
      const corpo = respostas.shift()

      return new Response(JSON.stringify(corpo), { status: 200 })
    })
    const fonte = criarFonteRepositorioGitHub({ buscar, token: 'token-secreto' })

    await expect(fonte.obterResumoRepositorio('dono', 'repositorio')).resolves.toEqual({
      proprietario: 'dono',
      nome: 'repositorio',
      url: 'https://github.com/dono/repositorio',
      referencia: 'main',
      commitSha: 'b'.repeat(40),
      arquivos: [
        { caminho: 'src/index.ts', sha: 'd'.repeat(40), tamanhoBytes: 100 },
        { caminho: 'README.md', sha: 'e'.repeat(40), tamanhoBytes: 50 },
      ],
    })

    expect(buscar).toHaveBeenCalledTimes(3)
    expect(buscar.mock.calls[0]?.[0]).toBe('https://api.github.com/repos/dono/repositorio')
    expect(buscar.mock.calls[1]?.[0]).toContain('/commits/main')
    expect(buscar.mock.calls[2]?.[0]).toContain(`/git/trees/${'b'.repeat(40)}?recursive=1`)
    expect(buscar.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer token-secreto' }),
    })
  })

  it('mapeia 404 para repositório indisponível sem revelar detalhes da API', async () => {
    const buscar = vi.fn(async () => new Response(null, { status: 404 }))
    const fonte = criarFonteRepositorioGitHub({ buscar })

    await expect(fonte.obterResumoRepositorio('dono', 'inexistente')).rejects.toSatisfy(
      (erro: unknown) => mapearErroFonteGitHub(erro) === 'REPOSITORIO_INDISPONIVEL',
    )
  })

  it.each([
    new Response(null, { status: 429 }),
    new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
    new Response(null, { status: 403, headers: { 'retry-after': '60' } }),
  ])('mapeia limite ao buscar a árvore', async (resposta) => {
    const fonte = criarFonteRepositorioGitHub({ buscar: vi.fn(async () => resposta) })

    await expect(fonte.obterArvore({ repositorio: { url: 'https://github.com/dono/repositorio', proprietario: 'dono', nome: 'repositorio' }, commitSha: 'a'.repeat(40) })).rejects.toMatchObject({ codigo: 'LIMITE_GITHUB' })
  })

  it('obtém a árvore por um commit explícito, sem consultar a branch', async () => {
    const commitSha = '9'.repeat(40)
    const buscar = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          truncated: false,
          tree: [{ path: 'src/index.ts', sha: '8'.repeat(40), type: 'blob' }],
        }),
        { status: 200 },
      ),
    )
    const fonte = criarFonteRepositorioGitHub({ buscar })

    await expect(
      fonte.obterArvore({
        repositorio: {
          url: 'https://github.com/dono/repositorio',
          proprietario: 'dono',
          nome: 'repositorio',
        },
        commitSha,
      }),
    ).resolves.toEqual([
      { caminho: 'src/index.ts', sha: '8'.repeat(40) },
    ])
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(buscar.mock.calls[0]?.[0]).toContain(`/git/trees/${commitSha}?recursive=1`)
    expect(buscar.mock.calls[0]?.[0]).not.toContain('/commits/')
  })

  it('mapeia árvore truncada para verificação inconclusiva', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            full_name: 'dono/repositorio',
            html_url: 'https://github.com/dono/repositorio',
            private: false,
            default_branch: 'main',
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'c'.repeat(40) })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ truncated: true, tree: [] })),
      )
    const fonte = criarFonteRepositorioGitHub({ buscar })

    await expect(fonte.obterResumoRepositorio('dono', 'repositorio')).rejects.toSatisfy(
      (erro: unknown) => mapearErroFonteGitHub(erro) === 'VERIFICACAO_INCONCLUSIVA',
    )
  })

  it('obtém tsconfig como arquivo auxiliar e prefere-o ao jsconfig', async () => {
    const sha = 'f'.repeat(40)
    const buscar = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          sha,
          content: Buffer.from('{"compilerOptions":{"baseUrl":"."}}').toString('base64'),
          encoding: 'base64',
        }),
        { status: 200 },
      ),
    )
    const fonte = criarFonteRepositorioGitHub({ buscar })

    await expect(
      fonte.obterConfiguracao?.({
        repositorio: {
          url: 'https://github.com/dono/repositorio',
          proprietario: 'dono',
          nome: 'repositorio',
        },
        commitSha: 'c'.repeat(40),
        arquivos: [
          { caminho: 'jsconfig.json', blobSha: 'j'.repeat(40) },
          { caminho: 'tsconfig.json', blobSha: sha },
        ],
      }),
    ).resolves.toEqual({
      caminho: 'tsconfig.json',
      conteudo: '{"compilerOptions":{"baseUrl":"."}}',
    })
    expect(buscar.mock.calls[0]?.[0]).toContain(`/git/blobs/${sha}`)
  })

  it('rejeita configuração acima do limite preliminar sem buscar o blob', async () => {
    const buscar = vi.fn<typeof fetch>()
    const fonte = criarFonteRepositorioGitHub({ buscar })

    await expect(
      fonte.obterConfiguracao?.({
        repositorio: {
          url: 'https://github.com/dono/repositorio',
          proprietario: 'dono',
          nome: 'repositorio',
        },
        commitSha: 'c'.repeat(40),
        arquivos: [
          {
            caminho: 'tsconfig.json',
            blobSha: 't'.repeat(40),
            tamanhoBytes: 512 * 1024 + 1,
          },
        ],
      }),
    ).rejects.toMatchObject({ codigo: 'CONFIGURACAO_TAMANHO' })
    expect(buscar).not.toHaveBeenCalled()
  })

  it('revalida o tamanho real da configuração depois de decodificar o blob', async () => {
    const sha = 't'.repeat(40)
    const conteudo = 'a'.repeat(512 * 1024 + 1)
    const buscar = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          sha,
          content: Buffer.from(conteudo).toString('base64'),
          encoding: 'base64',
        }),
        { status: 200 },
      ),
    )
    const fonte = criarFonteRepositorioGitHub({ buscar })

    await expect(
      fonte.obterConfiguracao?.({
        repositorio: {
          url: 'https://github.com/dono/repositorio',
          proprietario: 'dono',
          nome: 'repositorio',
        },
        commitSha: 'c'.repeat(40),
        arquivos: [{ caminho: 'tsconfig.json', blobSha: sha }],
      }),
    ).rejects.toMatchObject({ codigo: 'CONFIGURACAO_TAMANHO' })
  })
})
