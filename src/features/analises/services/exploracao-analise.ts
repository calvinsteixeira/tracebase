import type { CodigoDiagnostico, TipoArquivoFonte } from '../analises.types'

export type ItemArvoreAnalise =
  | { tipo: 'pasta'; caminho: string; nome: string; quantidadeArquivos: number }
  | { tipo: 'arquivo'; caminho: string; nome: string; linguagem: TipoArquivoFonte }

export interface ArvoreAnalise {
  escopo: string | null
  itens: ItemArvoreAnalise[]
}

export interface RelacaoArquivoConsolidada {
  caminho: string
  quantidadeImports: number
}

export interface RelacoesArquivo {
  arquivo: { caminho: string; nome: string; linguagem: TipoArquivoFonte }
  importa: RelacaoArquivoConsolidada[]
  importadoPor: RelacaoArquivoConsolidada[]
  limitacoes: Array<{ codigo: CodigoDiagnostico; categoria: 'sintaxe' | 'limitacao' }>
}

export interface LinhasRelacoesArquivo {
  arquivo: {
    caminho: string
    linguagem: TipoArquivoFonte
  }
  importa: RelacaoArquivoConsolidada[]
  importadoPor: RelacaoArquivoConsolidada[]
  limitacoes: Array<{ codigo: CodigoDiagnostico; categoria: 'sintaxe' | 'limitacao' }>
}

export interface RepositorioLeituraExploracao {
  obterArvoreSnapshotConcluido(snapshotId: string, escopo: string | null): Promise<ResultadoArvoreLeitura>
  obterRelacoesArquivoSnapshotConcluido(snapshotId: string, caminho: string): Promise<ResultadoRelacoesLeitura>
}

export type ResultadoArvoreLeitura =
  | { tipo: 'encontrada'; arvore: ArvoreAnalise }
  | { tipo: 'snapshot_indisponivel' }
  | { tipo: 'caminho_inexistente' }

export type ResultadoRelacoesLeitura =
  | { tipo: 'encontrada'; relacoes: LinhasRelacoesArquivo }
  | { tipo: 'snapshot_indisponivel' }
  | { tipo: 'arquivo_inexistente' }

export type CodigoErroExploracao =
  | 'SNAPSHOT_NAO_ENCONTRADO'
  | 'CAMINHO_INVALIDO'
  | 'CAMINHO_NAO_ENCONTRADO'
  | 'ARQUIVO_OBRIGATORIO'
  | 'REQUISICAO_INVALIDA'

export class ErroExploracaoAnalise extends Error {
  constructor(readonly codigo: CodigoErroExploracao) {
    super(codigo)
    this.name = 'ErroExploracaoAnalise'
  }
}

export const UUID_PUBLICO_EXPLORACAO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizarCaminhoExploracao(caminho: string | null | undefined, obrigatorio = false) {
  if (caminho === undefined || caminho === null || caminho === '') {
    if (obrigatorio) throw new ErroExploracaoAnalise('ARQUIVO_OBRIGATORIO')
    return null
  }
  if (
    caminho.startsWith('/') || caminho.includes('\\') ||
    caminho.split('/').some((parte) => !parte || parte === '.' || parte === '..')
  ) {
    throw new ErroExploracaoAnalise('CAMINHO_INVALIDO')
  }
  return caminho.replace(/\/$/, '')
}

export function validarSnapshotExploracao(snapshotId: string) {
  if (!UUID_PUBLICO_EXPLORACAO.test(snapshotId)) throw new ErroExploracaoAnalise('REQUISICAO_INVALIDA')
}
