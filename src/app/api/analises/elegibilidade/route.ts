import { criarFonteRepositorioGitHub } from '@/features/analises/services/github/github-repositorio-fonte'
import { verificarElegibilidadeRepositorio, ErroAnaliseRepositorio, obterLimitesElegibilidadeRepositorio } from '@/features/analises/services/criar-snapshot-repositorio'
import { mapearErroApiAnalises, obterRespostaErro, obterStatusErroApi } from '@/features/analises/services/erros-api-analises'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const corpo = await request.json() as { url?: unknown }
    if (typeof corpo.url !== 'string') throw new ErroAnaliseRepositorio('URL_INVALIDA', '')
    return Response.json(await verificarElegibilidadeRepositorio(corpo.url, criarFonteRepositorioGitHub(), obterLimitesElegibilidadeRepositorio()))
  } catch (erro) {
    const codigo = mapearErroApiAnalises(erro)
    return Response.json({ erro: obterRespostaErro(codigo) }, { status: obterStatusErroApi(codigo) })
  }
}
