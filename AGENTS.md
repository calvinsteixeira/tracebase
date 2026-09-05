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
- O título de todo Pull Request/MR deve ser em português, seguir o mesmo padrão `feat:` ou `fix:` e conter uma descrição breve da entrega, por exemplo `feat: adicionar filtro de projetos`.
- A descrição do Pull Request/MR deve resumir a entrega e listar as validações executadas; não use títulos genéricos como `update`, `changes` ou `inicial`.
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

### Fronteiras do domínio

- Modele o domínio com a linguagem e as necessidades próprias do Tracebase; interfaces, tipos e estruturas internas pertencem ao produto, não a uma ferramenta.
- Não deixe contratos, tipos ou objetos de bibliotecas e sistemas externos vazarem para o domínio. UI, persistência, GitHub, parser e IA não definem o modelo de domínio.
- Mantenha clients, adapters e mappers nas bordas. Converta dados externos para contratos internos antes de eles entrarem no core.
- Faça as dependências apontarem para o domínio; o domínio não deve depender de infraestrutura, interfaces de usuário ou fornecedores externos.
- Quando uma capacidade puder ser expressa por um contrato interno, não acople o indexador a uma implementação, parser ou biblioteca específica.
- Separe claramente domínio, aplicação/serviços e infraestrutura: o domínio descreve regras e conceitos; a aplicação orquestra casos de uso; a infraestrutura conecta recursos externos.

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

### Prop drilling e compartilhamento local

Não encaminhe a mesma prop por múltiplos níveis quando os componentes intermediários não a utilizam. Primeiro prefira composição; quando somente uma subárvore precisar de um valor, use Contexto local. Zustand é reservado para estado global de cliente, não para contornar qualquer prop drilling.

Evite:

```tsx
<Pagina usuario={usuario}>
  <Cabecalho usuario={usuario}>
    <Menu usuario={usuario} />
  </Cabecalho>
</Pagina>
```

Prefira composição quando o componente que precisa do dado pode ser passado diretamente:

```tsx
<Pagina>
  <Cabecalho>
    <Menu usuario={usuario} />
  </Cabecalho>
</Pagina>
```

Quando várias partes da mesma subárvore precisarem do dado, crie um Contexto restrito à feature:

```tsx
const UsuarioContext = createContext<Usuario | null>(null)

export function AreaDoUsuario({ children, usuario }: {
  children: React.ReactNode
  usuario: Usuario
}) {
  return <UsuarioContext value={usuario}>{children}</UsuarioContext>
}

export function NomeDoUsuario() {
  const usuario = useContext(UsuarioContext)

  if (!usuario) throw new Error('NomeDoUsuario deve estar dentro de AreaDoUsuario')

  return <span>{usuario.nome}</span>
}
```

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

## Banco de dados, persistência e migrations

O PostgreSQL é o único banco de dados oficial do Tracebase. Durante o desenvolvimento, ele roda localmente em Docker; no ambiente publicado, o mesmo schema será hospedado no Supabase. Não introduza SQLite como uma segunda implementação de produção, cache de runtime ou fonte de verdade.

- Mantenha o núcleo de indexação independente do banco. O domínio deve depender de contratos pequenos e orientados a casos de uso, como buscar um índice por repositório e commit ou salvar um índice, e não de um adaptador genérico para múltiplos bancos.
- Implemente inicialmente apenas o adaptador PostgreSQL. Em testes unitários, prefira um repositório em memória; use PostgreSQL real para testes de integração que validam schema, queries e persistência.
- O índice persistido por repositório e commit é o mecanismo inicial para reaproveitar uma análise já concluída. Não adicione SQLite, Redis ou outro cache distribuído sem uma necessidade comprovada.
- Todas as mudanças de schema devem ser migrations SQL versionadas em `supabase/migrations/`, com nomes ordenáveis e descritivos. Uma migration aplicada não deve ser alterada; uma correção é feita em uma nova migration.
- Nunca faça mudanças de schema diretamente no banco remoto pelo dashboard, editor SQL ou ferramentas manuais. Toda mudança precisa existir como migration revisável no Git e ser testada em uma base local limpa.
- O ambiente local deve usar Docker somente para o PostgreSQL. O Next.js continua executando fora do container para preservar o hot reload.
- Preserve comandos específicos para manutenção: `pnpm db:up`, `pnpm db:migrate`, `pnpm db:reset` e `pnpm dev:app`. Quando a infraestrutura existir, `pnpm dev` deve garantir que o banco local está disponível, esperar sua prontidão, aplicar apenas migrations pendentes e só então iniciar o Next.js. Se uma migration falhar, o servidor de desenvolvimento não deve iniciar.
- `pnpm db:reset` é destrutivo somente para a base local: recria uma base vazia e reaplica todas as migrations. Nunca execute um reset contra um banco remoto sem autorização explícita.
- Não execute migrations de produção durante builds, previews da Vercel ou qualquer job de CI nesta fase. A pipeline não deve apontar para Supabase nem para outro banco persistente. A aplicação de migrations em produção será uma etapa controlada quando o ambiente hospedado for configurado. Bytebase não deve ser adicionado sem uma necessidade explícita de governança de mudanças de banco.
- Migrations são obrigatórias nos testes de integração contra um PostgreSQL temporário e descartável. O job independente que executa esse fluxo deve se chamar exatamente `Integração PostgreSQL`; ele pode reutilizar `pnpm test:integration`, que sobe o Compose local do runner, recria a base, aplica as migrations e executa os testes.

## Internacionalização

Use `next-intl` como a única camada de resolução de textos da interface. O único locale do projeto neste momento é `pt-BR`; não crie `en.json`, rotas localizadas, seletor de idioma ou fallbacks para outro idioma até que isso seja solicitado. O locale padrão deve ser explícito e os catálogos devem ser tipados quando a configuração permitir.

### Conteúdo do produto e planejamento interno

- Separe rigorosamente o conteúdo destinado à pessoa usuária do conteúdo de planejamento, implementação e revisão. Pacotes como `P0` e `P1`, roadmap, tarefas, PRs, sprints, próximos pacotes, decisões pendentes e instruções para agentes pertencem à documentação interna, nunca à interface do produto.
- Antes de incluir qualquer texto visível, metadata, erro, estado vazio, loading, sucesso ou label acessível, pergunte: “isso ajuda a pessoa usuária a usar e entender o Tracebase agora?”. Se a resposta for não, o texto deve ficar em documentação, comentário, teste ou descrição de PR.
- Não exponha na interface status de implementação, promessas de funcionalidades futuras, nomes de pacotes, dependências entre entregas ou justificativas técnicas. Por exemplo, não exibir “será entregue no P2” ou “este snapshot existe para o próximo passo”.
- Ao transformar uma documentação de planejamento em implementação, use somente os requisitos de comportamento e experiência do produto. Não copie para a UI textos que servem apenas para orientar desenvolvimento.
- Em componentes alterados por esse tipo de decisão, adicione testes que garantam a ausência de textos internos relevantes, além de testar o conteúdo que deve ser percebido pela pessoa usuária.

Centralize mensagens no catálogo atual, com objetos aninhados por tela ou domínio:

```text
messages/
└── pt-BR.json
```

Exemplo de catálogo e uso da chave `home.titulo`:

```json
{
  "home": {
    "titulo": "Acompanhe seus rastreamentos"
  }
}
```

```tsx
const t = useTranslations('home')

return <h1>{t('titulo')}</h1>
```

O namespace `home` mais a chave `titulo` resolve `home.titulo`; preserve essa estrutura em vez de criar chaves planas ou acessar o JSON diretamente no componente.

Regras:

- Todo texto visível, label acessível, título, mensagem de erro e metadata deve ter uma chave no catálogo.
- Não use string da interface diretamente no JSX nem como fallback de tradução.
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
- Alterações de banco incluem uma migration versionada e validada contra uma base local limpa?
- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passaram?
