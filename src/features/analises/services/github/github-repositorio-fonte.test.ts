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
          { path: 'src/index.ts', type: 'blob', size: 100 },
          { path: 'README.md', type: 'blob', size: 50 },
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
      arquivos: [{ caminho: 'src/index.ts', tamanhoBytes: 100 }, { caminho: 'README.md', tamanhoBytes: 50 }],
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

  it('mapeia árvore truncada para limite excedido', async () => {
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
      (erro: unknown) => mapearErroFonteGitHub(erro) === 'LIMITE_EXCEDIDO',
    )
  })
})
