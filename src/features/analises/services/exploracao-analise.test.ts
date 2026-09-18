import { describe, expect, it } from 'vitest'

import { ErroExploracaoAnalise, normalizarCaminhoExploracao } from './exploracao-analise'

describe('exploracao-analise', () => {
  it.each(['../segredo', '/etc/passwd', 'src/../segredo', 'src\\arquivo.ts', 'src//arquivo.ts'])('rejeita caminho perigoso: %s', (caminho) => {
    expect(() => normalizarCaminhoExploracao(caminho)).toThrowError(new ErroExploracaoAnalise('CAMINHO_INVALIDO'))
  })

  it('representa a raiz quando o caminho é omitido e exige arquivo nas relações', () => {
    expect(normalizarCaminhoExploracao(undefined)).toBeNull()
    expect(() => normalizarCaminhoExploracao(null, true)).toThrowError(new ErroExploracaoAnalise('ARQUIVO_OBRIGATORIO'))
  })
})
