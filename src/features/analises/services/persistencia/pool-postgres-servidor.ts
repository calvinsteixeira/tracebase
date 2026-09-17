import { Pool } from 'pg'

let poolServidor: Pool | undefined

export function obterPoolPostgresServidor() {
  poolServidor ??= new Pool({ connectionString: process.env.DATABASE_URL })
  return poolServidor
}
