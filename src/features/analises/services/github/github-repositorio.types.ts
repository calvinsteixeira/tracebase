import type {
  ArquivoArvoreRepositorio,
  FonteDeRepositorioComArvore,
} from '../fonte-repositorio'

export interface ResumoFonteRepositorioGitHub {
  proprietario: string
  nome: string
  url: string
  referencia: string
  commitSha: string
  arquivos: ArquivoArvoreRepositorio[]
}

export interface FonteRepositorioGitHub {
  obterResumoRepositorio(
    proprietario: string,
    nome: string,
  ): Promise<ResumoFonteRepositorioGitHub>
}

export type FonteRepositorioGitHubCompleta = FonteRepositorioGitHub & FonteDeRepositorioComArvore
