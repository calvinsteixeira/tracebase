import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'

import messages from '../../messages/pt-BR.json'

import Home from './page'

describe('página inicial', () => {
  it('renderiza a navegação e o fluxo principal com nomes acessíveis', async () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <QueryClientProvider client={new QueryClient()}>
          <Home />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    )

    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute('href', '#conteudo-principal')
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()
    const novaAnalise = screen.getByRole('button', { name: 'Nova análise' })
    expect(novaAnalise).toHaveAttribute('type', 'submit')
    expect(novaAnalise.closest('form')).toHaveAttribute('action', '/')
    expect(screen.getByRole('heading', { level: 1, name: 'Novo repositório' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Entenda seu código a partir do GitHub' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verificar repositório' })).toBeEnabled()
    screen.getByRole('button', { name: 'Ver histórico' }).click()
    expect(await screen.findByText('As análises iniciadas por você aparecerão aqui para consulta rápida.')).toBeInTheDocument()
  })
})
