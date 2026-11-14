# ADR 0001: Run the whole of Loupe on Vercel

Date: 2026-11-14 · Status: accepted

## Context

The spec (§3–4) describes a FastAPI API service, Redis queue + pub/sub, Python workers, Postgres and S3-compatible storage, deployed to a VPS or Fly/Railway. We want to use the Vercel account we already have, including its marketplace integrations (Neon, Upstash) and included Hobby-plan usage.

## Decision

| Spec component | Vercel equivalent | Notes |
|---|---|---|
| FastAPI API service | Next.js route handlers under `/api/v1` | Same language as the UI; one deploy. Auth/rate limits added in Phase 5. |
| Redis queue + Python workers | **Workflow SDK** (`workflow` npm, `'use workflow'` / `'use step'`) | Durable, retried, each step can time out independently. Vercel World provides storage/queue/observability with zero config. |
| Redis pub/sub → SSE | Workflow run stream (`getWritable` / `run.getReadable`) → SSE route | Redis-backed on Vercel. Resumable by index. No Upstash needed for progress. |
| Python forensics code | **Python runtime** on a second project (`services/checks`) | FastAPI is a first-class framework there. 250 MB bundle cap: Pillow/numpy/c2pa fit; torch does not. |
| Postgres | Neon (installed) | Drizzle + HTTP driver suits serverless. |
| MinIO / S3 | Vercel Blob (private) | Client uploads straight from the browser; the API never proxies bytes. |
| Scheduled retention job | Vercel Cron | Hobby allows daily; that matches 24-hour retention. |
| LLM for claims (Phase 3) | AI Gateway | Later. |
| GPU detectors (Phase 4) | Not on Vercel | External adapter (Modal / RunPod / HF Inference) behind the same `Check` interface. |

## Consequences

- **Good:** no servers, no queue to run, built-in run observability, preview deployments per branch, everything in one `git push`.
- **Good:** the adapter boundary (`lib/checks-client.ts` ↔ `services/checks`) is HTTP, so heavy checks can move to a GPU host without touching the pipeline.
- **Trade-off:** each check is a separate HTTP call and a separate workflow step; a job with 6 checks is ~8 function invocations. Fine at MVP scale; batch checks per step if invocation counts matter.
- **Trade-off:** `exiftool` is not available in the Python runtime. Pillow's EXIF reader covers the camera-consistency checks; add `exifread` if a tag is missing.
- **Trade-off:** the Python Workflow SDK is beta, so orchestration stays in TypeScript and Python stays stateless.
- **Must do:** tick "Enable access to System Environment Variables" on the web project or the Workflow SDK silently falls back to the filesystem world and every run fails.
- **Must do:** enable `supportsCancellation` on the SSE route (done in `vercel.json`) so abandoned tabs do not hold functions open.

## Upstash

Installed but unused in Phase 0. Planned uses: per-IP / per-phone rate limits (Phase 3), perceptual-hash cache lookups if Postgres proves slow.
