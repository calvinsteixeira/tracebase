import { describe, expect, it } from 'vitest'

import { criarAmbienteAplicacao, obterConfiguracao } from './database-ambiente.mjs'

describe('ambiente da aplicação local', () => {
  it('usa a URL padrão quando DATABASE_URL não existe', () => {
    const ambiente = { GITHUB_TOKEN: 'token-de-teste-nao-real' }
    const configuracao = obterConfiguracao(ambiente)

    expect(criarAmbienteAplicacao(ambiente, configuracao)).toMatchObject({
      DATABASE_URL: 'postgresql://tracebase:tracebase_local@localhost:5432/tracebase?sslmode=disable',
      GITHUB_TOKEN: ambiente.GITHUB_TOKEN,
    })
  })

  it('prioriza DATABASE_URL explícita e preserva as demais variáveis', () => {
    const ambiente = {
      DATABASE_URL: 'postgresql://tracebase:tracebase_local@localhost:5432/tracebase?sslmode=disable&options=teste',
      GITHUB_TOKEN: 'token-de-teste-nao-real',
      NODE_ENV: 'test',
    }

    expect(criarAmbienteAplicacao(ambiente, obterConfiguracao(ambiente))).toEqual(ambiente)
  })
})
