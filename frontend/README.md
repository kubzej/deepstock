# DeepStock — Frontend

React 19 + TypeScript + Vite application. Primarily a presentation and workflow layer for the FastAPI backend, with a few UI-local utilities and embeds where needed for the product experience.

## Stack

| Library        | Purpose                           |
| -------------- | --------------------------------- |
| React 19       | UI framework                      |
| Vite           | Build tool + dev server           |
| Tailwind CSS 4 | Styling                           |
| shadcn/ui      | Components (Radix primitives)     |
| TanStack Query | Server state, cache, invalidation |
| TanStack Router | Routing and navigation            |
| Recharts       | Charts                            |
| Lucide React   | Icons                             |

## Key conventions

- **shadcn/ui mandatory** — always use existing components; add missing ones via `npx shadcn@latest add <name>`
- **TanStack Query mandatory** — all server data via hooks; never `useState` + `useEffect` for fetching
- **Query keys** — always via `queryKeys` factory from `@/lib/queryClient`; stale times via `STALE_TIMES`
- **Page layout** — `PageShell` + `PageIntro` / `PageHero` + skeleton / error / content states
- **Routing** — file-local route tree in `src/router.tsx` via TanStack Router
- **Backend-first domain logic** — investing/accounting rules belong in Python; UI-local calculators and embeds are exceptions, not the default pattern

## Running

```bash
npm run dev
```

See [root README](../README.md) for running the full stack and [CLAUDE.md](../CLAUDE.md) for complete conventions.
