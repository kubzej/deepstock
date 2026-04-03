# DeepStock — Claude Code Instructions

Personal portfolio tracker and stock analysis tool. Single user (owner-operated). Czech UI, English code.

## Language Rules

- **Code:** English only — variable names, functions, comments, types
- **UI text:** Czech only — labels, buttons, headings, errors, tooltips, placeholders
- **AI prompts:** Czech (all LLM system/user prompts in `backend/app/ai/prompts/`)

## Tech Stack

| Layer    | Stack                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query 5, Recharts, Lucide icons |
| Backend  | Python 3.12, FastAPI, Pydantic v2, yfinance, Pandas                                                       |
| Data     | Supabase (PostgreSQL + Auth), Redis 7 (cache)                                                             |
| AI       | Claude Sonnet via LiteLLM, Tavily (web search)                                                            |
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

All calculations (scores, indicators, aggregations) happen in Python. Frontend is presentation only. Frontend NEVER calls external APIs directly — always through FastAPI.

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
<div className="space-y-6 pb-12">
  <PageHeader title="..." onRefresh={...} actions={...} />
  {isLoading && <Skeleton />}
  {error && <Alert variant="destructive">...</Alert>}
  {data && <Content />}
</div>
```

- `PageHeader` from `@/components/shared/PageHeader` for all page titles
- `space-y-6` for vertical spacing, `pb-12` for mobile nav padding
- No `p-4 md:p-6` on page wrappers — `AppLayout` handles padding

### Design System

- **Theme:** Light mode default, `zinc-950` backgrounds
- **Typography:** Sans-serif for UI, monospace (`Geist Mono`) for financial data/prices
- **Colors:** `text-zinc-100` primary, `text-zinc-400` muted, `text-emerald-500` positive, `text-rose-500` negative
- **No Cards on desktop:** Use flat layouts with headings + spacing. Cards only for mobile or truly isolated widgets.
- **Icons:** Lucide React (`lucide-react`)

### Navigation

- Mobile: Bottom nav + hamburger header (`MobileHeader`)
- Desktop: Fixed left sidebar 256px wide (`Sidebar`)
- Routing: State-based via `activeTab` in `App.tsx` (no react-router)

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

- `frontend/src/App.tsx` — routing, main layout
- `frontend/src/components/layout/` — AppLayout, Sidebar, MobileHeader
- `frontend/src/components/ui/` — shadcn components
- `frontend/src/components/shared/` — PageHeader, ConfirmDialog, EmptyState, etc.
- `frontend/src/hooks/` — React Query hooks (useQuotes, useHoldings, etc.)
- `frontend/src/lib/api/` — API client functions per domain
- `frontend/src/lib/queryClient.ts` — QueryClient config, queryKeys factory, STALE_TIMES
- `frontend/src/contexts/` — AuthContext, PortfolioContext
