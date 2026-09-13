import { Pool } from 'pg'

import { criarConsumidorProcessamentoAnalise, criarExecutorLocalProcessamento } from './consumidor-processamento-analise'
import { criarFonteRepositorioGitHub } from './github/github-repositorio-fonte'
import { criarApiAnalises, obterLimiteAguardandoSemAtividadeMs } from './api-analises'
import { criarFilaLocalAnalises } from './fila-analises'
import { criarCicloVidaAnalisePostgres } from './persistencia/ciclo-vida-analise-postgres'
import { criarRepositorioPersistenciaIndicePostgres } from './persistencia/persistencia-indice-postgres'

let api: ReturnType<typeof criarApiAnalises> | undefined

export function obterApiAnalisesServidor() {
  if (api) return api
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const cicloVida = criarCicloVidaAnalisePostgres(pool)
  const persistencia = criarRepositorioPersistenciaIndicePostgres(pool)
  const fonte = criarFonteRepositorioGitHub()
  const consumidor = criarConsumidorProcessamentoAnalise({ cicloVida, persistencia, fonte })
  const fila = criarFilaLocalAnalises(criarExecutorLocalProcessamento(consumidor))
  api = criarApiAnalises({ cicloVida, fila, fonte, limiteAguardandoMs: obterLimiteAguardandoSemAtividadeMs() })
  return api
}
