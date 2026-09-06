import type { ArquivoDoSnapshot, ConfiguracaoProjeto } from '../../analises.types'
import { ErroFonteRepositorio } from '../fonte-repositorio'
import type {
  ArquivoArvoreGitHub,
  FonteRepositorioGitHubCompleta,
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
    sha: string
    type: string
    size?: number
  }>
}

interface RespostaBlobGitHub {
  sha: string
  content: string
  encoding: string
}

export interface OpcoesFonteRepositorioGitHub {
  buscar?: typeof fetch
  token?: string
  timeoutMs?: number
  concorrenciaMaxima?: number
}

export function criarFonteRepositorioGitHub(
  opcoes: OpcoesFonteRepositorioGitHub = {},
): FonteRepositorioGitHubCompleta {
  const buscar = opcoes.buscar ?? fetch
  const token = opcoes.token ?? process.env.GITHUB_TOKEN
  const timeoutMs = opcoes.timeoutMs ?? 10_000
  const concorrenciaMaxima = Math.min(Math.max(opcoes.concorrenciaMaxima ?? 8, 1), 8)

  return {
    async obterResumoRepositorio(proprietario, nome) {
      const repositorio = await requisitar<RespostaRepositorioGitHub>(
        buscar,
        `/repos/${encodeURIComponent(proprietario)}/${encodeURIComponent(nome)}`,
        token,
        timeoutMs,
      )

      if (repositorio.private) {
        throw new ErroFonteGitHub('REPOSITORIO_PRIVADO')
      }

      const commit = await requisitar<RespostaCommitGitHub>(
        buscar,
        `/repos/${encodeURIComponent(proprietario)}/${encodeURIComponent(nome)}/commits/${encodeURIComponent(repositorio.default_branch)}`,
        token,
        timeoutMs,
      )
      const arvore = await requisitar<RespostaArvoreGitHub>(
        buscar,
        `/repos/${encodeURIComponent(proprietario)}/${encodeURIComponent(nome)}/git/trees/${commit.sha}?recursive=1`,
        token,
        timeoutMs,
      )

      if (arvore.truncated) {
        throw new ErroFonteGitHub('VERIFICACAO_INCONCLUSIVA')
      }

      const arquivos = arvore.tree
        .filter((item) => item.type === 'blob')
        .map<ArquivoArvoreGitHub>((item) => ({
          caminho: item.path,
          sha: item.sha,
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

    async obterArquivos({ repositorio, arquivos }) {
      return obterArquivosGitHub({
        buscar,
        token,
        timeoutMs,
        concorrenciaMaxima,
        repositorio,
        arquivos,
      })
    },

    async obterConfiguracao({ repositorio, arquivos }) {
      const arquivo = [...arquivos]
        .filter(
          (item) => item.caminho === 'tsconfig.json' || item.caminho === 'jsconfig.json',
        )
        .sort((primeiro, segundo) => {
          if (primeiro.caminho === segundo.caminho) return 0
          return primeiro.caminho === 'tsconfig.json' ? -1 : 1
        })[0]

      if (!arquivo) return undefined

      const [resultado] = await obterArquivosGitHub({
        buscar,
        token,
        timeoutMs,
        concorrenciaMaxima: 1,
        repositorio,
        arquivos: [arquivo],
      })

      if (!resultado) return undefined

      return {
        caminho: arquivo.caminho as ConfiguracaoProjeto['caminho'],
        conteudo: resultado.conteudo,
      }
    },
  }
}

type CodigoErroFonte =
  | 'REPOSITORIO_PRIVADO'
  | 'REPOSITORIO_INDISPONIVEL'
  | 'VERIFICACAO_INCONCLUSIVA'
  | 'LIMITE_GITHUB'
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
  timeoutMs = 10_000,
): Promise<T> {
  const controlador = new AbortController()
  const timeout = setTimeout(() => controlador.abort(), timeoutMs)

  try {
    const resposta = await buscar(`${apiGitHub}${caminho}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controlador.signal,
    })

    if (!resposta.ok) {
      if (resposta.status === 404) {
        throw new ErroFonteGitHub('REPOSITORIO_INDISPONIVEL')
      }

      if (resposta.status === 403 || resposta.status === 429) {
        throw new ErroFonteGitHub('LIMITE_GITHUB')
      }

      throw new ErroFonteGitHub('GITHUB_INDISPONIVEL')
    }

    return (await resposta.json()) as T
  } catch (erro) {
    if (erro instanceof ErroFonteGitHub) {
      throw erro
    }

    throw new ErroFonteGitHub('GITHUB_INDISPONIVEL')
  } finally {
    clearTimeout(timeout)
  }
}

interface OpcoesBuscaArquivos {
  buscar: typeof fetch
  token?: string
  timeoutMs: number
  concorrenciaMaxima: number
  repositorio: { proprietario: string; nome: string }
  arquivos: ArquivoDoSnapshot[]
}

async function obterArquivosGitHub({
  buscar,
  token,
  timeoutMs,
  concorrenciaMaxima,
  repositorio,
  arquivos,
}: OpcoesBuscaArquivos): Promise<Array<{ caminho: string; conteudo: string }>> {
  const resultados: Array<{ caminho: string; conteudo: string } | undefined> = Array.from({
    length: arquivos.length,
  })
  const controladores = new Set<AbortController>()
  let proximoIndice = 0
  let falha: unknown

  async function trabalhador() {
    while (falha === undefined) {
      const indice = proximoIndice++
      const arquivo = arquivos[indice]

      if (!arquivo) return

      const controlador = new AbortController()
      controladores.add(controlador)

      try {
        resultados[indice] = await obterArquivoGitHub({
          buscar,
          token,
          timeoutMs,
          repositorio,
          arquivo,
          controlador,
        })
      } catch (erro) {
        if (falha === undefined) {
          falha = erro
          controladores.forEach((item) => item.abort())
        }
        return
      } finally {
        controladores.delete(controlador)
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concorrenciaMaxima, arquivos.length) },
      () => trabalhador(),
    ),
  )

  if (falha !== undefined) throw falha

  return resultados
    .filter((arquivo): arquivo is { caminho: string; conteudo: string } => Boolean(arquivo))
    .sort((primeiro, segundo) => primeiro.caminho.localeCompare(segundo.caminho))
}

async function obterArquivoGitHub({
  buscar,
  token,
  timeoutMs,
  repositorio,
  arquivo,
  controlador,
}: {
  buscar: typeof fetch
  token?: string
  timeoutMs: number
  repositorio: { proprietario: string; nome: string }
  arquivo: ArquivoDoSnapshot
  controlador: AbortController
}): Promise<{ caminho: string; conteudo: string }> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  let tempoEsgotado = false

  try {
    const leitura = (async () => {
      const resposta = await buscar(
        `${apiGitHub}/repos/${encodeURIComponent(repositorio.proprietario)}/${encodeURIComponent(repositorio.nome)}/git/blobs/${encodeURIComponent(arquivo.blobSha)}`,
        {
          headers: criarCabecalhos(token),
          signal: controlador.signal,
        },
      )

      if (resposta.status === 404) {
        throw new ErroFonteRepositorio('BLOB_AUSENTE')
      }

      if (!resposta.ok) {
        throw new ErroFonteRepositorio('FONTE_INDISPONIVEL')
      }

      const corpo: unknown = await resposta.json()

      if (!eRespostaBlobGitHub(corpo)) {
        throw new ErroFonteRepositorio('RESPOSTA_INVALIDA')
      }

      if (corpo.sha !== arquivo.blobSha) {
        throw new ErroFonteRepositorio('SHA_BLOB_INCORRETO')
      }

      if (corpo.encoding !== 'base64') {
        throw new ErroFonteRepositorio('ENCODING_NAO_SUPORTADO')
      }

      return {
        caminho: arquivo.caminho,
        conteudo: decodificarBase64(corpo.content),
      }
    })()

    const limite = new Promise<never>((_, rejeitar) => {
      timeout = setTimeout(() => {
        tempoEsgotado = true
        controlador.abort()
        rejeitar(new ErroFonteRepositorio('TEMPO_ESGOTADO'))
      }, timeoutMs)
    })

    return await Promise.race([leitura, limite])
  } catch (erro) {
    if (erro instanceof ErroFonteRepositorio) throw erro
    if (tempoEsgotado || controlador.signal.aborted) {
      throw new ErroFonteRepositorio('TEMPO_ESGOTADO')
    }

    throw new ErroFonteRepositorio('FONTE_INDISPONIVEL')
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function criarCabecalhos(token?: string) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function eRespostaBlobGitHub(corpo: unknown): corpo is RespostaBlobGitHub {
  return (
    typeof corpo === 'object' &&
    corpo !== null &&
    'sha' in corpo &&
    typeof corpo.sha === 'string' &&
    'content' in corpo &&
    typeof corpo.content === 'string' &&
    'encoding' in corpo &&
    typeof corpo.encoding === 'string'
  )
}

function decodificarBase64(conteudo: string) {
  const normalizado = conteudo.replace(/\s/g, '')
  const semPreenchimento = normalizado.replace(/=+$/, '')

  if (
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizado) ||
    normalizado.length % 4 === 1
  ) {
    throw new ErroFonteRepositorio('BASE64_INVALIDO')
  }

  const bytes = Buffer.from(normalizado, 'base64')
  const canonico = bytes.toString('base64').replace(/=+$/, '')

  if (canonico !== semPreenchimento) {
    throw new ErroFonteRepositorio('BASE64_INVALIDO')
  }

  return bytes.toString('utf8')
}

export function mapearErroFonteGitHub(erro: unknown) {
  if (!(erro instanceof ErroFonteGitHub)) {
    return 'GITHUB_INDISPONIVEL' as const
  }

  if (erro.codigo === 'REPOSITORIO_PRIVADO') {
    return 'REPOSITORIO_PRIVADO' as const
  }

  if (erro.codigo === 'VERIFICACAO_INCONCLUSIVA') {
    return 'VERIFICACAO_INCONCLUSIVA' as const
  }

  if (erro.codigo === 'LIMITE_GITHUB') {
    return 'LIMITE_GITHUB' as const
  }

  return erro.codigo
}
