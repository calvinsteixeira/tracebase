import { describe, expect, it } from 'vitest'

import { construirArvoreAnalise, ErroExploracaoAnalise, normalizarCaminhoExploracao } from './exploracao-analise'

const arquivos = [
  { caminho: 'src/z.ts', linguagem: 'typescript' as const },
  { caminho: 'src/components/z.js', linguagem: 'javascript' as const },
  { caminho: 'src/components/a.tsx', linguagem: 'typescript' as const },
  { caminho: 'src/lib/util.js', linguagem: 'javascript' as const },
]

describe('exploracao-analise', () => {
  it('monta a raiz com pastas antes de arquivos e conta descendentes', () => {
    expect(construirArvoreAnalise(arquivos, null)).toEqual({
      escopo: null,
      itens: [{ tipo: 'pasta', caminho: 'src', nome: 'src', quantidadeArquivos: 4 }],
    })
  })

  it('monta somente filhos diretos de uma pasta em ordem determinística', () => {
    expect(construirArvoreAnalise(arquivos, 'src')).toEqual({
      escopo: 'src',
      itens: [
        { tipo: 'pasta', caminho: 'src/components', nome: 'components', quantidadeArquivos: 2 },
        { tipo: 'pasta', caminho: 'src/lib', nome: 'lib', quantidadeArquivos: 1 },
        { tipo: 'arquivo', caminho: 'src/z.ts', nome: 'z.ts', linguagem: 'typescript' },
      ],
    })
    expect(construirArvoreAnalise(arquivos, 'src/components').itens.map((item) => item.nome)).toEqual(['a.tsx', 'z.js'])
  })

  it.each(['../segredo', '/etc/passwd', 'src/../segredo', 'src\\arquivo.ts', 'src//arquivo.ts'])('rejeita caminho perigoso: %s', (caminho) => {
    expect(() => normalizarCaminhoExploracao(caminho)).toThrowError(new ErroExploracaoAnalise('CAMINHO_INVALIDO'))
  })

  it('representa a raiz quando o caminho é omitido e exige arquivo nas relações', () => {
    expect(normalizarCaminhoExploracao(undefined)).toBeNull()
    expect(() => normalizarCaminhoExploracao(null, true)).toThrowError(new ErroExploracaoAnalise('ARQUIVO_OBRIGATORIO'))
  })
})
