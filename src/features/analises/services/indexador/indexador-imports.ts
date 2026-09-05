import ts from 'typescript'

import type {
  ArquivoAnalisado,
  ArquivoFonte,
  DestinoImportacao,
  Evidencia,
  IndiceAnalise,
  RelacaoImportacao,
  SnapshotAnalise,
  TipoArquivoFonte,
} from '@/features/analises/analises.types'

const extensoesSuportadas = ['.ts', '.tsx', '.js', '.jsx'] as const

interface SolicitarIndexacaoImports {
  snapshot: SnapshotAnalise
  arquivosFonte: ArquivoFonte[]
}

interface ArquivoIndexado {
  arquivo: ArquivoAnalisado
  conteudo: string
}

export function indexarImports({
  snapshot,
  arquivosFonte,
}: SolicitarIndexacaoImports): IndiceAnalise {
  const arquivos = criarArquivosIndexados(arquivosFonte)
  const arquivosPorCaminho = new Map(
    arquivos.map(({ arquivo }) => [arquivo.caminho, arquivo]),
  )

  return {
    snapshot,
    arquivos: arquivos.map(({ arquivo }) => arquivo),
    simbolos: [],
    relacoesImportacao: arquivos.flatMap(({ arquivo, conteudo }) =>
      extrairImportacoes(arquivo, conteudo, arquivosPorCaminho),
    ),
  }
}

function criarArquivosIndexados(arquivosFonte: ArquivoFonte[]): ArquivoIndexado[] {
  const caminhos = new Set<string>()

  return [...arquivosFonte]
    .sort((primeiro, segundo) => primeiro.caminho.localeCompare(segundo.caminho))
    .map((arquivoFonte) => {
      validarCaminhoArquivo(arquivoFonte.caminho)

      if (caminhos.has(arquivoFonte.caminho)) {
        throw new Error(
          'O snapshot contém o arquivo duplicado "' + arquivoFonte.caminho + '".',
        )
      }

      caminhos.add(arquivoFonte.caminho)

      return {
        arquivo: {
          id: criarIdArquivo(arquivoFonte.caminho),
          caminho: arquivoFonte.caminho,
          tipo: identificarTipoArquivo(arquivoFonte.caminho),
        },
        conteudo: arquivoFonte.conteudo,
      }
    })
}

function extrairImportacoes(
  arquivoOrigem: ArquivoAnalisado,
  conteudo: string,
  arquivosPorCaminho: Map<string, ArquivoAnalisado>,
) {
  const arquivoTypeScript = ts.createSourceFile(
    arquivoOrigem.caminho,
    conteudo,
    ts.ScriptTarget.Latest,
    true,
  )
  const relacoes: RelacaoImportacao[] = []

  arquivoTypeScript.forEachChild((no) => {
    if (!ts.isImportDeclaration(no) || !ts.isStringLiteral(no.moduleSpecifier)) {
      return
    }

    const especificador = no.moduleSpecifier.text
    const evidencia = criarEvidencia(
      arquivoTypeScript,
      no.moduleSpecifier.getStart(arquivoTypeScript),
      no.moduleSpecifier.getEnd(),
      arquivoOrigem.caminho,
    )
    const destino = resolverDestinoImportacao(
      arquivoOrigem.caminho,
      especificador,
      arquivosPorCaminho,
    )

    relacoes.push({
      id: criarIdRelacao(arquivoOrigem.caminho, especificador, evidencia.inicio.linha),
      tipo: 'importa' as const,
      arquivoOrigemId: arquivoOrigem.id,
      destino,
      evidencia,
    })
  })

  return relacoes
}

function resolverDestinoImportacao(
  caminhoOrigem: string,
  especificador: string,
  arquivosPorCaminho: Map<string, ArquivoAnalisado>,
): DestinoImportacao {
  if (!especificador.startsWith('.')) {
    return { tipo: 'externo', especificador }
  }

  const candidatoBase = normalizarCaminho(
    diretorioDe(caminhoOrigem) + '/' + especificador,
  )
  const candidato = encontrarArquivoInterno(candidatoBase, arquivosPorCaminho)

  if (candidato) {
    return { tipo: 'interno', caminhoArquivo: candidato.caminho }
  }

  return { tipo: 'nao-resolvido', especificador }
}

function encontrarArquivoInterno(
  caminhoBase: string,
  arquivosPorCaminho: Map<string, ArquivoAnalisado>,
) {
  const candidatos = [
    caminhoBase,
    ...extensoesSuportadas.map((extensao) => caminhoBase + extensao),
    ...extensoesSuportadas.map((extensao) => caminhoBase + '/index' + extensao),
  ]

  return candidatos
    .map((caminho) => arquivosPorCaminho.get(caminho))
    .find((arquivo): arquivo is ArquivoAnalisado => Boolean(arquivo))
}

function criarEvidencia(
  arquivo: ts.SourceFile,
  inicio: number,
  fim: number,
  caminhoArquivo: string,
): Evidencia {
  return {
    caminhoArquivo,
    inicio: criarPosicao(arquivo, inicio),
    fim: criarPosicao(arquivo, fim),
  }
}

function criarPosicao(arquivo: ts.SourceFile, posicao: number) {
  const { line, character } = arquivo.getLineAndCharacterOfPosition(posicao)

  return {
    linha: line + 1,
    coluna: character + 1,
  }
}

function criarIdArquivo(caminho: string) {
  return 'arquivo:' + caminho
}

function criarIdRelacao(caminhoOrigem: string, especificador: string, linha: number) {
  return 'importa:' + caminhoOrigem + ':' + especificador + ':' + linha
}

function identificarTipoArquivo(caminho: string): TipoArquivoFonte {
  return caminho.endsWith('.ts') || caminho.endsWith('.tsx')
    ? 'typescript'
    : 'javascript'
}

function validarCaminhoArquivo(caminho: string) {
  if (!extensoesSuportadas.some((extensao) => caminho.endsWith(extensao))) {
    throw new Error('O arquivo "' + caminho + '" não é JavaScript ou TypeScript.')
  }
}

function diretorioDe(caminho: string) {
  const indiceUltimaBarra = caminho.lastIndexOf('/')

  return indiceUltimaBarra === -1 ? '.' : caminho.slice(0, indiceUltimaBarra)
}

function normalizarCaminho(caminho: string) {
  const segmentos = caminho.split('/')
  const normalizados: string[] = []

  for (const segmento of segmentos) {
    if (!segmento || segmento === '.') {
      continue
    }

    if (segmento === '..') {
      normalizados.pop()
      continue
    }

    normalizados.push(segmento)
  }

  return normalizados.join('/')
}
