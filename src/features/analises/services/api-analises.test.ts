import { describe, expect, it, vi } from 'vitest'

import { criarApiAnalises } from './api-analises'
import { criarCicloVidaAnaliseEmMemoria } from './persistencia/ciclo-vida-analise-memoria'

const url = 'https://github.com/dono/repositorio'
const commitSha = 'a'.repeat(40)

function criarFonte(arquivos = [{ caminho: 'src/index.ts', sha: 'b'.repeat(40), tamanhoBytes: 20 }]) {
  return {
    obterResumoRepositorio: vi.fn(async () => ({
      proprietario: 'dono', nome: 'repositorio', url, referencia: 'main', commitSha, arquivos,
    })),
  }
}

function criarDependencias() {
  const cicloVida = criarCicloVidaAnaliseEmMemoria()
  const publicar = vi.fn(async () => undefined)
  const api = criarApiAnalises({ cicloVida, fila: { publicar } },)
  return { api, cicloVida, publicar }
}

function request(body: unknown) {
  return new Request('http://localhost/api/analises', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('API assíncrona de análises', () => {
  it('cria snapshot, publica mensagem mínima e retorna 202', async () => {
    const { publicar } = criarDependencias()
    const fonte = criarFonte()
    const apiComFonte = criarApiAnalises({ cicloVida: criarCicloVidaAnaliseEmMemoria(), fila: { publicar }, fonte })
    const requestId = '11111111-1111-4111-8111-111111111111'

    const resposta = await apiComFonte.criar(request({ url, requestId }))

    expect(resposta.status).toBe(202)
    const corpo = await resposta.json()
    expect(corpo.estado).toBe('aguardando')
    expect(corpo).not.toHaveProperty('leaseId')
    expect(corpo).not.toHaveProperty('contente')
    expect(publicar).toHaveBeenCalledWith(expect.objectContaining({
      chaveIdempotencia: `analise:${corpo.idPublico}:1`,
      mensagem: { snapshotId: corpo.idPublico, tentativa: 1 },
    }))
    expect(fonte.obterResumoRepositorio).toHaveBeenCalledTimes(1)
  })

  it('repete requestId sem consultar GitHub, publicar ou criar outro snapshot', async () => {
    const cicloVida = criarCicloVidaAnaliseEmMemoria()
    const publicar = vi.fn(async () => undefined)
    const fonte = criarFonte()
    const api = criarApiAnalises({ cicloVida, fila: { publicar }, fonte })
    const requestId = '22222222-2222-4222-8222-222222222222'

    const primeira = await api.criar(request({ url, requestId }))
    const primeiraJson = await primeira.json()
    const segunda = await api.criar(request({ url, requestId }))

    expect(segunda.status).toBe(202)
    expect((await segunda.json()).idPublico).toBe(primeiraJson.idPublico)
    expect(fonte.obterResumoRepositorio).toHaveBeenCalledTimes(1)
    expect(publicar).toHaveBeenCalledTimes(1)
  })

  it('rejeita requestId reutilizado com outra URL', async () => {
    const cicloVida = criarCicloVidaAnaliseEmMemoria()
    const fonte = criarFonte()
    const api = criarApiAnalises({ cicloVida, fila: { publicar: vi.fn(async () => undefined) }, fonte })
    const requestId = '33333333-3333-4333-8333-333333333333'

    await api.criar(request({ url, requestId }))
    const resposta = await api.criar(request({ url: 'https://github.com/dono/outro', requestId }))

    expect(resposta.status).toBe(409)
    expect((await resposta.json()).erro.codigo).toBe('REQUEST_ID_CONFLITO')
    expect(fonte.obterResumoRepositorio).toHaveBeenCalledTimes(1)
  })

  it('permite uma nova tentativa apenas para a falha atual e publica a tentativa nova', async () => {
    const cicloVida = criarCicloVidaAnaliseEmMemoria()
    const publicar = vi.fn(async () => { throw new Error('fila indisponível') })
    const fonte = criarFonte()
    const api = criarApiAnalises({ cicloVida, fila: { publicar }, fonte })
    const criacao = await api.criar(request({ url, requestId: '55555555-5555-4555-8555-555555555555' }))
    const snapshot = await criacao.json()

    expect(snapshot.estado).toBe('falha')
    const retry = await api.retry(snapshot.idPublico, request({
      requestId: '66666666-6666-4666-8666-666666666666', tentativaEsperada: 1,
    }))

    expect((await retry.json())).toMatchObject({ estado: 'falha', tentativa: 2 })
    expect(publicar).toHaveBeenCalledTimes(2)
  })

  it('não cria snapshot quando a elegibilidade falha', async () => {
    const cicloVida = criarCicloVidaAnaliseEmMemoria()
    const fonte = criarFonte([])
    const api = criarApiAnalises({ cicloVida, fila: { publicar: vi.fn(async () => undefined) }, fonte })

    const resposta = await api.criar(request({ url, requestId: '44444444-4444-4444-8444-444444444444' }))

    expect(resposta.status).toBe(422)
    expect((await resposta.json()).status).toBe('nao-elegivel')
  })

  it('consulta um resumo de status sem expor lease ou fatos do índice', async () => {
    const { api, cicloVida } = criarDependencias()
    const snapshot = await cicloVida.criarOuReutilizar({ repositorio: { url, proprietario: 'dono', nome: 'repositorio' }, commitSha, referencia: 'main', agora: new Date().toISOString() })

    const resposta = await api.status(snapshot.idPublico)
    const corpo = await resposta.json()

    expect(resposta.status).toBe(202)
    expect(corpo).toMatchObject({ idPublico: snapshot.idPublico, estado: 'aguardando', demorada: false })
    expect(corpo).not.toHaveProperty('leaseId')
    expect(corpo).not.toHaveProperty('indice')
    expect(corpo).not.toHaveProperty('arquivos')
  })

  it('rejeita requestId inválido sem consultar dependências externas', async () => {
    const fonte = criarFonte()
    const api = criarApiAnalises({ cicloVida: criarCicloVidaAnaliseEmMemoria(), fila: { publicar: vi.fn(async () => undefined) }, fonte })

    const resposta = await api.criar(request({ url, requestId: 'invalido' }))

    expect(resposta.status).toBe(400)
    expect(fonte.obterResumoRepositorio).not.toHaveBeenCalled()
  })
})
