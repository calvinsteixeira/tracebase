import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import messages from '../../../../messages/pt-BR.json'
import type { VisaoResultadoAnalise } from '../services/ler-resultado-analise'
import { ResultadoAnalise } from './resultado-analise'

vi.mock('./explorador-analise', () => ({
  ExploradorAnalise: ({ snapshotId }: { snapshotId: string }) => <div data-testid="explorador-analise">{snapshotId}</div>,
}))

vi.mock('next-intl/server', async () => {
  const { default: catalogo } = await import('../../../../messages/pt-BR.json')

  return {
    getTranslations: async (namespace: string) => (chave: string, valores?: Record<string, unknown>) => {
      const valor = chave.split('.').reduce<unknown>((atual, parte) => (atual as Record<string, unknown>)?.[parte], catalogo[namespace as keyof typeof catalogo])
      return String(valor).replace(/\{(\w+)\}/g, (_match, nome: string) => String(valores?.[nome] ?? ''))
    },
    getFormatter: async () => ({ dateTime: (data: Date) => data.toISOString() }),
  }
})

const base: VisaoResultadoAnalise = {
  idPublico: '11111111-1111-4111-8111-111111111111',
  repositorio: { proprietario: 'dono', nome: 'projeto' },
  commitSha: 'a'.repeat(40),
  referencia: 'main',
  estado: 'concluido',
  atualizadoEm: '2026-09-17T10:01:00.000Z',
  falhaCodigo: null,
  contagens: { arquivos: 2, simbolos: 1, exportacoes: 1, relacoesImportacao: 1, diagnosticos: 0 },
}

async function renderResultado(resumo: VisaoResultadoAnalise) {
  const elemento = await ResultadoAnalise({ resumo })
  return render(<NextIntlClientProvider locale="pt-BR" timeZone="America/Araguaina" messages={messages}>{elemento}</NextIntlClientProvider>)
}

describe('ResultadoAnalise', () => {
  it('exibe os dados reais do snapshot concluído e inicia a exploração sob demanda', async () => {
    await renderResultado(base)

    expect(screen.getByRole('heading', { name: 'dono/projeto' })).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('aaaaaaaaaaaa')).toBeInTheDocument()
    expect(screen.getByTestId('explorador-analise')).toHaveTextContent(base.idPublico)
    expect(screen.getByRole('heading', { name: 'Detalhes do snapshot' })).toBeInTheDocument()
    expect(screen.queryByText('P3')).not.toBeInTheDocument()
    expect(screen.queryByText('roadmap')).not.toBeInTheDocument()
    expect(screen.queryByText('nós')).not.toBeInTheDocument()
    expect(screen.queryByText('arestas')).not.toBeInTheDocument()
  })

  it.each([
    ['aguardando', 'A análise ainda está em andamento'],
    ['processando', 'A análise ainda está em andamento'],
    ['falha', 'Não foi possível concluir esta análise'],
  ] as const)('não apresenta mapa quando o snapshot está em %s', async (estado, titulo) => {
    await renderResultado({ ...base, estado, falhaCodigo: estado === 'falha' ? 'TEMPO_ESGOTADO' : null })
    expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Arquitetura do código' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao acompanhamento' })).toHaveAttribute('href', `/?analise=${base.idPublico}`)
  })
})
