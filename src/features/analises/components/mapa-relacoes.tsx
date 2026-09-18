'use client'

import type { Core, ElementDefinition } from 'cytoscape'
import { LoaderCircle, Minus, Plus, Scan } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import type { RelacoesArquivo } from '../services/exploracao-analise'

interface MapaRelacoesProps {
  relacoes: RelacoesArquivo
  onSelecionar: (caminho: string) => void
}

export function MapaRelacoes({ relacoes, onSelecionar }: MapaRelacoesProps) {
  const t = useTranslations('resultadoAnalise.exploracao')
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando')

  useEffect(() => {
    let ativo = true
    void import('cytoscape').then(({ default: cytoscape }) => {
      if (!ativo || !containerRef.current) return
      const container = containerRef.current
      const style = getComputedStyle(container)
      const foco = style.getPropertyValue('--graph-focus').trim()
      const contexto = style.getPropertyValue('--graph-context').trim()
      const linha = style.getPropertyValue('--graph-edge').trim()
      const textoNo = style.getPropertyValue('--graph-node-text').trim()
      const textoSelecionado = style.getPropertyValue('--graph-selected-text').trim()
      const fundoLabel = style.getPropertyValue('--graph-label-background').trim()
      const elementos = criarElementos(relacoes)
      const instancia = cytoscape({
        container,
        elements: elementos,
        layout: { name: 'preset' },
        style: [
          { selector: 'node', style: { label: 'data(label)', 'text-wrap': 'ellipsis', 'text-max-width': '150px', 'text-valign': 'center', 'text-halign': 'center', color: textoNo, 'font-size': 11, 'background-color': contexto, width: 42, height: 42, 'border-width': 1, 'border-color': linha } },
          { selector: '.selecionado', style: { 'background-color': foco, 'border-color': foco, color: textoSelecionado, width: 54, height: 54 } },
          { selector: 'edge', style: { width: 2, 'line-color': linha, 'target-arrow-color': linha, 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', label: 'data(label)', color: textoNo, 'font-size': 10, 'text-background-color': fundoLabel, 'text-background-opacity': 1 } },
        ],
      })
      instancia.fit(undefined, 40)
      instancia.on('tap', 'node', (evento) => onSelecionar(evento.target.data('caminho') as string))
      cyRef.current = instancia
      setEstado('pronto')
    }).catch(() => setEstado('erro'))

    return () => {
      ativo = false
      cyRef.current?.destroy()
      cyRef.current = null
    }
  }, [onSelecionar, relacoes])

  function ajustarZoom(delta: number) {
    const instancia = cyRef.current
    if (!instancia) return
    instancia.zoom({ level: instancia.zoom() + delta, renderedPosition: { x: instancia.width() / 2, y: instancia.height() / 2 } })
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-background/40">
      <div ref={containerRef} className="h-[30rem] w-full sm:h-[36rem]" aria-label={t('mapa')} role="img" />
      {estado === 'carregando' ? <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/80 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{t('carregandoRelacoes')}</div> : null}
      {estado === 'erro' ? <div className="absolute inset-0 flex items-center justify-center bg-background/95 p-6 text-center text-sm text-muted-foreground" role="alert">{t('erroMapa')}</div> : null}
      {estado === 'pronto' ? <div className="absolute right-3 top-3 flex gap-1 rounded-xl border border-border bg-card/90 p-1 shadow-sm">
        <button type="button" onClick={() => ajustarZoom(0.2)} aria-label={t('aumentarZoom')} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus aria-hidden="true" className="size-4" /></button>
        <button type="button" onClick={() => ajustarZoom(-0.2)} aria-label={t('reduzirZoom')} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Minus aria-hidden="true" className="size-4" /></button>
        <button type="button" onClick={() => cyRef.current?.fit(undefined, 24)} aria-label={t('enquadrarRelacoes')} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Scan aria-hidden="true" className="size-4" /></button>
      </div> : null}
    </div>
  )
}

function criarElementos(relacoes: RelacoesArquivo): ElementDefinition[] {
  const caminhos = new Set<string>([relacoes.arquivo.caminho])
  const nodes: ElementDefinition[] = [{ data: { id: relacoes.arquivo.caminho, caminho: relacoes.arquivo.caminho, label: relacoes.arquivo.nome }, position: { x: 0, y: 0 }, classes: 'selecionado' }]
  relacoes.importadoPor.forEach((relacao, indice) => {
    if (caminhos.has(relacao.caminho)) return
    caminhos.add(relacao.caminho)
    nodes.push({ data: { id: relacao.caminho, caminho: relacao.caminho, label: relacao.caminho.split('/').at(-1) ?? relacao.caminho }, position: { x: -230, y: indice * 90 - ((relacoes.importadoPor.length - 1) * 45) } })
  })
  relacoes.importa.forEach((relacao, indice) => {
    if (caminhos.has(relacao.caminho)) return
    caminhos.add(relacao.caminho)
    nodes.push({ data: { id: relacao.caminho, caminho: relacao.caminho, label: relacao.caminho.split('/').at(-1) ?? relacao.caminho }, position: { x: 230, y: indice * 90 - ((relacoes.importa.length - 1) * 45) } })
  })
  const edges = [
    ...relacoes.importadoPor.map((relacao, indice) => ({ data: { id: `entrada-${indice}-${relacao.caminho}`, source: relacao.caminho, target: relacoes.arquivo.caminho, label: relacao.quantidadeImports > 1 ? String(relacao.quantidadeImports) : '' } })),
    ...relacoes.importa.map((relacao, indice) => ({ data: { id: `saida-${indice}-${relacao.caminho}`, source: relacoes.arquivo.caminho, target: relacao.caminho, label: relacao.quantidadeImports > 1 ? String(relacao.quantidadeImports) : '' } })),
  ]
  return [...nodes, ...edges]
}
