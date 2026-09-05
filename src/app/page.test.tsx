import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'

import messages from '../../messages/pt-BR.json'

import Home from './page'

describe('página inicial', () => {
  it('renderiza o projeto', () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <QueryClientProvider client={new QueryClient()}>
          <Home />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    )

    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
