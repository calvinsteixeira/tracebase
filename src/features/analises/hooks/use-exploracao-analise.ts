'use client'

import { useQuery } from '@tanstack/react-query'

import { buscarArvoreAnalise, buscarRelacoesAnalise } from '../services/api-exploracao-analise-cliente'
import { analisesQueryKeys } from '../services/analises-query-keys'

const QUINZE_MINUTOS = 15 * 60 * 1000

export function useArvoreAnalise(snapshotId: string, caminho: string | null) {
  return useQuery({
    queryKey: analisesQueryKeys.arvore(snapshotId, caminho),
    queryFn: () => buscarArvoreAnalise(snapshotId, caminho),
    staleTime: Infinity,
    gcTime: QUINZE_MINUTOS,
  })
}

export function useRelacoesAnalise(snapshotId: string, caminhoArquivo: string | null) {
  return useQuery({
    queryKey: analisesQueryKeys.relacoes(snapshotId, caminhoArquivo ?? ''),
    queryFn: () => buscarRelacoesAnalise(snapshotId, caminhoArquivo as string),
    enabled: Boolean(caminhoArquivo),
    staleTime: Infinity,
    gcTime: QUINZE_MINUTOS,
  })
}
