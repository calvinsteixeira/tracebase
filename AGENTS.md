# Regras de desenvolvimento

## Fluxo de trabalho

- Trabalhe somente em branches `feat/` ou `fix/`; não altere `main` diretamente.
- Antes de concluir, execute `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`.
- Commits devem ser objetivos, em português e seguir Conventional Commits.
- Nunca inclua segredos; use variáveis de ambiente e mantenha o TypeScript estrito.

## Arquitetura

- Use Server Components por padrão e `'use client'` somente quando necessário.
- Use Zustand para estado global de cliente, com stores por domínio e seletores focados.
- Use TanStack Query exclusivamente para estado assíncrono/cache de servidor; configure um `QueryClient` compartilhado e trate loading, erro e vazio.
- Use `next-intl` como única camada de i18n. Todo texto visível deve vir de mensagens tipadas; não use strings de interface diretamente no JSX.
- Componentes devem ser funcionais, tipados, acessíveis e nomeados em `kebab-case`.
- Componentes do shadcn/ui devem ser adicionados pelo registry e customizados localmente; não instale uma biblioteca monolítica.
- Prefira tokens semânticos do Tailwind e componentes do design system a cores ou valores arbitrários.

## Testes e revisão

- Use Vitest e React Testing Library para testar comportamento observável, acessibilidade e estados principais.
- Prefira queries por papel, nome e label; use `data-testid` somente como último recurso.
- Não use `any`, `dangerouslySetInnerHTML` ou desabilite lint sem justificativa.
- Ao finalizar, descreva mudanças e validações executadas.

