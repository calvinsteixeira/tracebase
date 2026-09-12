import { describe, expect, it } from 'vitest'

import {
  inserirEmLotes,
  MAX_PARAMETROS_POR_LOTE,
} from './persistencia-indice-postgres'
import type { PoolClient } from 'pg'

describe('lotes da persistência do índice', () => {
  it('divide um volume representativo em lotes parametrizados', async () => {
    const consultas: string[] = []
    const executor = {
      query: async (...args: unknown[]) => {
        consultas.push(String(args[0]))
        return {} as never
      },
    } as unknown as Pick<PoolClient, 'query'>
    const colunas = Array.from({ length: 10 }, (_, indice) => `coluna_${indice}`)
    const linhas = Array.from({ length: 120 }, () => colunas.map(() => 'valor'))

    await inserirEmLotes(executor, 'simbolos_indice', colunas, linhas)

    expect(consultas).toHaveLength(3)
    expect(consultas.every((consulta) => consulta.includes('INSERT INTO simbolos_indice'))).toBe(true)
    expect(consultas).not.toHaveLength(linhas.length)
    expect(MAX_PARAMETROS_POR_LOTE).toBeGreaterThan(0)
  })
})
