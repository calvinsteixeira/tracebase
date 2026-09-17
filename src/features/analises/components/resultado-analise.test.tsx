import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import messages from '../../../../messages/pt-BR.json'
import type { ResumoStatusAnalise } from '../services/persistencia/ciclo-vida-analise'
import { ResultadoAnalise } from './resultado-analise'

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (chave: string, valores?: Record<string, unknown>) => {
    const mensagens: Record<string, string> = {
      'resultadoAnalise.eyebrow': 'Resultado da análise',
      'resultadoAnalise.commitCompleto': 'Commit completo: {commit}',
      'resultadoAnalise.status.concluida': 'Análise concluída',
      'resultadoAnalise.status.processando': 'Análise em andamento',
      'resultadoAnalise.status.falha': 'Análise interrompida',
      'resultadoAnalise.visualizacao.eyebrow': 'Visão do repositório',
      'resultadoAnalise.visualizacao.titulo': 'Arquitetura do código',
      'resultadoAnalise.visualizacao.pronta': 'A estrutura deste repositório está pronta para ser explorada.',
      'resultadoAnalise.visualizacao.relacoesEncontradas': '{quantidade} relações internas foram encontradas nesta análise.',
      'resultadoAnalise.visualizacao.vaziaTitulo': 'Nenhuma relação interna encontrada',
      'resultadoAnalise.visualizacao.vaziaDescricao': 'Este snapshot não possui conexões entre arquivos para apresentar aqui.',
      'resultadoAnalise.detalhe.eyebrow': 'Contexto',
      'resultadoAnalise.detalhe.titulo': 'Detalhes do snapshot',
      'resultadoAnalise.detalhe.descricao': 'Este painel reúne um resumo seguro da versão analisada. Selecione um item quando estiver disponível.',
      'resultadoAnalise.resumo.arquivos': 'Arquivos',
      'resultadoAnalise.resumo.simbolos': 'Símbolos',
      'resultadoAnalise.resumo.exportacoes': 'Exports',
      'resultadoAnalise.resumo.diagnosticos': 'Diagnósticos',
      'resultadoAnalise.resumo.atualizado': 'Atualizado em',
      'resultadoAnalise.indisponivel.falhaTitulo': 'Não foi possível concluir esta análise',
      'resultadoAnalise.indisponivel.andamentoTitulo': 'A análise ainda está em andamento',
      'resultadoAnalise.indisponivel.andamentoDescricao': 'Volte ao acompanhamento para consultar o estado mais recente quando o processamento avançar.',
      'resultadoAnalise.voltarAcompanhamento': 'Voltar ao acompanhamento',
      'erros.TEMPO_ESGOTADO': 'O processamento excedeu o tempo permitido. Tente novamente.',
    }
    const texto = mensagens[`${namespace}.${chave}`] ?? chave
    return texto.replace(/\{(\w+)\}/g, (_match, nome: string) => String(valores?.[nome] ?? ''))
  },
  getFormatter: async () => ({ dateTime: (data: Date) => data.toISOString() }),
}))

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

async function renderResultado(resumo: ResumoStatusAnalise) {
  const elemento = await ResultadoAnalise({ resumo })
  return render(<NextIntlClientProvider locale="pt-BR" messages={messages}>{elemento}</NextIntlClientProvider>)
}

describe('ResultadoAnalise', () => {
  it('exibe os dados reais do snapshot concluído e reserva o mapa sem simulação', async () => {
    await renderResultado(base)

    expect(screen.getByRole('heading', { name: 'dono/projeto' })).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('aaaaaaaaaaaa')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Arquitetura do código' })).toBeInTheDocument()
    expect(screen.getByText('A estrutura deste repositório está pronta para ser explorada.')).toBeInTheDocument()
    expect(screen.queryByText('P3')).not.toBeInTheDocument()
    expect(screen.queryByText('roadmap')).not.toBeInTheDocument()
    expect(screen.queryByText('nós')).not.toBeInTheDocument()
    expect(screen.queryByText('arestas')).not.toBeInTheDocument()
  })

  it('mostra estado vazio quando não há relações internas', async () => {
    await renderResultado({ ...base, contagens: { arquivos: 2, simbolos: 1, exportacoes: 1, relacoesImportacao: 0, diagnosticos: 0 } })
    expect(screen.getByText('Nenhuma relação interna encontrada')).toBeInTheDocument()
  })

  it.each([
    ['aguardando', 'A análise ainda está em andamento'],
    ['processando', 'A análise ainda está em andamento'],
    ['falha', 'Não foi possível concluir esta análise'],
  ] as const)('não apresenta mapa quando o snapshot está em %s', async (estado, titulo) => {
    await renderResultado({ ...base, estado, falha: estado === 'falha' ? { codigo: 'TEMPO_ESGOTADO', categoria: 'transitoria', mensagem: 'segura', detalhes: null, ocorridoEm: base.atualizadoEm } : null })
    expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Arquitetura do código' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao acompanhamento' })).toBeInTheDocument()
  })
})
