import { ErroExploracaoAnalise, normalizarCaminhoExploracao, validarSnapshotExploracao, type ArvoreAnalise, type RepositorioLeituraExploracao } from './exploracao-analise'

export async function lerArvoreAnalise(snapshotId: string, caminho: string | null | undefined, repositorio: Pick<RepositorioLeituraExploracao, 'obterArvoreSnapshotConcluido'>): Promise<ArvoreAnalise> {
  validarSnapshotExploracao(snapshotId)
  const escopo = normalizarCaminhoExploracao(caminho)
  const resultado = await repositorio.obterArvoreSnapshotConcluido(snapshotId, escopo)
  if (resultado.tipo === 'snapshot_indisponivel') throw new ErroExploracaoAnalise('SNAPSHOT_NAO_ENCONTRADO')
  if (resultado.tipo === 'caminho_inexistente') throw new ErroExploracaoAnalise('CAMINHO_NAO_ENCONTRADO')
  return resultado.arvore
}
