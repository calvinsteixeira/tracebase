'use client'

import { Activity, Check, GitBranch, ScanSearch } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type EtapaFluxoAnalise = 'conectar' | 'revisar' | 'acompanhar'

interface NavegacaoFluxoAnaliseProps {
  etapaAtual: EtapaFluxoAnalise
  revisaoDisponivel: boolean
  acompanhamentoDisponivel: boolean
  onNavegar: (etapa: EtapaFluxoAnalise) => void
}

const etapas: Array<{ id: EtapaFluxoAnalise; icone: typeof GitBranch }> = [
  { id: 'conectar', icone: GitBranch },
  { id: 'revisar', icone: ScanSearch },
  { id: 'acompanhar', icone: Activity },
]

export function NavegacaoFluxoAnalise({ etapaAtual, revisaoDisponivel, acompanhamentoDisponivel, onNavegar }: NavegacaoFluxoAnaliseProps) {
  const t = useTranslations('fluxo')
  const indiceAtual = etapas.findIndex((etapa) => etapa.id === etapaAtual)

  return (
    <nav aria-label={t('navegacao')} className="border-b border-border/70 bg-muted/20 px-4 py-4 sm:px-6 lg:px-8">
      <ol className="mx-auto grid max-w-4xl grid-cols-3">
        {etapas.map((etapa, indice) => {
          const disponivel = etapa.id === 'conectar' || (etapa.id === 'revisar' && revisaoDisponivel) || (etapa.id === 'acompanhar' && acompanhamentoDisponivel)
          const concluida = indice < indiceAtual
          const atual = etapa.id === etapaAtual
          const Icone = concluida ? Check : etapa.icone

          return (
            <li key={etapa.id} className="relative flex justify-center">
              {indice > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-5 h-px w-full ${indice <= indiceAtual ? 'bg-primary' : 'bg-border'}`} />}
              <button
                type="button"
                disabled={!disponivel}
                aria-current={atual ? 'step' : undefined}
                onClick={() => onNavegar(etapa.id)}
                className="group relative z-10 flex min-w-0 flex-col items-center gap-2 rounded-lg px-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
              >
                <span className={`flex size-10 items-center justify-center rounded-full border transition ${atual ? 'border-primary bg-primary text-primary-foreground shadow-sm' : concluida ? 'border-primary bg-background text-primary' : 'border-border bg-background text-muted-foreground group-disabled:opacity-45'}`}>
                  <Icone aria-hidden="true" className="size-4" />
                </span>
                <span className={`hidden text-xs font-medium sm:block ${atual ? 'text-foreground' : 'text-muted-foreground group-disabled:opacity-50'}`}>
                  {t(`etapas.${etapa.id}`)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
