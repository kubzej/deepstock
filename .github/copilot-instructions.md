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
