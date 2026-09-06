import { describe, expect, it } from 'vitest'

import type {
  ArquivoFonte,
  ConfiguracaoProjeto,
  IndiceAnalise,
  SnapshotAnalise,
} from '@/features/analises/analises.types'

import { indexarImports } from './indexador-imports'

const snapshot: SnapshotAnalise = {
  id: 'snapshot:task-3',
  repositorioId: 'repositorio:task-3',
  commitSha: 'commit-task-3',
  referencia: 'main',
}

describe('indexador de fatos estruturais', () => {
  it('resolve imports relativos, imports de tipo, efeito colateral e dependências externas', () => {
    const indice = indexar({
      arquivosFonte: [
        arquivo(
          'src/entry.ts',
          [
            "import type { Usuario } from './auth'",
            "import { autenticar } from './auth'",
            "import { Button } from './components/button.tsx'",
            "import { Card } from './components/card'",
            "import './setup'",
            "import React from 'react'",
            "import componente from '@empresa/design-system'",
            "import missing from './missing'",
          ].join('\n'),
        ),
        arquivo('src/auth.ts', 'export function autenticar() {}'),
        arquivo('src/components/button.tsx', 'export function Button() {}'),
        arquivo('src/components/card/index.ts', 'export function Card() {}'),
        arquivo('src/setup.js', 'export const setup = true'),
      ],
    })

    expect(indice.arquivos.map((item) => item.caminho)).toEqual([
      'src/auth.ts',
      'src/components/button.tsx',
      'src/components/card/index.ts',
      'src/entry.ts',
      'src/setup.js',
    ])
    expect(indice.relacoesImportacao.map((relacao) => relacao.destino)).toEqual([
      { tipo: 'interno', caminhoArquivo: 'src/auth.ts' },
      { tipo: 'interno', caminhoArquivo: 'src/auth.ts' },
      { tipo: 'interno', caminhoArquivo: 'src/components/button.tsx' },
      { tipo: 'interno', caminhoArquivo: 'src/components/card/index.ts' },
      { tipo: 'interno', caminhoArquivo: 'src/setup.js' },
      { tipo: 'externo', especificador: 'react' },
      { tipo: 'externo', especificador: '@empresa/design-system' },
      { tipo: 'nao-resolvido', especificador: './missing' },
    ])
    expect(indice.relacoesImportacao.every((relacao) => relacao.evidencia.caminhoArquivo === 'src/entry.ts')).toBe(true)
    expect(indice.simbolos).toEqual([])
  })

  it('resolve alias configurado, preserva alias sem destino e mantém pacote com escopo externo', () => {
    const indice = indexar({
      configuracao: {
        caminho: 'jsconfig.json',
        conteudo: JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: { '@/*': ['./src/*'] },
          },
        }),
      },
      arquivosFonte: [
        arquivo(
          'src/entry.ts',
          [
            "import Button from '@/components/button'",
            "import Missing from '@/missing'",
            "import pacote from '@empresa/design-system'",
          ].join('\n'),
        ),
        arquivo('src/components/button.tsx', 'export default function Button() {}'),
      ],
    })

    expect(indice.relacoesImportacao.map((relacao) => relacao.destino)).toEqual([
      { tipo: 'interno', caminhoArquivo: 'src/components/button.tsx' },
      { tipo: 'nao-resolvido', especificador: '@/missing' },
      { tipo: 'externo', especificador: '@empresa/design-system' },
    ])
    expect(indice.diagnosticos).toEqual([])
  })

  it('extrai import dinâmico literal e marca expressão dinâmica sem tentar resolvê-la', () => {
    const indice = indexar({
      arquivosFonte: [
        arquivo(
          'src/loader.ts',
          [
            "const carregado = import('./auth')",
            "const pagina = import('./paginas/' + nomeDaPagina)",
          ].join('\n'),
        ),
        arquivo('src/auth.ts', 'export const autenticar = true'),
      ],
    })

    expect(indice.relacoesImportacao).toHaveLength(2)
    expect(indice.relacoesImportacao[0]?.destino).toEqual({
      tipo: 'interno',
      caminhoArquivo: 'src/auth.ts',
    })
    expect(indice.relacoesImportacao[1]?.destino).toEqual({
      tipo: 'nao-resolvido',
      especificador: "'./paginas/' + nomeDaPagina",
      expressao: "'./paginas/' + nomeDaPagina",
    })
    expect(indice.diagnosticos).toEqual([
      expect.objectContaining({
        codigo: 'IMPORT_DINAMICO_NAO_RESOLVIDO',
        evidencia: expect.objectContaining({ caminhoArquivo: 'src/loader.ts' }),
      }),
    ])
    expect(indice.parcial).toBe(true)
  })

  it('extrai exportações nomeadas, padrão, locais e múltiplas variáveis', () => {
    const indice = indexar({
      arquivosFonte: [
        arquivo(
          'src/exports.ts',
          [
            'export function autenticar() {}',
            'export class Usuario {}',
            'export const primeiro = 1, segundo = 2',
            'export interface Sessao {}',
            'export type Identificador = string',
            'export enum Papel { Admin }',
            'export { autenticar as autenticarPublica }',
          ].join('\n'),
        ),
        arquivo('src/default.ts', 'export default function Login() {}'),
        arquivo('src/expression.ts', 'const valor = 1\nexport default valor'),
        arquivo('src/anonymous.ts', 'export default function () {}'),
      ],
    })

    expect(indice.exportacoes
      .filter((exportacao) => exportacao.arquivoOrigemId === 'arquivo:src/exports.ts')
      .map(({ nomeExportado, tipo, nomeLocal }) => ({ nomeExportado, tipo, nomeLocal }))).toEqual([
      { nomeExportado: 'autenticar', tipo: 'nomeada', nomeLocal: undefined },
      { nomeExportado: 'Usuario', tipo: 'nomeada', nomeLocal: undefined },
      { nomeExportado: 'primeiro', tipo: 'nomeada', nomeLocal: undefined },
      { nomeExportado: 'segundo', tipo: 'nomeada', nomeLocal: undefined },
      { nomeExportado: 'Sessao', tipo: 'nomeada', nomeLocal: undefined },
      { nomeExportado: 'Identificador', tipo: 'nomeada', nomeLocal: undefined },
      { nomeExportado: 'Papel', tipo: 'nomeada', nomeLocal: undefined },
      { nomeExportado: 'autenticarPublica', tipo: 'nomeada', nomeLocal: 'autenticar' },
    ])
    expect(indice.exportacoes
      .filter((exportacao) => exportacao.tipo === 'padrao')
      .map(({ nomeExportado, nomeLocal }) => ({ nomeExportado, nomeLocal }))).toEqual([
        { nomeExportado: 'default', nomeLocal: undefined },
        { nomeExportado: 'default', nomeLocal: 'Login' },
        { nomeExportado: 'default', nomeLocal: 'valor' },
      ])
    expect(indice.exportacoes.every((exportacao) => exportacao.evidencia.inicio.linha > 0)).toBe(true)
  })

  it('extrai reexports nomeados, com alias, curinga e namespace sem inventar nomes', () => {
    const indice = indexar({
      arquivosFonte: [
        arquivo(
          'src/index.ts',
          [
            "export { autenticar } from './auth'",
            "export { autenticar as entrar } from './auth'",
            "export * from './permissions'",
            "export * as permissions from './permissions'",
            "export { z } from 'zod'",
            "export { ausente } from './missing'",
          ].join('\n'),
        ),
        arquivo('src/auth.ts', 'export function autenticar() {}'),
        arquivo('src/permissions.ts', 'export const admin = true'),
      ],
    })

    expect(indice.exportacoes
      .filter((exportacao) => exportacao.arquivoOrigemId === 'arquivo:src/index.ts')
      .map(({ nomeExportado, tipo, nomeLocal, destino }) => ({ nomeExportado, tipo, nomeLocal, destino }))).toEqual([
      {
        nomeExportado: 'autenticar',
        tipo: 'reexportacao',
        nomeLocal: 'autenticar',
        destino: { tipo: 'interno', caminhoArquivo: 'src/auth.ts' },
      },
      {
        nomeExportado: 'entrar',
        tipo: 'reexportacao',
        nomeLocal: 'autenticar',
        destino: { tipo: 'interno', caminhoArquivo: 'src/auth.ts' },
      },
      {
        nomeExportado: '*',
        tipo: 'reexportacao',
        nomeLocal: undefined,
        destino: { tipo: 'interno', caminhoArquivo: 'src/permissions.ts' },
      },
      {
        nomeExportado: 'permissions',
        tipo: 'reexportacao',
        nomeLocal: undefined,
        destino: { tipo: 'interno', caminhoArquivo: 'src/permissions.ts' },
      },
      {
        nomeExportado: 'z',
        tipo: 'reexportacao',
        nomeLocal: 'z',
        destino: { tipo: 'externo', especificador: 'zod' },
      },
      {
        nomeExportado: 'ausente',
        tipo: 'reexportacao',
        nomeLocal: 'ausente',
        destino: { tipo: 'nao-resolvido', especificador: './missing' },
      },
    ])
  })

  it('preserva outros arquivos quando há erro sintático e registra CommonJS como limitação', () => {
    const indice = indexar({
      arquivosFonte: [
        arquivo('src/broken.ts', 'export const valido = 1\nexport const = 2'),
        arquivo(
          'src/common.ts',
          [
            "const dependência = require('dependencia')",
            'module.exports = dependência',
            'exports.nome = dependência',
            'export const segura = true',
          ].join('\n'),
        ),
        arquivo('src/healthy.ts', 'export const saudavel = true'),
      ],
    })

    expect(indice.arquivos.map((arquivo) => arquivo.caminho)).toEqual([
      'src/broken.ts',
      'src/common.ts',
      'src/healthy.ts',
    ])
    expect(indice.exportacoes.some((exportacao) => exportacao.nomeExportado === 'saudavel')).toBe(true)
    expect(indice.exportacoes.some((exportacao) => exportacao.nomeExportado === 'segura')).toBe(true)
    expect(indice.diagnosticos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codigo: 'ERRO_SINTATICO' }),
        expect.objectContaining({ codigo: 'COMMONJS_NAO_SUPORTADO' }),
      ]),
    )
    expect(indice.relacoesImportacao).toEqual([])
    expect(indice.parcial).toBe(true)
    expect(indice.diagnosticos.every((diagnostico) => diagnostico.evidencia.inicio.linha > 0)).toBe(true)
  })

  it('é determinístico quando a entrada chega em ordem diferente', () => {
    const arquivos = [
      arquivo('src/z.ts', "import './a'\nexport const z = true"),
      arquivo('src/a.ts', 'export const a = true'),
    ]

    const indiceOriginal = indexar({ arquivosFonte: arquivos })
    const indiceInvertido = indexar({ arquivosFonte: [...arquivos].reverse() })

    expect(indiceInvertido).toEqual(indiceOriginal)
  })

  it('rejeita caminhos duplicados sem sobrescrever o conteúdo', () => {
    const arquivoDuplicado = arquivo('src/duplicado.ts', 'export {}')

    expect(() => indexar({ arquivosFonte: [arquivoDuplicado, arquivoDuplicado] })).toThrow(
      'O snapshot contém o arquivo duplicado "src/duplicado.ts".',
    )
  })
})

function indexar({
  arquivosFonte,
  configuracao,
}: {
  arquivosFonte: ArquivoFonte[]
  configuracao?: ConfiguracaoProjeto
}): IndiceAnalise {
  return indexarImports({ snapshot, arquivosFonte, configuracao })
}

function arquivo(caminho: string, conteudo: string): ArquivoFonte {
  return { caminho, conteudo }
}
