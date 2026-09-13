export function obterChaveMensagemErro(codigo: string) {
  switch (codigo) {
    case 'URL_INVALIDA':
    case 'REQUISICAO_INVALIDA':
    case 'REQUEST_ID_CONFLITO':
    case 'SNAPSHOT_NAO_ENCONTRADO':
    case 'REPOSITORIO_INDISPONIVEL':
    case 'REPOSITORIO_PRIVADO':
    case 'VERIFICACAO_INCONCLUSIVA':
    case 'LIMITE_GITHUB':
    case 'GITHUB_INDISPONIVEL':
    case 'FONTE_INDISPONIVEL':
    case 'TEMPO_ESGOTADO':
    case 'CONFIGURACAO_INVALIDA':
    case 'LIMITE_REPOSITORIO':
    case 'ERRO_PERSISTENCIA':
    case 'PUBLICACAO_RECUSADA':
    case 'AGENDAMENTO_INTERROMPIDO':
    case 'ERRO_INTERNO':
      return codigo
    default:
      return 'DESCONHECIDA'
  }
}
