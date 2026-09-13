import { criarFonteRepositorioGitHub } from '@/features/analises/services/github/github-repositorio-fonte'
import { verificarElegibilidadeRepositorio, obterLimitesElegibilidadeRepositorio } from '@/features/analises/services/criar-snapshot-repositorio'
import { mapearErroApiAnalises, obterRespostaErro, obterStatusErroApi } from '@/features/analises/services/erros-api-analises'
import { exigirUrlDoCorpo, lerCorpoObjeto } from '@/features/analises/services/validar-corpo-http'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const url = exigirUrlDoCorpo(await lerCorpoObjeto(request))
    return Response.json(await verificarElegibilidadeRepositorio(url, criarFonteRepositorioGitHub(), obterLimitesElegibilidadeRepositorio()))
  } catch (erro) {
    const codigo = mapearErroApiAnalises(erro)
    return Response.json({ erro: obterRespostaErro(codigo) }, { status: obterStatusErroApi(codigo) })
  }
}
