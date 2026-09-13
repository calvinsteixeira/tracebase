import { existsSync, readFileSync as readFileSyncFromFs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as esperar } from 'node:timers/promises'
import { criarAmbienteAplicacao, obterConfiguracao } from './database-ambiente.mjs'
const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)))
const arquivoCompose = join(raiz, 'docker-compose.yml')
const projetoCompose = ['compose', '-p', 'tracebase', '-f', arquivoCompose]

function carregarAmbienteLocal() {
  const ambiente = {}

  for (const nomeArquivo of ['.env.local', '.env']) {
    const caminho = join(raiz, nomeArquivo)

    if (!existsSync(caminho)) continue

    const linhas = readFileSyncFromFs(caminho, 'utf8').split(/\r?\n/)

    for (const linha of linhas) {
      const correspondencia = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)

      if (!correspondencia) continue

      const [, chave, valorBruto] = correspondencia
      const valor = valorBruto.replace(/^(['"])(.*)\1$/, '$2')
      ambiente[chave] = valor
    }
  }

  return { ...ambiente, ...process.env }
}

function garantirBancoLocal(configuracao) {
  const analisada = new URL(configuracao.url)
  const hostsLocais = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

  if (
    !['postgres:', 'postgresql:'].includes(analisada.protocol) ||
    !hostsLocais.has(analisada.hostname) ||
    configuracao.banco !== 'tracebase'
  ) {
    throw new Error('Operação permitida somente na base PostgreSQL local do Tracebase.')
  }
}

function executar(comando, argumentos, opcoes = {}) {
  const resultado = spawnSync(comando, argumentos, {
    cwd: raiz,
    stdio: 'inherit',
    ...opcoes,
  })

  if (resultado.error) throw resultado.error
  if (resultado.status !== 0) {
    throw new Error(`O comando ${comando} falhou.`)
  }
}

function executarSilencioso(comando, argumentos) {
  const resultado = spawnSync(comando, argumentos, {
    cwd: raiz,
    stdio: 'ignore',
  })

  return resultado.status === 0
}

function executarCompose(argumentos, opcoes = {}) {
  executar('docker', [...projetoCompose, ...argumentos], opcoes)
}

function executarSupabase(argumentos, configuracao) {
  executar('pnpm', ['exec', 'supabase', ...argumentos], {
    env: criarAmbienteAplicacao(carregarAmbienteLocal(), configuracao),
  })
}

function obterUrlSupabase(configuracao) {
  const url = new URL(configuracao.url)

  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'disable')

  return url.toString()
}

function composeEstaPronto(configuracao) {
  return executarSilencioso('docker', [
    ...projetoCompose,
    'exec',
    '-T',
    'postgres',
    'pg_isready',
    '-U',
    configuracao.usuario,
    '-d',
    configuracao.banco,
  ])
}

async function subirPostgres(configuracao) {
  garantirBancoLocal(configuracao)
  executarCompose(['up', '-d', 'postgres'])
}

async function aguardarPostgres(configuracao) {
  const limite = Date.now() + 60_000

  while (Date.now() < limite) {
    if (composeEstaPronto(configuracao)) return
    await esperar(1_000)
  }

  throw new Error('O PostgreSQL local não ficou pronto dentro do tempo esperado.')
}

function aplicarMigrations(configuracao) {
  garantirBancoLocal(configuracao)
  executarSupabase(
    ['db', 'push', '--db-url', obterUrlSupabase(configuracao), '--skip-vault', '--yes'],
    configuracao,
  )
}

async function resetarBanco(configuracao) {
  garantirBancoLocal(configuracao)
  executarCompose(['down', '-v'])
  await subirPostgres(configuracao)
  await aguardarPostgres(configuracao)
  await aplicarMigrations(configuracao)
}

function iniciarAplicacao(configuracao) {
  const processo = spawn('pnpm', ['dev:app'], {
    cwd: raiz,
    stdio: 'inherit',
    env: { ...carregarAmbienteLocal(), DATABASE_URL: configuracao.url },
  })

  processo.on('exit', (codigo, sinal) => {
    if (sinal) {
      process.kill(process.pid, sinal)
      return
    }

    process.exitCode = codigo ?? 1
  })
}

async function executarTestesIntegracao(configuracao) {
  await resetarBanco(configuracao)
  executar('pnpm', ['vitest', 'run', '--config', 'vitest.integration.config.ts'], {
    env: { ...carregarAmbienteLocal(), DATABASE_URL: configuracao.url },
  })
}

async function main() {
  const ambiente = carregarAmbienteLocal()
  const configuracao = obterConfiguracao(ambiente)
  const comando = process.argv[2]

  if (comando === 'up') {
    await subirPostgres(configuracao)
    return
  }

  if (comando === 'migrate') {
    await aguardarPostgres(configuracao)
    await aplicarMigrations(configuracao)
    return
  }

  if (comando === 'reset') {
    await resetarBanco(configuracao)
    return
  }

  if (comando === 'dev') {
    await subirPostgres(configuracao)
    await aguardarPostgres(configuracao)
    await aplicarMigrations(configuracao)
    iniciarAplicacao(configuracao)
    return
  }

  if (comando === 'test:integration') {
    await executarTestesIntegracao(configuracao)
    return
  }

  throw new Error('Comando desconhecido. Use up, migrate, reset, dev ou test:integration.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : 'Falha na operação do PostgreSQL local.')
    process.exitCode = 1
  })
}
