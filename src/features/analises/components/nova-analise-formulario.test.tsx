import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import messages from '../../../../messages/pt-BR.json'
import { LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO } from '../services/politica-elegibilidade-repositorio'
import { NovaAnaliseFormulario } from './nova-analise-formulario'

function renderFormulario() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <NovaAnaliseFormulario />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  )
}

describe('NovaAnaliseFormulario', () => {
  it('envia a URL e exibe o resultado elegível', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            repositorio: {
              url: 'https://github.com/dono/repositorio',
              proprietario: 'dono',
              nome: 'repositorio',
            },
            snapshot: { commitSha: 'd'.repeat(40), referencia: 'main' },
            status: 'elegivel',
            quantidadeArquivosElegiveis: 4,
            tamanhoTotalBytes: 4096,
            detalhe: null,
            limites: LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
          }),
        ),
      ),
    )
    renderFormulario()

    await user.type(
      screen.getByRole('textbox', { name: 'URL do repositório GitHub' }),
      'https://github.com/dono/repositorio',
    )
    await user.click(screen.getByRole('button', { name: 'Verificar repositório' }))

    expect(screen.getByRole('status')).toHaveTextContent('Repositório elegível para análise')
    expect(await screen.findByRole('heading', { name: 'dono/repositorio' })).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('Commit considerado na branch padrão')).toBeInTheDocument()
    expect(screen.getByText('4 de até 250 arquivos')).toBeInTheDocument()
    expect(screen.getByText('4 kB de até 5 MB')).toBeInTheDocument()
    expect(screen.queryByText('Próximo passo')).not.toBeInTheDocument()
    expect(
      screen.queryByText('A indexação estrutural será entregue no P2.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'O snapshot está associado a este commit para manter a análise rastreável.',
      ),
    ).not.toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: 'URL do repositório GitHub' }))
    await user.type(
      screen.getByRole('textbox', { name: 'URL do repositório GitHub' }),
      'https://github.com/dono/outro-repositorio',
    )

    expect(screen.getByRole('heading', { name: 'dono/repositorio' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      '/api/analises/elegibilidade',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('rejeita URL inválida no cliente sem consultar a API', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderFormulario()

    await user.type(screen.getByRole('textbox', { name: 'URL do repositório GitHub' }), 'https://gitlab.com/dono/repositorio')
    await user.click(screen.getByRole('button', { name: 'Verificar repositório' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Informe uma URL canônica de repositório público do GitHub.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explica quando o repositório não possui arquivos JS ou TS', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
        JSON.stringify({
          status: 'nao-elegivel',
          repositorio: {
            url: 'https://github.com/dono/repositorio',
            proprietario: 'dono',
            nome: 'repositorio',
          },
          snapshot: { commitSha: 'd'.repeat(40), referencia: 'main' },
          quantidadeArquivosElegiveis: 0,
          tamanhoTotalBytes: 0,
          detalhe: { criterio: 'sem-arquivos', encontrado: 0, maximo: null },
          limites: LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
        }),
      ),
      ),
    )
    renderFormulario()

    expect(
      screen.getByText(
        'O Tracebase verifica repositórios públicos e considera apenas arquivos JavaScript e TypeScript (.js, .jsx, .ts ou .tsx): até 250 arquivos, 512 kB por arquivo e 5 MB no total.',
      ),
    ).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'URL do repositório GitHub' }), 'https://github.com/dono/repositorio')
    await user.click(screen.getByRole('button', { name: 'Verificar repositório' }))

    expect(screen.getAllByRole('status')[0]).toHaveTextContent(
      'Repositório não elegível para análise',
    )
    expect(screen.getByText('Nenhum arquivo JavaScript ou TypeScript elegível foi encontrado.')).toBeInTheDocument()
  })

  it('mostra o valor encontrado e o limite quando a quantidade excede o permitido', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'nao-elegivel',
            repositorio: {
              url: 'https://github.com/dono/repositorio',
              proprietario: 'dono',
              nome: 'repositorio',
            },
            snapshot: { commitSha: 'e'.repeat(40), referencia: 'main' },
            quantidadeArquivosElegiveis: 251,
            tamanhoTotalBytes: 251,
            detalhe: {
              criterio: 'quantidade-arquivos',
              encontrado: 251,
              maximo: 250,
            },
            limites: LIMITES_PADRAO_ELEGIBILIDADE_REPOSITORIO,
          }),
        ),
      ),
    )
    renderFormulario()

    await user.type(
      screen.getByRole('textbox', { name: 'URL do repositório GitHub' }),
      'https://github.com/dono/repositorio',
    )
    await user.click(screen.getByRole('button', { name: 'Verificar repositório' }))

    expect(screen.getAllByRole('status')[0]).toHaveTextContent(
      'Repositório não elegível para análise',
    )
    expect(screen.getByText('251 de até 250 arquivos')).toBeInTheDocument()
    expect(
      screen.getByText(
        '251 arquivos JavaScript/TypeScript encontrados. Limite atual: 250 arquivos.',
      ),
    ).toBeInTheDocument()
  })

  it('desabilita o formulário durante a consulta', async () => {
    const user = userEvent.setup()
    let resolver: (response: Response) => void = () => undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolver = resolve
          }),
      ),
    )
    renderFormulario()

    await user.type(screen.getByRole('textbox', { name: 'URL do repositório GitHub' }), 'https://github.com/dono/repositorio')
    await user.click(screen.getByRole('button', { name: 'Verificar repositório' }))

    expect(screen.getByRole('button', { name: 'Verificando repositório...' })).toBeDisabled()
    expect(screen.getByRole('status')).toBeInTheDocument()

    resolver(
      new Response(
        JSON.stringify({
          repositorio: { url: 'https://github.com/dono/repositorio', proprietario: 'dono', nome: 'repositorio' },
          snapshot: { commitSha: 'e'.repeat(40), referencia: 'main' },
          quantidadeArquivosElegiveis: 1,
        }),
      ),
    )
  })
})
