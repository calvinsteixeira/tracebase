import {
  ErroAnaliseRepositorio,
  analisarUrlRepositorio,
  verificarElegibilidadeRepositorio,
  obterLimitesElegibilidadeRepositorio,
} from './criar-snapshot-repositorio'
import { mapearErroFonteGitHub, criarFonteRepositorioGitHub } from './github/github-repositorio-fonte'
import type { FonteRepositorioGitHub } from './github/github-repositorio.types'
import type {
  RepositorioCicloVidaAnalise,
  ResumoStatusAnalise,
  SolicitacaoAnalise,
} from './persistencia/ciclo-vida-analise'
import type { FilaDeAnalises } from './fila-analises'

export const LIMITE_AGUARDANDO_SEM_ATIVIDADE_MS = 60_000

export function obterLimiteAguardandoSemAtividadeMs() {
  const valor = Number(process.env.TRACEBASE_SCHEDULE_TIMEOUT_MS)
  return Number.isInteger(valor) && valor > 0 ? valor : LIMITE_AGUARDANDO_SEM_ATIVIDADE_MS
}

interface DependenciasApiAnalises {
  cicloVida: RepositorioCicloVidaAnalise
  fila: FilaDeAnalises
  fonte?: FonteRepositorioGitHub
  limiteAguardandoMs?: number
  agora?: () => string
}

export function criarApiAnalises(dependencias: DependenciasApiAnalises) {
  const fonte = dependencias.fonte ?? criarFonteRepositorioGitHub()
  const agora = dependencias.agora ?? (() => new Date().toISOString())
  const limiteAguardandoMs = dependencias.limiteAguardandoMs ?? obterLimiteAguardandoSemAtividadeMs()

  return {
    async elegibilidade(request: Request) {
      try {
        const corpo = await lerObjeto(request)
        if (typeof corpo.url !== 'string') throw new ErroAnaliseRepositorio('URL_INVALIDA', '')
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
        if (typeof url !== 'string') throw new ErroAnaliseRepositorio('URL_INVALIDA', '')
        const referencia = analisarUrlRepositorio(url)
        const urlNormalizada = `https://github.com/${referencia.proprietario}/${referencia.nome}`
        const solicitacaoExistente = await dependencias.cicloVida.buscarSolicitacao?.(requestId)
        if (solicitacaoExistente) {
          if (!eSolicitacaoCriacaoCompativel(solicitacaoExistente, urlNormalizada)) return respostaErroCodigo('REQUEST_ID_CONFLITO', 409)
          return respostaSnapshot(await obterResumoObrigatorio(solicitacaoExistente.snapshotId))
        }

        const elegibilidade = await verificarElegibilidadeRepositorio(url, fonte, obterLimitesElegibilidadeRepositorio())
        if (elegibilidade.status !== 'elegivel') return Response.json(elegibilidade, { status: 422 })
        if (!dependencias.cicloVida.criarOuReutilizarComSolicitacao) throw new Error('A composição da API não possui idempotência configurada.')
        const resultado = await dependencias.cicloVida.criarOuReutilizarComSolicitacao({
          repositorio: elegibilidade.repositorio,
          commitSha: elegibilidade.snapshot.commitSha,
          referencia: elegibilidade.snapshot.referencia,
          agora: agora(),
          requestId,
          urlNormalizada,
        })
        if (resultado.resultado === 'conflito') return respostaErroCodigo('REQUEST_ID_CONFLITO', 409)
        if (resultado.publicar) await publicar(resultado.snapshot.idPublico, resultado.snapshot.tentativa)
        return respostaSnapshot(await obterResumoObrigatorio(resultado.snapshot.idPublico))
      } catch (erro) {
        return respostaErro(erro)
      }
    },

    async status(snapshotId: string) {
      try {
        exigirUuid(snapshotId)
        return respostaSnapshot(await obterResumoObrigatorio(snapshotId))
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
        const solicitacaoExistente = await dependencias.cicloVida.buscarSolicitacao?.(requestId)
        if (solicitacaoExistente) {
          if (!eSolicitacaoRetryCompativel(solicitacaoExistente, snapshotId, tentativaEsperada)) return respostaErroCodigo('REQUEST_ID_CONFLITO', 409)
          return respostaSnapshot(await obterResumoObrigatorio(snapshotId))
        }
        if (!dependencias.cicloVida.iniciarNovaTentativaComSolicitacao) throw new Error('A composição da API não possui idempotência configurada.')
        const resultado = await dependencias.cicloVida.iniciarNovaTentativaComSolicitacao({ requestId, idPublico: snapshotId, tentativaEsperada, agora: agora() })
        if (resultado.resultado === 'conflito') return respostaErroCodigo('REQUEST_ID_CONFLITO', 409)
        if (resultado.resultado === 'tentativa_desatualizada') return respostaSnapshot(await obterResumoObrigatorio(snapshotId))
        if (resultado.publicar && resultado.snapshot) await publicar(snapshotId, resultado.snapshot.tentativa)
        return respostaSnapshot(await obterResumoObrigatorio(snapshotId))
      } catch (erro) {
        return respostaErro(erro)
      }
    },
  }

  async function publicar(snapshotId: string, tentativa: number) {
    try {
      await dependencias.fila.publicar({
        mensagem: { snapshotId, tentativa },
        chaveIdempotencia: `analise:${snapshotId}:${tentativa}`,
      })
    } catch {
      const falha = await dependencias.cicloVida.registrarFalhaAgendamento({
        idPublico: snapshotId,
        tentativa,
        agora: agora(),
        falha: {
          codigo: 'PUBLICACAO_RECUSADA',
          categoria: 'transitoria',
          mensagem: 'Não foi possível iniciar o processamento desta análise.',
        },
      })
      if (falha) return
      // Um consumidor pode ter adquirido ou concluído entre a criação e a falha de publicação.
    }
  }

  async function obterResumoObrigatorio(snapshotId: string) {
    const resumo = await dependencias.cicloVida.obterResumoStatus?.({
      idPublico: snapshotId,
      agora: agora(),
      limiteAguardandoMs,
    })
    if (!resumo) throw new ErroAnaliseRepositorio('REPOSITORIO_INDISPONIVEL', '')
    return resumo
  }
}

function lerObjeto(request: Request): Promise<Record<string, unknown>> {
  return request.json().then((corpo: unknown) => {
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroAnaliseRepositorio('URL_INVALIDA', '')
    return corpo as Record<string, unknown>
  }).catch(() => { throw new ErroAnaliseRepositorio('URL_INVALIDA', '') })
}

function exigirUuid(valor: unknown) {
  if (typeof valor !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)) return respostaInvalida()
  return valor
}

function respostaInvalida(): never {
  throw new ErroAnaliseRepositorio('URL_INVALIDA', 'Requisição inválida.')
}

function eSolicitacaoCriacaoCompativel(s: SolicitacaoAnalise, url: string) {
  return s.operacao === 'criacao' && s.urlNormalizada === url
}

function eSolicitacaoRetryCompativel(s: SolicitacaoAnalise, snapshotId: string, tentativa: number) {
  return s.operacao === 'retry' && s.snapshotId === snapshotId && s.tentativaEsperada === tentativa
}

function respostaSnapshot(resumo: ResumoStatusAnalise) {
  return Response.json(resumo, { status: resumo.estado === 'concluido' ? 200 : 202 })
}

function respostaErro(erro: unknown) {
  if (erro instanceof ErroAnaliseRepositorio) return respostaErroCodigo(erro.codigo, statusErro(erro.codigo))
  const codigo = mapearErroFonteGitHub(erro)
  if (codigo !== 'GITHUB_INDISPONIVEL') return respostaErroCodigo(codigo, statusErro(codigo))
  return respostaErroCodigo('ERRO_INTERNO', 500)
}

function respostaErroCodigo(codigo: string, status: number) {
  const mensagens: Record<string, string> = {
    URL_INVALIDA: 'Informe uma URL canônica de repositório público do GitHub.',
    REPOSITORIO_INDISPONIVEL: 'Não foi possível encontrar ou acessar esse repositório público.',
    REPOSITORIO_PRIVADO: 'Apenas repositórios públicos são aceitos.',
    VERIFICACAO_INCONCLUSIVA: 'Não foi possível confirmar os dados desse repositório agora.',
    LIMITE_GITHUB: 'O GitHub não permitiu concluir a verificação agora.',
    GITHUB_INDISPONIVEL: 'Não foi possível consultar o GitHub agora.',
    REQUEST_ID_CONFLITO: 'O requestId já foi usado com outra operação ou entrada.',
    REQUISICAO_INVALIDA: 'A requisição não possui os dados esperados.',
    ERRO_INTERNO: 'Não foi possível processar a solicitação agora.',
  }
  return Response.json({ erro: { codigo, mensagem: mensagens[codigo] ?? mensagens.ERRO_INTERNO } }, { status })
}

function statusErro(codigo: string) {
  if (codigo === 'URL_INVALIDA') return 400
  if (codigo === 'VERIFICACAO_INCONCLUSIVA') return 422
  if (codigo === 'LIMITE_GITHUB') return 429
  if (codigo === 'REPOSITORIO_INDISPONIVEL' || codigo === 'REPOSITORIO_PRIVADO') return 404
  return 502
}
