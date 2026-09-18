import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import messages from '../../../../messages/pt-BR.json'
import { useArvoreAnalise, useRelacoesAnalise } from '../hooks/use-exploracao-analise'
import { ExploradorAnalise, normalizarArquivoSelecionado } from './explorador-analise'

const push = vi.fn()
let consulta = ''
let modoTeste: 'normal' | 'carregando' | 'erro' | 'vazio' | 'sem-relacoes' | 'limitacao' = 'normal'
const refetchRelacoes = vi.fn()

const cytoscapeBoundary = vi.hoisted(() => {
  let eventoNo: ((evento: { target: { data: (chave: string) => string } }) => void) | undefined
  let deveFalhar = false
  const instancia = {
    on: vi.fn((_evento: string, _seletor: string, handler: typeof eventoNo) => { eventoNo = handler }),
    fit: vi.fn(),
    destroy: vi.fn(),
    zoom: vi.fn(() => 1),
    width: vi.fn(() => 600),
    height: vi.fn(() => 300),
  }
  return {
    instancia,
    factory: vi.fn(),
    deveFalhar: () => deveFalhar,
    definirFalha(valor: boolean) { deveFalhar = valor },
    clicarNo(caminho: string) { eventoNo?.({ target: { data: () => caminho } }) },
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/analises/snapshot',
  useSearchParams: () => new URLSearchParams(consulta),
}))

vi.mock('../hooks/use-exploracao-analise', () => ({
  useArvoreAnalise: vi.fn(),
  useRelacoesAnalise: vi.fn(),
}))

vi.mock('cytoscape', () => ({
  default: (config: unknown) => {
    if (cytoscapeBoundary.deveFalhar()) throw new Error('falha simulada')
    cytoscapeBoundary.factory(config)
    return cytoscapeBoundary.instancia
  },
}))

const arvoreRaiz = { escopo: null, itens: [{ tipo: 'pasta' as const, caminho: 'src', nome: 'src', quantidadeArquivos: 2 }, { tipo: 'arquivo' as const, caminho: 'README.ts', nome: 'README.ts', linguagem: 'typescript' as const }] }
const arvoreSrc = { escopo: 'src', itens: [{ tipo: 'arquivo' as const, caminho: 'src/a.ts', nome: 'a.ts', linguagem: 'typescript' as const }] }
const relacoes = { arquivo: { caminho: 'src/a.ts', nome: 'a.ts', linguagem: 'typescript' as const }, importa: [{ caminho: 'src/lib.ts', quantidadeImports: 2 }], importadoPor: [{ caminho: 'src/app.ts', quantidadeImports: 1 }], limitacoes: [] }

function renderExplorador() {
  return render(<NextIntlClientProvider locale="pt-BR" messages={messages}><ExploradorAnalise snapshotId="snapshot" /></NextIntlClientProvider>)
}

beforeEach(() => {
  consulta = ''
  modoTeste = 'normal'
  push.mockReset()
  refetchRelacoes.mockReset()
  cytoscapeBoundary.factory.mockReset()
  cytoscapeBoundary.definirFalha(false)
  cytoscapeBoundary.instancia.fit.mockReset()
  cytoscapeBoundary.instancia.destroy.mockReset()
  vi.mocked(useArvoreAnalise).mockImplementation((_id, caminho) => ({ data: modoTeste === 'vazio' ? { escopo: caminho, itens: [] } : caminho === 'src' ? arvoreSrc : arvoreRaiz, isLoading: modoTeste === 'carregando', isError: modoTeste === 'erro', refetch: vi.fn() } as never))
  vi.mocked(useRelacoesAnalise).mockImplementation((_id, arquivo) => ({ data: arquivo ? { ...relacoes, importa: modoTeste === 'sem-relacoes' ? [] : relacoes.importa, importadoPor: modoTeste === 'sem-relacoes' ? [] : relacoes.importadoPor, limitacoes: modoTeste === 'limitacao' ? [{ codigo: 'COMMONJS_NAO_SUPORTADO' as const, categoria: 'limitacao' as const }] : [] } : undefined, isLoading: modoTeste === 'carregando', isError: modoTeste === 'erro', error: modoTeste === 'erro' ? new Error('erro técnico') : null, refetch: refetchRelacoes } as never))
})

describe('ExploradorAnalise', () => {
  it('começa na raiz, abre pasta e seleciona arquivo atualizando a URL', async () => {
    renderExplorador()
    fireEvent.click(screen.getByRole('button', { name: /Abrir pasta src/ }))
    await waitFor(() => expect(vi.mocked(useArvoreAnalise)).toHaveBeenLastCalledWith('snapshot', 'src'))
    fireEvent.click(screen.getByRole('button', { name: /Abrir arquivo a.ts/ }))
    expect(push).toHaveBeenCalledWith('/analises/snapshot?arquivo=src%2Fa.ts', { scroll: false })
  })

  it('usa a mesma seleção para lista, mapa e alternância mobile', async () => {
    consulta = 'arquivo=src%2Fa.ts'
    const view = renderExplorador()
    expect(screen.getByRole('button', { name: 'Relações' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /src\/lib\.ts/ }))
    await waitFor(() => expect(cytoscapeBoundary.factory).toHaveBeenCalled())
    const config = cytoscapeBoundary.factory.mock.calls[0]?.[0] as { elements: Array<{ data?: { id?: string; source?: string; target?: string; label?: string }; position?: { x: number; y: number } }> }
    expect(config.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ data: expect.objectContaining({ id: 'src/a.ts' }), position: { x: 0, y: 0 } }),
      expect.objectContaining({ data: expect.objectContaining({ id: 'src/app.ts' }), position: expect.objectContaining({ x: -230 }) }),
      expect.objectContaining({ data: expect.objectContaining({ id: 'src/lib.ts' }), position: expect.objectContaining({ x: 230 }) }),
      expect.objectContaining({ data: expect.objectContaining({ source: 'src/a.ts', target: 'src/lib.ts', label: '2' }) }),
    ]))
    expect(JSON.stringify((config as { style?: unknown }).style)).not.toMatch(/oklch|var\(--/)
    expect(cytoscapeBoundary.instancia.fit).toHaveBeenCalledWith(undefined, 40)
    cytoscapeBoundary.clicarNo('src/lib.ts')
    expect(push).toHaveBeenNthCalledWith(1, '/analises/snapshot?arquivo=src%2Flib.ts', { scroll: false })
    expect(push).toHaveBeenNthCalledWith(2, '/analises/snapshot?arquivo=src%2Flib.ts', { scroll: false })
    fireEvent.click(screen.getByRole('button', { name: 'Arquivos' }))
    expect(screen.getByRole('button', { name: 'Arquivos' })).toHaveAttribute('aria-pressed', 'true')
    view.unmount()
    expect(cytoscapeBoundary.instancia.destroy).toHaveBeenCalled()
  })

  it('rejeita seleção de arquivo com path inválido', () => {
    expect(normalizarArquivoSelecionado('../segredo')).toBeNull()
    expect(normalizarArquivoSelecionado('/etc/passwd')).toBeNull()
    expect(normalizarArquivoSelecionado('src\\arquivo.ts')).toBeNull()
    expect(normalizarArquivoSelecionado('src/arquivo.ts')).toBe('src/arquivo.ts')
  })

  it('apresenta loading, erro, vazio e limitações sem detalhes técnicos', () => {
    consulta = 'arquivo=src%2Fa.ts'
    modoTeste = 'carregando'
    const { rerender } = renderExplorador()
    expect(screen.getByText('Carregando relações...')).toBeInTheDocument()

    modoTeste = 'erro'
    rerender(<NextIntlClientProvider locale="pt-BR" messages={messages}><ExploradorAnalise snapshotId="snapshot" /></NextIntlClientProvider>)
    expect(screen.getByText('Não foi possível carregar as relações deste arquivo.')).toBeInTheDocument()
    expect(screen.queryByText('erro técnico')).not.toBeInTheDocument()

    modoTeste = 'sem-relacoes'
    rerender(<NextIntlClientProvider locale="pt-BR" messages={messages}><ExploradorAnalise snapshotId="snapshot" /></NextIntlClientProvider>)
    expect(screen.getByText('Nenhuma relação interna encontrada para este arquivo.')).toBeInTheDocument()

    modoTeste = 'limitacao'
    rerender(<NextIntlClientProvider locale="pt-BR" messages={messages}><ExploradorAnalise snapshotId="snapshot" /></NextIntlClientProvider>)
    expect(screen.getByText('Uma importação CommonJS não pôde ser detalhada.')).toBeInTheDocument()
  })

  it('permite tentar novamente quando a consulta de relações falha', () => {
    consulta = 'arquivo=src%2Fa.ts'
    modoTeste = 'erro'
    renderExplorador()
    const botoes = screen.getAllByRole('button', { name: 'Tentar novamente' })
    fireEvent.click(botoes.at(-1) as HTMLButtonElement)
    expect(refetchRelacoes).toHaveBeenCalledOnce()
  })

  it('destaca o arquivo selecionado na navegação', () => {
    consulta = 'arquivo=src%2Fa.ts'
    renderExplorador()
    expect(screen.getByRole('button', { name: /Arquivo selecionado.*Abrir arquivo a.ts/ })).toHaveAttribute('aria-current', 'page')
  })

  it('apresenta erro seguro e remove os controles quando Cytoscape falha', async () => {
    consulta = 'arquivo=src%2Fa.ts'
    cytoscapeBoundary.definirFalha(true)
    renderExplorador()
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o mapa.')
    expect(screen.queryByRole('button', { name: 'Aumentar zoom' })).not.toBeInTheDocument()
  })
})
