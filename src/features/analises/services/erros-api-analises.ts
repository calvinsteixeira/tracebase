import { mapearErroFonteGitHub } from './github/github-repositorio-fonte'
import { ErroAnaliseRepositorio } from './validar-url-repositorio'

export type CodigoErroApiAnalise =
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
  | 'ERRO_INTERNO'

export class ErroApiAnalises extends Error {
  constructor(readonly codigo: CodigoErroApiAnalise) {
    super(codigo)
    this.name = 'ErroApiAnalises'
  }
}

export function mapearErroApiAnalises(erro: unknown) {
  if (erro instanceof ErroApiAnalises) return erro.codigo
  if (erro instanceof ErroAnaliseRepositorio) return erro.codigo
  return mapearErroFonteGitHub(erro) ?? 'ERRO_INTERNO'
}

export function obterRespostaErro(codigo: CodigoErroApiAnalise) {
  const mensagens: Record<CodigoErroApiAnalise, string> = {
    URL_INVALIDA: 'Informe uma URL canônica de repositório público do GitHub.',
    REQUISICAO_INVALIDA: 'A requisição não possui os dados esperados.',
    REQUEST_ID_CONFLITO: 'O requestId já foi usado com outra operação ou entrada.',
    SNAPSHOT_NAO_ENCONTRADO: 'A análise solicitada não foi encontrada.',
    REPOSITORIO_INDISPONIVEL: 'Não foi possível encontrar ou acessar esse repositório público.',
    REPOSITORIO_PRIVADO: 'Apenas repositórios públicos são aceitos.',
    VERIFICACAO_INCONCLUSIVA: 'Não foi possível confirmar os dados desse repositório agora.',
    LIMITE_GITHUB: 'O GitHub não permitiu concluir a verificação agora.',
    GITHUB_INDISPONIVEL: 'Não foi possível consultar o GitHub agora. Tente novamente mais tarde.',
    PUBLICACAO_RECUSADA: 'Não foi possível agendar a análise agora. Tente novamente mais tarde.',
    ERRO_INTERNO: 'Não foi possível processar a solicitação agora.',
  }
  return { codigo, mensagem: mensagens[codigo] }
}

export function obterStatusErroApi(codigo: CodigoErroApiAnalise) {
  if (codigo === 'URL_INVALIDA' || codigo === 'REQUISICAO_INVALIDA') return 400
  if (codigo === 'SNAPSHOT_NAO_ENCONTRADO' || codigo === 'REPOSITORIO_INDISPONIVEL' || codigo === 'REPOSITORIO_PRIVADO') return 404
  if (codigo === 'VERIFICACAO_INCONCLUSIVA') return 422
  if (codigo === 'LIMITE_GITHUB') return 429
  if (codigo === 'PUBLICACAO_RECUSADA' || codigo === 'GITHUB_INDISPONIVEL') return 503
  return 500
}
