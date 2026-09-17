import { handleCallback } from '@vercel/queue'

import {
  obterConsumidorProcessamentoAnaliseServidor,
} from '@/features/analises/services/composicao-analises-servidor'
import type { ResultadoProcessamentoAnalise } from '@/features/analises/services/consumidor-processamento-analise'
import {
  ErroMensagemFilaAnalises,
  validarMensagemFilaAnalises,
} from '@/features/analises/services/validar-mensagem-fila-analises'

export const runtime = 'nodejs'

export async function processarMensagemFilaAnalises(valor: unknown) {
  const mensagem = validarMensagemFilaAnalises(valor)
  const resultado = await obterConsumidorProcessamentoAnaliseServidor().processar(mensagem)

  if (!resultadoSeguro(resultado)) {
    throw new Error('O processamento perdeu o lease e deve ser reentregue.')
  }
}

export const POST = handleCallback(processarMensagemFilaAnalises, {
  visibilityTimeoutSeconds: 300,
  retry: (erro) => {
    if (erro instanceof ErroMensagemFilaAnalises) return { acknowledge: true }
    return undefined
  },
})

function resultadoSeguro(resultado: ResultadoProcessamentoAnalise) {
  return resultadosSeguros.has(resultado.tipo)
}

const resultadosSeguros = new Set<ResultadoProcessamentoAnalise['tipo']>([
  'concluido',
  'ja_concluido',
  'ocupado',
  'tentativa_desatualizada',
  'inexistente',
  'estado_incompativel',
  'falha_registrada',
])
