import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Home from './page'

describe('página inicial', () => {
  it('renderiza o projeto', () => {
    render(<Home />)

    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
