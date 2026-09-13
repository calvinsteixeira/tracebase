import { describe, expect, it } from 'vitest'

import { adicionarAnaliseRecente, lerAnalisesRecentes, removerAnalisesRecentes } from './analises-recentes'

const id = (numero: number) => `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`

describe('analises recentes', () => {
  it('deduplica, ordena pelo mais recente e limita a dez ids', () => {
    const armazenamento = new Map<string, string>()
    const storage = criarStorage(armazenamento)

    for (let numero = 1; numero <= 11; numero += 1) adicionarAnaliseRecente(id(numero), storage)
    adicionarAnaliseRecente(id(5), storage)

    expect(lerAnalisesRecentes(storage)).toHaveLength(10)
    expect(lerAnalisesRecentes(storage)[0]).toBe(id(5))
    expect(lerAnalisesRecentes(storage)).not.toContain(id(1))
  })

  it('ignora conteúdo corrompido, ids inválidos e remove snapshots inexistentes', () => {
    const armazenamento = new Map<string, string>([['tracebase:analises-recentes:v1', '{invalido']])
    const storage = criarStorage(armazenamento)

    expect(lerAnalisesRecentes(storage)).toEqual([])
    adicionarAnaliseRecente(id(1), storage)
    removerAnalisesRecentes([id(1)], storage)
    expect(lerAnalisesRecentes(storage)).toEqual([])
  })

  it('não quebra quando o storage falha', () => {
    const storage = criarStorage(new Map(), true)

    expect(() => adicionarAnaliseRecente(id(1), storage)).not.toThrow()
    expect(() => lerAnalisesRecentes(storage)).not.toThrow()
    expect(() => removerAnalisesRecentes([id(1)], storage)).not.toThrow()
  })
})

function criarStorage(armazenamento: Map<string, string>, falhar = false): Storage {
  return {
    getItem: (chave) => falhar ? (() => { throw new Error('storage indisponível') })() : armazenamento.get(chave) ?? null,
    setItem: (chave, valor) => { if (falhar) throw new Error('storage indisponível'); armazenamento.set(chave, valor) },
    removeItem: () => undefined,
    clear: () => armazenamento.clear(),
    key: () => null,
    length: armazenamento.size,
  }
}
