export type CodigoErroAnalise =
  | 'URL_INVALIDA'
  | 'REPOSITORIO_INDISPONIVEL'
  | 'REPOSITORIO_PRIVADO'
  | 'SEM_ARQUIVOS_ELEGIVEIS'
  | 'LIMITE_EXCEDIDO'
  | 'GITHUB_INDISPONIVEL'

export class ErroAnaliseRepositorio extends Error {
  readonly codigo: CodigoErroAnalise

  constructor(codigo: CodigoErroAnalise, mensagem: string) {
    super(mensagem)
    this.name = 'ErroAnaliseRepositorio'
    this.codigo = codigo
  }
}

export function analisarUrlRepositorio(url: string) {
  try {
    const valor = url.trim()
    const urlAnalisada = new URL(valor)
    const segmentos = urlAnalisada.pathname.split('/').filter(Boolean)

    if (
      urlAnalisada.protocol !== 'https:' ||
      urlAnalisada.hostname !== 'github.com' ||
      urlAnalisada.username ||
      urlAnalisada.password ||
      urlAnalisada.search ||
      urlAnalisada.hash ||
      segmentos.length !== 2 ||
      urlAnalisada.pathname.endsWith('/') ||
      segmentos[1].toLowerCase().endsWith('.git') ||
      !eNomeGitHubValido(segmentos[0]) ||
      !eNomeRepositorioValido(segmentos[1])
    ) {
      throw new Error('URL inválida')
    }

    return {
      proprietario: segmentos[0],
      nome: segmentos[1],
    }
  } catch {
    throw new ErroAnaliseRepositorio(
      'URL_INVALIDA',
      'Informe uma URL canônica de repositório público do GitHub.',
    )
  }
}

function eNomeGitHubValido(nome: string) {
  return /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(nome)
}

function eNomeRepositorioValido(nome: string) {
  return /^[a-z\d](?:[a-z\d._-]*[a-z\d])?$/i.test(nome)
}
