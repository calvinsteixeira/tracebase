import {
  analisarUrlRepositorio,
  verificarElegibilidadeRepositorio,
  obterLimitesElegibilidadeRepositorio,
} from './criar-snapshot-repositorio'
import { criarFonteRepositorioGitHub } from './github/github-repositorio-fonte'
import type { FonteRepositorioGitHub } from './github/github-repositorio.types'
import type { ResumoStatusAnalise, SolicitacaoAnalise } from './persistencia/ciclo-vida-analise'
import type { RepositorioApiAnalises } from './persistencia/repositorio-api-analises'
import type { FilaDeAnalises } from './fila-analises'
import {
  ErroApiAnalises,
  mapearErroApiAnalises,
  obterRespostaErro,
  obterStatusErroApi,
  type CodigoErroApiAnalise,
} from './erros-api-analises'

export const LIMITE_AGUARDANDO_SEM_ATIVIDADE_MS = 60_000
export const LIMITE_ANALISE_DEMORADA_MS = 30_000

type ResultadoPublicacao =
  | { tipo: 'publicada'; resumo: ResumoStatusAnalise }
  | { tipo: 'falhou'; resumo: ResumoStatusAnalise }
  | { tipo: 'estado_avancou'; resumo: ResumoStatusAnalise }

export function obterLimiteAguardandoSemAtividadeMs() {
  const valor = Number(process.env.TRACEBASE_SCHEDULE_TIMEOUT_MS)
  return Number.isInteger(valor) && valor > 0 ? valor : LIMITE_AGUARDANDO_SEM_ATIVIDADE_MS
}

export function obterLimiteAnaliseDemoradaMs() {
  const valor = Number(process.env.TRACEBASE_SLOW_ANALYSIS_MS)
  return Number.isInteger(valor) && valor > 0 ? valor : LIMITE_ANALISE_DEMORADA_MS
}

export interface DependenciasApiAnalises {
  repositorio: RepositorioApiAnalises
  fila: FilaDeAnalises
  fonte?: FonteRepositorioGitHub
  limiteAguardandoMs?: number
  limiteDemoradaMs?: number
  agora?: () => string
}

export function criarApiAnalises(dependencias: DependenciasApiAnalises) {
  const fonte = dependencias.fonte ?? criarFonteRepositorioGitHub()
  const agora = dependencias.agora ?? (() => new Date().toISOString())
  const limiteAguardandoMs = dependencias.limiteAguardandoMs ?? obterLimiteAguardandoSemAtividadeMs()
  const limiteDemoradaMs = dependencias.limiteDemoradaMs ?? obterLimiteAnaliseDemoradaMs()

  return {
    async elegibilidade(request: Request) {
      try {
        const corpo = await lerObjeto(request)
        if (typeof corpo.url !== 'string') throw new ErroApiAnalises('REQUISICAO_INVALIDA')
        return Response.json(await verificarElegibilidadeRepositorio(corpo.url, fonte, obterLimitesElegibilidadeRepositorio()))
      } catch (erro) {
        return respostaErro(erro)
      }
    },

    async criar(request: Request) {
      try {
        const corpo = await lerObjeto(request)
        const requestId = exigirUuid(corpo.requestId)
        const url = corpo.url
        if (typeof url !== 'string') throw new ErroApiAnalises('REQUISICAO_INVALIDA')
        const referencia = analisarUrlRepositorio(url)
        const urlNormalizada = `https://github.com/${referencia.proprietario}/${referencia.nome}`
        const solicitacaoExistente = await dependencias.repositorio.buscarSolicitacao(requestId)
        if (solicitacaoExistente) {
          if (!eSolicitacaoCriacaoCompativel(solicitacaoExistente, urlNormalizada)) return respostaErroCodigo('REQUEST_ID_CONFLITO', 409)
          return respostaCriacao(await obterResumoObrigatorio(solicitacaoExistente.snapshotId))
        }

        const elegibilidade = await verificarElegibilidadeRepositorio(url, fonte, obterLimitesElegibilidadeRepositorio())
        if (elegibilidade.status !== 'elegivel') return Response.json(elegibilidade, { status: 422 })
        const resultado = await dependencias.repositorio.criarOuReutilizarComSolicitacao({
          repositorio: elegibilidade.repositorio,
          commitSha: elegibilidade.snapshot.commitSha,
          referencia: elegibilidade.snapshot.referencia,
          agora: agora(),
          requestId,
          urlNormalizada,
        })
        if (resultado.resultado === 'conflito') return respostaErroCodigo('REQUEST_ID_CONFLITO', 409)
        if (resultado.publicar) {
          const publicacao = await publicar(resultado.snapshot.idPublico, resultado.snapshot.tentativa)
          if (publicacao.tipo === 'falhou') return respostaFalhaPublicacao(publicacao.resumo)
          return respostaCriacao(publicacao.resumo)
        }
        return respostaCriacao(await obterResumoObrigatorio(resultado.snapshot.idPublico))
      } catch (erro) {
        return respostaErro(erro)
      }
    },

    async status(snapshotId: string) {
      try {
        exigirUuid(snapshotId)
        return respostaConsulta(await obterResumoObrigatorio(snapshotId))
      } catch (erro) {
        return respostaErro(erro)
      }
    },

    async retry(snapshotId: string, request: Request) {
      try {
        exigirUuid(snapshotId)
        const corpo = await lerObjeto(request)
        const requestId = exigirUuid(corpo.requestId)
        const tentativaEsperada = corpo.tentativaEsperada
        if (typeof tentativaEsperada !== 'number' || !Number.isInteger(tentativaEsperada) || tentativaEsperada < 1) return respostaErroCodigo('REQUISICAO_INVALIDA', 400)
        const solicitacaoExistente = await dependencias.repositorio.buscarSolicitacao(requestId)
        if (solicitacaoExistente) {
          if (!eSolicitacaoRetryCompativel(solicitacaoExistente, snapshotId, tentativaEsperada)) return respostaErroCodigo('REQUEST_ID_CONFLITO', 409)
          return respostaCriacao(await obterResumoObrigatorio(snapshotId))
        }
        const resultado = await dependencias.repositorio.iniciarNovaTentativaComSolicitacao({ requestId, idPublico: snapshotId, tentativaEsperada, agora: agora() })
        if (resultado.resultado === 'conflito') return respostaErroCodigo('REQUEST_ID_CONFLITO', 409)
        if (resultado.resultado === 'tentativa_desatualizada') return respostaCriacao(await obterResumoObrigatorio(snapshotId))
        if (resultado.publicar && resultado.snapshot) {
          const publicacao = await publicar(snapshotId, resultado.snapshot.tentativa)
          if (publicacao.tipo === 'falhou') return respostaFalhaPublicacao(publicacao.resumo)
          return respostaCriacao(publicacao.resumo)
        }
        return respostaCriacao(await obterResumoObrigatorio(snapshotId))
      } catch (erro) {
        return respostaErro(erro)
      }
    },
  }

  async function publicar(snapshotId: string, tentativa: number): Promise<ResultadoPublicacao> {
    try {
      await dependencias.fila.publicar({
        mensagem: { snapshotId, tentativa },
        chaveIdempotencia: `analise:${snapshotId}:${tentativa}`,
      })
    } catch {
      const falha = await dependencias.repositorio.registrarFalhaAgendamento({
        idPublico: snapshotId,
        tentativa,
        agora: agora(),
        falha: {
          codigo: 'PUBLICACAO_RECUSADA',
          categoria: 'transitoria',
          mensagem: 'Não foi possível iniciar o processamento desta análise.',
        },
      })
      if (falha) return { tipo: 'falhou', resumo: await obterResumoObrigatorio(snapshotId) }
      const resumo = await obterResumoObrigatorio(snapshotId)
      return { tipo: resumo.estado === 'concluido' ? 'estado_avancou' : 'publicada', resumo }
    }
    return { tipo: 'publicada', resumo: await obterResumoObrigatorio(snapshotId) }
  }

  async function obterResumoObrigatorio(snapshotId: string) {
    const resumo = await dependencias.repositorio.obterResumoStatus({
      idPublico: snapshotId,
      agora: agora(),
      limiteAguardandoMs,
      limiteDemoradaMs,
    })
    if (!resumo) throw new ErroApiAnalises('SNAPSHOT_NAO_ENCONTRADO')
    return resumo
  }
}

function lerObjeto(request: Request): Promise<Record<string, unknown>> {
  return request.json().then((corpo: unknown) => {
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroApiAnalises('REQUISICAO_INVALIDA')
    return corpo as Record<string, unknown>
  }).catch((erro) => {
    if (erro instanceof ErroApiAnalises) throw erro
    throw new ErroApiAnalises('REQUISICAO_INVALIDA')
  })
}

function exigirUuid(valor: unknown) {
  if (typeof valor !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)) return respostaInvalida()
  return valor
}

function respostaInvalida(): never {
  throw new ErroApiAnalises('REQUISICAO_INVALIDA')
}

function eSolicitacaoCriacaoCompativel(s: SolicitacaoAnalise, url: string) {
  return s.operacao === 'criacao' && s.urlNormalizada === url
}

function eSolicitacaoRetryCompativel(s: SolicitacaoAnalise, snapshotId: string, tentativa: number) {
  return s.operacao === 'retry' && s.snapshotId === snapshotId && s.tentativaEsperada === tentativa
}

function respostaConsulta(resumo: ResumoStatusAnalise) {
  return Response.json(resumo, { status: 200 })
}

function respostaCriacao(resumo: ResumoStatusAnalise) {
  if (resumo.estado === 'falha' && resumo.falha?.codigo === 'PUBLICACAO_RECUSADA') {
    return respostaFalhaPublicacao(resumo)
  }
  return Response.json(resumo, {
    status: resumo.estado === 'concluido' ? 200 : resumo.estado === 'falha' ? 409 : 202,
  })
}

function respostaFalhaPublicacao(resumo: ResumoStatusAnalise) {
  return Response.json({ ...resumo, erro: obterRespostaErro('PUBLICACAO_RECUSADA') }, {
    status: obterStatusErroApi('PUBLICACAO_RECUSADA'),
  })
}

function respostaErro(erro: unknown) {
  const codigo = mapearErroApiAnalises(erro)
  return respostaErroCodigo(codigo, obterStatusErroApi(codigo))
}

function respostaErroCodigo(codigo: CodigoErroApiAnalise, status = obterStatusErroApi(codigo)) {
  return Response.json({ erro: obterRespostaErro(codigo) }, { status })
}
