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

export interface ArquivoExploracao {
  caminho: string
  linguagem: TipoArquivoFonte
}

export interface LinhasRelacoesArquivo {
  arquivo: ArquivoExploracao
  importa: RelacaoArquivoConsolidada[]
  importadoPor: RelacaoArquivoConsolidada[]
  limitacoes: Array<{ codigo: CodigoDiagnostico; categoria: 'sintaxe' | 'limitacao' }>
}

export interface RepositorioLeituraExploracao {
  obterArquivosSnapshotConcluido(snapshotId: string): Promise<ArquivoExploracao[] | null>
  obterRelacoesArquivoSnapshotConcluido(snapshotId: string, caminho: string): Promise<LinhasRelacoesArquivo | null>
}

export type CodigoErroExploracao =
  | 'SNAPSHOT_NAO_ENCONTRADO'
  | 'CAMINHO_INVALIDO'
  | 'CAMINHO_NAO_ENCONTRADO'
  | 'ARQUIVO_OBRIGATORIO'

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
  if (!UUID_PUBLICO_EXPLORACAO.test(snapshotId)) throw new ErroExploracaoAnalise('SNAPSHOT_NAO_ENCONTRADO')
}

export function construirArvoreAnalise(arquivos: readonly ArquivoExploracao[], escopo: string | null): ArvoreAnalise {
  const prefixo = escopo ? `${escopo}/` : ''
  const candidatos = arquivos.filter((arquivo) => !escopo || arquivo.caminho.startsWith(prefixo))
  if (escopo && !candidatos.length) throw new ErroExploracaoAnalise('CAMINHO_NAO_ENCONTRADO')

  const pastas = new Map<string, number>()
  const filhos = new Map<string, ItemArvoreAnalise>()
  for (const arquivo of candidatos) {
    const relativo = escopo ? arquivo.caminho.slice(prefixo.length) : arquivo.caminho
    const partes = relativo.split('/')
    if (partes.length === 1) {
      filhos.set(arquivo.caminho, { tipo: 'arquivo', caminho: arquivo.caminho, nome: partes[0], linguagem: arquivo.linguagem })
      continue
    }
    for (let indice = 1; indice < partes.length; indice += 1) {
      const caminhoPasta = `${prefixo}${partes.slice(0, indice).join('/')}`
      pastas.set(caminhoPasta, (pastas.get(caminhoPasta) ?? 0) + 1)
    }
    const caminhoPastaDireta = `${prefixo}${partes[0]}`
    filhos.set(caminhoPastaDireta, { tipo: 'pasta', caminho: caminhoPastaDireta, nome: partes[0], quantidadeArquivos: pastas.get(caminhoPastaDireta) ?? 0 })
  }
  for (const [caminho, quantidadeArquivos] of pastas) {
    const relativo = escopo ? caminho.slice(prefixo.length) : caminho
    if (!relativo.includes('/')) filhos.set(caminho, { tipo: 'pasta', caminho, nome: relativo, quantidadeArquivos })
  }

  const itens = [...filhos.values()].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'pasta' ? -1 : 1
    return a.nome.localeCompare(b.nome, 'pt-BR') || a.caminho.localeCompare(b.caminho)
  })
  return { escopo, itens }
}
