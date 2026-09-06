import ts from 'typescript'

import type {
  ArquivoAnalisado,
  ArquivoFonte,
  CategoriaDiagnostico,
  ConfiguracaoProjeto,
  DestinoImportacao,
  DiagnosticoAnalise,
  ExportacaoAnalisada,
  Evidencia,
  IndiceAnalise,
  RelacaoImportacao,
  SnapshotAnalise,
  TipoArquivoFonte,
  TipoExportacao,
} from '@/features/analises/analises.types'

const extensoesSuportadas = ['.ts', '.tsx', '.js', '.jsx'] as const

export interface SolicitarIndexacaoImports {
  snapshot: SnapshotAnalise
  arquivosFonte: ArquivoFonte[]
  configuracao?: ConfiguracaoProjeto
}

interface ArquivoIndexado {
  arquivo: ArquivoAnalisado
  conteudo: string
  sourceFile: ts.SourceFile
}

interface MapeamentoAlias {
  chave: string
  alvos: string[]
}

interface ResolucaoModulos {
  resolver: (especificador: string, caminhoOrigem: string) => DestinoImportacao
  diagnosticos: DiagnosticoAnalise[]
}

export type CodigoErroConfiguracaoIndexacao =
  | 'CONFIGURACAO_INVALIDA'
  | 'CONFIGURACAO_NAO_SUPORTADA'

export class ErroConfiguracaoIndexacao extends Error {
  constructor(readonly codigo: CodigoErroConfiguracaoIndexacao) {
    super(codigo)
    this.name = 'ErroConfiguracaoIndexacao'
  }
}

export function indexarImports({
  snapshot,
  arquivosFonte,
  configuracao,
}: SolicitarIndexacaoImports): IndiceAnalise {
  const arquivos = criarArquivosIndexados(arquivosFonte)
  const arquivosPorCaminho = new Map(
    arquivos.map((arquivo) => [arquivo.arquivo.caminho, arquivo]),
  )
  const resolucao = criarResolucaoModulos(arquivosPorCaminho, configuracao)
  const relacoesImportacao: RelacaoImportacao[] = []
  const exportacoes: ExportacaoAnalisada[] = []
  const diagnosticos = [...resolucao.diagnosticos]

  for (const arquivo of arquivos) {
    diagnosticos.push(...extrairDiagnosticosSintaticos(arquivo))
    relacoesImportacao.push(
      ...extrairImportacoes(arquivo, resolucao.resolver, diagnosticos),
    )
    exportacoes.push(...extrairExportacoes(arquivo, resolucao.resolver))
    diagnosticos.push(...detectarCommonJS(arquivo))
  }

  return {
    snapshot,
    arquivos: arquivos.map(({ arquivo }) => arquivo),
    exportacoes: ordenarExportacoes(exportacoes),
    simbolos: [],
    relacoesImportacao: ordenarRelacoes(relacoesImportacao),
    diagnosticos: ordenarDiagnosticos(diagnosticos),
    parcial: diagnosticos.length > 0,
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
      const sourceFile = ts.createSourceFile(
        arquivoFonte.caminho,
        arquivoFonte.conteudo,
        ts.ScriptTarget.Latest,
        true,
        obterScriptKind(arquivoFonte.caminho),
      )

      return {
        arquivo: {
          id: criarIdArquivo(arquivoFonte.caminho),
          caminho: arquivoFonte.caminho,
          tipo: identificarTipoArquivo(arquivoFonte.caminho),
        },
        conteudo: arquivoFonte.conteudo,
        sourceFile,
      }
    })
}

function criarResolucaoModulos(
  arquivosPorCaminho: Map<string, ArquivoIndexado>,
  configuracao?: ConfiguracaoProjeto,
): ResolucaoModulos {
  const diagnosticos: DiagnosticoAnalise[] = []
  const configuracaoResolucao = lerConfiguracaoResolucao(configuracao)

  return {
    diagnosticos,
    resolver: (especificador, caminhoOrigem) =>
      resolverDestinoImportacao(
        especificador,
        caminhoOrigem,
        arquivosPorCaminho,
        configuracaoResolucao,
      ),
  }
}

function lerConfiguracaoResolucao(
  configuracao: ConfiguracaoProjeto | undefined,
) {
  if (!configuracao) {
    return {
      baseUrl: undefined as string | undefined,
      aliases: [] as MapeamentoAlias[],
      aliasDeclarado: () => false,
    }
  }

  const resultado = ts.parseConfigFileTextToJson(
    configuracao.caminho,
    configuracao.conteudo,
  )

  if (resultado.error || !eObjeto(resultado.config)) {
    throw new ErroConfiguracaoIndexacao('CONFIGURACAO_INVALIDA')
  }

  if (resultado.config.extends !== undefined) {
    throw new ErroConfiguracaoIndexacao('CONFIGURACAO_NAO_SUPORTADA')
  }

  const compilerOptions = resultado.config.compilerOptions
  if (compilerOptions !== undefined && !eObjeto(compilerOptions)) {
    throw new ErroConfiguracaoIndexacao('CONFIGURACAO_INVALIDA')
  }

  if (
    compilerOptions?.baseUrl !== undefined &&
    typeof compilerOptions.baseUrl !== 'string'
  ) {
    throw new ErroConfiguracaoIndexacao('CONFIGURACAO_INVALIDA')
  }

  const baseUrl = compilerOptions?.baseUrl
    ? normalizarCaminho(compilerOptions.baseUrl)
    : undefined
  const aliases = criarMapeamentosAlias(compilerOptions?.paths)

  return {
    baseUrl,
    aliases,
    aliasDeclarado: (especificador: string) =>
      aliases.some((alias) => correspondeAoAlias(alias.chave, especificador)),
  }
}

function criarMapeamentosAlias(
  paths: unknown,
): MapeamentoAlias[] {
  if (paths === undefined) return []

  if (!eObjeto(paths)) {
    throw new ErroConfiguracaoIndexacao('CONFIGURACAO_INVALIDA')
  }

  const aliases: MapeamentoAlias[] = []

  for (const chave of Object.keys(paths).sort()) {
    const valor = paths[chave]
    if (!Array.isArray(valor) || !valor.every((alvo): alvo is string => typeof alvo === 'string')) {
      throw new ErroConfiguracaoIndexacao('CONFIGURACAO_INVALIDA')
    }

    aliases.push({ chave, alvos: valor })
  }

  return aliases
}

function resolverDestinoImportacao(
  especificador: string,
  caminhoOrigem: string,
  arquivosPorCaminho: Map<string, ArquivoIndexado>,
  configuracao: ReturnType<typeof lerConfiguracaoResolucao>,
): DestinoImportacao {
  if (especificador.startsWith('.')) {
    const caminhoBase = normalizarCaminho(
      diretorioDe(caminhoOrigem) + '/' + especificador,
    )
    const candidato = encontrarArquivoInterno(caminhoBase, arquivosPorCaminho)
    return candidato
      ? { tipo: 'interno', caminhoArquivo: candidato.arquivo.caminho }
      : { tipo: 'nao-resolvido', especificador }
  }

  const aliasAlvos = obterAlvosDoAlias(especificador, configuracao.aliases)
  if (aliasAlvos) {
    for (const alvo of aliasAlvos) {
      const caminhoBase = normalizarCaminho(
        (configuracao.baseUrl ? configuracao.baseUrl + '/' : '') + alvo,
      )
      const candidato = encontrarArquivoInterno(caminhoBase, arquivosPorCaminho)
      if (candidato) {
        return { tipo: 'interno', caminhoArquivo: candidato.arquivo.caminho }
      }
    }

    return { tipo: 'nao-resolvido', especificador }
  }

  if (configuracao.aliasDeclarado(especificador)) {
    return { tipo: 'nao-resolvido', especificador }
  }

  if (configuracao.baseUrl) {
    const candidato = encontrarArquivoInterno(
      normalizarCaminho(configuracao.baseUrl + '/' + especificador),
      arquivosPorCaminho,
    )
    if (candidato) {
      return { tipo: 'interno', caminhoArquivo: candidato.arquivo.caminho }
    }
  }

  return { tipo: 'externo', especificador }
}

function extrairImportacoes(
  arquivo: ArquivoIndexado,
  resolver: ResolucaoModulos['resolver'],
  diagnosticos: DiagnosticoAnalise[],
): RelacaoImportacao[] {
  const relacoes: RelacaoImportacao[] = []

  for (const declaracao of arquivo.sourceFile.statements) {
    if (!ts.isImportDeclaration(declaracao)) continue
    if (!ts.isStringLiteral(declaracao.moduleSpecifier)) continue

    const especificador = declaracao.moduleSpecifier.text
    const evidencia = criarEvidenciaDoNo(arquivo.sourceFile, declaracao.moduleSpecifier)
    relacoes.push({
      id: criarIdRelacao(arquivo.arquivo.caminho, especificador, evidencia, 'estatico'),
      tipo: 'importa',
      arquivoOrigemId: arquivo.arquivo.id,
      destino: resolver(especificador, arquivo.arquivo.caminho),
      evidencia,
    })
  }

  function visitar(no: ts.Node) {
    if (ts.isCallExpression(no) && no.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argumento = no.arguments[0]
      const expressao = argumento?.getText(arquivo.sourceFile) ?? ''
      const evidencia = argumento
        ? criarEvidenciaDoNo(arquivo.sourceFile, argumento)
        : criarEvidenciaDoNo(arquivo.sourceFile, no)
      const literal = argumento && ts.isStringLiteralLike(argumento)

      if (literal) {
        const especificador = argumento.text
        relacoes.push({
          id: criarIdRelacao(arquivo.arquivo.caminho, especificador, evidencia, 'dinamico'),
          tipo: 'importa',
          arquivoOrigemId: arquivo.arquivo.id,
          destino: resolver(especificador, arquivo.arquivo.caminho),
          evidencia,
        })
      } else {
        const destino: DestinoImportacao = {
          tipo: 'nao-resolvido',
          especificador: expressao,
          expressao,
        }
        relacoes.push({
          id: criarIdRelacao(arquivo.arquivo.caminho, expressao, evidencia, 'dinamico'),
          tipo: 'importa',
          arquivoOrigemId: arquivo.arquivo.id,
          destino,
          evidencia,
        })
        diagnosticos.push(
          criarDiagnostico(
            'IMPORT_DINAMICO_NAO_RESOLVIDO',
            'limitacao',
            evidencia,
            arquivo.arquivo.id,
          ),
        )
      }
    }

    ts.forEachChild(no, visitar)
  }

  ts.forEachChild(arquivo.sourceFile, visitar)
  return relacoes
}

function extrairExportacoes(
  arquivo: ArquivoIndexado,
  resolver: ResolucaoModulos['resolver'],
): ExportacaoAnalisada[] {
  const exportacoes: ExportacaoAnalisada[] = []

  for (const declaracao of arquivo.sourceFile.statements) {
    if (ts.isExportDeclaration(declaracao)) {
      exportacoes.push(
        ...extrairDeclaracaoDeExportacao(arquivo, declaracao, resolver),
      )
      continue
    }

    if (ts.isExportAssignment(declaracao)) {
      const evidencia = criarEvidenciaDoNo(arquivo.sourceFile, declaracao.expression)
      exportacoes.push(
        criarExportacao({
          arquivo,
          nomeExportado: 'default',
          tipo: 'padrao',
          ...(ts.isIdentifier(declaracao.expression)
            ? { nomeLocal: declaracao.expression.text }
            : {}),
          evidencia,
        }),
      )
      continue
    }

    if (!temModificador(declaracao, ts.SyntaxKind.ExportKeyword)) continue

    const ehPadrao = temModificador(declaracao, ts.SyntaxKind.DefaultKeyword)
    if (ehPadrao && (ts.isFunctionDeclaration(declaracao) || ts.isClassDeclaration(declaracao))) {
      exportacoes.push(
        criarExportacao({
          arquivo,
          nomeExportado: 'default',
          tipo: 'padrao',
          ...(declaracao.name ? { nomeLocal: declaracao.name.text } : {}),
          evidencia: declaracao.name
            ? criarEvidenciaDoNo(arquivo.sourceFile, declaracao.name)
            : criarEvidenciaDoNo(arquivo.sourceFile, declaracao),
        }),
      )
      continue
    }

    if (ehPadrao && ts.isInterfaceDeclaration(declaracao)) {
      if (!declaracao.name) continue
      exportacoes.push(
        criarExportacao({
          arquivo,
          nomeExportado: 'default',
          tipo: 'padrao',
          nomeLocal: declaracao.name.text,
          evidencia: criarEvidenciaDoNo(arquivo.sourceFile, declaracao.name),
        }),
      )
      continue
    }

    if (ts.isVariableStatement(declaracao)) {
      for (const declaracaoVariavel of declaracao.declarationList.declarations) {
        if (!ts.isIdentifier(declaracaoVariavel.name)) continue
        exportacoes.push(
          criarExportacao({
            arquivo,
            nomeExportado: declaracaoVariavel.name.text,
            tipo: 'nomeada',
            evidencia: criarEvidenciaDoNo(arquivo.sourceFile, declaracaoVariavel.name),
          }),
        )
      }
      continue
    }

    if (
      ts.isFunctionDeclaration(declaracao) ||
      ts.isClassDeclaration(declaracao) ||
      ts.isInterfaceDeclaration(declaracao) ||
      ts.isTypeAliasDeclaration(declaracao) ||
      ts.isEnumDeclaration(declaracao)
    ) {
      if (!declaracao.name) continue
      exportacoes.push(
        criarExportacao({
          arquivo,
          nomeExportado: declaracao.name.text,
          tipo: 'nomeada',
          evidencia: criarEvidenciaDoNo(arquivo.sourceFile, declaracao.name),
        }),
      )
    }
  }

  return exportacoes
}

function extrairDeclaracaoDeExportacao(
  arquivo: ArquivoIndexado,
  declaracao: ts.ExportDeclaration,
  resolver: ResolucaoModulos['resolver'],
): ExportacaoAnalisada[] {
  const exportacoes: ExportacaoAnalisada[] = []
  const destino = declaracao.moduleSpecifier && ts.isStringLiteral(declaracao.moduleSpecifier)
    ? resolver(declaracao.moduleSpecifier.text, arquivo.arquivo.caminho)
    : undefined
  const evidenciaDestino = declaracao.moduleSpecifier
    ? criarEvidenciaDoNo(arquivo.sourceFile, declaracao.moduleSpecifier)
    : undefined

  if (!declaracao.exportClause) {
    if (!evidenciaDestino || !destino) return []
    exportacoes.push(
      criarExportacao({
        arquivo,
        nomeExportado: '*',
        tipo: 'reexportacao',
        destino,
        evidencia: evidenciaDestino,
      }),
    )
    return exportacoes
  }

  if (ts.isNamespaceExport(declaracao.exportClause)) {
    if (!evidenciaDestino || !destino) return []
    exportacoes.push(
      criarExportacao({
        arquivo,
        nomeExportado: declaracao.exportClause.name.text,
        tipo: 'reexportacao',
        destino,
        evidencia: evidenciaDestino,
      }),
    )
    return exportacoes
  }

  for (const especificador of declaracao.exportClause.elements) {
    const nomeLocal = especificador.propertyName?.text ?? especificador.name.text
    const nomeExportado = especificador.name.text
    exportacoes.push(
      criarExportacao({
        arquivo,
        nomeExportado,
        tipo: declaracao.moduleSpecifier ? 'reexportacao' : 'nomeada',
        nomeLocal,
        ...(destino ? { destino } : {}),
        evidencia: evidenciaDestino ?? criarEvidenciaDoNo(arquivo.sourceFile, especificador.name),
      }),
    )
  }

  return exportacoes
}

function criarExportacao({
  arquivo,
  nomeExportado,
  tipo,
  nomeLocal,
  destino,
  evidencia,
}: {
  arquivo: ArquivoIndexado
  nomeExportado: string
  tipo: TipoExportacao
  nomeLocal?: string
  destino?: DestinoImportacao
  evidencia: Evidencia
}): ExportacaoAnalisada {
  return {
    id: criarIdExportacao(arquivo.arquivo.caminho, nomeExportado, tipo, evidencia),
    arquivoOrigemId: arquivo.arquivo.id,
    nomeExportado,
    tipo,
    ...(nomeLocal ? { nomeLocal } : {}),
    ...(destino ? { destino } : {}),
    evidencia,
  }
}

function extrairDiagnosticosSintaticos(arquivo: ArquivoIndexado): DiagnosticoAnalise[] {
  return obterDiagnosticosDeParse(arquivo.sourceFile).map((diagnostico) => {
    const inicio = diagnostico.start ?? 0
    const fim = inicio + Math.max(diagnostico.length ?? 1, 1)
    return criarDiagnostico(
      'ERRO_SINTATICO',
      'sintaxe',
      criarEvidenciaDoNo(arquivo.sourceFile, inicio, fim),
      arquivo.arquivo.id,
    )
  })
}

function detectarCommonJS(arquivo: ArquivoIndexado): DiagnosticoAnalise[] {
  const diagnosticos: DiagnosticoAnalise[] = []

  function visitar(no: ts.Node) {
    if (ts.isCallExpression(no) && ts.isIdentifier(no.expression) && no.expression.text === 'require') {
      diagnosticos.push(
        criarDiagnostico(
          'COMMONJS_NAO_SUPORTADO',
          'limitacao',
          criarEvidenciaDoNo(arquivo.sourceFile, no),
          arquivo.arquivo.id,
        ),
      )
    }

    if (eComumJSProperty(no)) {
      diagnosticos.push(
        criarDiagnostico(
          'COMMONJS_NAO_SUPORTADO',
          'limitacao',
          criarEvidenciaDoNo(arquivo.sourceFile, no),
          arquivo.arquivo.id,
        ),
      )
    }

    ts.forEachChild(no, visitar)
  }

  ts.forEachChild(arquivo.sourceFile, visitar)
  return diagnosticos
}

function eComumJSProperty(no: ts.Node): no is ts.PropertyAccessExpression {
  if (!ts.isPropertyAccessExpression(no)) return false

  return (
    (ts.isIdentifier(no.expression) && no.expression.text === 'exports') ||
    (ts.isIdentifier(no.expression) &&
      no.expression.text === 'module' &&
      no.name.text === 'exports')
  )
}

function obterDiagnosticosDeParse(sourceFile: ts.SourceFile): readonly ts.DiagnosticWithLocation[] {
  return (
    sourceFile as ts.SourceFile & {
      parseDiagnostics?: readonly ts.DiagnosticWithLocation[]
    }
  ).parseDiagnostics ?? []
}

function criarDiagnostico(
  codigo: DiagnosticoAnalise['codigo'],
  categoria: CategoriaDiagnostico,
  evidencia: Evidencia,
  arquivoOrigemId?: string,
): DiagnosticoAnalise {
  return {
    id: `diagnostico:${codigo}:${evidencia.caminhoArquivo}:${evidencia.inicio.linha}:${evidencia.inicio.coluna}`,
    codigo,
    categoria,
    ...(arquivoOrigemId ? { arquivoOrigemId } : {}),
    evidencia,
  }
}

function ordenarRelacoes(relacoes: RelacaoImportacao[]) {
  return [...relacoes].sort((primeiro, segundo) => compararFatos(primeiro, segundo))
}

function ordenarExportacoes(exportacoes: ExportacaoAnalisada[]) {
  return [...exportacoes].sort((primeiro, segundo) => compararFatos(primeiro, segundo))
}

function ordenarDiagnosticos(diagnosticos: DiagnosticoAnalise[]) {
  return [...diagnosticos].sort((primeiro, segundo) => compararFatos(primeiro, segundo))
}

function compararFatos(
  primeiro: { evidencia: Evidencia; id: string },
  segundo: { evidencia: Evidencia; id: string },
) {
  return (
    primeiro.evidencia.caminhoArquivo.localeCompare(segundo.evidencia.caminhoArquivo) ||
    primeiro.evidencia.inicio.linha - segundo.evidencia.inicio.linha ||
    primeiro.evidencia.inicio.coluna - segundo.evidencia.inicio.coluna ||
    primeiro.id.localeCompare(segundo.id)
  )
}

function criarIdArquivo(caminho: string) {
  return 'arquivo:' + caminho
}

function criarIdRelacao(
  caminho: string,
  especificador: string,
  evidencia: Evidencia,
  tipo: 'estatico' | 'dinamico',
) {
  return `importa:${caminho}:${especificador}:${tipo}:${evidencia.inicio.linha}:${evidencia.inicio.coluna}`
}

function criarIdExportacao(
  caminho: string,
  nome: string,
  tipo: TipoExportacao,
  evidencia: Evidencia,
) {
  return `exporta:${caminho}:${tipo}:${nome}:${evidencia.inicio.linha}:${evidencia.inicio.coluna}`
}

function identificarTipoArquivo(caminho: string): TipoArquivoFonte {
  const caminhoNormalizado = caminho.toLowerCase()
  return caminhoNormalizado.endsWith('.ts') || caminhoNormalizado.endsWith('.tsx')
    ? 'typescript'
    : 'javascript'
}

function validarCaminhoArquivo(caminho: string) {
  const caminhoNormalizado = caminho.toLowerCase()
  if (!extensoesSuportadas.some((extensao) => caminhoNormalizado.endsWith(extensao))) {
    throw new Error('O arquivo "' + caminho + '" não é JavaScript ou TypeScript.')
  }
}

function obterScriptKind(caminho: string) {
  const caminhoNormalizado = caminho.toLowerCase()
  if (caminhoNormalizado.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (caminhoNormalizado.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (caminhoNormalizado.endsWith('.js')) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function temModificador(node: ts.Node, kind: ts.SyntaxKind) {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modificador) => modificador.kind === kind)
  )
}

function diretorioDe(caminho: string) {
  const indiceUltimaBarra = caminho.lastIndexOf('/')
  return indiceUltimaBarra === -1 ? '.' : caminho.slice(0, indiceUltimaBarra)
}

function normalizarCaminho(caminho: string) {
  const segmentos = caminho.replaceAll('\\', '/').split('/')
  const normalizados: string[] = []

  for (const segmento of segmentos) {
    if (!segmento || segmento === '.') continue
    if (segmento === '..') {
      normalizados.pop()
      continue
    }
    normalizados.push(segmento)
  }

  return normalizados.join('/')
}

function encontrarArquivoInterno(
  caminhoBase: string,
  arquivosPorCaminho: Map<string, ArquivoIndexado>,
) {
  const candidatos = temExtensaoSuportada(caminhoBase)
    ? [caminhoBase]
    : [
        ...extensoesSuportadas.map((extensao) => caminhoBase + extensao),
        ...extensoesSuportadas.map((extensao) => caminhoBase + '/index' + extensao),
      ]

  for (const candidato of candidatos) {
    const arquivo = arquivosPorCaminho.get(candidato)
    if (arquivo) return arquivo

    const porExtensao = [...arquivosPorCaminho.values()].find(({ arquivo: item }) =>
      mesmoCaminhoComExtensaoDiferente(item.caminho, candidato),
    )
    if (porExtensao) return porExtensao
  }

  return undefined
}

function mesmoCaminhoComExtensaoDiferente(primeiro: string, segundo: string) {
  const primeiroPonto = primeiro.lastIndexOf('.')
  const segundoPonto = segundo.lastIndexOf('.')
  if (primeiroPonto === -1 || segundoPonto === -1) return false

  return (
    primeiro.slice(0, primeiroPonto) === segundo.slice(0, segundoPonto) &&
    primeiro.slice(primeiroPonto).toLowerCase() === segundo.slice(segundoPonto).toLowerCase()
  )
}

function temExtensaoSuportada(caminho: string) {
  const caminhoNormalizado = caminho.toLowerCase()
  return extensoesSuportadas.some((extensao) => caminhoNormalizado.endsWith(extensao))
}

function correspondeAoAlias(chave: string, especificador: string) {
  if (!chave.includes('*')) return chave === especificador
  const indiceAsterisco = chave.indexOf('*')
  const prefixo = chave.slice(0, indiceAsterisco)
  const sufixo = chave.slice(indiceAsterisco + 1)
  return especificador.startsWith(prefixo) && especificador.endsWith(sufixo)
}

function obterAlvosDoAlias(especificador: string, aliases: MapeamentoAlias[]) {
  const alias = [...aliases]
    .sort((primeiro, segundo) => segundo.chave.length - primeiro.chave.length)
    .find((item) => correspondeAoAlias(item.chave, especificador))
  if (!alias) return undefined

  const indiceAsterisco = alias.chave.indexOf('*')
  const substituicao = indiceAsterisco === -1
    ? ''
    : especificador.slice(indiceAsterisco, especificador.length - alias.chave.slice(indiceAsterisco + 1).length)
  return alias.alvos.map((alvo) => alvo.replace('*', substituicao))
}

function criarEvidenciaDoNo(
  sourceFile: ts.SourceFile,
  no: ts.Node,
): Evidencia
function criarEvidenciaDoNo(
  sourceFile: ts.SourceFile,
  inicio: number,
  fim: number,
): Evidencia
function criarEvidenciaDoNo(
  sourceFile: ts.SourceFile,
  noOuInicio: ts.Node | number,
  fim?: number,
): Evidencia {
  const inicio = typeof noOuInicio === 'number' ? noOuInicio : noOuInicio.getStart(sourceFile)
  const fimReal = typeof noOuInicio === 'number' ? fim ?? inicio + 1 : noOuInicio.getEnd()
  const inicioSeguro = Math.max(0, Math.min(inicio, sourceFile.text.length))
  const fimSeguro = Math.max(inicioSeguro, Math.min(fimReal, sourceFile.text.length))
  const posicaoInicio = sourceFile.getLineAndCharacterOfPosition(inicioSeguro)
  const posicaoFim = sourceFile.getLineAndCharacterOfPosition(fimSeguro)

  return {
    caminhoArquivo: sourceFile.fileName,
    inicio: {
      linha: posicaoInicio.line + 1,
      coluna: posicaoInicio.character + 1,
    },
    fim: {
      linha: posicaoFim.line + 1,
      coluna: posicaoFim.character + 1,
    },
  }
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}
