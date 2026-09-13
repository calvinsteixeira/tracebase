'use client'

import { useQueries, useQuery } from '@tanstack/react-query'

import { buscarStatusAnalise } from '../services/api-analises-cliente'
import { analisesQueryKeys } from '../services/analises-query-keys'

export const INTERVALO_POLLING_ANALISE_MS = 2_000

export function useStatusAnalise(snapshotId: string | null) {
  return useQuery({
    queryKey: snapshotId ? analisesQueryKeys.status(snapshotId) : analisesQueryKeys.all,
    queryFn: () => buscarStatusAnalise(snapshotId as string),
    enabled: Boolean(snapshotId),
    refetchInterval: (query) => eEstadoAtivo(query.state.data?.estado) ? INTERVALO_POLLING_ANALISE_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  })
}

export function useStatusAnalises(snapshotIds: string[]) {
  return useQueries({
    queries: snapshotIds.map((snapshotId) => ({
      queryKey: analisesQueryKeys.status(snapshotId),
      queryFn: () => buscarStatusAnalise(snapshotId),
      refetchInterval: (query: { state: { data?: { estado?: string } } }) => eEstadoAtivo(query.state.data?.estado) ? INTERVALO_POLLING_ANALISE_MS : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      retry: false,
    })),
  })
}

export function eEstadoAtivo(estado: string | undefined) {
  return estado === 'aguardando' || estado === 'processando'
}
