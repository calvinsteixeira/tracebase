export interface ResumoFonteRepositorioGitHub {
  proprietario: string
  nome: string
  url: string
  referencia: string
  commitSha: string
  arquivos: ArquivoArvoreGitHub[]
}

export interface ArquivoArvoreGitHub {
  caminho: string
  tamanhoBytes?: number
}

export interface FonteRepositorioGitHub {
  obterResumoRepositorio(
    proprietario: string,
    nome: string,
  ): Promise<ResumoFonteRepositorioGitHub>
}
