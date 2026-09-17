'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const montado = useSyncExternalStore(() => () => undefined, () => true, () => false)

  const temaAtual = montado ? resolvedTheme : 'light'
  const proximoTema = temaAtual === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(proximoTema)}
      aria-label={temaAtual === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={temaAtual === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {temaAtual === 'dark' ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
    </button>
  )
}
