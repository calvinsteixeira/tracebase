import { obterRespostaErro, obterStatusErroApi } from '@/features/analises/services/erros-api-analises'
import { obterRepositorioExploracaoAnaliseServidor } from '@/features/analises/services/composicao-exploracao-analise-servidor'
import { ErroExploracaoAnalise } from '@/features/analises/services/exploracao-analise'
import { lerRelacoesAnalise } from '@/features/analises/services/ler-relacoes-analise'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ snapshotId: string }> }) {
  try {
    const url = new URL(request.url)
    const relacoes = await lerRelacoesAnalise((await params).snapshotId, url.searchParams.get('arquivo'), obterRepositorioExploracaoAnaliseServidor())
    return Response.json(relacoes)
  } catch (erro) {
    const codigo = erro instanceof ErroExploracaoAnalise ? erro.codigo : 'ERRO_INTERNO'
    return Response.json({ erro: obterRespostaErro(codigo) }, { status: obterStatusErroApi(codigo) })
  }
}
