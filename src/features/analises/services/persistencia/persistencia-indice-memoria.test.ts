import { describe, expect, it } from 'vitest'

import type {
  ArquivoDoSnapshot,
  IndiceAnalise,
} from '../../analises.types'
import {
  criarCicloVidaAnaliseEmMemoria,
  criarEstadoCicloVidaAnaliseEmMemoria,
} from './ciclo-vida-analise-memoria'
import { criarRepositorioPersistenciaIndiceEmMemoria } from './persistencia-indice-memoria'
import {
  type EntradaPersistenciaIndice,
} from './persistencia-indice'

const agora = '2026-09-13T12:00:00.000Z'
const expiraEm = '2026-09-13T12:10:00.000Z'

describe('persistência do índice em memória', () => {
  it('salva e recupera um índice completo, associando os blobs por caminho', async () => {
    const preparado = await preparar()
    const entrada = criarEntrada(preparado.snapshot, preparado.leaseId)

    const resultado = await preparado.persistencia.salvarEConcluir(entrada)

    expect(resultado).toMatchObject({ tipo: 'persistido', indice: entrada.indice })
    expect(await preparado.persistencia.buscarPorSnapshotConcluido(preparado.snapshot.idPublico))
      .toEqual(entrada.indice)
    expect(
      await preparado.persistencia.buscarPorRepositorioECommit({
        url: entrada.indice.snapshot.repositorio.url,
        commitSha: entrada.indice.snapshot.commitSha,
      }),
    ).toEqual(entrada.indice)
    expect(await preparado.ciclo.buscarPorIdPublico(preparado.snapshot.idPublico)).toMatchObject({
      estado: 'concluido',
      leaseId: null,
      finalizadoEm: agora,
    })
    expect(resultado).not.toHaveProperty('conteudoFonte')
    expect(resultado).not.toHaveProperty('ast')
    expect(resultado).not.toHaveProperty('tokens')
    expect(resultado).not.toHaveProperty('stack')
  })

  it('torna o índice concluído imutável e não duplica uma conclusão repetida', async () => {
    const preparado = await preparar()
    const entrada = criarEntrada(preparado.snapshot, preparado.leaseId)

    await preparado.persistencia.salvarEConcluir(entrada)
    const repetido = await preparado.persistencia.salvarEConcluir({
      ...entrada,
      indice: { ...entrada.indice, parcial: false },
    })

    expect(repetido).toMatchObject({ tipo: 'ja_concluido', indice: entrada.indice })
    expect(preparado.estado.indices.size).toBe(1)
  })

  it('rejeita tentativa desatualizada, lease inválido, vencido e estado incompatível', async () => {
    const preparado = await preparar()

    await expect(
      preparado.persistencia.salvarEConcluir({
        ...criarEntrada(preparado.snapshot, preparado.leaseId),
        tentativa: 0,
      }),
    ).resolves.toEqual({ tipo: 'tentativa_desatualizada' })
    await expect(
      preparado.persistencia.salvarEConcluir({
        ...criarEntrada(preparado.snapshot, preparado.leaseId),
        leaseId: 'lease-incorreto',
      }),
    ).resolves.toEqual({ tipo: 'lease_invalido' })
    await expect(
      preparado.persistencia.salvarEConcluir({
        ...criarEntrada(preparado.snapshot, preparado.leaseId),
        agora: '2026-09-13T12:11:00.000Z',
      }),
    ).resolves.toEqual({ tipo: 'lease_invalido' })

    await preparado.persistencia.salvarEConcluir(criarEntrada(preparado.snapshot, preparado.leaseId))
    await expect(
      preparado.persistencia.salvarEConcluir(criarEntrada(preparado.snapshot)),
    ).resolves.toMatchObject({ tipo: 'ja_concluido' })
  })

  it('não reutiliza índice de outro commit e mantém fatos isolados', async () => {
    const estado = criarEstadoCicloVidaAnaliseEmMemoria()
    const ciclo = criarCicloVidaAnaliseEmMemoria(estado)
    const persistencia = criarRepositorioPersistenciaIndiceEmMemoria(estado)
    const primeiro = await ciclo.criarOuReutilizar({
      ...dadosBase,
      commitSha: 'a'.repeat(40),
    })
    const segundo = await ciclo.criarOuReutilizar({
      ...dadosBase,
      commitSha: 'b'.repeat(40),
    })
    const adquiridoPrimeiro = await ciclo.adquirirProcessamento({
      idPublico: primeiro.idPublico,
      tentativa: 1,
      agora,
      leaseExpiraEm: expiraEm,
    })
    const adquiridoSegundo = await ciclo.adquirirProcessamento({
      idPublico: segundo.idPublico,
      tentativa: 1,
      agora,
      leaseExpiraEm: expiraEm,
    })

    if (adquiridoPrimeiro.tipo !== 'adquirido' || adquiridoSegundo.tipo !== 'adquirido') {
      throw new Error('As duas aquisições deveriam ter sido concluídas.')
    }
    await persistencia.salvarEConcluir(
      criarEntrada(adquiridoPrimeiro.snapshot, adquiridoPrimeiro.lease.id),
    )
    await persistencia.salvarEConcluir(
      criarEntrada(adquiridoSegundo.snapshot, adquiridoSegundo.lease.id),
    )

    const indicePrimeiro = await persistencia.buscarPorRepositorioECommit({
      url: dadosBase.repositorio.url,
      commitSha: 'a'.repeat(40),
    })
    const indiceSegundo = await persistencia.buscarPorRepositorioECommit({
      url: dadosBase.repositorio.url,
      commitSha: 'b'.repeat(40),
    })
    expect(indicePrimeiro?.arquivos[0]?.id).toBe(indiceSegundo?.arquivos[0]?.id)
    expect(indicePrimeiro?.snapshot.idPublico).not.toBe(indiceSegundo?.snapshot.idPublico)
  })

  it('valida blobs, caminhos, identificadores, destinos e evidências antes de salvar', async () => {
    const preparado = await preparar()
    const entrada = criarEntrada(preparado.snapshot, preparado.leaseId)
    const casos: Array<[string, EntradaPersistenciaIndice, string]> = [
      [
        'blob ausente',
        { ...entrada, arquivos: [{ caminho: 'src/entrada.ts', blobSha: '' }] },
        'ARQUIVO_SEM_BLOB_SHA',
      ],
      [
        'caminho duplicado',
        { ...entrada, arquivos: [...entrada.arquivos, entrada.arquivos[0]!] },
        'ARQUIVO_DUPLICADO',
      ],
      [
        'arquivo não correspondente',
        { ...entrada, arquivos: entrada.arquivos.slice(0, 1) },
        'ARQUIVO_NAO_CORRESPONDENTE',
      ],
      [
        'id de fato duplicado',
        {
          ...entrada,
          indice: {
            ...entrada.indice,
            simbolos: [entrada.indice.simbolos[0]!, { ...entrada.indice.simbolos[0]! }],
          },
        },
        'FATO_DUPLICADO',
      ],
      [
        'destino interno ausente',
        {
          ...entrada,
          indice: {
            ...entrada.indice,
            relacoesImportacao: [{
              ...entrada.indice.relacoesImportacao[0]!,
              destino: { tipo: 'interno', caminhoArquivo: 'src/inexistente.ts' },
            }],
          },
        },
        'REFERENCIA_ARQUIVO_INVALIDA',
      ],
      [
        'evidência inválida',
        {
          ...entrada,
          indice: {
            ...entrada.indice,
            diagnosticos: [{
              ...entrada.indice.diagnosticos[0]!,
              evidencia: {
                ...entrada.indice.diagnosticos[0]!.evidencia,
                inicio: { linha: 0, coluna: 1 },
              },
            }],
          },
        },
        'EVIDENCIA_INVALIDA',
      ],
    ]

    for (const [, caso, codigo] of casos) {
      await expect(preparado.persistencia.salvarEConcluir(caso)).rejects.toMatchObject({ codigo })
    }
    expect(await preparado.ciclo.buscarPorIdPublico(preparado.snapshot.idPublico)).toMatchObject({
      estado: 'processando',
    })
  })

  it('retorna inexistente e não permite concluir um snapshot sem processamento adquirido', async () => {
    const estado = criarEstadoCicloVidaAnaliseEmMemoria()
    const ciclo = criarCicloVidaAnaliseEmMemoria(estado)
    const persistencia = criarRepositorioPersistenciaIndiceEmMemoria(estado)
    const snapshot = await ciclo.criarOuReutilizar(dadosBase)
    const entrada = criarEntrada(snapshot, 'lease-inexistente')

    await expect(
      persistencia.buscarPorSnapshotConcluido('00000000-0000-4000-8000-000000000000'),
    ).resolves.toBeNull()
    await expect(persistencia.salvarEConcluir(entrada)).resolves.toEqual({
      tipo: 'estado_incompativel',
    })
  })
})

const dadosBase = {
  repositorio: {
    url: 'https://github.com/tracebase/persistencia-indice',
    proprietario: 'Tracebase',
    nome: 'Persistencia-Indice',
  },
  commitSha: 'c'.repeat(40),
  referencia: 'main',
  agora,
}

async function preparar() {
  const estado = criarEstadoCicloVidaAnaliseEmMemoria()
  const ciclo = criarCicloVidaAnaliseEmMemoria(estado)
  const persistencia = criarRepositorioPersistenciaIndiceEmMemoria(estado)
  const criado = await ciclo.criarOuReutilizar(dadosBase)
  const adquirido = await ciclo.adquirirProcessamento({
    idPublico: criado.idPublico,
    tentativa: 1,
    agora,
    leaseExpiraEm: expiraEm,
  })
  if (adquirido.tipo !== 'adquirido') throw new Error('A aquisição deveria ter sido concluída.')

  return {
    estado,
    ciclo,
    persistencia,
    snapshot: adquirido.snapshot,
    leaseId: adquirido.lease.id,
  }
}

function criarEntrada(
  snapshot: Awaited<ReturnType<typeof preparar>>['snapshot'],
  leaseId?: string,
): EntradaPersistenciaIndice {
  const indice = criarIndice(snapshot)
  return {
    snapshotIdPublico: snapshot.idPublico,
    tentativa: snapshot.tentativa,
    leaseId: leaseId ?? 'lease-placeholder',
    agora,
    indice,
    arquivos: criarArquivosDoSnapshot(),
  }
}

function criarArquivosDoSnapshot(): ArquivoDoSnapshot[] {
  return [
    { caminho: 'src/entrada.ts', blobSha: '1'.repeat(40) },
    { caminho: 'src/interno.ts', blobSha: '2'.repeat(40) },
    { caminho: 'src/externo.ts', blobSha: '3'.repeat(40) },
  ]
}

function criarIndice(
  snapshot: Awaited<ReturnType<typeof preparar>>['snapshot'],
): IndiceAnalise {
  const identidade = {
    idPublico: snapshot.idPublico,
    repositorio: snapshot.repositorio,
    commitSha: snapshot.commitSha,
    referencia: snapshot.referencia,
  }
  const evidencia = (caminhoArquivo: string, linha: number) => ({
    caminhoArquivo,
    inicio: { linha, coluna: 2 },
    fim: { linha, coluna: 18 },
  })
  const entrada = 'arquivo:src/entrada.ts'
  const interno = 'arquivo:src/interno.ts'
  const externo = 'arquivo:src/externo.ts'

  return {
    snapshot: identidade,
    arquivos: [
      { id: entrada, caminho: 'src/entrada.ts', tipo: 'typescript' },
      { id: interno, caminho: 'src/interno.ts', tipo: 'javascript' },
      { id: externo, caminho: 'src/externo.ts', tipo: 'typescript' },
    ],
    simbolos: [{
      id: 'simbolo:entrada',
      arquivoId: entrada,
      nome: 'entrada',
      tipo: 'funcao',
      evidencia: evidencia('src/entrada.ts', 2),
    }],
    exportacoes: [
      {
        id: 'exportacao:interna',
        arquivoOrigemId: entrada,
        nomeExportado: 'interna',
        tipo: 'nomeada',
        nomeLocal: 'interna',
        destino: { tipo: 'interno', caminhoArquivo: 'src/interno.ts' },
        evidencia: evidencia('src/entrada.ts', 3),
      },
      {
        id: 'exportacao:externa',
        arquivoOrigemId: entrada,
        nomeExportado: 'useMemo',
        tipo: 'reexportacao',
        destino: { tipo: 'externo', especificador: 'react' },
        evidencia: evidencia('src/entrada.ts', 4),
      },
    ],
    relacoesImportacao: [
      {
        id: 'relacao:interna',
        tipo: 'importa',
        arquivoOrigemId: entrada,
        destino: { tipo: 'interno', caminhoArquivo: 'src/interno.ts' },
        evidencia: evidencia('src/entrada.ts', 5),
      },
      {
        id: 'relacao:externa',
        tipo: 'importa',
        arquivoOrigemId: entrada,
        destino: { tipo: 'externo', especificador: 'react' },
        evidencia: evidencia('src/entrada.ts', 6),
      },
      {
        id: 'relacao:nao-resolvida',
        tipo: 'importa',
        arquivoOrigemId: externo,
        destino: {
          tipo: 'nao-resolvido',
          especificador: './dinamico',
          expressao: "'./' + modulo",
        },
        evidencia: evidencia('src/externo.ts', 7),
      },
    ],
    diagnosticos: [{
      id: 'diagnostico:entrada',
      codigo: 'COMMONJS_NAO_SUPORTADO',
      categoria: 'limitacao',
      arquivoOrigemId: entrada,
      evidencia: evidencia('src/entrada.ts', 8),
    }],
    parcial: true,
  }
}
