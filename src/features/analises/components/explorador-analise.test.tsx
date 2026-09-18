import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import messages from '../../../../messages/pt-BR.json'
import { useArvoreAnalise, useRelacoesAnalise } from '../hooks/use-exploracao-analise'
import { ExploradorAnalise, normalizarArquivoSelecionado } from './explorador-analise'

const push = vi.fn()
let consulta = ''
let modoTeste: 'normal' | 'carregando' | 'erro' | 'vazio' | 'sem-relacoes' | 'limitacao' = 'normal'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/analises/snapshot',
  useSearchParams: () => new URLSearchParams(consulta),
}))

vi.mock('../hooks/use-exploracao-analise', () => ({
  useArvoreAnalise: vi.fn(),
  useRelacoesAnalise: vi.fn(),
}))

vi.mock('./mapa-relacoes', () => ({
  MapaRelacoes: ({ relacoes, onSelecionar }: { relacoes: { importa: Array<{ caminho: string }>; importadoPor: Array<{ caminho: string }> }; onSelecionar: (caminho: string) => void }) => <button type="button" data-testid="no-mapa" onClick={() => onSelecionar(relacoes.importa[0]?.caminho ?? relacoes.importadoPor[0]?.caminho ?? '')}>selecionar no mapa</button>,
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
  vi.mocked(useArvoreAnalise).mockImplementation((_id, caminho) => ({ data: modoTeste === 'vazio' ? { escopo: caminho, itens: [] } : caminho === 'src' ? arvoreSrc : arvoreRaiz, isLoading: modoTeste === 'carregando', isError: modoTeste === 'erro', refetch: vi.fn() } as never))
  vi.mocked(useRelacoesAnalise).mockImplementation((_id, arquivo) => ({ data: arquivo ? { ...relacoes, importa: modoTeste === 'sem-relacoes' ? [] : relacoes.importa, importadoPor: modoTeste === 'sem-relacoes' ? [] : relacoes.importadoPor, limitacoes: modoTeste === 'limitacao' ? [{ codigo: 'COMMONJS_NAO_SUPORTADO' as const, categoria: 'limitacao' as const }] : [] } : undefined, isLoading: modoTeste === 'carregando', isError: modoTeste === 'erro', error: modoTeste === 'erro' ? new Error('erro técnico') : null } as never))
})

describe('ExploradorAnalise', () => {
  it('começa na raiz, abre pasta e seleciona arquivo atualizando a URL', async () => {
    renderExplorador()
    fireEvent.click(screen.getByRole('button', { name: /Abrir pasta src/ }))
    await waitFor(() => expect(vi.mocked(useArvoreAnalise)).toHaveBeenLastCalledWith('snapshot', 'src'))
    fireEvent.click(screen.getByRole('button', { name: /Abrir arquivo a.ts/ }))
    expect(push).toHaveBeenCalledWith('/analises/snapshot?arquivo=src%2Fa.ts', { scroll: false })
  })

  it('usa a mesma seleção para lista, mapa e alternância mobile', () => {
    consulta = 'arquivo=src%2Fa.ts'
    renderExplorador()
    expect(screen.getByRole('button', { name: 'Relações' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /src\/lib\.ts/ }))
    fireEvent.click(screen.getByTestId('no-mapa'))
    expect(push).toHaveBeenNthCalledWith(1, '/analises/snapshot?arquivo=src%2Flib.ts', { scroll: false })
    expect(push).toHaveBeenNthCalledWith(2, '/analises/snapshot?arquivo=src%2Flib.ts', { scroll: false })
    fireEvent.click(screen.getByRole('button', { name: 'Arquivos' }))
    expect(screen.getByRole('button', { name: 'Arquivos' })).toHaveAttribute('aria-pressed', 'true')
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
})
