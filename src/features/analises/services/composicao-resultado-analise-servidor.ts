import type { RepositorioApiAnalises } from './persistencia/repositorio-api-analises'
import { criarCicloVidaAnalisePostgres } from './persistencia/ciclo-vida-analise-postgres'
import { obterPoolPostgresServidor } from './persistencia/pool-postgres-servidor'

let repositorioLeitura: Pick<RepositorioApiAnalises, 'obterResumoStatus'> | undefined

export function obterRepositorioLeituraResultadoAnalise() {
  repositorioLeitura ??= criarCicloVidaAnalisePostgres(obterPoolPostgresServidor())
  return repositorioLeitura
}
