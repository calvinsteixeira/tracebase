'use client'

import { CheckCircle2, CircleAlert, Clock3, LoaderCircle, RefreshCw } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import type { ErroApiAnaliseCliente, ResumoStatusAnaliseCliente } from '../services/api-analises-cliente'
import { obterChaveMensagemErro } from '../services/mensagens-erros-analise'

interface CartaoAcompanhamentoAnaliseProps {
  resumo?: ResumoStatusAnaliseCliente
  carregando?: boolean
  erroAtualizacao?: ErroApiAnaliseCliente | null
  tentandoNovamente?: boolean
  erroNovaTentativa?: ErroApiAnaliseCliente | null
  onAtualizar?: () => void
  onTentarNovamente?: (tentativa: number) => void
}

export function CartaoAcompanhamentoAnalise({
  resumo,
  carregando = false,
  erroAtualizacao = null,
  tentandoNovamente = false,
  erroNovaTentativa = null,
  onAtualizar,
  onTentarNovamente,
}: CartaoAcompanhamentoAnaliseProps) {
  const t = useTranslations('analises')
  const formatador = useFormatter()

  if (!resumo) {
    return (
      <section aria-labelledby="cartao-analise-titulo" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 id="cartao-analise-titulo" className="text-lg font-semibold">{t('carregando')}</h3>
        {carregando && <p className="mt-2 text-sm text-muted-foreground">{t('consultando')}</p>}
        {erroAtualizacao && (
          <AvisoAtualizacao erro={erroAtualizacao} onAtualizar={onAtualizar} />
        )}
      </section>
    )
  }

  const estado = obterEstadoVisual(resumo.estado)
  const IconeEstado = estado.icone
  const tituloId = `analise-${resumo.idPublico}-titulo`

  return (
    <article aria-labelledby={tituloId} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('analise')}</p>
          <h3 id={tituloId} className="mt-1 break-words text-xl font-semibold">
            {resumo.repositorio.proprietario}/{resumo.repositorio.nome}
          </h3>
        </div>
        <div className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium ${estado.classes}`}>
          <IconeEstado aria-hidden="true" className={`size-4 ${resumo.estado === 'processando' ? 'motion-safe:animate-spin' : ''}`} />
          {t(`estados.${resumo.estado}`)}
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <ItemResumo label={t('branch')} value={resumo.referencia} />
        <ItemResumo label={t('tentativa')} value={String(resumo.tentativa)} />
        <ItemResumo
          label={t('commit')}
          value={resumo.commitSha.slice(0, 7)}
          valueLabel={t('commitCompleto', { commit: resumo.commitSha })}
          mono
        />
        <ItemResumo
          label={t('atualizadoEm')}
          value={formatador.dateTime(new Date(resumo.atualizadoEm), { dateStyle: 'short', timeStyle: 'short' })}
        />
      </dl>

      <div className="mt-6 rounded-xl border border-border/70 bg-muted/35 p-4">
        <p className="text-sm text-muted-foreground">{t('etapa')}</p>
        <p className="mt-1 font-medium">{resumo.etapa ? t(`etapas.${resumo.etapa}`) : t('aguardandoEtapa')}</p>
      </div>

      {resumo.demorada && resumo.estado === 'processando' && (
        <p className="mt-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          <Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{t('demorada')}</span>
        </p>
      )}

      {resumo.falha && (
        <div role="alert" aria-live="assertive" className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">{t('falhaTitulo')}</p>
            <p className="mt-1">{t(`erros.${obterChaveMensagemErro(resumo.falha.codigo)}`)}</p>
          </div>
        </div>
      )}

      {erroNovaTentativa && (
        <p role="alert" aria-live="assertive" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {t('novaTentativaFalhou')}: {t(`erros.${obterChaveMensagemErro(erroNovaTentativa.codigo)}`)}
        </p>
      )}

      {resumo.contagens && <Contagens resumo={resumo} />}

      {resumo.estado === 'falha' && onTentarNovamente && (
        <button
          type="button"
          onClick={() => onTentarNovamente(resumo.tentativa)}
          disabled={tentandoNovamente}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary px-5 text-sm font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {tentandoNovamente ? t('tentandoNovamente') : t('tentarNovamente')}
        </button>
      )}

      {erroAtualizacao && <AvisoAtualizacao erro={erroAtualizacao} onAtualizar={onAtualizar} />}
    </article>
  )
}

function ItemResumo({ label, value, valueLabel, mono = false }: { label: string; value: string; valueLabel?: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-muted/35 p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words font-medium ${mono ? 'font-mono text-sm' : ''}`} aria-label={valueLabel} title={valueLabel}>
        {value}
      </dd>
    </div>
  )
}

function Contagens({ resumo }: { resumo: ResumoStatusAnaliseCliente }) {
  const t = useTranslations('analises')
  const contagens = resumo.contagens
  if (!contagens) return null

  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold">{t('contagens.titulo')}</h4>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Contagem label={t('contagens.arquivos')} value={contagens.arquivos} />
        <Contagem label={t('contagens.simbolos')} value={contagens.simbolos} />
        <Contagem label={t('contagens.exportacoes')} value={contagens.exportacoes} />
        <Contagem label={t('contagens.relacoes')} value={contagens.relacoesImportacao} />
        <Contagem label={t('contagens.diagnosticos')} value={contagens.diagnosticos} />
      </dl>
    </div>
  )
}

function Contagem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function AvisoAtualizacao({ erro, onAtualizar }: { erro: ErroApiAnaliseCliente; onAtualizar?: () => void }) {
  const t = useTranslations('analises')
  return (
    <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
      <div className="flex items-start gap-3">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <p>{t('falhaAtualizacao')}</p>
          <p className="mt-1 text-xs opacity-90">{t(`erros.${obterChaveMensagemErro(erro.codigo)}`)}</p>
        </div>
      </div>
      {onAtualizar && (
        <button type="button" onClick={onAtualizar} className="mt-3 min-h-11 rounded-lg border border-warning/50 px-3 font-medium hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t('tentarAtualizar')}
        </button>
      )}
    </div>
  )
}

function obterEstadoVisual(estado: ResumoStatusAnaliseCliente['estado']) {
  if (estado === 'concluido') return { icone: CheckCircle2, classes: 'border-primary/40 bg-primary/10 text-primary' }
  if (estado === 'falha') return { icone: CircleAlert, classes: 'border-destructive/40 bg-destructive/10 text-destructive' }
  if (estado === 'processando') return { icone: LoaderCircle, classes: 'border-accent-foreground/30 bg-accent text-accent-foreground' }
  return { icone: Clock3, classes: 'border-border bg-muted text-muted-foreground' }
}
