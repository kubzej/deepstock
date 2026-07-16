# DeepStock — Claude Code Instructions

Personal portfolio tracker and stock analysis tool. Single user (owner-operated). Czech UI, English code.

## Language Rules

- **Code:** English only — variable names, functions, comments, types
- **UI text:** Czech only — labels, buttons, headings, errors, tooltips, placeholders
- **AI prompts:** Czech (all LLM system/user prompts in `backend/app/ai/prompts/`)

## Tech Stack

| Layer    | Stack                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query 5, TanStack Router, Recharts, Lucide icons |
| Backend  | Python 3.12, FastAPI, Pydantic v2, yfinance, Pandas                                                       |
| Data     | Supabase (PostgreSQL + Auth), Redis 7 (cache)                                                             |
| AI       | Configured LLM via LiteLLM, Tavily (web search)                                                           |
| Infra    | Docker Compose (backend + redis), Vite dev server (frontend)                                              |

## Running the App

```bash
# Backend + Redis
docker compose up -d

# Frontend
cd frontend && npm run dev
```

## Architecture Principles

### Smart Backend, Dumb UI

Core investing logic (accounting, holdings, performance semantics, derived portfolio state) belongs in Python. Frontend should stay backend-first for business logic and fetch application data through FastAPI.

Current repo reality:

- frontend contains a few UI-local utilities such as the options calculator and workflow state
- frontend embeds third-party widgets such as TradingView where the UX depends on them
- these exceptions should not become a precedent for moving core portfolio or market business rules out of the backend

### MCP Is A Public Contract

DeepStock is also an MCP provider consumed by external agents. Treat the MCP surface as a public integration contract, not just internal backend glue.

When changing chat, research, journal, portfolio-context, performance, or market-context behavior, always consider both:

1. DeepStock internal implementation
2. The external MCP contract agents depend on

Rules:

- `backend/app/api/endpoints/mcp.py` and `mcp/deepstock_mcp.py` are public integration surface
- prefer summary-first default tools/endpoints, with separate drilldown tools for full detail
- do not silently rename or reshape MCP payloads without updating docs and downstream agent instructions
- full-content endpoints for user data must always be scoped to the authenticated user
- multi-portfolio behavior must be explicit; never rely on a hidden active-portfolio assumption

If MCP changes, update these together:

- `backend/app/api/endpoints/mcp.py`
- `backend/app/services/research_context.py`
- any affected split `backend/app/services/research_context_*.py` domain modules
- `backend/app/schemas/mcp.py`
- any affected split `backend/app/schemas/mcp_*.py` schema modules
- `mcp/deepstock_mcp.py`
- `mcp/CONTRACT.md`
- `mcp/README.md`

Alethea depends on this contract too. If tool names, tool purpose, response shape, or recommended call order change, keep the mirrored Alethea prompts aligned:

- `../alethea/alethea-core/agents/shared/specs/investing.md`
- `../alethea/alethea-knowledge/personal/wiki/projects/deepstock/knowledge.md`

### yfinance Rate Limiting — BE CAREFUL

yfinance hits Yahoo Finance which aggressively rate-limits. Follow these rules strictly:

1. **Batch downloads:** Use `yf.download(tickers, ...)` for multiple tickers (1 HTTP request). Never loop `yf.Ticker(t).info` for a list.
2. **Redis cache everything:** Every yfinance call must check Redis first. TTLs are defined in `backend/app/core/cache.py` (`CacheTTL` class).
3. **No new yfinance calls without caching:** If you add a new yfinance call, it MUST have Redis caching with an appropriate TTL.
4. **Background fetches:** Extended data (`.info`) runs in a thread pool, fire-and-forget. See `quotes.py` pattern.
5. **Existing cache TTLs:** Quotes 5min, extended data 1h, technical raw 1h, stock info 5min, financials 24h, price history varies.

### No Tests Required

This is a personal tool. Do not write unit tests, integration tests, or test files unless explicitly asked.

## Frontend Patterns

### React Query — Mandatory

All server data MUST use TanStack Query hooks. Never `useState` + `useEffect` for data fetching.

```tsx
// Correct
const { data, isLoading } = useQuotes(tickers);

// Wrong — never do this
const [data, setData] = useState(null);
useEffect(() => { fetch(...).then(setData) }, []);
```

- Query keys: Always use `queryKeys` factory from `@/lib/queryClient`
- Stale times: Defined in `STALE_TIMES` in `@/lib/queryClient.ts`
- Mutations auto-invalidate related queries

### shadcn/ui — Mandatory

Always use shadcn/ui components. Never create custom equivalents.

- Buttons: `<Button>` with variant (default/outline/ghost/destructive)
- Forms: `<Label>` + `<Input>` / `<Select>` / `<Textarea>`
- Tables: `<Table>` + `<TableHeader>` + `<TableBody>` + `<TableRow>` + `<TableCell>`
- Loading: `<Skeleton>` — never custom spinners
- Modals: `<Dialog>` for confirmations, `<Sheet>` for side panels
- Import from `@/components/ui/`

If a shadcn component doesn't exist yet: `cd frontend && npx shadcn@latest add <name>`

### Page Layout Pattern

Every page follows this structure:

```tsx
<PageShell width="full">
  <PageIntro title="..." onRefresh={...} dataUpdatedAt={...} />
  {isLoading && <Skeleton />}
  {error && <ErrorState ... />}
  {data && <Content />}
</PageShell>
```

- Use `PageShell` from `@/components/shared/PageShell` as the default page wrapper
- Use `PageIntro` for standard page headers and `PageHero` for dashboard/detail hero sections
- Use shared feedback states (`EmptyState`, `ErrorState`, `FilteredEmptyState`) instead of ad hoc empty/error blocks where possible
- No `p-4 md:p-6` on page wrappers — `AppLayout` handles padding

### Design System

- **Theme:** Light mode default, `zinc-950` backgrounds
- **Typography:** Sans-serif for UI, monospace (`Geist Mono`) for financial data/prices
- **Colors:** `text-zinc-100` primary, `text-zinc-400` muted, `text-emerald-500` positive, `text-rose-500` negative
- **No Cards on desktop:** Use flat layouts with headings + spacing. Cards only for mobile or truly isolated widgets.
- **Icons:** Lucide React (`lucide-react`)

### Navigation

- Mobile: Fixed top header with portfolio switcher, quick-add menu, and hamburger navigation (`MobileHeader`)
- Desktop: Fixed left sidebar 256px wide (`Sidebar`)
- Routing: `frontend/src/router.tsx` via TanStack Router

### API Client Pattern

```tsx
import { getAuthHeader, API_URL } from '@/lib/api/client';

const res = await fetch(`${API_URL}/api/endpoint`, {
  headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
});
```

## Backend Patterns

### Endpoint Structure

```python
from fastapi import APIRouter, Depends
from app.core.auth import get_current_user_id

router = APIRouter()

@router.get("/endpoint")
async def my_endpoint(user_id: str = Depends(get_current_user_id)):
    ...
```

- Auth: `get_current_user_id` dependency from `app.core.auth`
- Market data: `market_service` singleton from `app.services.market`
- Routers registered in `app/main.py`

### Security — Always Filter by user_id

Backend uses Supabase `service_role_key` which bypasses Row Level Security.
Every endpoint that returns user data **must** filter by `user_id` — either directly via `.eq("user_id", user_id)` or via a `verify_*_ownership()` check. Never return data without ownership verification.

### Supabase Migrations — Povinné GRANTy pro nové tabulky

Backend přistupuje k Supabase přes `service_role_key` skrze Data API (supabase-py → PostgREST). Od října 2026 Supabase vyžaduje explicitní GRANT pro každou novou tabulku — bez něj PostgREST vrátí chybu `42501`.

Každá nová migrace, která vytváří tabulku v `public` schématu, **musí** obsahovat:

```sql
-- Backend (vždy povinné)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nova_tabulka TO service_role;

-- RLS policy pro service_role (backend jde přes policy, ne přes přímý bypass)
ALTER TABLE public.nova_tabulka ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.nova_tabulka
    FOR ALL USING (auth.role() = 'service_role');
```

Frontend nikdy nečte data přímo ze Supabase (vše jde přes FastAPI), takže `anon` a `authenticated` granty pro datové tabulky nejsou povinné — přidej je jen pokud má tabulka přímý přístup z klienta.

### Market Service

`market_service` (singleton) wraps all yfinance calls with Redis caching:

- `get_quotes(tickers)` — batch stock quotes
- `get_price_history(ticker, period)` — OHLCV for charts
- `get_stock_info(ticker)` — fundamentals + insights
- `get_technical_indicators(ticker, period)` — all tech indicators
- `get_historical_financials(ticker)` — annual financial data

### AI / LLM Pattern

```python
from app.ai.providers.litellm_client import call_llm
content, model = await call_llm(SYSTEM_PROMPT, user_prompt)
```

- Prompts in `backend/app/ai/prompts/`
- All prompts in Czech, forbid hallucination
- Cache AI reports: research 24h, technical 2h, alert suggestions 6h

## Key File Locations

### Backend

- `backend/app/main.py` — FastAPI app, router registration
- `backend/app/core/auth.py` — Supabase JWT auth
- `backend/app/core/cache.py` — `CacheTTL` constants
- `backend/app/core/redis.py` — Redis connection pool
- `backend/app/services/market/` — yfinance wrapper (quotes, stock_info, technical, financials)
- `backend/app/services/price_alerts.py` — alert CRUD + cron checker
- `backend/app/ai/` — AI research service, prompts, LLM client
- `backend/app/api/endpoints/` — all API routers

### Frontend

- `frontend/src/router.tsx` — route tree, auth-gated root layout, page entrypoints
- `frontend/src/components/layout/` — AppLayout, Sidebar, MobileHeader
- `frontend/src/components/ui/` — shadcn components
- `frontend/src/components/shared/` — PageShell family, feedback states, reusable product UI
- `frontend/src/hooks/` — React Query hooks (useQuotes, useHoldings, etc.)
- `frontend/src/lib/api/` — API client functions per domain
- `frontend/src/lib/queryClient.ts` — QueryClient config, queryKeys factory, STALE_TIMES
- `frontend/src/contexts/` — AuthContext, PortfolioContext
