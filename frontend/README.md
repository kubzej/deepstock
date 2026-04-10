# DeepStock — Frontend

React 19 + TypeScript + Vite application. Presentation layer only — no calculations, no direct external API calls.

## Stack

| Library        | Purpose                           |
| -------------- | --------------------------------- |
| React 19       | UI framework                      |
| Vite           | Build tool + dev server           |
| Tailwind CSS 4 | Styling                           |
| shadcn/ui      | Components (Radix primitives)     |
| TanStack Query | Server state, cache, invalidation |
| Recharts       | Charts                            |
| Lucide React   | Icons                             |

## Key conventions

- **shadcn/ui mandatory** — always use existing components; add missing ones via `npx shadcn@latest add <name>`
- **TanStack Query mandatory** — all server data via hooks; never `useState` + `useEffect` for fetching
- **Query keys** — always via `queryKeys` factory from `@/lib/queryClient`; stale times via `STALE_TIMES`
- **Page layout** — `<div className="space-y-6 pb-12">` → `PageHeader` → skeleton → error → content
- **Routing** — state-based via `activeTab` in `App.tsx`; no react-router

## Running

```bash
npm run dev
```

See [root README](../README.md) for running the full stack and [CLAUDE.md](../CLAUDE.md) for complete conventions.
