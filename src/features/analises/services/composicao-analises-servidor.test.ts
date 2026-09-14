import { describe, expect, it } from 'vitest'

import { selecionarFilaAnalises } from './composicao-analises-servidor'

const filaLocal = { publicar: async () => undefined }
const filaVercel = { publicar: async () => undefined }

describe('composição de análises no servidor', () => {
  it('seleciona a fila local fora da Vercel', () => {
    expect(selecionarFilaAnalises({ emVercel: false, filaLocal, filaVercel })).toBe(filaLocal)
  })

  it('seleciona a fila Vercel no ambiente publicado', () => {
    expect(selecionarFilaAnalises({ emVercel: true, filaLocal, filaVercel })).toBe(filaVercel)
  })
})
