import { criarFonteRepositorioGitHub, mapearErroFonteGitHub } from '@/features/analises/services/github/github-repositorio-fonte'
import {
  criarSnapshotRepositorio,
  ErroAnaliseRepositorio,
  obterLimitesAnaliseRepositorio,
} from '@/features/analises/services/criar-snapshot-repositorio'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    let corpo: unknown

    try {
      corpo = await request.json()
    } catch {
      throw new ErroAnaliseRepositorio(
        'URL_INVALIDA',
        'Informe uma URL canônica de repositório público do GitHub.',
      )
    }

    const url =
      typeof corpo === 'object' && corpo !== null && 'url' in corpo
        ? corpo.url
        : undefined

    if (typeof url !== 'string') {
      throw new ErroAnaliseRepositorio(
        'URL_INVALIDA',
        'Informe uma URL canônica de repositório público do GitHub.',
      )
    }

    const resumo = await criarSnapshotRepositorio(
      url,
      criarFonteRepositorioGitHub(),
      obterLimitesAnaliseRepositorio(),
    )

    return Response.json(resumo)
  } catch (erro) {
    const codigo = obterCodigoErro(erro)

    return Response.json(
      { erro: { codigo, mensagem: obterMensagemErro(codigo) } },
      { status: obterStatusErro(codigo) },
    )
  }
}

function obterCodigoErro(erro: unknown) {
  if (erro instanceof ErroAnaliseRepositorio) {
    return erro.codigo
  }

  return mapearErroFonteGitHub(erro)
}

function obterMensagemErro(codigo: ReturnType<typeof obterCodigoErro>) {
  const mensagens = {
    URL_INVALIDA: 'Informe uma URL canônica de repositório público do GitHub.',
    REPOSITORIO_INDISPONIVEL:
      'Não foi possível encontrar ou acessar esse repositório público.',
    REPOSITORIO_PRIVADO:
      'Não foi possível acessar esse repositório. Apenas repositórios públicos são aceitos.',
    SEM_ARQUIVOS_ELEGIVEIS:
      'Este repositório não parece ser um projeto JavaScript ou TypeScript: não encontramos arquivos .js, .jsx, .ts ou .tsx.',
    LIMITE_EXCEDIDO:
      'O repositório excede os limites atuais para uma análise.',
    GITHUB_INDISPONIVEL:
      'Não foi possível consultar o GitHub agora. Tente novamente mais tarde.',
  } satisfies Record<typeof codigo, string>

  return mensagens[codigo]
}

function obterStatusErro(codigo: ReturnType<typeof obterCodigoErro>) {
  if (codigo === 'URL_INVALIDA') return 400
  if (codigo === 'SEM_ARQUIVOS_ELEGIVEIS') return 422
  if (codigo === 'LIMITE_EXCEDIDO') return 413
  if (codigo === 'REPOSITORIO_INDISPONIVEL' || codigo === 'REPOSITORIO_PRIVADO') {
    return 404
  }

  return 502
}
