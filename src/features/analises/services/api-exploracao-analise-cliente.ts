import type { ArvoreAnalise, CodigoErroExploracao, RelacoesArquivo } from './exploracao-analise'

export type CodigoErroExploracaoCliente = CodigoErroExploracao | 'ERRO_INTERNO'

export class ErroExploracaoAnaliseCliente extends Error {
  constructor(readonly codigo: CodigoErroExploracaoCliente, readonly status: number, mensagem?: string) {
    super(mensagem ?? codigo)
    this.name = 'ErroExploracaoAnaliseCliente'
  }
}

export async function buscarArvoreAnalise(snapshotId: string, caminho: string | null): Promise<ArvoreAnalise> {
  const parametros = caminho ? `?caminho=${encodeURIComponent(caminho)}` : ''
  return requisitar<ArvoreAnalise>(`/api/analises/${encodeURIComponent(snapshotId)}/arvore${parametros}`)
}

export async function buscarRelacoesAnalise(snapshotId: string, caminhoArquivo: string): Promise<RelacoesArquivo> {
  return requisitar<RelacoesArquivo>(`/api/analises/${encodeURIComponent(snapshotId)}/relacoes?arquivo=${encodeURIComponent(caminhoArquivo)}`)
}

async function requisitar<T>(url: string): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(url)
  } catch {
    throw new ErroExploracaoAnaliseCliente('ERRO_INTERNO', 503)
  }

  const corpo = await resposta.json().catch(() => null) as T | { erro?: { codigo?: string; mensagem?: string } } | null
  if (resposta.ok) return corpo as T

  const erro = corpo && typeof corpo === 'object' && 'erro' in corpo ? corpo.erro : undefined
  const codigos: CodigoErroExploracaoCliente[] = ['SNAPSHOT_NAO_ENCONTRADO', 'CAMINHO_INVALIDO', 'CAMINHO_NAO_ENCONTRADO', 'ARQUIVO_OBRIGATORIO', 'REQUISICAO_INVALIDA', 'ERRO_INTERNO']
  const codigo = erro?.codigo && codigos.includes(erro.codigo as CodigoErroExploracaoCliente) ? erro.codigo as CodigoErroExploracaoCliente : 'ERRO_INTERNO'
  throw new ErroExploracaoAnaliseCliente(codigo, resposta.status, erro?.mensagem)
}
