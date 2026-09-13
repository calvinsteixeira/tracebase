import type {
  ArquivoDoSnapshot,
  DestinoImportacao,
  DiagnosticoAnalise,
  ExportacaoAnalisada,
  Evidencia,
  IndiceAnalise,
  RelacaoImportacao,
  SimboloAnalisado,
} from '../../analises.types'

export interface IdentidadeSnapshotEsperada {
  idPublico: string
  repositorio: {
    url: string
    proprietario: string
    nome: string
  }
  commitSha: string
  referencia: string
}

export interface EntradaPersistenciaIndice {
  snapshotIdPublico: string
  tentativa: number
  leaseId: string
  agora: string
  prazoExpiraEm: string
  indice: IndiceAnalise
  arquivos: ArquivoDoSnapshot[]
}

export interface IndicePersistido {
  indice: IndiceAnalise
  arquivos: ArquivoDoSnapshot[]
}

export type ResultadoPersistenciaIndice =
  | { tipo: 'persistido'; indice: IndicePersistido }
  | { tipo: 'ja_concluido'; indice: IndicePersistido }
  | { tipo: 'inexistente' }
  | { tipo: 'tentativa_desatualizada' }
  | { tipo: 'lease_invalido' }
  | { tipo: 'prazo_expirado' }
  | { tipo: 'estado_incompativel' }

export interface RepositorioPersistenciaIndice {
  salvarEConcluir(input: EntradaPersistenciaIndice): Promise<ResultadoPersistenciaIndice>
  buscarPorSnapshotConcluido(idPublico: string): Promise<IndicePersistido | null>
  buscarPorRepositorioECommit(input: {
    url: string
    commitSha: string
  }): Promise<IndicePersistido | null>
}

export type CodigoErroValidacaoIndice =
  | 'SNAPSHOT_INCOMPATIVEL'
  | 'ARQUIVO_SEM_BLOB_SHA'
  | 'ARQUIVO_DUPLICADO'
  | 'ARQUIVO_NAO_CORRESPONDENTE'
  | 'FATO_DUPLICADO'
  | 'REFERENCIA_ARQUIVO_INVALIDA'
  | 'DESTINO_INVALIDO'
  | 'EVIDENCIA_INVALIDA'

export class ErroValidacaoIndice extends Error {
  constructor(readonly codigo: CodigoErroValidacaoIndice) {
    super(codigo)
    this.name = 'ErroValidacaoIndice'
  }
}

export function validarEntradaPersistenciaIndice(input: EntradaPersistenciaIndice) {
  if (input.indice.snapshot.idPublico !== input.snapshotIdPublico) {
    throw new ErroValidacaoIndice('SNAPSHOT_INCOMPATIVEL')
  }

  const arquivosPorCaminho = new Map<string, ArquivoDoSnapshot>()
  const caminhos = new Set<string>()

  for (const arquivo of input.arquivos) {
    if (!arquivo.caminho || !arquivo.blobSha || !eSha(arquivo.blobSha)) {
      throw new ErroValidacaoIndice('ARQUIVO_SEM_BLOB_SHA')
    }
    if (caminhos.has(arquivo.caminho)) {
      throw new ErroValidacaoIndice('ARQUIVO_DUPLICADO')
    }

    caminhos.add(arquivo.caminho)
    arquivosPorCaminho.set(arquivo.caminho, arquivo)
  }

  const arquivosIndexadosPorCaminho = new Map<string, string>()
  const idsArquivos = new Set<string>()
  for (const arquivo of input.indice.arquivos) {
    if (
      !arquivo.id ||
      !arquivo.caminho ||
      !arquivo.tipo ||
      idsArquivos.has(arquivo.id) ||
      arquivosIndexadosPorCaminho.has(arquivo.caminho)
    ) {
      throw new ErroValidacaoIndice('FATO_DUPLICADO')
    }
    if (!arquivosPorCaminho.has(arquivo.caminho)) {
      throw new ErroValidacaoIndice('ARQUIVO_NAO_CORRESPONDENTE')
    }

    idsArquivos.add(arquivo.id)
    arquivosIndexadosPorCaminho.set(arquivo.caminho, arquivo.id)
  }

  if (arquivosIndexadosPorCaminho.size !== arquivosPorCaminho.size) {
    throw new ErroValidacaoIndice('ARQUIVO_NAO_CORRESPONDENTE')
  }

  validarFatos(input.indice, idsArquivos, arquivosIndexadosPorCaminho)
}

export function validarIdentidadeSnapshotIndice(
  indice: IndiceAnalise,
  esperada: IdentidadeSnapshotEsperada,
) {
  if (
    indice.snapshot.idPublico !== esperada.idPublico ||
    indice.snapshot.repositorio.url !== esperada.repositorio.url ||
    indice.snapshot.repositorio.proprietario !== esperada.repositorio.proprietario ||
    indice.snapshot.repositorio.nome !== esperada.repositorio.nome ||
    indice.snapshot.commitSha !== esperada.commitSha ||
    indice.snapshot.referencia !== esperada.referencia
  ) {
    throw new ErroValidacaoIndice('SNAPSHOT_INCOMPATIVEL')
  }
}

function validarFatos(
  indice: IndiceAnalise,
  idsArquivos: Set<string>,
  arquivosPorCaminho: Map<string, string>,
) {
  validarSimbolos(indice.simbolos, idsArquivos, arquivosPorCaminho)
  validarExportacoes(indice.exportacoes, idsArquivos, arquivosPorCaminho)
  validarRelacoes(indice.relacoesImportacao, idsArquivos, arquivosPorCaminho)
  validarDiagnosticos(indice.diagnosticos, idsArquivos, arquivosPorCaminho)
}

function validarSimbolos(
  simbolos: SimboloAnalisado[],
  idsArquivos: Set<string>,
  arquivosPorCaminho: Map<string, string>,
) {
  const ids = new Set<string>()
  for (const simbolo of simbolos) {
    validarIdFato(simbolo.id, ids)
    validarArquivo(simbolo.arquivoId, idsArquivos)
    validarEvidencia(simbolo.evidencia, arquivosPorCaminho)
  }
}

function validarExportacoes(
  exportacoes: ExportacaoAnalisada[],
  idsArquivos: Set<string>,
  arquivosPorCaminho: Map<string, string>,
) {
  const ids = new Set<string>()
  for (const exportacao of exportacoes) {
    validarIdFato(exportacao.id, ids)
    validarArquivo(exportacao.arquivoOrigemId, idsArquivos)
    validarDestino(exportacao.destino, arquivosPorCaminho)
    validarEvidencia(exportacao.evidencia, arquivosPorCaminho)
  }
}

function validarRelacoes(
  relacoes: RelacaoImportacao[],
  idsArquivos: Set<string>,
  arquivosPorCaminho: Map<string, string>,
) {
  const ids = new Set<string>()
  for (const relacao of relacoes) {
    validarIdFato(relacao.id, ids)
    validarArquivo(relacao.arquivoOrigemId, idsArquivos)
    validarDestino(relacao.destino, arquivosPorCaminho)
    validarEvidencia(relacao.evidencia, arquivosPorCaminho)
  }
}

function validarDiagnosticos(
  diagnosticos: DiagnosticoAnalise[],
  idsArquivos: Set<string>,
  arquivosPorCaminho: Map<string, string>,
) {
  const ids = new Set<string>()
  for (const diagnostico of diagnosticos) {
    validarIdFato(diagnostico.id, ids)
    if (diagnostico.arquivoOrigemId) {
      validarArquivo(diagnostico.arquivoOrigemId, idsArquivos)
    }
    validarEvidencia(diagnostico.evidencia, arquivosPorCaminho)
  }
}

function validarIdFato(id: string, ids: Set<string>) {
  if (!id || ids.has(id)) throw new ErroValidacaoIndice('FATO_DUPLICADO')
  ids.add(id)
}

function validarArquivo(id: string, idsArquivos: Set<string>) {
  if (!idsArquivos.has(id)) throw new ErroValidacaoIndice('REFERENCIA_ARQUIVO_INVALIDA')
}

function validarEvidencia(evidencia: Evidencia, arquivosPorCaminho: Map<string, string>) {
  if (
    !arquivosPorCaminho.has(evidencia.caminhoArquivo) ||
    !intervaloValido(evidencia)
  ) {
    throw new ErroValidacaoIndice('EVIDENCIA_INVALIDA')
  }
}

function validarDestino(
  destino: DestinoImportacao | undefined,
  arquivosPorCaminho: Map<string, string>,
) {
  if (!destino) return
  if (destino.tipo === 'interno') {
    if (!destino.caminhoArquivo || !arquivosPorCaminho.has(destino.caminhoArquivo)) {
      throw new ErroValidacaoIndice('REFERENCIA_ARQUIVO_INVALIDA')
    }
    return
  }
  if (!destino.especificador || (destino.tipo === 'nao-resolvido' && destino.expressao === '')) {
    throw new ErroValidacaoIndice('DESTINO_INVALIDO')
  }
}

function posicaoValida(posicao: { linha: number; coluna: number }) {
  return Number.isInteger(posicao.linha) && posicao.linha > 0 &&
    Number.isInteger(posicao.coluna) && posicao.coluna > 0
}

function intervaloValido(evidencia: Evidencia) {
  if (!posicaoValida(evidencia.inicio) || !posicaoValida(evidencia.fim)) return false

  return evidencia.fim.linha > evidencia.inicio.linha ||
    (evidencia.fim.linha === evidencia.inicio.linha &&
      evidencia.fim.coluna >= evidencia.inicio.coluna)
}

function eSha(valor: string) {
  return /^[0-9a-f]{40}$/i.test(valor)
}
