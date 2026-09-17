import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'

import messages from '../../../../messages/pt-BR.json'
import type { ResumoStatusAnalise } from '../services/persistencia/ciclo-vida-analise'
import { ResultadoAnalise } from './resultado-analise'

const base: ResumoStatusAnalise = {
  idPublico: '11111111-1111-4111-8111-111111111111',
  repositorio: { url: 'https://github.com/dono/projeto', proprietario: 'dono', nome: 'projeto' },
  commitSha: 'a'.repeat(40),
  referencia: 'main',
  estado: 'concluido',
  etapa: 'persistencia',
  tentativa: 1,
  tentativaIniciadaEm: '2026-09-17T10:00:00.000Z',
  ultimaAtividadeEm: '2026-09-17T10:01:00.000Z',
  atualizadoEm: '2026-09-17T10:01:00.000Z',
  finalizadoEm: '2026-09-17T10:01:00.000Z',
  demorada: false,
  falha: null,
  contagens: { arquivos: 2, simbolos: 1, exportacoes: 1, relacoesImportacao: 1, diagnosticos: 0 },
}

function renderResultado(resumo: ResumoStatusAnalise) {
  return render(<NextIntlClientProvider locale="pt-BR" timeZone="America/Araguaina" messages={messages}><ResultadoAnalise resumo={resumo} /></NextIntlClientProvider>)
}

describe('ResultadoAnalise', () => {
  it('exibe os dados reais do snapshot concluído e reserva o mapa sem simulação', async () => {
    renderResultado(base)

    expect(screen.getByRole('heading', { name: 'dono/projeto' })).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('aaaaaaaaaaaa')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Arquitetura do código' })).toBeInTheDocument()
    expect(screen.getByText('1 relações internas foram identificadas neste snapshot.')).toBeInTheDocument()
    expect(screen.queryByText('A estrutura deste repositório está pronta para ser explorada.')).not.toBeInTheDocument()
    expect(screen.queryByText('Selecione um item quando estiver disponível.')).not.toBeInTheDocument()
    expect(screen.queryByText('P3')).not.toBeInTheDocument()
    expect(screen.queryByText('roadmap')).not.toBeInTheDocument()
    expect(screen.queryByText('nós')).not.toBeInTheDocument()
    expect(screen.queryByText('arestas')).not.toBeInTheDocument()
  })

  it('mostra estado vazio quando não há relações internas', async () => {
    renderResultado({ ...base, contagens: { arquivos: 2, simbolos: 1, exportacoes: 1, relacoesImportacao: 0, diagnosticos: 0 } })
    expect(screen.getByText('Nenhuma relação interna encontrada')).toBeInTheDocument()
  })

  it.each([
    ['aguardando', 'A análise ainda está em andamento'],
    ['processando', 'A análise ainda está em andamento'],
    ['falha', 'Não foi possível concluir esta análise'],
  ] as const)('não apresenta mapa quando o snapshot está em %s', async (estado, titulo) => {
    renderResultado({ ...base, estado, falha: estado === 'falha' ? { codigo: 'TEMPO_ESGOTADO', categoria: 'transitoria', mensagem: 'segura', detalhes: null, ocorridoEm: base.atualizadoEm } : null })
    expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Arquitetura do código' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao acompanhamento' })).toHaveAttribute('href', `/?analise=${base.idPublico}`)
  })
})
