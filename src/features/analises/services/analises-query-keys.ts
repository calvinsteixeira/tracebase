export const analisesQueryKeys = {
  all: ['analises'] as const,
  status: (snapshotId: string) => [...analisesQueryKeys.all, 'status', snapshotId] as const,
  arvore: (snapshotId: string, caminho: string | null) => [...analisesQueryKeys.all, snapshotId, 'arvore', caminho ?? 'raiz'] as const,
  relacoes: (snapshotId: string, caminhoArquivo: string) => [...analisesQueryKeys.all, snapshotId, 'relacoes', caminhoArquivo] as const,
}
