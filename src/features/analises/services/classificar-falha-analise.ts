import { ErroConfiguracaoIndexacao } from './indexador/indexador-imports'
import { ErroFonteRepositorio } from './fonte-repositorio'
import type { FalhaAnaliseParaRegistro } from './persistencia/ciclo-vida-analise'
import { ErroValidacaoIndice } from './persistencia/persistencia-indice'

export class ErroControleProcessamento extends Error {
  constructor(readonly codigo: 'LEASE_PERDIDO' | 'TEMPO_ESGOTADO') {
    super(codigo)
    this.name = 'ErroControleProcessamento'
  }
}

export class ErroPersistenciaProcessamento extends Error {
  constructor() {
    super('ERRO_PERSISTENCIA')
    this.name = 'ErroPersistenciaProcessamento'
  }
}

export function classificarFalhaAnalise(erro: unknown): FalhaAnaliseParaRegistro {
  if (erro instanceof ErroControleProcessamento && erro.codigo === 'TEMPO_ESGOTADO') {
    return falha('TEMPO_ESGOTADO', 'transitoria', 'A análise excedeu o tempo permitido.')
  }

  if (erro instanceof ErroPersistenciaProcessamento) {
    return falha('ERRO_PERSISTENCIA', 'transitoria', 'Não foi possível salvar o resultado da análise.')
  }

  if (erro instanceof ErroFonteRepositorio) {
    if (erro.codigo === 'TEMPO_ESGOTADO') {
      return falha('TEMPO_ESGOTADO', 'transitoria', 'A análise excedeu o tempo permitido.')
    }

    if (
      erro.codigo === 'QUANTIDADE_ARQUIVOS' ||
      erro.codigo === 'TAMANHO_ARQUIVO' ||
      erro.codigo === 'TAMANHO_TOTAL' ||
      erro.codigo === 'CONFIGURACAO_TAMANHO'
    ) {
      return falha(
        'LIMITE_REPOSITORIO',
        'deterministica',
        'O repositório excede os limites permitidos para análise.',
        { criterio: erro.codigo },
      )
    }

    if (
      erro.codigo === 'CONFIGURACAO_INVALIDA' ||
      erro.codigo === 'CONFIGURACAO_NAO_SUPORTADA' ||
      erro.codigo === 'CONFIGURACAO_INDISPONIVEL'
    ) {
      return falha(
        'CONFIGURACAO_INVALIDA',
        'deterministica',
        'A configuração do projeto não pôde ser usada na análise.',
        { criterio: erro.codigo },
      )
    }

    return falha('FONTE_INDISPONIVEL', 'transitoria', 'A fonte do repositório está temporariamente indisponível.')
  }

  if (erro instanceof ErroConfiguracaoIndexacao) {
    return falha(
      'CONFIGURACAO_INVALIDA',
      'deterministica',
      'A configuração do projeto não pôde ser usada na análise.',
      { criterio: erro.codigo },
    )
  }

  if (erro instanceof ErroValidacaoIndice) {
    return falha('ERRO_PERSISTENCIA', 'transitoria', 'Não foi possível salvar o resultado da análise.')
  }

  return falha('ERRO_INTERNO', 'transitoria', 'Não foi possível concluir a análise.')
}

function falha(
  codigo: FalhaAnaliseParaRegistro['codigo'],
  categoria: FalhaAnaliseParaRegistro['categoria'],
  mensagem: string,
  detalhes?: FalhaAnaliseParaRegistro['detalhes'],
): FalhaAnaliseParaRegistro {
  return { codigo, categoria, mensagem, ...(detalhes ? { detalhes } : {}) }
}
