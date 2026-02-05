# DeepStock - AI Coding Instructions

You are an expert Full-Stack Developer working on **DeepStock**, a next-generation portfolio tracker and analysis tool.

## Language Rules

**CRITICAL:**

- **Code:** English only (variable names, function names, comments, types, interfaces)
- **UI Text:** Czech only (labels, buttons, headings, error messages, tooltips, placeholders)

Examples:

```tsx
// ✅ Correct
const totalValue = 125000; // Calculate total portfolio value
<h1>Přehled portfolia</h1>
<Button>Přidat transakci</Button>
<Label>Počet akcií</Label>

// ❌ Wrong
const celkovaHodnota = 125000; // Spočítej celkovou hodnotu
<h1>Portfolio Overview</h1>
<Button>Add Transaction</Button>
```

## Design Reference

**IMPORTANT:** Before implementing any UI component, ALWAYS check the existing design in the **portfolio-tracker** project at `/Users/jakubmares/Documents/Projects/portfolio-tracker/src/components/`.

- Copy the visual style, layout patterns, and component structure as closely as possible.
- Use the same color palette, spacing, and typography patterns.
- Key reference files:
  - `Dashboard/Dashboard.tsx` - Main portfolio view layout
  - `StocksList/StocksList.tsx` - Holdings table design
  - `StockDetail/` - Stock detail page patterns
  - `shared/` - Reusable UI components (Typography, Button, etc.)
- The goal is visual consistency with portfolio-tracker while using the new tech stack (Tailwind + shadcn instead of plain CSS).

## Tech Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Recharts.
- **Backend:** Python 3.12, FastAPI, Pydantic, yfinance, Redis, Supabase (Postgres).
- **Tools:** Docker, Vitest (Frontend), Pytest (Backend).

## Core Principles

### 1. Architecture: Smart Backend, Dumb UI

- **Backend Driven:** All complex calculations (scores, technical analysis, aggregations) MUST happen on the backend in Python using Pandas/NumPy.
- **Frontend Role:** The frontend is strictly for presentation and user interaction. Do not calculate financial indicators in JavaScript.
- **Data Fetching:** ALWAYS use the Proxy Pattern. The frontend NEVER calls external APIs (Yahoo/Finnhub) directly. It calls the FastAPI backend.

### 2. Data Strategy (Anti-Rate-Limit)

- **Batching:** When fetching data for lists (tickers, portfolio), ALWAYS use batch endpoints (e.g., `POST /api/market/batch-quotes`). Never fire parallel individual requests.
- **Caching:** Significant market data must be cached in Redis with appropriate TTL (e.g., prices: 60s, fundamentals: 24h).

### 3. UI/UX & Design System ("DeepStock One")

**Core Philosophy:** "Transactions & Portfolio First". The app is a tool for managing wealth, not a news reader.

**Style Guide:**

- **Framework:** `shadcn/ui` + `Tailwind CSS`.
- **Theme:** Dark Mode Default (`zinc-950` backgrounds).
- **Typography:** Sans-serif for UI, Monospace (`Geist Mono`) for all financial data/prices.
- **Colors:**
  - Standard: `text-zinc-100` (primary), `text-zinc-400` (muted).
  - Sentiment: `text-emerald-500` (positive), `text-rose-500` (negative).

**IMPORTANT - No Cards on Desktop:**

- Do NOT wrap content sections in `Card` components for desktop web views.
- Use simple `div` with headings and proper spacing instead.
- Cards are acceptable ONLY for mobile-specific card layouts or truly isolated widgets.
- Prefer flat, clean layouts with clear visual hierarchy using typography and spacing.

**Navigation Structure:**

- **Mobile:** Bottom Navigation Bar.
  - Items: `[Domů]`, `[Portfolio]`, `[FAB (+)]`, `[Výzkum]`, `[Menu]`.
  - **The Super FAB (+):** A central floating action button that opens a drawer to quickly add:
    - Stock Buy/Sell
    - Option Trade
    - Cash Transaction
- **Desktop:** Fixed Left Sidebar with "Nová transakce" button at the top.

**Key Views:**

1.  **Dashboard (Přehled):**
    - Net Worth + Daily P/L (Large, Prominent).
    - Holdings Table with sorting.
    - Open Lots ranking.

2.  **Portfolio List:**
    - Segmented Control: `[Akcie] | [Opce] | [Hotovost]`.
    - **Stock Cards (Mobile):** Ticker, Name, Price, Shares, Total P/L.
    - **Option Cards (Mobile):** Contract Name (Strike/Exp), ITM/OTM Status indicator, Days Left, P/L.

3.  **Stock Detail (Prioritní pohled):**
    - **Header:** Price + Interactive Chart (using `Recharts`).
    - **Your Position Card:** Avg Cost, Current Value, Unrealized P/L, Realized P/L.
    - **Open Lots:** Individual purchase lots for this ticker.
    - **History List:** Clean timeline of all transactions for this specific asset.
    - **Stats:** Minimalist grid of key data (Mkt Cap, P/E, Yield).

4.  **Research & Watchlists:**
    - Unified Search Bar.
    - Watchlists displayed as clean lists with "Target Price" indicators.

### 4. Coding Standards

**Python (Backend):**

- Use Type Hints strictly (`def func(a: int) -> str:`).
- Use Pydantic schemas for all API inputs/outputs.
- Errors must be handled gracefully with standard HTTP codes.
- Logic related to money/finance must handle floating point precision correctly (use Decimal where appropriate).

**TypeScript (Frontend):**

- No `any`. Define strict interfaces for API responses.
- Use `useQuery` for all server state.
- Components should be small, functional, and composed.

## UI Components - MANDATORY shadcn/ui Usage

**CRITICAL: ALWAYS use shadcn/ui components. NEVER create custom components if shadcn has one.**

### Available Components (use ONLY these):

| Category       | Components                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------- |
| **Layout**     | `Card`, `Separator`, `ScrollArea`, `Sheet`, `Dialog`                                         |
| **Navigation** | `Tabs`, `DropdownMenu`, `Command` (for search)                                               |
| **Forms**      | `Button`, `Input`, `Textarea`, `Label`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Form` |
| **Display**    | `Table`, `Badge`, `Avatar`, `Skeleton`, `Alert`, `Tooltip`                                   |
| **Controls**   | `Toggle`, `ToggleGroup`, `Popover`                                                           |

### Forbidden Patterns (NEVER do this):

```tsx
// ❌ WRONG - Custom elements
<div className="rounded-lg border p-4">...</div>  // Use Card
<div className="flex gap-2">                      // Use ToggleGroup for segmented controls
  <button onClick={...}>Tab 1</button>
  <button onClick={...}>Tab 2</button>
</div>
<input type="text" className="..." />             // Use Input
<span className="text-xs bg-green-500 px-2 rounded">BUY</span>  // Use Badge

// ✅ CORRECT - shadcn components
<Card><CardContent>...</CardContent></Card>
<ToggleGroup type="single" value={tab} onValueChange={setTab}>
  <ToggleGroupItem value="tab1">Tab 1</ToggleGroupItem>
  <ToggleGroupItem value="tab2">Tab 2</ToggleGroupItem>
</ToggleGroup>
<Input type="text" placeholder="..." />
<Badge variant="default">BUY</Badge>
```

### Component Usage Rules:

1. **Cards:** ALWAYS use `Card` + `CardHeader` + `CardContent` for any boxed content
2. **Buttons:** ALWAYS use `Button` with proper `variant` (default, outline, ghost, destructive)
3. **Forms:** ALWAYS use `Label` + `Input`/`Select`/`Textarea` combo
4. **Tables:** ALWAYS use `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`
5. **Tabs:** Use `Tabs` for page sections, `ToggleGroup` for inline segment controls
6. **Modals:** Use `Dialog` for confirmations, `Sheet` for side panels/drawers
7. **Loading:** Use `Skeleton` for loading states, never custom spinners
8. **Tooltips:** Use `Tooltip` + `TooltipTrigger` + `TooltipContent`
9. **Dropdowns:** Use `DropdownMenu` for menus, `Select` for form selects
10. **Search:** Use `Command` (cmdk) for search/command palettes

### Import Pattern:

```tsx
// Always import from @/components/ui/
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
```

### Before Creating ANY UI:

1. Check if shadcn has the component: https://ui.shadcn.com/docs/components
2. If not installed, run: `npx shadcn@latest add <component-name>`
3. Only create custom components for domain-specific things (e.g., `HoldingsTable`, `StockChart`)

## Project Structure

- `/backend`: FastAPI application.
- `/frontend`: React application.

## Feature Scope (What to Build vs Ignore)

- **Must Have (Core):**
  - **Transaction Management:** Adding/Editing Stock & Options (Calls/Puts).
  - **Portfolio Tracking:** Cost basis calculation, Realized/Unrealized P/L.
  - **Research:** Price lookups, basic stats via `yfinance`.
  - **Watchlists:** Multiple named lists.
  - **Option Support:** Tracking expiry, strike, delta (if avail).

- **Nice to Have (Later):**
  - Analysis Scores.
  - Price Alerts.

- **Out of Scope (Ignore):**
  - News Feeds.
  - Social Sentiment.
  - Automated Trading.
  - Complex "Tracker" Kanban boards.

## Testing Strategy

- **Backend:** Unit tests for all scoring algorithms and API endpoints using `pytest`.
- **Frontend:** Component tests for critical UI elements using `vitest`.

## Data Fetching & Caching (React Query)

**CRITICAL: All server state MUST use React Query (TanStack Query). NEVER use useState + useEffect for data fetching.**

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      React Components                        │
│  (Dashboard, StockDetail, WatchlistsPage, StocksManager)    │
└─────────────────────────┬───────────────────────────────────┘
                          │ uses hooks
┌─────────────────────────▼───────────────────────────────────┐
│                    Custom React Query Hooks                  │
│  useQuotes, useHoldings, useStocks, useWatchlists, etc.     │
└─────────────────────────┬───────────────────────────────────┘
                          │ uses
┌─────────────────────────▼───────────────────────────────────┐
│                   QueryClient (shared cache)                 │
│  staleTime: 5min, gcTime: 30min, refetchOnWindowFocus: false│
└─────────────────────────┬───────────────────────────────────┘
                          │ calls
┌─────────────────────────▼───────────────────────────────────┐
│                      API Functions                           │
│  fetchQuotes, fetchHoldings, fetchStocks (in lib/api.ts)    │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP
┌─────────────────────────▼───────────────────────────────────┐
│                    FastAPI Backend                           │
│  /api/market/batch-quotes, /api/portfolio/:id/holdings      │
└─────────────────────────────────────────────────────────────┘
```

### Query Client Configuration (`lib/queryClient.ts`)

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - cache retention
      refetchOnWindowFocus: false, // No annoying refetches
      retry: 1, // Retry once on failure
      placeholderData: (prev) => prev, // Keep previous data while fetching
    },
  },
});
```

### Query Keys Factory (`queryKeys` object)

**ALWAYS use `queryKeys` for consistent cache keys:**

```typescript
import { queryKeys } from '@/lib/queryClient';

// Examples:
queryKeys.quotes(['AAPL', 'MSFT']); // ['quotes', 'AAPL,MSFT']
queryKeys.holdings('portfolio-uuid'); // ['holdings', 'portfolio-uuid']
queryKeys.watchlists(); // ['watchlists']
queryKeys.stock('AAPL'); // ['stock', 'AAPL']
```

### Available Hooks (`/frontend/src/hooks/`)

| Hook                           | Purpose                   | Stale Time |
| ------------------------------ | ------------------------- | ---------- |
| `useQuotes(tickers[])`         | Batch fetch stock quotes  | 1 min      |
| `useHoldings(portfolioId)`     | Portfolio holdings        | 2 min      |
| `useOpenLots(portfolioId)`     | Open lots for a portfolio | 2 min      |
| `usePortfolios()`              | User's portfolios list    | 10 min     |
| `useStocks()`                  | All stocks (master data)  | 10 min     |
| `useStock(ticker)`             | Single stock details      | 10 min     |
| `useTransactions(portfolioId)` | Transaction history       | 2 min      |
| `useWatchlists()`              | Watchlist list            | 5 min      |
| `useWatchlistItems(id)`        | Items in a watchlist      | 5 min      |
| `useExchangeRates()`           | Currency exchange rates   | 30 min     |

### Mutation Hooks (for CRUD operations)

```typescript
// Each resource has mutation hooks:
const createMutation = useCreateStock();
const updateMutation = useUpdateStock();
const deleteMutation = useDeleteStock();

// Usage:
await createMutation.mutateAsync(data);
await updateMutation.mutateAsync({ id, data });
await deleteMutation.mutateAsync(id);
```

**Mutations automatically invalidate related queries** - no manual refresh needed after create/update/delete.

### Pattern: Component Data Fetching

```tsx
// ✅ CORRECT - Use React Query hooks
function StockDetail({ ticker }: { ticker: string }) {
  const { data: stock, isLoading, error } = useStock(ticker);
  const { data: quotes = {} } = useQuotes([ticker]);

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      {stock.name}: {quotes[ticker]?.price}
    </div>
  );
}

// ❌ WRONG - Never use useState + useEffect for server data
function StockDetail({ ticker }: { ticker: string }) {
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStock(ticker)
      .then(setStock)
      .finally(() => setLoading(false));
  }, [ticker]);
  // DON'T DO THIS!
}
```

### Pattern: Manual Refresh

```tsx
import { useQueryClient } from '@tanstack/react-query';

function MyComponent() {
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['stocks'] });
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
  };

  return <Button onClick={handleRefresh}>Obnovit</Button>;
}
```

### PortfolioContext Integration

`PortfolioContext` internally uses React Query hooks but exposes a simple API for backward compatibility:

```tsx
const { holdings, quotes, rates, loading, refresh } = usePortfolio();
```

The `refresh()` function invalidates all portfolio-related queries.

## Shared UI Components

### PageHeader Component (`/components/shared/PageHeader.tsx`)

**ALWAYS use `PageHeader` for page titles with refresh functionality.**

```tsx
import { PageHeader } from '@/components/shared/PageHeader';

function MyPage() {
  const queryClient = useQueryClient();
  const { isLoading } = useMyData();

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Název stránky"
        subtitle="Volitelný podtitulek"
        onRefresh={() =>
          queryClient.invalidateQueries({ queryKey: ['myData'] })
        }
        isRefreshing={isLoading}
        actions={
          <Button onClick={openDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Přidat
          </Button>
        }
      />

      {/* Page content */}
    </div>
  );
}
```

**Props:**

- `title` (required): Page heading (h1)
- `subtitle`: Optional secondary text
- `onRefresh`: Callback for refresh button (shows RefreshCw icon)
- `isRefreshing`: Shows spinning animation on refresh icon
- `lastUpdated`: Timestamp text (hidden on mobile)
- `actions`: Custom buttons/actions on the right side

### Page Layout Pattern

**All pages MUST follow this layout structure:**

```tsx
return (
  <div className="space-y-6 pb-12">
    <PageHeader title="..." onRefresh={...} actions={...} />

    {/* Loading state */}
    {isLoading && <Skeleton />}

    {/* Error state */}
    {error && <Alert variant="destructive">...</Alert>}

    {/* Content */}
    {data && <Content data={data} />}
  </div>
);
```

**Key CSS classes:**

- `space-y-6` - Consistent vertical spacing between sections
- `pb-12` - Bottom padding for mobile navigation bar
- NO `p-4 md:p-6` on page wrappers (AppLayout handles padding)
