import { criarFonteRepositorioGitHub, mapearErroFonteGitHub } from '@/features/analises/services/github/github-repositorio-fonte'
import { verificarElegibilidadeRepositorio, ErroAnaliseRepositorio, obterLimitesElegibilidadeRepositorio } from '@/features/analises/services/criar-snapshot-repositorio'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const corpo = await request.json() as { url?: unknown }
    if (typeof corpo.url !== 'string') throw new ErroAnaliseRepositorio('URL_INVALIDA', '')
    return Response.json(await verificarElegibilidadeRepositorio(corpo.url, criarFonteRepositorioGitHub(), obterLimitesElegibilidadeRepositorio()))
  } catch (erro) {
    const codigo = erro instanceof ErroAnaliseRepositorio ? erro.codigo : mapearErroFonteGitHub(erro)
    const mensagem: Record<string, string> = {
      URL_INVALIDA: 'Informe uma URL canônica de repositório público do GitHub.',
      REPOSITORIO_INDISPONIVEL: 'Não foi possível encontrar ou acessar esse repositório público.',
      REPOSITORIO_PRIVADO: 'Apenas repositórios públicos são aceitos.',
      VERIFICACAO_INCONCLUSIVA: 'Não foi possível confirmar os dados desse repositório agora.',
      LIMITE_GITHUB: 'O GitHub não permitiu concluir a verificação agora.',
      GITHUB_INDISPONIVEL: 'Não foi possível consultar o GitHub agora.',
    }
    return Response.json({ erro: { codigo, mensagem: mensagem[codigo] } }, { status: codigo === 'URL_INVALIDA' ? 400 : 502 })
  }
}
