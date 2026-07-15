<img src="docs/social-preview.svg" alt="DeepStock" width="100%" />

# DeepStock

Personal investing workstation for portfolio management, stock and options tracking, AI analysis, and alerting. One place for the full investing workflow — from monitoring to decision-making to record-keeping.

## Architecture

| Layer    | Stack                                                        |
| -------- | ------------------------------------------------------------ |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, TanStack Router |
| Backend  | Python 3.12, FastAPI, Pydantic v2                            |
| Data     | Supabase (PostgreSQL + Auth), Redis (cache)                  |
| AI       | Claude Sonnet via LiteLLM, Tavily (web search)               |
| Infra    | Docker Compose (backend + Redis), Vite dev server (frontend) |

Core investing, accounting, and portfolio logic lives in the backend. The frontend is primarily a presentation and workflow layer that talks to FastAPI, with a few UI-local utilities and embeds where the UX depends on them.

## Running

```bash
# Backend + Redis
docker compose up -d

# Frontend
cd frontend && npm run dev
```

## Verify

```bash
make verify
```

Runs the standard repository verification flow:
- `frontend`: `npm run lint` and `npm run build`
- `backend`: `python3 -m pytest`

## Conventions & patterns

See [CLAUDE.md](CLAUDE.md) — code conventions, frontend patterns, backend patterns, key file locations.

## Domain map

See [docs/source-of-truth.md](docs/source-of-truth.md) — authoritative locations for domain truths (holdings, snapshot, accounting, performance, transactions).

## Operations

See [docs/railway-cron.md](docs/railway-cron.md) for Railway scheduled job commands and schedules.
