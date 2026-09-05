import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import messages from '../../../../messages/pt-BR.json'
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
  it('envia a URL e exibe o resumo do snapshot', async () => {
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
            quantidadeArquivosElegiveis: 4,
          }),
        ),
      ),
    )
    renderFormulario()

    await user.type(
      screen.getByRole('textbox', { name: 'URL do repositório GitHub' }),
      'https://github.com/dono/repositorio',
    )
    await user.click(screen.getByRole('button', { name: 'Analisar repositório' }))

    expect(await screen.findByRole('heading', { name: 'dono/repositorio' })).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      '/api/analises',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('rejeita URL inválida no cliente sem consultar a API', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderFormulario()

    await user.type(screen.getByRole('textbox', { name: 'URL do repositório GitHub' }), 'https://gitlab.com/dono/repositorio')
    await user.click(screen.getByRole('button', { name: 'Analisar repositório' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Informe uma URL canônica de repositório público do GitHub.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
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
    await user.click(screen.getByRole('button', { name: 'Analisar repositório' }))

    expect(screen.getByRole('button', { name: 'Consultando repositório...' })).toBeDisabled()
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
