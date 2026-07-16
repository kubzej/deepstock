# Railway Cron Jobs

DeepStock scheduled jobs run as short-lived Railway cron services using the
backend image/source. They call the backend job runner directly; there are no
public `/api/cron/*` endpoints and no GitHub Actions cron workflows.

Railway cron schedules are UTC. Do not put a cron schedule on the long-running
FastAPI web service, because it starts `uvicorn` and does not exit.

## Scheduled Services

| Railway service | Start command | Schedule |
| --- | --- | --- |
| `price-target-alerts` | `python -m app.jobs.runner price-target-alerts` | `*/10 7-21 * * 1-5` |
| `custom-price-alerts` | `python -m app.jobs.runner custom-price-alerts` | `*/10 7-21 * * 1-5` |
| `earnings-alerts` | `python -m app.jobs.runner earnings-alerts` | `0 8 * * 1-5` |
| `daily-news-briefing` | `python -m app.jobs.runner daily-news-briefing` | `0 14 * * 1-5` |

`daily-news-briefing` targets roughly 16:00 Prague during summer time. Railway
cron is UTC-only, so adjust the Railway schedule manually for winter time if an
exact 16:00 Europe/Prague delivery time matters.

## Daily News Briefing Setup

Create `daily-news-briefing` as a separate short-lived Railway service that uses
the same backend image/source as the FastAPI service. The service must run the
job command above and exit after one run; do not run it through the web service.

The job generates reports only for users with daily briefing generation enabled
in DeepStock settings. Push delivery also requires a browser push subscription
and the dedicated `Denní briefing` notification toggle.

Required environment:

- normal backend Supabase/Redis environment variables
- `ANTHROPIC_API_KEY`
- `MARKETAUX_API_KEY`
- `SEC_USER_AGENT`, e.g. `DeepStock daily briefing you@example.com`
- VAPID variables if push notifications should be delivered

Marketaux defaults are intentionally conservative and fit the free/base request
budget:

```env
MARKETAUX_SYMBOLS_PER_REQUEST=1
MARKETAUX_ARTICLES_PER_REQUEST=3
MARKETAUX_REQUEST_DELAY_SECONDS=2
MARKETAUX_MAX_RETRIES=4
MARKETAUX_RETRY_BACKOFF_SECONDS=30
```

Keep those defaults unless the Marketaux plan allows a higher throughput. Raising
`MARKETAUX_SYMBOLS_PER_REQUEST` batches tickers into one request, but the article
limit is shared across the whole batch, so use it carefully for ticker coverage.

Hong Kong tickers are included in the normal alert jobs. The schedule does not
run during Hong Kong market hours; the first `07:00 UTC` run checks any HK
tickers after their session, which is intentional for the current alerting
workflow.

## Manual Maintenance Commands

These commands are intentionally CLI-only and unscheduled:

```bash
python -m app.jobs.runner refresh-earnings-calendar
python -m app.jobs.runner refresh-earnings-calendar-force
python -m app.jobs.runner cleanup-earnings-calendar
```

Use `refresh-earnings-calendar-force` for backfills after provider/schema bugs
or deploys that require all watchlist earnings dates to be refreshed. Use
`cleanup-earnings-calendar` to remove cached earnings rows for stocks no longer
present in any watchlist.

## Local Smoke Check

From the backend directory:

```bash
python -m app.jobs.runner --help
python -m app.jobs.runner daily-news-briefing
```

Do not run live alert or daily briefing jobs against production unless sending
notifications is intended.
