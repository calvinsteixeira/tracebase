import { Pool } from 'pg'

import { criarConsumidorProcessamentoAnalise, criarExecutorLocalProcessamento } from './consumidor-processamento-analise'
import { criarFonteRepositorioGitHub } from './github/github-repositorio-fonte'
import { criarApiAnalises, obterLimiteAguardandoSemAtividadeMs, obterLimiteAnaliseDemoradaMs } from './api-analises'
import { criarFilaLocalAnalises } from './fila-analises'
import { criarFilaVercelAnalises } from './fila-vercel-analises'
import type { FilaDeAnalises } from './fila-analises'
import { criarCicloVidaAnalisePostgres } from './persistencia/ciclo-vida-analise-postgres'
import { criarRepositorioPersistenciaIndicePostgres } from './persistencia/persistencia-indice-postgres'

let api: ReturnType<typeof criarApiAnalises> | undefined
let consumidor: ReturnType<typeof criarConsumidorProcessamentoAnalise> | undefined

export function selecionarFilaAnalises({
  emVercel,
  filaVercel,
  filaLocal,
}: {
  emVercel: boolean
  filaVercel: FilaDeAnalises
  filaLocal: FilaDeAnalises
}) {
  return emVercel ? filaVercel : filaLocal
}

export function obterApiAnalisesServidor() {
  if (api) return api
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const cicloVida = criarCicloVidaAnalisePostgres(pool)
  const persistencia = criarRepositorioPersistenciaIndicePostgres(pool)
  const fonte = criarFonteRepositorioGitHub()
  consumidor = criarConsumidorProcessamentoAnalise({ cicloVida, persistencia, fonte })
  const filaLocal = criarFilaLocalAnalises(criarExecutorLocalProcessamento(consumidor))
  const fila = selecionarFilaAnalises({
    emVercel: process.env.VERCEL === '1',
    filaVercel: criarFilaVercelAnalises(),
    filaLocal,
  })
  api = criarApiAnalises({
    repositorio: cicloVida,
    fila,
    fonte,
    limiteAguardandoMs: obterLimiteAguardandoSemAtividadeMs(),
    limiteDemoradaMs: obterLimiteAnaliseDemoradaMs(),
  })
  return api
}

export function obterConsumidorProcessamentoAnaliseServidor() {
  obterApiAnalisesServidor()
  if (!consumidor) throw new Error('Consumidor de análises não foi configurado.')
  return consumidor
}
