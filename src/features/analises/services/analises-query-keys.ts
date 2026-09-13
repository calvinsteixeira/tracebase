export const analisesQueryKeys = {
  all: ['analises'] as const,
  status: (snapshotId: string) => [...analisesQueryKeys.all, 'status', snapshotId] as const,
}
