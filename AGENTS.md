# Regras de desenvolvimento do Tracebase

## Objetivo e escopo

O Tracebase é uma aplicação web construída com Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, `next-intl`, Vitest e React Testing Library. Este arquivo orienta agentes de IA e pessoas que contribuem para o projeto.

Priorize código simples, legível, seguro, acessível, testável e fácil de evoluir. Evite abstrações prematuras, dependências sem necessidade real e soluções que escondam o fluxo de dados. Em caso de conflito, siga a instrução explícita da tarefa atual e depois as regras mais específicas do diretório alterado.

Este é o arquivo canônico de instruções do projeto. Ele fica na raiz e não deve ser duplicado com nomes alternativos.

## Fluxo de trabalho

- Trabalhe sempre em uma branch com prefixo `feat/` ou `fix/`.
- Não faça alterações diretamente na `main`; use Pull Requests/MRs.
- Antes de concluir uma alteração, execute `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`.
- Ao alterar componentes, páginas ou lógica de domínio, adicione ou atualize testes.
- Mensagens de commit devem ser objetivas, em português e seguir Conventional Commits, por exemplo `feat: adicionar filtro de projetos` ou `fix: corrigir cache da lista`.
- Não inclua segredos, tokens, credenciais, dados pessoais ou arquivos `.env` nos commits.
- Preserve alterações existentes de outras pessoas. Não use comandos destrutivos como `git reset --hard` ou `git checkout --` sem autorização explícita.
- Ao finalizar, descreva o que mudou, as validações executadas e qualquer limitação restante.

## Organização e arquitetura

Organize o código por domínio/feature quando houver uma funcionalidade, mantendo a infraestrutura compartilhada separada. Uma estrutura esperada é:

```text
src/
├── app/                    # rotas, layouts e composição de páginas
├── components/             # componentes compartilhados e do design system
├── features/               # componentes, hooks e regras de cada domínio
│   └── projetos/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── projetos.types.ts
│       └── projetos.keys.ts
├── content/                # conteúdo editorial por domínio
├── i18n/                   # configuração e tipos de internacionalização
├── lib/                    # utilitários sem regra de negócio
├── providers/              # providers React da aplicação
├── stores/                 # stores Zustand por domínio
└── test/                   # helpers e fixtures compartilhados
```

Respeite esta direção de dependências:

```text
app → features/components → hooks/services → lib
```

Módulos de infraestrutura não devem importar páginas ou componentes. Uma feature pode importar `lib` e componentes compartilhados, mas componentes genéricos não devem conhecer regras de uma feature específica. Evite um `utils.ts`, `hooks.ts` ou `store.ts` gigantesco: separe por responsabilidade e domínio.

Use aliases configurados no TypeScript, como `@/components`, `@/features` e `@/lib`, em vez de cadeias frágeis de imports relativos.

### Server Components e Client Components

- Server Components são o padrão. Mantenha no servidor páginas, layouts, busca inicial de dados e composição estática sempre que possível.
- Use `'use client'` apenas em componentes que precisam de estado local, eventos do navegador, hooks de cliente, Zustand ou TanStack Query.
- Coloque a diretiva no menor componente possível; não transforme uma página inteira em Client Component por causa de um botão.
- Não importe um componente de servidor em um módulo cliente. Passe dados serializáveis por props.
- Não acesse `window`, `document`, `localStorage` ou APIs do navegador durante a renderização no servidor.

Exemplo de boundary pequeno:

```tsx
// features/projetos/components/projeto-filtro.tsx
'use client'

import { useProjetosStore } from '@/stores/projetos.store'

export function ProjetoFiltro() {
  const filtro = useProjetosStore((state) => state.filtro)
  const definirFiltro = useProjetosStore((state) => state.definirFiltro)

  return (
    <input
      aria-label="Filtrar projetos"
      value={filtro}
      onChange={(event) => definirFiltro(event.target.value)}
    />
  )
}
```

## React e composição

Use componentes funcionais tipados, com responsabilidade única e nomes de arquivos em `kebab-case`. Prefira composição, `children`, slots e componentes especializados a componentes monolíticos com muitas flags.

Evite:

```tsx
<Card
  showHeader
  showFooter
  compact
  loading
  type="project"
  onAction={handleAction}
  title="Projeto"
  description="..."
/>
```

Prefira:

```tsx
<ProjetoCard>
  <ProjetoCard.Cabecalho>
    <ProjetoCard.Titulo>{projeto.nome}</ProjetoCard.Titulo>
  </ProjetoCard.Cabecalho>
  <ProjetoCard.Conteudo>
    <ProjetoResumo projeto={projeto} />
  </ProjetoCard.Conteudo>
  <ProjetoCard.Acoes>
    <ProjetoAbrir projetoId={projeto.id} />
  </ProjetoCard.Acoes>
</ProjetoCard>
```

Quando compound components não forem necessários, `children` simples já é suficiente:

```tsx
interface SecaoProps {
  children: React.ReactNode
  titulo: string
}

export function Secao({ children, titulo }: SecaoProps) {
  return (
    <section aria-labelledby="secao-titulo">
      <h2 id="secao-titulo">{titulo}</h2>
      {children}
    </section>
  )
}
```

Não crie wrappers vazios para cada `div`. Extraia um componente quando ele isolar uma responsabilidade visual, semântica, comportamental ou de domínio real. Páginas devem compor componentes; não concentre markup, estilos, textos, requisições e estado em `page.tsx`.

Mantenha componentes complexos próximos de seus testes e estilos específicos:

```text
components/projeto-card/
├── projeto-card.tsx
├── projeto-card.style.css
└── projeto-card.test.tsx
```

Prefira exports nomeados. Use `default export` somente quando for uma página, layout ou módulo em que o framework exija esse formato.

## Estado e fluxo de dados

Antes de criar estado, identifique a fonte correta:

| Tipo de dado | Solução |
| --- | --- |
| Valor derivável de props ou dados | Calcular durante a renderização |
| Interação isolada de um componente | `useState` local |
| Estado compartilhado por uma subárvore | Composição ou Contexto local |
| Preferência/estado global de cliente | Zustand |
| Dados vindos de API e seu cache | TanStack Query |
| Conteúdo e traduções | módulos de conteúdo e `next-intl` |

Não duplique a mesma fonte em `useState`, Context, Zustand e Query. O estado deve ter um único dono.

Derive valores sem efeitos desnecessários:

```tsx
const projetosPublicados = projetos.filter((projeto) => projeto.publicado)
const quantidade = projetosPublicados.length
```

Não faça isto:

```tsx
const [quantidade, setQuantidade] = useState(0)

useEffect(() => {
  setQuantidade(projetos.filter((projeto) => projeto.publicado).length)
}, [projetos])
```

Use hooks somente no topo de componentes ou hooks customizados. Declare dependências completas de `useEffect`, `useMemo` e `useCallback`. Não use memoização por padrão: aplique-a quando reduzir trabalho mensurável ou estabilizar uma referência necessária.

## Zustand

Use Zustand apenas para estado global de cliente que realmente precisa sobreviver entre componentes/rotas. Crie stores por domínio, mantenha ações junto do estado e selecione somente o que o componente utiliza.

```ts
import { create } from 'zustand'

interface ProjetosState {
  filtro: string
  definirFiltro: (filtro: string) => void
  limparFiltro: () => void
}

export const useProjetosStore = create<ProjetosState>((set) => ({
  filtro: '',
  definirFiltro: (filtro) => set({ filtro }),
  limparFiltro: () => set({ filtro: '' }),
}))
```

Selecione campos e ações separadamente para evitar renders por mudanças não relacionadas:

```tsx
const filtro = useProjetosStore((state) => state.filtro)
const definirFiltro = useProjetosStore((state) => state.definirFiltro)
```

Evite:

```tsx
const estado = useProjetosStore()
```

Não armazene no Zustand dados de servidor que devem ser invalidados, refetchados ou sincronizados: esse é o papel do TanStack Query. Não coloque dados sensíveis globalmente sem necessidade. Persistência em `localStorage` só deve ser adicionada com uma justificativa clara e tratamento de hidratação.

## TanStack Query e cache

TanStack Query é a fonte de verdade para estado assíncrono de servidor. A configuração deve ter um `QueryClient` compartilhado por uma única árvore de providers; não crie um client novo a cada renderização ou dentro de cada hook.

Separe chaves de query por domínio e mantenha-as estáveis:

```ts
export const projetosKeys = {
  all: ['projetos'] as const,
  lista: (filtro: string) => [...projetosKeys.all, 'lista', { filtro }] as const,
  detalhe: (id: string) => [...projetosKeys.all, 'detalhe', id] as const,
}
```

Use as mesmas chaves para leitura, invalidação e atualização otimista. Nunca use a mesma chave para respostas com formatos diferentes.

```ts
export function useProjetos(filtro: string) {
  return useQuery({
    queryKey: projetosKeys.lista(filtro),
    queryFn: () => buscarProjetos({ filtro }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  })
}
```

Regras de cache:

- `staleTime` define por quanto tempo o dado pode ser reutilizado sem refetch; escolha-o de acordo com a frequência real de mudança.
- `gcTime` define por quanto tempo dados inativos permanecem em memória; não confunda cache inativo com dado fresco.
- Dados imutáveis ou raramente alterados podem ter `staleTime` maior ou `Infinity`, desde que exista estratégia para atualização.
- Inclua na `queryKey` todo parâmetro que muda o resultado: filtros, paginação, ordenação, locale e identificadores.
- Não faça `invalidateQueries` globalmente após qualquer mutation; invalide a família mínima de chaves afetada.
- Após uma mutation, invalide ou atualize explicitamente queries relacionadas. O cache não deve ficar silenciosamente desatualizado.
- Prefira `placeholderData` para manter dados anteriores durante paginação/filtros quando isso melhorar a experiência, mas não esconda erros.
- Trate estados `pending`, `error`, `empty` e `success` na interface.
- Não use `useEffect` para copiar `data` da query para Zustand ou estado local.

Exemplo de mutation com invalidação específica:

```ts
const queryClient = useQueryClient()

const mutation = useMutation({
  mutationFn: criarProjeto,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: projetosKeys.all })
  },
})
```

Para SSR, prefetch/hidratação ou alterações otimistas, preserve a separação entre funções de acesso a dados, configuração de query e componentes. Não coloque chamadas de API diretamente espalhadas pelo JSX. Nunca confie no cache do cliente para autorização ou segurança: o servidor deve validar todas as operações.

## Internacionalização

Use `next-intl` como a única camada de resolução de textos da interface. O locale padrão deve ser explícito e os catálogos devem ser tipados quando a configuração permitir.

Centralize mensagens por domínio:

```text
messages/
├── pt-BR.json
└── en.json
```

Exemplo de uso:

```tsx
const t = useTranslations('Projetos')

return <h1>{t('titulo')}</h1>
```

Regras:

- Todo texto visível, label acessível, título, mensagem de erro e metadata deve ter uma chave no catálogo.
- Não use string da interface diretamente no JSX nem como fallback de tradução.
- Mantenha a mesma chave semântica entre locales; não use o texto traduzido como identificador.
- Use ICU para pluralização, interpolação e formatação de datas/números.
- Traduza também estados de loading, erro, vazio, sucesso e ações de teclado.
- Não misture conteúdo editorial, tokens visuais e lógica de tradução no mesmo módulo.
- Componentes recebem conteúdo via props ou consultam o catálogo da própria feature.
- Testes devem renderizar pela mesma camada de i18n ou consultar contratos de acessibilidade sem depender de um catálogo alternativo.

## Design system, shadcn e estilos

As fontes de verdade do design system são `components.json`, `src/app/globals.css`, `src/app/layout.tsx` e os componentes instalados em `src/components/ui`.

- Adicione componentes shadcn pelo registry; depois customize a cópia local quando necessário.
- Não instale shadcn/ui como uma biblioteca monolítica nem copie componentes sem entender suas dependências.
- Preserve o preset, a biblioteca de ícones e os tokens definidos em `components.json`.
- Use classes semânticas como `bg-primary`, `text-muted-foreground`, `border-border` e `ring-ring`.
- Não use hex, RGB, HSL, OKLCH ou valores arbitrários fora da definição central de tokens.
- Um novo token/variant precisa de necessidade demonstrável, definição central e documentação da decisão.
- Use Tailwind para composição e arquivos `.style.css` para estilos específicos complexos; não espalhe CSS de domínio em `globals.css`.
- Preserve foco visível, estados hover/focus/disabled/loading e responsividade.
- Não altere o preset global para resolver uma preferência visual local.

## Acessibilidade

- Prefira HTML semântico antes de ARIA.
- Todo controle interativo deve ter nome acessível, ser operável por teclado e manter foco visível.
- Use `button` para ações e `a` para navegação; não simule controles com `div` clicável.
- Mantenha uma ordem de headings lógica e landmarks (`main`, `nav`, `header`, `footer`) coerentes.
- Imagens informativas precisam de `alt`; imagens decorativas devem usar `alt=""`.
- Estados de loading, erro, vazio, disabled e sucesso devem ser perceptíveis sem depender apenas de cor.
- Garanta contraste compatível com WCAG 2.1 AA e comportamento razoável em viewport móvel.

## TypeScript e segurança

- Mantenha `strict` ativo e modele props, respostas e entradas com tipos explícitos.
- Evite `any`, casts sem justificativa e objetos sem contrato.
- Valide entradas no cliente para UX e no servidor para segurança; dados vindos do navegador nunca são confiáveis.
- Não use `dangerouslySetInnerHTML` com conteúdo não confiável. Se for inevitável, sanitize antes.
- Use variáveis de ambiente para segredos e nunca exponha credenciais em Client Components.
- Valide tipo, tamanho e conteúdo de uploads quando essa funcionalidade existir.
- Trate erros com mensagens úteis para a pessoa usuária sem expor stack traces, tokens ou detalhes internos.
- IDs, permissões e regras de negócio devem ser verificados no servidor, independentemente do estado do cliente ou do cache.

## Testes

Use Vitest e React Testing Library. Teste comportamento observável, não detalhes internos, classes ou a implementação de hooks sem uma razão concreta.

```tsx
it('permite limpar o filtro', async () => {
  const user = userEvent.setup()
  render(<ProjetoFiltro />)

  await user.type(screen.getByRole('textbox', { name: 'Filtrar projetos' }), 'frontend')
  await user.click(screen.getByRole('button', { name: 'Limpar filtro' }))

  expect(screen.getByRole('textbox', { name: 'Filtrar projetos' })).toHaveValue('')
})
```

Regras de teste:

- Prefira queries por role, accessible name, label e texto observável.
- Use `data-testid` somente como último recurso.
- Cubra estados principais, interações, mensagens de erro e caminhos de acessibilidade.
- Mantenha testes determinísticos, isolados e independentes da rede real.
- Mocke fronteiras externas, como API, relógio e storage, sem mockar o componente inteiro.
- Para TanStack Query, crie um `QueryClient` novo por teste e desative retries quando isso evitar flakiness.
- Para Zustand, limpe ou recrie a store entre testes; um teste não pode depender do estado deixado por outro.
- Não valide somente que uma string fixa existe; valide que a pessoa consegue realizar a ação e observar o resultado.

## Checklist antes de concluir

- A alteração está na branch correta (`feat/` ou `fix/`)?
- A responsabilidade está no domínio/camada correto?
- O Server/Client boundary é o menor possível?
- O estado tem uma única fonte de verdade?
- Queries têm chaves estáveis e cache/invalidação coerentes?
- Todo texto novo está no i18n?
- O componente usa o design system e tokens existentes?
- Loading, erro, vazio, sucesso, teclado e foco foram considerados?
- Existem testes para o comportamento alterado?
- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passaram?
