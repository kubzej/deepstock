# DeepStock - AI Coding Instructions

You are an expert Full-Stack Developer working on **DeepStock**, a next-generation portfolio tracker and analysis tool.

## Tech Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Recharts.
- **Backend:** Python 3.12, FastAPI, Pydantic, yfinance, Redis, Supabase (Postgres).
- **Tools:** Docker, Vitest (Frontend), Pytest (Backend).

## Core Principles

### 1. Architecture: Smart Header, Dumb UI

- **Backend Driven:** All complex calculations (scores, technical analysis, aggregations) MUST happen on the backend in Python using Pandas/NumPy.
- **Frontend Role:** The frontend is strictly for presentation and user interaction. Do not calculate financial indicators in JavaScript.
- **Data Fetching:** ALWAYS use the Proxy Pattern. The frontend NEVER calls internal APIs (Yahoo/Finnhub) directly. It calls the FastAPI backend.

### 2. Data Strategy (Anti-Rate-Limit)

- **Batching:** When fetching data for lists (tickers, portfolio), ALWAYS use batch endpoints (e.g., `POST /api/market/batch-quotes`). Never fire parallel individual requests.
- **Caching:** Significant market data must be cached in Redis with appropriate TTL (e.g., prices: 60s, fundamentals: 24h).

### 3. UI/UX & Design System

- **Mobile First:** All UI components must be designed for mobile screens first, then scaled up to desktop. Use standard touch targets (44px+).
- **Components:** strict adherence to `shadcn/ui`. Do not invent new styles if a tailored component exists.
- **Dark Mode:** The app is Dark Mode default.

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
- `/shared`: (Optional) Shared types if using a monorepo tooling.

## Testing Strategy

- **Backend:** Unit tests for all scoring algorithms and API endpoints using `pytest`.
- **Frontend:** Component tests for critical UI elements using `vitest`.

## Specific Modules

- **Market Data:** via `yfinance` with caching.
- **Auth:** Supabase Auth (JWT forwarded to Backend).
- **Database:** Supabase Postgres (accessed via Backend or strictly controlled RLS on Frontend).
