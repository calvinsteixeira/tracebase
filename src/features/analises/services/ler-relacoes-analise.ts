import { ErroExploracaoAnalise, normalizarCaminhoExploracao, validarSnapshotExploracao, type RelacoesArquivo, type RepositorioLeituraExploracao } from './exploracao-analise'

export async function lerRelacoesAnalise(snapshotId: string, caminho: string | null | undefined, repositorio: Pick<RepositorioLeituraExploracao, 'obterRelacoesArquivoSnapshotConcluido'>): Promise<RelacoesArquivo> {
  validarSnapshotExploracao(snapshotId)
  const arquivo = normalizarCaminhoExploracao(caminho, true)
  if (!arquivo) throw new ErroExploracaoAnalise('ARQUIVO_OBRIGATORIO')
  const relacoes = await repositorio.obterRelacoesArquivoSnapshotConcluido(snapshotId, arquivo)
  if (!relacoes) throw new ErroExploracaoAnalise('CAMINHO_NAO_ENCONTRADO')
  return {
    ...relacoes,
    arquivo: { ...relacoes.arquivo, nome: relacoes.arquivo.caminho.split('/').at(-1) ?? relacoes.arquivo.caminho },
  }
}
