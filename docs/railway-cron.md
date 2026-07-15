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

The old GitHub schedule also ran two Hong Kong market checks at `0 2 * * 1-5`
and `30 7 * * 1-5`. If Railway does not support multiple schedules on one
cron service, create extra Railway cron services with the same start command
for each HK schedule that should remain active.

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
```

Do not run live alert jobs against production unless sending notifications is
intended.
