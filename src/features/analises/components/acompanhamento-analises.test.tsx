import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, beforeEach, afterEach, it, vi } from 'vitest'

import messages from '../../../../messages/pt-BR.json'
import { AcompanhamentoAnalises } from './acompanhamento-analises'
import { CartaoAcompanhamentoAnalise } from './cartao-acompanhamento-analise'
import { ErroApiAnaliseCliente, type ResumoStatusAnaliseCliente } from '../services/api-analises-cliente'

const id = '11111111-1111-4111-8111-111111111111'
const retryId = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'
const url = 'https://github.com/dono/repositorio'

describe('AcompanhamentoAnalises', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('apresenta iniciar somente para um repositório elegível', async () => {
    const user = userEvent.setup()
    mockFetch(resposta(elegibilidade()))
    renderTela()

    await verificar(user)
    expect(screen.getByRole('button', { name: 'Iniciar análise' })).toBeInTheDocument()

    mockFetch(resposta({ ...elegibilidade(), status: 'nao-elegivel', detalhe: { criterio: 'sem-arquivos', encontrado: 0, maximo: null }, quantidadeArquivosElegiveis: 0 }))
    await user.click(screen.getByRole('button', { name: 'Verificar repositório' }))
    expect(await screen.findByText('Nenhum arquivo JavaScript ou TypeScript elegível foi encontrado.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Iniciar análise' })).not.toBeInTheDocument()
  })

  it('envia URL e UUID, impedindo uma segunda submissão enquanto inicia', async () => {
    const user = userEvent.setup()
    let resolver: ((resposta: Response) => void) | undefined
    mockFetch(resposta(elegibilidade()))
    renderTela()
    await verificar(user)
    ;(fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<Response>((resolve) => { resolver = resolve }))

    await user.click(screen.getByRole('button', { name: 'Iniciar análise' }))
    const botao = screen.getByRole('button', { name: 'Iniciando análise...' })
    expect(botao).toBeDisabled()
    expect(fetch).toHaveBeenLastCalledWith('/api/analises', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ url, requestId }),
    }))
    await user.click(botao)
    expect(fetch).toHaveBeenCalledTimes(2)
    resolver?.(resposta(resumo({ estado: 'aguardando' })))
  })

  it('cria o card e guarda o id quando a API aceita a análise', async () => {
    const user = userEvent.setup()
    mockFetch(resposta(elegibilidade()), resposta(resumo({ estado: 'aguardando' })))
    renderTela()
    await verificar(user)
    await user.click(screen.getByRole('button', { name: 'Iniciar análise' }))

    expect(await screen.findAllByRole('heading', { name: 'dono/repositorio' })).toHaveLength(2)
    expect(screen.getByText('Aguardando')).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('tracebase:analises-recentes:v1') ?? '[]')).toEqual([id])
  })

  it('guarda o id e mostra a falha quando a publicação é recusada', async () => {
    const user = userEvent.setup()
    mockFetch(
      resposta(elegibilidade()),
      resposta({ ...resumo({ estado: 'falha' }), erro: { codigo: 'PUBLICACAO_RECUSADA', mensagem: 'Não foi possível iniciar o processamento desta análise.' } }, 503),
      resposta(resumo({ estado: 'falha', falha: { codigo: 'PUBLICACAO_RECUSADA', categoria: 'transitoria', mensagem: 'Não foi possível iniciar o processamento desta análise.', detalhes: null, ocorridoEm: '2026-09-13T12:00:00.000Z' } })),
    )
    renderTela()
    await verificar(user)
    await user.click(screen.getByRole('button', { name: 'Iniciar análise' }))

    expect(await screen.findByText('Não foi possível iniciar o processamento da análise.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('tracebase:analises-recentes:v1') ?? '[]')).toEqual([id])
  })

  it('faz polling apenas enquanto aguardando ou processando e para ao concluir', async () => {
    vi.useFakeTimers()
    mockFetch(
      resposta(elegibilidade()),
      resposta(resumo({ estado: 'processando', etapa: 'indexacao' })),
      resposta(resumo({ estado: 'processando', etapa: 'indexacao' })),
      resposta(resumo({ estado: 'concluido', contagens: contagens() })),
    )
    renderTela()
    verificarSemUsuario()
    await atualizarTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar análise' }))
    await atualizarTimers()
    expect(screen.getByText('Processando')).toBeInTheDocument()

    await avancar(2_000)
    await assentarConsulta()
    expect(chamadasPara('/api/analises/')).toHaveLength(2)
    const chamadasStatus = chamadasPara('/api/analises/')
    await avancar(4_000)
    await assentarConsulta()
    expect(chamadasPara('/api/analises/')).toHaveLength(chamadasStatus.length)
  })

  it('mostra demora sem transformar o estado em falha e exibe todas as contagens', async () => {
    const user = userEvent.setup()
    mockFetch(
      resposta(elegibilidade()),
      resposta(resumo({ estado: 'processando', demorada: true, etapa: 'persistencia', contagens: contagens() })),
      resposta(resumo({ estado: 'processando', demorada: true, etapa: 'persistencia', contagens: contagens() })),
    )
    renderTela()
    await verificar(user)
    await user.click(screen.getByRole('button', { name: 'Iniciar análise' }))

    expect(await screen.findByText('Esta análise está levando mais tempo que o esperado, mas continua em andamento.')).toBeInTheDocument()
    expect(screen.getByText('Processando')).toBeInTheDocument()
    expect(screen.getByText('Arquivos')).toBeInTheDocument()
    expect(screen.getByText('Símbolos')).toBeInTheDocument()
    expect(screen.getByText('Exports')).toBeInTheDocument()
    expect(screen.getByText('Relações')).toBeInTheDocument()
    expect(screen.getByText('Diagnósticos')).toBeInTheDocument()
    expect(screen.queryByText('Falha')).not.toBeInTheDocument()
  })

  it('mantém a falha no card e envia tentativa esperada com novo requestId', async () => {
    const user = userEvent.setup()
    const novoRequestId = '44444444-4444-4444-8444-444444444444'
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValueOnce(requestId).mockReturnValueOnce(novoRequestId)
    mockFetch(
      resposta(elegibilidade()),
      resposta(resumo({ estado: 'falha', tentativa: 1, falha: falha() })),
      resposta(resumo({ estado: 'falha', tentativa: 1, falha: falha() })),
      resposta(resumo({ estado: 'aguardando', tentativa: 2 })),
    )
    renderTela()
    await verificar(user)
    await user.click(screen.getByRole('button', { name: 'Iniciar análise' }))
    await screen.findByText('Não foi possível consultar os arquivos do repositório.')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/analises/${id}/tentativas`, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ requestId: novoRequestId, tentativaEsperada: 1 }),
    })))
    expect(await screen.findByText('Aguardando')).toBeInTheDocument()
  })

  it('preserva o card quando o retry falha, mostra o erro e permite recuperar', async () => {
    const user = userEvent.setup()
    let modoRetry: 'erro' | 'sucesso' = 'erro'
    vi.stubGlobal('fetch', vi.fn((endereco: string) => {
      if (endereco === '/api/analises/elegibilidade') return Promise.resolve(resposta(elegibilidade()))
      if (endereco === '/api/analises') return Promise.resolve(resposta(resumo({ estado: 'falha', falha: falha() })))
      if (endereco.includes('/tentativas')) {
        return modoRetry === 'erro'
          ? Promise.resolve(resposta({ erro: { codigo: 'ERRO_PERSISTENCIA', mensagem: 'stack técnico que não deve aparecer' } }, 503))
          : Promise.resolve(resposta(resumo({ estado: 'aguardando', tentativa: 2 })))
      }
      return Promise.resolve(resposta(resumo({ estado: 'falha', falha: falha() })))
    }))
    renderTela()
    await verificar(user)
    await user.click(screen.getByRole('button', { name: 'Iniciar análise' }))
    expect(await screen.findByText('Não foi possível consultar os arquivos do repositório.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText(/Não foi possível iniciar uma nova tentativa/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled()
    expect(screen.getByText('Não foi possível consultar os arquivos do repositório.')).toBeInTheDocument()
    expect(screen.queryByText('stack técnico que não deve aparecer')).not.toBeInTheDocument()

    let resolver: ((resposta: Response) => void) | undefined
    modoRetry = 'sucesso'
    ;(fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<Response>((resolve) => { resolver = resolve }))
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(screen.getByRole('button', { name: 'Tentando novamente...' })).toBeDisabled()
    expect(screen.queryByText(/Não foi possível iniciar uma nova tentativa/)).not.toBeInTheDocument()
    resolver?.(resposta(resumo({ estado: 'aguardando', tentativa: 2 })))
    expect(await screen.findByText('Aguardando')).toBeInTheDocument()
    expect(screen.queryByText(/Não foi possível iniciar uma nova tentativa/)).not.toBeInTheDocument()
  })

  it('resolve falhas por código, usa fallback desconhecido e não renderiza mensagem técnica', () => {
    render(
      <NextIntlClientProvider locale="pt-BR" timeZone="America/Araguaina" messages={messages}>
        <CartaoAcompanhamentoAnalise resumo={resumo({ estado: 'falha', falha: { ...falha(), codigo: 'TEMPO_ESGOTADO', mensagem: 'detalhe técnico' } })} />
        <CartaoAcompanhamentoAnalise
          resumo={resumo({ estado: 'falha', falha: { ...falha(), codigo: 'CODIGO_NOVO', mensagem: 'resposta técnica' } })}
          erroNovaTentativa={new ErroApiAnaliseCliente('ERRO_INTERNO', 500, undefined, 'stack do servidor')}
        />
      </NextIntlClientProvider>,
    )

    expect(screen.getByText('O processamento excedeu o tempo permitido. Tente novamente.')).toBeInTheDocument()
    expect(screen.getByText('Não foi possível concluir esta operação. Tente novamente.')).toBeInTheDocument()
    expect(screen.queryByText('detalhe técnico')).not.toBeInTheDocument()
    expect(screen.queryByText('resposta técnica')).not.toBeInTheDocument()
    expect(screen.queryByText('CODIGO_NOVO')).not.toBeInTheDocument()
    expect(screen.queryByText('stack do servidor')).not.toBeInTheDocument()
  })

  it('mantém erros de retry isolados por snapshot', () => {
    const primeiro = resumo({ estado: 'falha', falha: falha() })
    const segundo = { ...resumo({ estado: 'falha', falha: falha() }), idPublico: retryId, repositorio: { ...resumoBase().repositorio, nome: 'outro-repositorio' } }

    render(
      <NextIntlClientProvider locale="pt-BR" timeZone="America/Araguaina" messages={messages}>
        <CartaoAcompanhamentoAnalise
          resumo={primeiro}
          erroNovaTentativa={new ErroApiAnaliseCliente('ERRO_PERSISTENCIA', 503)}
        />
        <CartaoAcompanhamentoAnalise
          resumo={segundo}
          erroNovaTentativa={new ErroApiAnaliseCliente('PUBLICACAO_RECUSADA', 503)}
        />
      </NextIntlClientProvider>,
    )

    const cartoes = screen.getAllByRole('article')
    expect(cartoes[0]).toHaveTextContent('Não foi possível salvar o resultado da análise.')
    expect(cartoes[0]).not.toHaveTextContent('Não foi possível iniciar o processamento da análise.')
    expect(cartoes[1]).toHaveTextContent('Não foi possível iniciar o processamento da análise.')
    expect(cartoes[1]).not.toHaveTextContent('Não foi possível salvar o resultado da análise.')
  })

  it('preserva o último resumo quando uma atualização temporária falha', () => {
    render(
      <NextIntlClientProvider locale="pt-BR" timeZone="America/Araguaina" messages={messages}>
        <CartaoAcompanhamentoAnalise
          resumo={resumo({ estado: 'processando', etapa: 'indexacao' })}
          erroAtualizacao={new ErroApiAnaliseCliente('GITHUB_INDISPONIVEL', 503, undefined, 'Falha temporária.')}
        />
      </NextIntlClientProvider>,
    )

    expect(screen.getByText('Processando')).toBeInTheDocument()
    expect(screen.getByText('Não foi possível atualizar este card. O último estado conhecido foi preservado.')).toBeInTheDocument()
  })

  it('restaura ids recentes depois da montagem e remove snapshot inexistente', async () => {
    window.localStorage.setItem('tracebase:analises-recentes:v1', JSON.stringify([retryId]))
    mockFetch(resposta({}, 404))
    renderTela()

    await waitFor(() => expect(screen.getByText('Nenhuma análise recente neste navegador.')).toBeInTheDocument())
    expect(window.localStorage.getItem('tracebase:analises-recentes:v1')).toBe('[]')
  })

  it('não expõe lease, stack, JSON bruto ou textos de planejamento', async () => {
    window.localStorage.setItem('tracebase:analises-recentes:v1', JSON.stringify([id]))
    mockFetch(resposta({ ...resumo({ estado: 'concluido', contagens: contagens() }), leaseId: 'segredo', stack: 'stack', interno: '{json}' }))
    renderTela()

    expect(await screen.findByText('Concluída')).toBeInTheDocument()
    expect(screen.queryByText('segredo')).not.toBeInTheDocument()
    expect(screen.queryByText('stack')).not.toBeInTheDocument()
    expect(screen.queryByText('{json}')).not.toBeInTheDocument()
    expect(screen.queryByText('P2')).not.toBeInTheDocument()
    expect(screen.queryByText('Task 4')).not.toBeInTheDocument()
    expect(screen.queryByText('próximo passo')).not.toBeInTheDocument()
  })

  it('continua renderizável no servidor sem ler o storage', async () => {
    const { renderToString } = await import('react-dom/server')
    expect(() => renderToString(renderTelaElement())).not.toThrow()
  })
})

function renderTela() {
  return render(renderTelaElement())
}

function renderTelaElement() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  return (
    <NextIntlClientProvider locale="pt-BR" timeZone="America/Araguaina" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <AcompanhamentoAnalises />
      </QueryClientProvider>
    </NextIntlClientProvider>
  )
}

async function verificar(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: 'URL do repositório GitHub' }), url)
  await user.click(screen.getByRole('button', { name: 'Verificar repositório' }))
}

function verificarSemUsuario() {
  const campo = screen.getByRole('textbox', { name: 'URL do repositório GitHub' })
  fireEvent.change(campo, { target: { value: url } })
  fireEvent.submit(campo.closest('form') as HTMLFormElement)
}

function mockFetch(...respostas: Response[]) {
  let indice = 0
  ;(fetch as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(respostas[indice++] ?? resposta(resumo())))
}

function chamadasPara(inicio: string) {
  return (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => typeof url === 'string' && url.startsWith(inicio) && url !== '/api/analises/elegibilidade' && url !== '/api/analises')
}

async function atualizarTimers() {
  await act(async () => {
    for (let indice = 0; indice < 10; indice += 1) {
      await Promise.resolve()
    }
  })
}

async function avancar(milissegundos: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milissegundos)
  })
}

async function assentarConsulta() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
    for (let indice = 0; indice < 10; indice += 1) {
      await Promise.resolve()
    }
  })
}

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

function elegibilidade() {
  return {
    status: 'elegivel',
    repositorio: { url, proprietario: 'dono', nome: 'repositorio' },
    snapshot: { commitSha: 'a'.repeat(40), referencia: 'main' },
    quantidadeArquivosElegiveis: 1,
    tamanhoTotalBytes: 10,
    detalhe: null,
    limites: { quantidadeMaximaArquivosElegiveis: 250, tamanhoMaximoArquivoBytes: 512 * 1024, tamanhoMaximoTotalBytes: 5 * 1024 * 1024 },
  }
}

function resumo(overrides: Partial<ResumoStatusAnaliseCliente> = {}): ResumoStatusAnaliseCliente {
  return { ...resumoBase(), ...overrides }
}

function resumoBase(): ResumoStatusAnaliseCliente {
  return {
    idPublico: id,
    repositorio: { url, proprietario: 'dono', nome: 'repositorio' },
    commitSha: 'a'.repeat(40),
    referencia: 'main',
    estado: 'aguardando' as const,
    etapa: null,
    tentativa: 1,
    tentativaIniciadaEm: null,
    ultimaAtividadeEm: '2026-09-13T12:00:00.000Z',
    atualizadoEm: '2026-09-13T12:00:00.000Z',
    finalizadoEm: null,
    demorada: false,
    falha: null,
    contagens: null,
  }
}

function falha(): NonNullable<ResumoStatusAnaliseCliente['falha']> {
  return { codigo: 'FONTE_INDISPONIVEL', categoria: 'transitoria' as const, mensagem: 'Não foi possível consultar a fonte do repositório.', detalhes: null, ocorridoEm: '2026-09-13T12:00:00.000Z' }
}

function contagens() {
  return { arquivos: 4, simbolos: 2, exportacoes: 3, relacoesImportacao: 5, diagnosticos: 1 }
}
