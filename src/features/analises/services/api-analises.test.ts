import { describe, expect, it, vi } from 'vitest'

import { criarApiAnalises } from './api-analises'
import { criarCicloVidaAnaliseEmMemoria, criarEstadoCicloVidaAnaliseEmMemoria } from './persistencia/ciclo-vida-analise-memoria'

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
  const api = criarApiAnalises({ repositorio: cicloVida, fila: { publicar } })
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
    const apiComFonte = criarApiAnalises({ repositorio: criarCicloVidaAnaliseEmMemoria(), fila: { publicar }, fonte })
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
    const api = criarApiAnalises({ repositorio: cicloVida, fila: { publicar }, fonte })
    const requestId = '22222222-2222-4222-8222-222222222222'

    const primeira = await api.criar(request({ url, requestId }))
    const primeiraJson = await primeira.json()
    const segunda = await api.criar(request({ url, requestId }))

    expect(segunda.status).toBe(202)
    expect((await segunda.json()).idPublico).toBe(primeiraJson.idPublico)
    expect(fonte.obterResumoRepositorio).toHaveBeenCalledTimes(1)
    expect(publicar).toHaveBeenCalledTimes(1)
  })

  it('reutiliza snapshot concluído com 200 e não publica novamente', async () => {
    const estado = criarEstadoCicloVidaAnaliseEmMemoria()
    const cicloVida = criarCicloVidaAnaliseEmMemoria(estado)
    const publicar = vi.fn(async () => undefined)
    const fonte = criarFonte()
    const api = criarApiAnalises({ repositorio: cicloVida, fila: { publicar }, fonte })

    const primeira = await api.criar(request({ url, requestId: '12121212-1212-4121-8121-121212121212' }))
    const snapshotId = (await primeira.json()).idPublico as string
    const snapshot = estado.snapshots.get(snapshotId)
    if (!snapshot) throw new Error('Snapshot não encontrado no estado do teste.')
    snapshot.estado = 'concluido'
    snapshot.finalizadoEm = '2026-09-12T19:00:01.000Z'

    const segunda = await api.criar(request({ url, requestId: '13131313-1313-4131-8131-131313131313' }))

    expect(segunda.status).toBe(200)
    expect(publicar).toHaveBeenCalledTimes(1)
  })

  it('preserva processamento adquirido quando a publicação falha durante a compensação', async () => {
    const cicloVidaBase = criarCicloVidaAnaliseEmMemoria()
    const fila = {
      publicar: vi.fn(async ({ mensagem }: { mensagem: { snapshotId: string; tentativa: number } }) => {
        const adquirido = await cicloVidaBase.adquirirProcessamento({ idPublico: mensagem.snapshotId, tentativa: mensagem.tentativa, agora: '2026-09-12T19:00:01.000Z', leaseExpiraEm: '2026-09-12T19:02:00.000Z' })
        expect(adquirido.tipo).toBe('adquirido')
        throw new Error('publicação interrompida')
      }),
    }
    const repositorio = { ...cicloVidaBase, registrarFalhaAgendamento: vi.fn(async () => null) }
    const api = criarApiAnalises({ repositorio, fila, fonte: criarFonte(), agora: () => '2026-09-12T19:00:01.000Z' })

    const resposta = await api.criar(request({ url, requestId: '14141414-1414-4141-8141-141414141414' }))

    expect(resposta.status).toBe(202)
    expect((await resposta.json()).estado).toBe('processando')
    expect(repositorio.registrarFalhaAgendamento).toHaveBeenCalledOnce()
  })

  it('rejeita requestId reutilizado com outra URL', async () => {
    const cicloVida = criarCicloVidaAnaliseEmMemoria()
    const fonte = criarFonte()
    const api = criarApiAnalises({ repositorio: cicloVida, fila: { publicar: vi.fn(async () => undefined) }, fonte })
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
    const api = criarApiAnalises({ repositorio: cicloVida, fila: { publicar }, fonte })
    const criacao = await api.criar(request({ url, requestId: '55555555-5555-4555-8555-555555555555' }))
    const snapshot = await criacao.json()

    expect(snapshot.estado).toBe('falha')
    const retry = await api.retry(snapshot.idPublico, request({
      requestId: '66666666-6666-4666-8666-666666666666', tentativaEsperada: 1,
    }))

    expect(retry.status).toBe(503)
    expect((await retry.json())).toMatchObject({ erro: { codigo: 'PUBLICACAO_RECUSADA' }, tentativa: 2 })
    expect(publicar).toHaveBeenCalledTimes(2)
  })

  it('não cria snapshot quando a elegibilidade falha', async () => {
    const cicloVida = criarCicloVidaAnaliseEmMemoria()
    const fonte = criarFonte([])
    const api = criarApiAnalises({ repositorio: cicloVida, fila: { publicar: vi.fn(async () => undefined) }, fonte })

    const resposta = await api.criar(request({ url, requestId: '44444444-4444-4444-8444-444444444444' }))

    expect(resposta.status).toBe(422)
    expect((await resposta.json()).status).toBe('nao-elegivel')
  })

  it('consulta um resumo de status sem expor lease ou fatos do índice', async () => {
    const { api, cicloVida } = criarDependencias()
    const snapshot = await cicloVida.criarOuReutilizar({ repositorio: { url, proprietario: 'dono', nome: 'repositorio' }, commitSha, referencia: 'main', agora: new Date().toISOString() })

    const resposta = await api.status(snapshot.idPublico)
    const corpo = await resposta.json()

    expect(resposta.status).toBe(200)
    expect(corpo).toMatchObject({ idPublico: snapshot.idPublico, estado: 'aguardando', demorada: false })
    expect(corpo).not.toHaveProperty('leaseId')
    expect(corpo).not.toHaveProperty('indice')
    expect(corpo).not.toHaveProperty('arquivos')
  })

  it('retorna 200 ao consultar snapshot em falha e 404 para snapshot inexistente', async () => {
    const cicloVida = criarCicloVidaAnaliseEmMemoria()
    const api = criarApiAnalises({ repositorio: cicloVida, fila: { publicar: vi.fn(async () => undefined) } })
    const snapshot = await cicloVida.criarOuReutilizar({ repositorio: { url, proprietario: 'dono', nome: 'repositorio' }, commitSha, referencia: 'main', agora: '2026-09-12T19:00:00.000Z' })
    await cicloVida.registrarFalhaAgendamento({ idPublico: snapshot.idPublico, tentativa: 1, agora: '2026-09-12T19:00:01.000Z', falha: { codigo: 'PUBLICACAO_RECUSADA', categoria: 'transitoria', mensagem: 'fila recusou' } })

    const falha = await api.status(snapshot.idPublico)
    const inexistente = await api.status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    expect(falha.status).toBe(200)
    expect((await falha.json()).estado).toBe('falha')
    expect(inexistente.status).toBe(404)
    expect((await inexistente.json()).erro.codigo).toBe('SNAPSHOT_NAO_ENCONTRADO')
  })

  it('distingue análise demorada de agendamento interrompido', async () => {
    const cicloVida = criarCicloVidaAnaliseEmMemoria()
    let agora = '2026-09-12T19:00:00.000Z'
    const api = criarApiAnalises({ repositorio: cicloVida, fila: { publicar: vi.fn(async () => undefined) }, limiteDemoradaMs: 30_000, limiteAguardandoMs: 60_000, agora: () => agora })
    const processando = await cicloVida.criarOuReutilizar({ repositorio: { url, proprietario: 'dono', nome: 'repositorio' }, commitSha: 'c'.repeat(40), referencia: 'main', agora: '2026-09-12T19:00:00.000Z' })
    const adquirido = await cicloVida.adquirirProcessamento({ idPublico: processando.idPublico, tentativa: 1, agora: '2026-09-12T19:00:00.000Z', leaseExpiraEm: '2026-09-12T19:02:00.000Z' })
    expect(adquirido.tipo).toBe('adquirido')

    const antes = await api.status(processando.idPublico)
    if (adquirido.tipo === 'adquirido') {
      await cicloVida.renovarLease({ idPublico: processando.idPublico, tentativa: 1, leaseId: adquirido.lease.id, agora: '2026-09-12T19:00:20.000Z', leaseExpiraEm: '2026-09-12T19:02:20.000Z' })
    }
    agora = '2026-09-12T19:00:31.000Z'
    const demorada = await api.status(processando.idPublico)
    expect((await antes.json()).demorada).toBe(false)
    expect((await demorada.json()).demorada).toBe(true)
    expect((await cicloVida.buscarPorIdPublico(processando.idPublico))?.estado).toBe('processando')

    const aguardando = await cicloVida.criarOuReutilizar({ repositorio: { url, proprietario: 'dono', nome: 'repositorio' }, commitSha: 'd'.repeat(40), referencia: 'main', agora: '2026-09-12T19:00:00.000Z' })
    agora = '2026-09-12T19:00:10.000Z'
    const dentro = await api.status(aguardando.idPublico)
    expect(dentro.status).toBe(200)
    expect((await dentro.json()).estado).toBe('aguardando')
    agora = '2026-09-12T19:01:01.000Z'
    const interrompido = await api.status(aguardando.idPublico)
    expect((await interrompido.json())).toMatchObject({ estado: 'falha', falha: { codigo: 'AGENDAMENTO_INTERROMPIDO' } })
  })

  it('rejeita requestId inválido sem consultar dependências externas', async () => {
    const fonte = criarFonte()
    const api = criarApiAnalises({ repositorio: criarCicloVidaAnaliseEmMemoria(), fila: { publicar: vi.fn(async () => undefined) }, fonte })

    const resposta = await api.criar(request({ url, requestId: 'invalido' }))

    expect(resposta.status).toBe(400)
    expect(fonte.obterResumoRepositorio).not.toHaveBeenCalled()
  })

  it('classifica corpo inválido separadamente de URL inválida e preserva erro desconhecido como interno', async () => {
    const fonte = criarFonte()
    const api = criarApiAnalises({ repositorio: criarCicloVidaAnaliseEmMemoria(), fila: { publicar: vi.fn(async () => undefined) }, fonte })
    const corpoInvalido = await api.criar(request({ url, requestId: 'nao-uuid' }))
    const urlInvalida = await api.criar(request({ url: 'https://gitlab.com/dono/repositorio', requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }))
    const erroDesconhecido = criarApiAnalises({ repositorio: criarCicloVidaAnaliseEmMemoria(), fila: { publicar: vi.fn(async () => undefined) }, fonte: { obterResumoRepositorio: vi.fn(async () => { throw new Error('erro inesperado') }) } })
    const respostaDesconhecida = await erroDesconhecido.elegibilidade(request({ url }))

    expect((await corpoInvalido.json()).erro.codigo).toBe('REQUISICAO_INVALIDA')
    expect((await urlInvalida.json()).erro.codigo).toBe('URL_INVALIDA')
    expect(respostaDesconhecida.status).toBe(500)
    expect((await respostaDesconhecida.json()).erro.codigo).toBe('ERRO_INTERNO')
  })
})
