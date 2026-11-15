# Loupe

Loupe checks whether an image (then documents, claims, audio and video) can be trusted, and shows its working. It never returns a bare "real" or "fake": it returns a **verdict with evidence**, and says "inconclusive" when that is the honest answer.

The full product spec is in `docs/spec.md`. This README is the build guide.

## Architecture on Vercel

| Concern | Choice |
|---|---|
| Web app + API | `apps/web` — Next.js 16 App Router, one Vercel project (`loupe`) |
| Pipeline orchestration | **Vercel Workflow SDK** (`workflows/analyze.ts`): one durable step per check, parallel, retried, per-check timeouts |
| Live progress (SSE) | The workflow writes `JobEvent`s to its own durable stream; `/api/v1/jobs/{id}/stream` forwards it as Server-Sent Events. Reconnect with `Last-Event-ID`. |
| Forensics | `services/checks` — FastAPI on Vercel's Python runtime, second Vercel project (`loupe-checks`). One endpoint per check. |
| Database | Neon Postgres (Drizzle ORM, HTTP driver) |
| File storage | Vercel Blob, private store, browser → Blob client uploads |
| Retention | Vercel Cron, daily, deletes expired anonymous uploads and everything derived |
| Shared types | `packages/schema` — Zod is the source of truth; `services/checks/loupe_checks/schemas.py` mirrors it |

Read `docs/decisions/0001-vercel-architecture.md` for why.

## Repository

```
apps/web/                 Next.js app (UI, API routes, workflow)
  app/                    routes: /, /check/[jobId], /r/[shareId], /how-it-works, /dev/sheet, /api/v1/*
  components/             proof-sheet, verdict, evidence, upload, buttons
  lib/                    checks registry, aggregate (scoring), db (drizzle), checks-client (adapter)
  workflows/analyze.ts    the pipeline
packages/schema/          Signal, Verdict, Report, JobEvent (Zod)
services/checks/          Python checks service (FastAPI); receives a signed per-file URL, never a Blob token
docs/                     spec, decisions, privacy (to write before launch)
eval/                     your own labelled evaluation set + results (start on day one)
infra/compose.yml         local Postgres
```

## Local setup

Prerequisites: Node 22, pnpm 10, Python 3.12, [uv](https://docs.astral.sh/uv/), Docker (for local Postgres) or a Neon branch URL.

```bash
pnpm install

# database: either docker…
docker compose -f infra/compose.yml up -d
# …or paste a Neon URL into apps/web/.env.local
cp apps/web/.env.example apps/web/.env.local
cd apps/web && pnpm db:push && cd ../..

# Python checks service (terminal 1)
cd services/checks && cp .env.example .env && uv sync --extra dev
uv run uvicorn loupe_checks.main:app --reload --port 8100

# web (terminal 2)
pnpm dev
# open http://localhost:3000
# workflow inspector: cd apps/web && pnpm workflow:web
```

Without the Python service, set `CHECKS_MODE=fake` in `apps/web/.env.local` to stream synthetic signals.
Without a database at all, `http://localhost:3000/dev/sheet` plays the developing sequence from fixtures.

Local uploads need a `BLOB_READ_WRITE_TOKEN`; create a Blob store on the Vercel project and `vercel env pull apps/web/.env.local`.

## Deploy

Two Vercel projects from this one repo:

1. **loupe** (web): Root Directory `apps/web`, framework Next.js.
   - Storage tab → add **Blob** (private) and connect **Neon**; both inject their env vars.
   - Settings → Environment Variables → tick **Enable access to System Environment Variables** (the Workflow SDK needs `VERCEL_DEPLOYMENT_ID`).
   - Add `CHECKS_URL`, `CHECKS_SHARED_SECRET`, `CRON_SECRET`.
2. **loupe-checks** (Python): Root Directory `services/checks`, framework "Other".
   - Add `LOUPE_SHARED_SECRET` (same value as `CHECKS_SHARED_SECRET`). No Blob token: each job passes a 20-minute signed URL for one file.

Production builds apply `apps/web/drizzle/` migrations automatically (`scripts/migrate.mjs`); preview builds never migrate.

## Tests

```bash
pnpm -r typecheck && pnpm -r lint
cd services/checks && uv run pytest
```

## Phase status

- [x] Phase 0: repo, schema, tokens, Frame / Develop button / Verdict plate, workflow streaming real signals to the grid
- [ ] Phase 1: images — reverse search adapter, two detector adapters, calibration from `eval/`, retention tested end to end
- [ ] Phase 2: documents · Phase 3: claims + WhatsApp · Phase 4: audio/video (GPU adapter) · Phase 5: accounts, API keys, teams
