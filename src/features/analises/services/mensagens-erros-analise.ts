export function obterChaveMensagemErro(codigo: string) {
  switch (codigo) {
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
