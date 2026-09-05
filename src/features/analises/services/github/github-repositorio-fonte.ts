import type {
  ArquivoArvoreGitHub,
  FonteRepositorioGitHub,
} from './github-repositorio.types'

const apiGitHub = 'https://api.github.com'

interface RespostaRepositorioGitHub {
  full_name: string
  html_url: string
  private: boolean
  default_branch: string
}

interface RespostaCommitGitHub {
  sha: string
}

interface RespostaArvoreGitHub {
  truncated: boolean
  tree: Array<{
    path: string
    type: string
    size?: number
  }>
}

interface OpcoesFonteRepositorioGitHub {
  buscar?: typeof fetch
  token?: string
}

export function criarFonteRepositorioGitHub(
  opcoes: OpcoesFonteRepositorioGitHub = {},
): FonteRepositorioGitHub {
  const buscar = opcoes.buscar ?? fetch
  const token = opcoes.token ?? process.env.GITHUB_TOKEN

  return {
    async obterResumoRepositorio(proprietario, nome) {
      const repositorio = await requisitar<RespostaRepositorioGitHub>(
        buscar,
        `/repos/${encodeURIComponent(proprietario)}/${encodeURIComponent(nome)}`,
        token,
      )

      if (repositorio.private) {
        throw new ErroFonteGitHub('REPOSITORIO_PRIVADO')
      }

      const commit = await requisitar<RespostaCommitGitHub>(
        buscar,
        `/repos/${encodeURIComponent(proprietario)}/${encodeURIComponent(nome)}/commits/${encodeURIComponent(repositorio.default_branch)}`,
        token,
      )
      const arvore = await requisitar<RespostaArvoreGitHub>(
        buscar,
        `/repos/${encodeURIComponent(proprietario)}/${encodeURIComponent(nome)}/git/trees/${commit.sha}?recursive=1`,
        token,
      )

      if (arvore.truncated) {
        throw new ErroFonteGitHub('LIMITE_EXCEDIDO')
      }

      const arquivos = arvore.tree
        .filter((item) => item.type === 'blob')
        .map<ArquivoArvoreGitHub>((item) => ({
          caminho: item.path,
          ...(item.size === undefined ? {} : { tamanhoBytes: item.size }),
        }))

      return {
        proprietario,
        nome,
        url: repositorio.html_url,
        referencia: repositorio.default_branch,
        commitSha: commit.sha,
        arquivos,
      }
    },
  }
}

type CodigoErroFonte =
  | 'REPOSITORIO_PRIVADO'
  | 'REPOSITORIO_INDISPONIVEL'
  | 'LIMITE_EXCEDIDO'
  | 'GITHUB_INDISPONIVEL'

class ErroFonteGitHub extends Error {
  constructor(readonly codigo: CodigoErroFonte) {
    super(codigo)
  }
}

async function requisitar<T>(
  buscar: typeof fetch,
  caminho: string,
  token?: string,
): Promise<T> {
  try {
    const resposta = await buscar(`${apiGitHub}${caminho}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    if (!resposta.ok) {
      if (resposta.status === 404) {
        throw new ErroFonteGitHub('REPOSITORIO_INDISPONIVEL')
      }

      if (resposta.status === 403 || resposta.status === 429) {
        throw new ErroFonteGitHub('LIMITE_EXCEDIDO')
      }

      throw new ErroFonteGitHub('GITHUB_INDISPONIVEL')
    }

    return (await resposta.json()) as T
  } catch (erro) {
    if (erro instanceof ErroFonteGitHub) {
      throw erro
    }

    throw new ErroFonteGitHub('GITHUB_INDISPONIVEL')
  }
}

export function mapearErroFonteGitHub(erro: unknown) {
  if (!(erro instanceof ErroFonteGitHub)) {
    return 'GITHUB_INDISPONIVEL' as const
  }

  if (erro.codigo === 'REPOSITORIO_PRIVADO') {
    return 'REPOSITORIO_PRIVADO' as const
  }

  if (erro.codigo === 'LIMITE_EXCEDIDO') {
    return 'LIMITE_EXCEDIDO' as const
  }

  return erro.codigo
}
