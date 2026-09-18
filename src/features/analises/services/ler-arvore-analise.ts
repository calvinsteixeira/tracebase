import { construirArvoreAnalise, ErroExploracaoAnalise, normalizarCaminhoExploracao, validarSnapshotExploracao, type ArvoreAnalise, type RepositorioLeituraExploracao } from './exploracao-analise'

export async function lerArvoreAnalise(snapshotId: string, caminho: string | null | undefined, repositorio: Pick<RepositorioLeituraExploracao, 'obterArquivosSnapshotConcluido'>): Promise<ArvoreAnalise> {
  validarSnapshotExploracao(snapshotId)
  const escopo = normalizarCaminhoExploracao(caminho)
  const arquivos = await repositorio.obterArquivosSnapshotConcluido(snapshotId)
  if (!arquivos) throw new ErroExploracaoAnalise('SNAPSHOT_NAO_ENCONTRADO')
  return construirArvoreAnalise(arquivos, escopo)
}
