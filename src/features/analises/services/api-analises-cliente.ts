import type { ResultadoElegibilidadeRepositorio } from './criar-snapshot-repositorio'
import { analisarUrlRepositorio, ErroAnaliseRepositorio } from './validar-url-repositorio'

export type CodigoErroApiAnaliseCliente =
  | 'URL_INVALIDA'
  | 'REQUISICAO_INVALIDA'
  | 'REQUEST_ID_CONFLITO'
  | 'SNAPSHOT_NAO_ENCONTRADO'
  | 'REPOSITORIO_INDISPONIVEL'
  | 'REPOSITORIO_PRIVADO'
  | 'VERIFICACAO_INCONCLUSIVA'
  | 'LIMITE_GITHUB'
  | 'GITHUB_INDISPONIVEL'
  | 'PUBLICACAO_RECUSADA'
  | 'FONTE_INDISPONIVEL'
  | 'TEMPO_ESGOTADO'
  | 'CONFIGURACAO_INVALIDA'
  | 'LIMITE_REPOSITORIO'
  | 'ERRO_PERSISTENCIA'
  | 'AGENDAMENTO_INTERROMPIDO'
  | 'ERRO_INTERNO'

export type EstadoAnaliseCliente = 'aguardando' | 'processando' | 'concluido' | 'falha'
export type EtapaAnaliseCliente = 'preparacao' | 'obtencao_arquivos' | 'indexacao' | 'persistencia'

export interface FalhaAnaliseCliente {
  codigo: string
  categoria: 'transitoria' | 'deterministica'
  mensagem: string
  detalhes: Record<string, string | number | boolean | null> | null
  ocorridoEm: string
}

export interface ResumoStatusAnaliseCliente {
  idPublico: string
  repositorio: {
    url: string
    proprietario: string
    nome: string
  }
  commitSha: string
  referencia: string
  estado: EstadoAnaliseCliente
  etapa: EtapaAnaliseCliente | null
  tentativa: number
  tentativaIniciadaEm: string | null
  ultimaAtividadeEm: string | null
  atualizadoEm: string
  finalizadoEm: string | null
  demorada: boolean
  falha: FalhaAnaliseCliente | null
  contagens: {
    arquivos: number
    simbolos: number
    exportacoes: number
    relacoesImportacao: number
    diagnosticos: number
  } | null
}

interface ErroApiResposta {
  erro?: {
    codigo?: string
    mensagem?: string
  }
}

export class ErroApiAnaliseCliente extends Error {
  constructor(
    readonly codigo: CodigoErroApiAnaliseCliente,
    readonly status: number,
    readonly resumo?: ResumoStatusAnaliseCliente,
    readonly mensagem?: string,
  ) {
    super(mensagem ?? codigo)
    this.name = 'ErroApiAnaliseCliente'
  }
}

export async function verificarElegibilidade(url: string) {
  try {
    analisarUrlRepositorio(url)
  } catch (erro) {
    if (erro instanceof ErroAnaliseRepositorio) {
      throw new ErroApiAnaliseCliente(erro.codigo, 400, undefined, erro.message)
    }
    throw new ErroApiAnaliseCliente('URL_INVALIDA', 400)
  }

  const resposta = await requisitar<ResultadoElegibilidadeRepositorio | ErroApiResposta>(
    '/api/analises/elegibilidade',
    {
      method: 'POST',
      body: JSON.stringify({ url: url.trim() }),
    },
  )

  return resposta as ResultadoElegibilidadeRepositorio
}

export async function iniciarAnalise(url: string) {
  const resposta = await requisitar<ResumoStatusAnaliseCliente | (ErroApiResposta & Partial<ResumoStatusAnaliseCliente>)>(
    '/api/analises',
    {
      method: 'POST',
      body: JSON.stringify({ url: url.trim(), requestId: globalThis.crypto.randomUUID() }),
    },
  )

  return resposta as ResumoStatusAnaliseCliente
}

export async function buscarStatusAnalise(snapshotId: string) {
  const resposta = await requisitar<ResumoStatusAnaliseCliente | ErroApiResposta>(
    `/api/analises/${encodeURIComponent(snapshotId)}`,
    { method: 'GET' },
  )

  return resposta as ResumoStatusAnaliseCliente
}

export async function tentarNovamente(snapshotId: string, tentativaEsperada: number) {
  const resposta = await requisitar<ResumoStatusAnaliseCliente | (ErroApiResposta & Partial<ResumoStatusAnaliseCliente>)>(
    `/api/analises/${encodeURIComponent(snapshotId)}/tentativas`,
    {
      method: 'POST',
      body: JSON.stringify({
        requestId: globalThis.crypto.randomUUID(),
        tentativaEsperada,
      }),
    },
  )

  return resposta as ResumoStatusAnaliseCliente
}

async function requisitar<T>(url: string, init: RequestInit): Promise<T> {
  let resposta: Response

  try {
    resposta = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch {
    throw new ErroApiAnaliseCliente('GITHUB_INDISPONIVEL', 503)
  }

  const corpo = await resposta.json().catch(() => null) as T | null
  if (resposta.ok) return corpo as T

  const dados = corpo && typeof corpo === 'object' ? corpo as ErroApiResposta & Partial<ResumoStatusAnaliseCliente> : {}
  const codigo = normalizarCodigo(dados.erro?.codigo, resposta.status)
  const resumo = eResumoStatus(dados) ? dados as ResumoStatusAnaliseCliente : undefined

  throw new ErroApiAnaliseCliente(codigo, resposta.status, resumo, dados.erro?.mensagem)
}

function normalizarCodigo(codigo: string | undefined, status: number): CodigoErroApiAnaliseCliente {
  const codigos: CodigoErroApiAnaliseCliente[] = [
    'URL_INVALIDA',
    'REQUISICAO_INVALIDA',
    'REQUEST_ID_CONFLITO',
    'SNAPSHOT_NAO_ENCONTRADO',
    'REPOSITORIO_INDISPONIVEL',
    'REPOSITORIO_PRIVADO',
    'VERIFICACAO_INCONCLUSIVA',
    'LIMITE_GITHUB',
    'GITHUB_INDISPONIVEL',
    'PUBLICACAO_RECUSADA',
    'FONTE_INDISPONIVEL',
    'TEMPO_ESGOTADO',
    'CONFIGURACAO_INVALIDA',
    'LIMITE_REPOSITORIO',
    'ERRO_PERSISTENCIA',
    'AGENDAMENTO_INTERROMPIDO',
    'ERRO_INTERNO',
  ]

  if (codigo && codigos.includes(codigo as CodigoErroApiAnaliseCliente)) {
    return codigo as CodigoErroApiAnaliseCliente
  }

  if (status === 404) return 'SNAPSHOT_NAO_ENCONTRADO'
  if (status === 503) return 'GITHUB_INDISPONIVEL'
  return 'ERRO_INTERNO'
}

function eResumoStatus(valor: Partial<ResumoStatusAnaliseCliente>): valor is ResumoStatusAnaliseCliente {
  return typeof valor.idPublico === 'string' && typeof valor.estado === 'string'
}
