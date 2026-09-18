import { criarRepositorioLeituraExploracaoPostgres } from './persistencia/exploracao-analise-postgres'
import { obterPoolPostgresServidor } from './persistencia/pool-postgres-servidor'
import type { RepositorioLeituraExploracao } from './exploracao-analise'

let repositorio: RepositorioLeituraExploracao | undefined

export function obterRepositorioExploracaoAnaliseServidor() {
  repositorio ??= criarRepositorioLeituraExploracaoPostgres(obterPoolPostgresServidor())
  return repositorio
}
