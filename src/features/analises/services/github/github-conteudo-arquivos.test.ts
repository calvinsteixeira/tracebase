import { describe, expect, it, vi } from 'vitest'

import { ErroFonteRepositorio } from '../fonte-repositorio'
import { criarFonteRepositorioGitHub } from './github-repositorio-fonte'

const repositorio = {
  id: 'repositorio:teste',
  url: 'https://github.com/dono/repositorio',
  proprietario: 'dono',
  nome: 'repositorio',
}

const commitSha = 'c'.repeat(40)

describe('conteúdo de arquivos do GitHub', () => {
  it('associa caminho e SHA ao blob correto e decodifica Base64', async () => {
    const buscar = vi.fn<typeof fetch>(async (url) => {
      const sha = String(url).split('/').at(-1)
      const conteudo = sha === 'a'.repeat(40) ? 'export const a = 1' : 'export const z = 2'

      return respostaBlob(sha ?? '', conteudo)
    })
    const fonte = criarFonteRepositorioGitHub({ buscar, token: 'token-secreto' })

    await expect(
      fonte.obterArquivos({
        repositorio,
        commitSha,
        arquivos: [
          { caminho: 'src/z.ts', blobSha: 'b'.repeat(40) },
          { caminho: 'src/a.ts', blobSha: 'a'.repeat(40) },
        ],
      }),
    ).resolves.toEqual([
      { caminho: 'src/a.ts', conteudo: 'export const a = 1' },
      { caminho: 'src/z.ts', conteudo: 'export const z = 2' },
    ])

    expect(buscar).toHaveBeenCalledTimes(2)
    expect(buscar.mock.calls.map(([url]) => url).sort()).toEqual([
      `https://api.github.com/repos/dono/repositorio/git/blobs/${'a'.repeat(40)}`,
      `https://api.github.com/repos/dono/repositorio/git/blobs/${'b'.repeat(40)}`,
    ])
    expect(buscar.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer token-secreto' }),
    })
  })

  it('limita a oito blobs simultâneos e ordena respostas fora de ordem', async () => {
    let emAndamento = 0
    let maximoEmAndamento = 0
    const buscar = vi.fn<typeof fetch>(async (url) => {
      emAndamento += 1
      maximoEmAndamento = Math.max(maximoEmAndamento, emAndamento)
      await esperar(3)
      emAndamento -= 1

      const sha = String(url).split('/').at(-1) ?? ''
      return respostaBlob(sha, sha.slice(0, 4))
    })
    const fonte = criarFonteRepositorioGitHub({ buscar })
    const arquivos = Array.from({ length: 16 }, (_, indice) => ({
      caminho: `src/${String.fromCharCode(122 - indice)}.ts`,
      blobSha: String(indice).repeat(40),
    }))

    const resultado = await fonte.obterArquivos({ repositorio, commitSha, arquivos })

    expect(maximoEmAndamento).toBeLessThanOrEqual(8)
    expect(resultado.map((arquivo) => arquivo.caminho)).toEqual(
      [...resultado].map((arquivo) => arquivo.caminho).sort(),
    )
  })

  it('falha com timeout controlado', async () => {
    const buscar = vi.fn<typeof fetch>((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      }),
    )
    const fonte = criarFonteRepositorioGitHub({ buscar, timeoutMs: 5 })

    await expect(
      fonte.obterArquivos({
        repositorio,
        commitSha,
        arquivos: [{ caminho: 'src/app.ts', blobSha: 'a'.repeat(40) }],
      }),
    ).rejects.toMatchObject({ codigo: 'TEMPO_ESGOTADO' })
  })

  it.each([
    ['encoding não suportado', 'ENCODING_NAO_SUPORTADO', respostaBlob('a'.repeat(40), 'YQ==', 'utf-8')],
    ['blob ausente', 'BLOB_AUSENTE', new Response(null, { status: 404 })],
    ['resposta inválida', 'RESPOSTA_INVALIDA', new Response(JSON.stringify({}), { status: 200 })],
    [
      'Base64 inválido',
      'BASE64_INVALIDO',
      new Response(
        JSON.stringify({
          sha: 'a'.repeat(40),
          content: 'não-é-base64',
          encoding: 'base64',
        }),
        { status: 200 },
      ),
    ],
    ['SHA divergente', 'SHA_BLOB_INCORRETO', respostaBlob('b'.repeat(40), 'YQ==')],
    ['limite 429', 'LIMITE_GITHUB', new Response(null, { status: 429 })],
    ['limite 403 pelo cabeçalho restante', 'LIMITE_GITHUB', new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } })],
    ['limite 403 pelo retry-after', 'LIMITE_GITHUB', new Response(null, { status: 403, headers: { 'retry-after': '60' } })],
    ['403 sem evidência de limite', 'FONTE_INDISPONIVEL', new Response(null, { status: 403 })],
  ] as const)('falha quando há %s', async (_descricao, codigo, resposta) => {
    const buscar = vi.fn<typeof fetch>(async () => resposta)
    const fonte = criarFonteRepositorioGitHub({ buscar })

    await expect(
      fonte.obterArquivos({
        repositorio,
        commitSha,
        arquivos: [{ caminho: 'src/app.ts', blobSha: 'a'.repeat(40) }],
      }),
    ).rejects.toMatchObject({ codigo } satisfies Pick<ErroFonteRepositorio, 'codigo'>)
  })
})

function respostaBlob(sha: string, conteudo: string, encoding = 'base64') {
  return new Response(
    JSON.stringify({
      sha,
      content: Buffer.from(conteudo).toString('base64'),
      encoding,
    }),
    { status: 200 },
  )
}

async function esperar(milissegundos: number) {
  await new Promise((resolve) => setTimeout(resolve, milissegundos))
}
