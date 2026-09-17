import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import { lerResultadoAnalise } from '@/features/analises/services/ler-resultado-analise'

import PaginaResultadoAnalise from './page'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND') },
}))

vi.mock('@/features/analises/services/ler-resultado-analise', () => ({
  lerResultadoAnalise: vi.fn(),
}))

vi.mock('@/features/analises/services/composicao-resultado-analise-servidor', () => ({
  obterRepositorioLeituraResultadoAnalise: vi.fn(() => ({ obterResumoStatus: vi.fn() })),
}))


const resumo = {
  idPublico: '11111111-1111-4111-8111-111111111111',
  repositorio: { proprietario: 'dono', nome: 'projeto' },
  commitSha: 'a'.repeat(40),
  referencia: 'main',
  estado: 'concluido' as const,
  atualizadoEm: '2026-09-17T10:00:00.000Z',
  falhaCodigo: null,
  contagens: { arquivos: 1, simbolos: 0, exportacoes: 0, relacoesImportacao: 0, diagnosticos: 0 },
}

describe('rota /analises/[snapshotId]', () => {
  it('compõe a página com a visão segura do snapshot', async () => {
    vi.mocked(lerResultadoAnalise).mockResolvedValue(resumo)

    const pagina = await PaginaResultadoAnalise({ params: Promise.resolve({ snapshotId: resumo.idPublico }) })

    expect(pagina).toBeDefined()
    expect((pagina as ReactElement<{ children: ReactElement<{ resumo: typeof resumo }> }>).props.children.props.resumo).toEqual(resumo)
    expect(lerResultadoAnalise).toHaveBeenCalledWith(resumo.idPublico, expect.any(Object))
  })

  it('usa notFound para snapshot inválido ou inexistente', async () => {
    vi.mocked(lerResultadoAnalise).mockResolvedValue(null)

    await expect(PaginaResultadoAnalise({ params: Promise.resolve({ snapshotId: 'invalido' }) })).rejects.toThrow('NOT_FOUND')
  })
})
