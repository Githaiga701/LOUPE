# Loupe: build spec for an authenticity verification tool

Working name: **Loupe** (a jeweller's magnifier: look closely, then say what you see).
Rename freely. Everything below is written so you can start a repo today.

---

## 1. What it is

Loupe checks whether an image, video, audio clip, document or news claim can be trusted, and shows its working. It never returns a bare "real" or "fake". It returns a **verdict with evidence**, and it says "inconclusive" when that is the honest answer.

**Primary user:** journalists, fact-checkers, HR and compliance staff, and ordinary people who received something suspicious on WhatsApp.

**Primary job:** in under a minute, tell the user what is known about a file, what is suspicious, and what to do next.

### Scope by phase

| Phase | Adds | Why this order |
|---|---|---|
| 1 | Images | Best-supported tooling, fastest feedback loop |
| 2 | Documents (PDF, scans, IDs, certificates) | Issuer verification is high value and mostly deterministic |
| 3 | News claims + WhatsApp bot | Where real users already are |
| 4 | Audio and video | Hardest, most expensive, needs the earlier layers |
| 5 | Teams, API keys, audit exports | Revenue and trust |

### Non-goals

- Proving that something is *true*. Loupe can say a photo is unedited; it cannot say the event it shows happened as described.
- Detecting AI-written text. These detectors produce false accusations. Skip them.
- A single "fake score" model. The product is a layered pipeline.

---

## 2. Principles that shape every decision

1. **Provenance before detection.** Signed origin beats guessing from pixels. Detection is the fallback.
2. **Show the evidence.** Every conclusion links to the signals behind it.
3. **Three honest outcomes.** Likely authentic, inconclusive, likely manipulated. Inconclusive is a first-class result, not an error.
4. **Calibrated confidence.** A "90% confident" label must be right about 90% of the time on your own test data.
5. **Degrade gracefully.** If a detector times out, the report still ships with that check marked "not run".
6. **Privacy by default.** Anonymous uploads are deleted after 24 hours unless the user saves them.
7. **Plain language.** No jargon without a one-line explanation beside it.

---

## 3. System architecture

```
                    ┌────────────────────────────┐
  Web app (Next.js) │  WhatsApp bot (webhook)    │  Public API (API keys)
          │         └─────────────┬──────────────┘          │
          └───────────────┬───────┴───────────────┬─────────┘
                          ▼                       ▼
                 ┌──────────────────────────────────────┐
                 │  API service (FastAPI)               │
                 │  auth, upload, job create, SSE       │
                 └───────┬───────────────┬──────────────┘
                         │               │
              ┌──────────▼───┐    ┌──────▼────────┐
              │ Postgres     │    │ Object store  │
              │ jobs, signals│    │ (S3 / R2)     │
              │ reports      │    │ uploads, maps │
              └──────────────┘    └──────▲────────┘
                         ▲               │
                 ┌───────┴──────┐        │
                 │ Redis (queue │        │
                 │ + pub/sub)   │        │
                 └───────┬──────┘        │
                         ▼               │
         ┌───────────────────────────────┴────────────┐
         │ Workers (Python)                           │
         │  ingest → provenance → forensics →         │
         │  detectors → context → aggregate → report  │
         └──────────┬────────────────────┬────────────┘
                    ▼                    ▼
           Local models (ONNX/PyTorch)  External APIs
                                        (reverse search, fact-check,
                                         commercial detectors, LLM)
```

**Flow:** the client uploads a file, the API stores it and creates a job, a worker runs the pipeline stage by stage, each finished stage publishes a `signal` event over Redis, and the API streams those events to the browser via Server-Sent Events. The UI "develops" each check live (see section 9).

---

## 4. Tech stack

### Frontend

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | SSR for shareable report pages and link previews |
| Styling | **Tailwind CSS** with CSS variables for tokens | Tokens in section 9 |
| Components | **Radix UI primitives** (headless) | Accessible dialogs, tabs, tooltips; all visuals are custom |
| Motion | **Motion (formerly Framer Motion)** | For the contact sheet development sequence |
| Data | **TanStack Query** + native `EventSource` | SSE for live stage updates |
| Forms/upload | **react-dropzone**, **tus-js-client** (resumable) | Large videos on bad connections |
| Image inspection | **OpenSeadragon** or a custom canvas viewer | Zoom, pan, heatmap overlay |
| Charts | Custom SVG | Few charts; keep them hand-built |
| i18n | **next-intl** | Plan for Swahili and French early |
| Testing | **Vitest**, **Playwright**, **Storybook** | Storybook doubles as the design system reference |

### Backend

| Concern | Choice | Notes |
|---|---|---|
| API | **FastAPI** (Python) | Same language as the ML code |
| Validation | **Pydantic v2** | Shared result schema |
| Queue | **Dramatiq** or **Arq** with Redis | Simple, reliable; move to Celery or Temporal only if needed |
| Database | **PostgreSQL** + **SQLAlchemy 2** + **Alembic** | |
| Object storage | **S3-compatible**: MinIO locally, Cloudflare R2 or S3 in production | Presigned uploads |
| Live updates | **SSE** (`sse-starlette`) | Simpler than WebSockets for one-way progress |
| Auth | Anonymous with rate limits first; then **Auth.js** or **Clerk** | API keys for the public API |
| Rate limiting | `slowapi` or Redis token bucket | |
| Observability | **OpenTelemetry**, **Sentry**, structured JSON logs | Trace each job across stages |

### Analysis libraries and services

| Area | Tools |
|---|---|
| Provenance | `c2pa-python` / `c2patool` (Content Credentials), `exiftool` (metadata) |
| Image forensics | `Pillow`, `OpenCV`, `imagehash` (perceptual hashing), error level analysis, JPEG quantization table checks, noise residual analysis |
| Image detectors | Evaluate several open models from Hugging Face (check each licence); optionally a commercial API (Hive, Sightengine, Reality Defender and similar). **Check current availability and pricing before committing.** |
| Reverse search | TinEye API, Google Vision web detection, or a SERP provider with image search |
| Video | `ffmpeg` for frame sampling, `insightface` or `mediapipe` for faces, SyncNet-style lip-sync scoring, temporal consistency checks |
| Audio | `librosa`, `torchaudio`, anti-spoofing models in the AASIST / RawNet2 family, trained or evaluated on ASVspoof data |
| PDF / documents | `PyMuPDF`, `pikepdf`, `pdfplumber`, **`pyHanko`** (verify PDF digital signatures) |
| OCR | `Tesseract` or `PaddleOCR`; QR/barcodes via `zxing-cpp` or `pyzbar` |
| Claims | Google Fact Check Tools API (ClaimReview), an LLM with web retrieval for evidence gathering |
| Model serving | **ONNX Runtime** for CPU-friendly inference; **PyTorch** on a GPU worker only for video and audio |

### Infrastructure

- **Docker Compose** for local development (api, worker, redis, postgres, minio, web).
- **Hosting:** start with one small VPS or Fly.io/Railway for API and CPU workers. Add a separate GPU worker (Modal, RunPod or a cloud GPU) only when video detection arrives.
- **CI:** GitHub Actions: lint, type-check, unit tests, build images, run the evaluation suite on a fixed sample.
- **Secrets:** environment variables in dev, a secrets manager in production.

---

## 5. Repository structure

```
loupe/
├── apps/
│   ├── web/                      # Next.js frontend
│   │   ├── app/
│   │   │   ├── (marketing)/page.tsx
│   │   │   ├── check/page.tsx            # upload screen
│   │   │   ├── check/[jobId]/page.tsx    # live analysis + report
│   │   │   ├── r/[shareId]/page.tsx      # public shared report
│   │   │   ├── history/page.tsx
│   │   │   └── api/                      # thin proxy routes only
│   │   ├── components/
│   │   │   ├── proof-sheet/              # ProofSheet, Frame, CropMarks
│   │   │   ├── verdict/                  # VerdictPlate, ConfidenceBar
│   │   │   ├── evidence/                 # EvidenceTile, EvidenceDrawer
│   │   │   ├── upload/                   # DropField, SourcePicker
│   │   │   ├── buttons/                  # DevelopButton, GhostButton
│   │   │   └── viewer/                   # ImageViewer, HeatmapLayer
│   │   ├── lib/                          # api client, sse hook, format utils
│   │   ├── styles/tokens.css
│   │   └── messages/                     # en.json, sw.json, fr.json
│   └── bot/                      # WhatsApp webhook service (FastAPI or Node)
│
├── services/
│   ├── api/
│   │   ├── loupe_api/
│   │   │   ├── main.py
│   │   │   ├── routes/ (uploads.py, jobs.py, reports.py, stream.py, keys.py)
│   │   │   ├── models/               # SQLAlchemy
│   │   │   ├── schemas/              # Pydantic (shared with workers)
│   │   │   ├── storage.py            # presigned URLs
│   │   │   └── settings.py
│   │   └── alembic/
│   └── worker/
│       ├── loupe_worker/
│       │   ├── pipeline/
│       │   │   ├── runner.py         # stage orchestration + timeouts
│       │   │   ├── ingest.py         # type sniffing, virus scan, normalise
│       │   │   ├── provenance.py     # C2PA, watermarks, issuer checks
│       │   │   ├── forensics/        # image.py, pdf.py, audio.py, video.py
│       │   │   ├── detectors/        # one adapter per model or API
│       │   │   ├── context.py        # reverse search, claim tracing
│       │   │   ├── aggregate.py      # scoring + verdict
│       │   │   └── explain.py        # plain-language summaries
│       │   ├── models/               # ONNX files, model cards, checksums
│       │   └── tasks.py
│       └── tests/
│
├── packages/
│   └── schema/                       # JSON Schema generated from Pydantic;
│                                     # TypeScript types generated from it
├── eval/
│   ├── datasets/                     # your own labelled real-world sample
│   ├── run_eval.py                   # metrics + calibration plots
│   └── reports/                      # saved results per model version
│
├── infra/ (docker/, compose.yml, deploy/)
├── docs/ (decisions/, model-cards/, privacy.md)
├── .github/workflows/
└── README.md
```

**Rule:** every detector or external service lives behind an adapter with the same interface, so you can swap or add one without touching the pipeline.

```python
class Check(Protocol):
    id: str                       # "image.c2pa", "image.detector.a"
    media_types: set[str]
    timeout_s: int
    async def run(self, item: MediaItem) -> Signal: ...
```

---

## 6. The analysis pipeline

Stages run in order. Cheap, deterministic checks run first; expensive models run last and can be skipped if earlier stages are decisive.

### 6.1 Ingest
- Sniff the real file type from magic bytes, not the extension.
- Enforce size and duration limits; scan for malware (ClamAV).
- Compute SHA-256 and a perceptual hash. If seen before, return the cached report and note that it has been checked before.
- Re-encode a working copy; **never modify the original**.
- Record whether the file looks like it passed through WhatsApp or a screenshot (recompression, stripped metadata, odd dimensions). This lowers confidence in later forensics and the report says so.

### 6.2 Provenance
- Read and cryptographically verify C2PA Content Credentials. Report who signed, what tool, and the edit history.
- Look for known AI-generator metadata tags and visible or invisible watermarks where a public detector exists.
- For documents: verify PDF digital signatures with pyHanko and follow QR codes or reference numbers to the issuer's record where an issuer integration exists.

### 6.3 Forensics

| Media | Checks |
|---|---|
| Image | EXIF consistency (camera model vs. dimensions vs. software), error level analysis, JPEG double-compression, noise residual inconsistencies, clone detection, lighting and shadow direction (experimental) |
| PDF | Incremental updates and hidden revisions, font substitutions mid-line, text drawn over text, image-over-text layers, producer and creation vs. modification date mismatches |
| Scanned doc | Template match against known layouts, OCR field cross-checks (date formats, ID checksum rules, name consistency), signature and stamp reuse across documents |
| Audio | Spectral artefacts, codec history, silence and breath patterns, anti-spoofing model score |
| Video | Frame sampling at a fixed interval, per-frame image checks, face region consistency, lip-sync scoring, temporal flicker, audio-video agreement |

### 6.4 Detectors
Run two or three independent detectors and compare. Disagreement is itself a signal and lowers confidence. Record the model name, version and licence in each signal.

### 6.5 Context
- Reverse image search for the earliest known appearance, previous captions, and different claimed locations.
- For claims: extract the specific statement, search existing fact-checks, gather evidence from trusted sources with an LLM using retrieval and **citations**, and keep a human review path for anything published as a verdict.
- Spread signals (optional later): account age, coordinated posting, recycled media.

### 6.6 Aggregate and explain
See sections 7 and 8.

---

## 7. Result schema

Every check emits a **Signal**. The report is a list of signals plus a verdict.

```json
{
  "job_id": "job_01J...",
  "media_type": "image",
  "verdict": {
    "label": "inconclusive",
    "confidence": 0.58,
    "summary": "No origin record was found. Two of three detectors flagged this image; one did not."
  },
  "signals": [
    {
      "id": "image.c2pa",
      "category": "provenance",
      "status": "not_found",
      "weight": "strong",
      "title": "Content Credentials",
      "plain": "This file carries no signed record of where it came from.",
      "detail": { "manifest": null },
      "ran_ms": 42
    },
    {
      "id": "image.reverse_search",
      "category": "context",
      "status": "warn",
      "weight": "medium",
      "title": "Earlier appearances",
      "plain": "A near-identical image was posted 14 months before the date claimed.",
      "detail": { "matches": [{ "url": "...", "first_seen": "2025-03-02" }] },
      "ran_ms": 3100
    }
  ],
  "limits": ["File was recompressed, which weakens pixel-level checks."],
  "versions": { "pipeline": "0.4.1", "detectors": { "a": "2026.09" } }
}
```

`status` is one of: `pass`, `warn`, `fail`, `not_found`, `not_run`, `error`.
`weight` is one of: `strong`, `medium`, `weak`.

---

## 8. Scoring and verdicts

1. **Hard rules first.**
   - Valid C2PA signature from a trusted issuer with no AI-generation assertion: leans authentic, but the report states exactly what that proves (origin and edit history, not truth).
   - Declared AI-generation assertion, or a broken signature on a file that claims one: leans manipulated.
   - Valid issuer-confirmed document: authentic.
2. **Weighted evidence otherwise.** Combine signal statuses and weights with a simple logistic model trained on your labelled set. Start with hand-set weights, then fit.
3. **Calibrate.** Apply isotonic or Platt calibration so confidence matches observed accuracy. Re-run on every model update.
4. **Inconclusive band.** If calibrated probability is between roughly 0.35 and 0.65, or detectors disagree strongly, or the file is heavily recompressed, return `inconclusive`. Tune the band from your evaluation data.
5. **Always include `limits`.** Anything that reduces confidence is stated, not hidden.

### Wording rules
- Say "likely", never "is".
- Say "no origin record found", not "fake".
- Never name or accuse a person.

---

## 9. Design system

### 9.1 Concept: the proof sheet

Photographers check film on a **contact sheet**: a grid of small square frames on a light table, marked up with crop marks and grease pencil. Loupe borrows that language because it matches the job (inspect closely, mark what matters) and gives the product its own face.

- The uploaded item sits in a large square **frame** with **crop marks** at the corners.
- Each check is a smaller square frame beside it.
- Checks **develop** like exposures: blank grey, then a gradual reveal into a result colour.
- The verdict arrives last on a **plate**, like a print pulled from the tray.

Spend the boldness here: the developing contact sheet is the one memorable moment. Everything else stays quiet.

### 9.2 Tokens

```css
:root {
  /* Surfaces: a light table, not paper */
  --table:      #E4E9EC;   /* page background */
  --frame:      #FFFFFF;   /* cards */
  --frame-dim:  #F2F5F6;   /* undeveloped / disabled frames */
  --rule:       #B6C1C8;   /* grid lines, crop marks */

  /* Ink */
  --ink:        #17212B;   /* primary text */
  --ink-soft:   #51606D;   /* secondary text */

  /* Verdict colours: print registration inks */
  --authentic:  #00828F;   /* cyan */
  --uncertain:  #F0B400;   /* yellow */
  --manipulated:#D6195B;   /* magenta */

  /* Focus and links */
  --focus:      #2B4EFF;

  --frame-size: clamp(148px, 22vw, 220px);
  --gap: 12px;
  --radius: 2px;           /* near-square; not a rounded SaaS card */
}

:root[data-theme="dark"] {
  --table:#10171D; --frame:#1A242D; --frame-dim:#141C23; --rule:#33424F;
  --ink:#E8EEF2;  --ink-soft:#9AAAB6;
  --authentic:#3CC3CF; --uncertain:#FFC933; --manipulated:#FF5C93;
}
```

Verdict colours always travel with an icon and a word. Never rely on colour alone.

### 9.3 Type

One family, used at two widths:

- **Archivo (variable, width axis)**.
  - Expanded width, heavy weight, for verdict words and page titles.
  - Normal width for body and interface text.
  - Tabular figures for numbers (timestamps, percentages, hashes).

No separate monospace for labels; use tabular Archivo and reserve a monospace only for hashes and raw metadata in the evidence drawer. Sentence case everywhere. No all-caps labels, no decorative eyebrows.

Scale (1.25 ratio): 13 / 16 / 20 / 25 / 31 / 39 / 61 px. Body line length under 70 characters.

### 9.4 Layout principles

- A strict square grid: frames are `--frame-size` squares. Everything snaps to it.
- Each frame has a **fixed corner structure**: result icon at top left, check name under it, one-line plain result at the bottom. Position is information; the user learns where to look.
- **Crop marks** are used for one purpose: they mark the frame currently under inspection (the one open in the drawer, or the upload during analysis). They are not decoration.
- Left-aligned text throughout.
- Two-column on desktop (item left, frames right). Single column on mobile, frames in a 2-up grid.

```
Desktop report
┌──────────────────────────────────────────────────────────┐
│ Loupe                                  History   Share   │
├──────────────────┬───────────────────────────────────────┤
│ ┌──────────────┐ │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│ ┌┘  uploaded   └┐│ │prov.│ │meta │ │ ELA │ │det A│       │
│ │    image      ││ └─────┘ └─────┘ └─────┘ └─────┘       │
│ │  (crop marks) ││ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│ └┐             ┌┘│ │det B│ │rev. │ │ ... │ │ ... │       │
│  └─────────────┘ │ └─────┘ └─────┘ └─────┘ └─────┘       │
│                  │                                       │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ VERDICT PLATE: Inconclusive.  58% confidence         │ │
│ │ One-paragraph summary. What to do next.              │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 9.5 Components

**Frame (check card)**
- Square. 1px `--rule` border, solid `--frame` fill, no soft shadow. On hover or focus: a hard 3px offset shadow in `--ink` at 12% (answers the user's action, not decoration).
- States: `queued` (dim fill, small dashes), `developing` (see below), `pass` / `warn` / `fail` / `not_found` / `not_run`, each with its own icon shape (circle check, triangle, square cross, open circle, dash) in addition to colour.
- Click or press Enter: opens the **Evidence drawer** and places crop marks on the frame.

**Evidence drawer**
- Slides from the right on desktop, from the bottom on mobile.
- Contents in order: plain-language result, why it matters (one sentence), the technical detail (collapsed), a visual (heatmap, metadata table, match list), and "How reliable is this check?" with a one-line honest note.

**Verdict plate**
- Wide, square-cornered block. The verdict word in Archivo Expanded ExtraBold, large, in the verdict colour on `--frame`, with a thick left bar in the same colour.
- Confidence shown as a **segmented bar of 20 squares**, filled to the calibrated value, with the inconclusive band visibly marked. Hovering a segment is not required; the number is always printed too.
- Beneath it: summary, "Limits of this check" list, and actions (Save report, Share link, Check another file).

**Develop button** (the primary action)
- Rectangular, solid `--ink` fill, `--frame` text.
- Idle: "Check this file".
- Pressed: the label changes to "Checking 3 of 7" and a lighter fill sweeps left to right in step with real completed stages (not a fake timer). Width never changes, so nothing jumps.
- Done: the fill turns to the verdict colour and the label reads "See result".
- Failed: the fill turns to `--manipulated`-tinted outline with "Check failed. Try again." and the button stays pressable.
- Disabled: `--frame-dim` with `--ink-soft` text and a tooltip that says why ("Add a file first").

**Drop field**
- A large square with dashed `--rule` border and crop marks that sit at the corners only while a file is dragged over it.
- Three source options under it, as square tiles: Upload a file, Paste a link, Paste a claim.
- Accepts paste from the clipboard and a share-sheet on mobile.

**Chips and toasts**
- Toasts reuse the action's own word: "Saved report" after "Save report".
- Errors say what happened and what to do, with no apology.

### 9.6 The developing sequence (loading screen)

This replaces a spinner. It is the one orchestrated motion in the product.

1. The uploaded item appears in the large frame with crop marks. A thin scan line moves once across it.
2. The grid of check frames appears **already laid out** (queued, dim) so nothing shifts later.
3. As each worker stage finishes, its frame **develops** over 600 to 900 ms: a grain texture fades out while the result colour and icon emerge from grey. Frames finish in whatever order the checks complete; that unevenness reads as real work.
4. Slow checks (reverse search, video) show a slow grain shimmer and a live caption under the grid: "Searching for earlier copies. This can take up to 30 seconds."
5. When the last frame develops, a beat of 400 ms, then the verdict plate slides up from the bottom of the grid.

Rules:
- Progress shown is real: driven by SSE stage events.
- If a check exceeds its timeout it flips to `not_run` with the reason ("Reverse search took too long") and the report still completes.
- `prefers-reduced-motion`: no scan line, no grain; frames simply swap state with a 150 ms cross-fade.
- The sequence must be usable with a screen reader: each completed check is announced in an `aria-live="polite"` region ("Content Credentials: none found").

### 9.7 Screens

1. **Home / check** *(landing and tool are the same page)*
   - Headline in Archivo Expanded: "Check what you were sent."
   - The drop field is the hero. A short line beneath: "Images, documents, audio, video and claims. You get the evidence, not just a score."
   - Below the fold: one worked example report (a real, static one) so people see the output before they upload.

2. **Analysing** — the developing sequence above.

3. **Report** — frames, verdict plate, drawer, actions. Shareable URL with a rendered preview image (Open Graph) showing the plate.

4. **Shared report (public)** — same layout, read-only, with originals hidden unless the owner chose to show them. A line at the top: "This report was made on [date] with pipeline [version]. Results can change as tools improve."

5. **History** — a contact-sheet grid of past checks as square thumbnails with a small verdict marker in the corner. Filter by verdict, type, date.

6. **Claim check** — input is a pasted claim or link. Output swaps frames for **source tiles** (each fact-check, original source, and supporting evidence as squares with outlet and date) and the plate states what was found, not a true/false ruling unless an established fact-check exists.

7. **Settings / API** — API keys, retention, language, theme.

### 9.8 Empty, error and edge states

| Situation | Message pattern |
|---|---|
| No file yet | "Drop a file here, paste a link, or paste a claim." |
| Unsupported type | "Loupe can't read .xyz files yet. Supported: JPG, PNG, WebP, HEIC, MP4, MOV, MP3, WAV, M4A, PDF." |
| File too large | "This file is 340 MB. The limit is 200 MB. Trim the clip or send a still frame." |
| All checks failed | "None of the checks could run. Your file wasn't saved. Try again in a minute." |
| Heavily recompressed | Verdict plate adds: "This file was compressed (likely by WhatsApp). Pixel checks are less reliable." |
| Report expired | "This report was deleted after 24 hours. Upload the file again to re-run it." |

### 9.9 Accessibility and quality floor

- WCAG AA contrast in both themes (verify the yellow on white; pair it with `--ink` text, not as text colour).
- Full keyboard path: upload, run, navigate frames with arrow keys, open the drawer with Enter, close with Escape.
- Visible 2px `--focus` outline, never removed.
- Touch targets at least 44 px.
- Works at 360 px width.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Alt text and text equivalents for every visual signal (heatmaps get a written summary).

### 9.10 Copy voice

Plain verbs, sentence case, no hype. The same word names the same action everywhere: the button says "Save report", the toast says "Saved report". No arrows appended to buttons, no middle-dot strings, no apologies in errors.

---

## 10. API design

```
POST   /v1/uploads                 -> { upload_id, presigned_url }       (resumable via tus)
POST   /v1/jobs                    { upload_id | url | claim_text }  -> { job_id }
GET    /v1/jobs/{id}               -> status + signals so far
GET    /v1/jobs/{id}/stream        -> SSE: stage_started, signal, stage_failed, verdict, done
GET    /v1/reports/{id}            -> final report JSON
POST   /v1/reports/{id}/share      -> { share_id, expires_at }
DELETE /v1/reports/{id}            -> deletes report and stored file
GET    /v1/me/history              -> paginated jobs
POST   /v1/keys                    -> create API key
```

SSE event example:

```
event: signal
data: {"id":"image.c2pa","status":"not_found","title":"Content Credentials", ...}
```

Conventions: idempotency keys on job creation, cursor pagination, problem+json errors, versioned paths.

---

## 11. Database schema (Postgres)

```sql
users        (id, email, created_at)
api_keys     (id, user_id, hash, label, last_used_at, revoked_at)
uploads      (id, user_id NULL, sha256, phash, media_type, size_bytes,
              storage_key, created_at, expires_at)
jobs         (id, upload_id, user_id NULL, input_kind, status,
              pipeline_version, created_at, finished_at)
signals      (id, job_id, check_id, category, status, weight,
              plain_text, detail JSONB, ran_ms, created_at)
reports      (id, job_id, verdict_label, confidence, summary,
              limits JSONB, share_id NULL, shared_until NULL)
claims       (id, job_id, text, normalized_text, result JSONB)
feedback     (id, report_id, rating, note, created_at)   -- trains weights later
audit_log    (id, user_id, action, subject, at)
```

Indexes: `uploads(sha256)`, `uploads(phash)` (use a BK-tree or pgvector for similarity), `jobs(user_id, created_at)`, `signals(job_id)`.
A scheduled job deletes expired uploads and their derived files.

---

## 12. WhatsApp bot

- Use the **WhatsApp Business Cloud API** (Meta) with a webhook to `apps/bot`.
- Flow: user forwards an image, voice note, PDF or text; bot replies immediately ("Checking this. Usually under a minute"), creates a job through the internal API, then sends a compact result.
- The reply is plain text plus the report link:
  - One line verdict ("Inconclusive: no origin record, detectors disagree.")
  - Two or three key reasons
  - "Full evidence: loupe.example/r/abc123"
- Note in the reply when the media was recompressed by WhatsApp.
- Rate limit per phone number. Hash the number at rest.
- Respect template and 24-hour-window messaging rules from Meta; check current policy before launch.

---

## 13. Security and privacy

- Treat every upload as hostile: size caps, type sniffing, virus scan, parse files in a sandboxed worker with no network access except an allow-list, and resource limits (CPU, memory, time) on every task.
- Never trust file metadata when rendering it: escape everything shown in the UI.
- SSRF protection on "paste a link": block private IP ranges, follow limited redirects, cap download size.
- Encrypt at rest and in transit; presigned URLs expire in minutes.
- Retention: anonymous uploads deleted after 24 hours; saved reports follow user settings; one-click delete that removes the file and derived data.
- Shared reports hide the original file by default and strip metadata from any preview image.
- Document what you send to external services (reverse search, detector APIs, LLM). Offer an "on-device and local models only" mode for sensitive material later.
- Follow the data protection law that applies to your users; write `docs/privacy.md` before launch.
- Prompt-injection care in the claim pipeline: retrieved web text is data, never instructions.

---

## 14. Testing and evaluation

This is what separates a credible tool from a demo.

1. **Build your own evaluation set.** Public datasets (FaceForensics++, DFDC, ASVspoof and similar) are useful for development, but detectors that score well there often fail on real material. Collect:
   - Real photos and videos from phones, screenshots, WhatsApp-compressed copies.
   - AI images and video from current generators (refresh this set every quarter).
   - Forged and genuine documents (synthetic forgeries you make yourself, plus consented real samples).
   - Edited-but-real content (cropped, filtered, colour-graded), so you test false positives on honest edits.
2. **Measure what matters:** precision and recall per class, false positive rate on real content, calibration (reliability curve, expected calibration error), and performance **after recompression**.
3. **Regression gate in CI.** A model or weight change cannot merge if false positives on real content rise or calibration worsens.
4. **Version everything.** Each report stores pipeline and model versions so old results can be explained.
5. **Feedback loop.** "Was this helpful / was this wrong?" on every report feeds the evaluation set after human review.
6. **Unit and integration tests** per check, golden-file tests for the report schema, and Playwright tests for the full upload-to-report flow including reduced-motion mode.
7. **Red-team yourself.** Try to fool the pipeline with adversarial edits, stripped metadata, re-encoding, and screenshots of screenshots. Record the results in `docs/limits.md` and show a public summary of known weaknesses.

---

## 15. Local setup

```bash
# prerequisites: Docker, Node 20+, Python 3.11+, pnpm, uv (or poetry), ffmpeg, exiftool
git clone <your-repo> loupe && cd loupe
cp .env.example .env
docker compose up -d redis postgres minio

# backend
cd services/api && uv sync && alembic upgrade head && uvicorn loupe_api.main:app --reload
cd services/worker && uv sync && dramatiq loupe_worker.tasks

# frontend
cd apps/web && pnpm install && pnpm dev
```

`.env.example`

```
DATABASE_URL=postgresql+psycopg://loupe:loupe@localhost:5432/loupe
REDIS_URL=redis://localhost:6379/0
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=loupe-uploads
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
UPLOAD_MAX_MB=200
RETENTION_HOURS_ANON=24
REVERSE_SEARCH_API_KEY=...
DETECTOR_API_KEY=...          # optional commercial detector
FACT_CHECK_API_KEY=...
LLM_API_KEY=...               # claim evidence gathering
SENTRY_DSN=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
```

---

## 16. Roadmap

**Phase 0: skeleton (about 1 week)**
Repo, compose file, upload to job to fake signal streamed to a placeholder frame grid. Design tokens and the Frame, Develop button and Verdict plate components in Storybook.

**Phase 1: images (3 to 4 weeks)**
Ingest, C2PA, EXIF, ELA, two detectors, reverse search, aggregation, full report UI with the developing sequence, share links, retention job. Start the evaluation set on day one.

**Phase 2: documents (3 weeks)**
PDF structure checks, pyHanko signatures, OCR cross-checks, QR and issuer lookups for one pilot issuer (a university or a training body is a good first partner).

**Phase 3: claims and WhatsApp (3 weeks)**
Claim extraction, fact-check lookup, evidence tiles, WhatsApp bot, per-number rate limits.

**Phase 4: audio and video (4 to 6 weeks)**
GPU worker, frame sampling, anti-spoofing, lip-sync, chunked processing with partial results streamed as they finish.

**Phase 5: trust and scale**
Accounts, teams, API keys and billing, audit exports, public methodology page, Swahili and French, on-premise mode for newsrooms and banks.

### Definition of done for the MVP
- A stranger can upload a WhatsApp-compressed image and get a readable, honest report in under 60 seconds.
- False positive rate on your real-photo set is below a threshold you set and publish.
- Every claim in the UI links to the signal behind it.
- Passes keyboard-only and screen-reader walkthroughs.
- A "How Loupe works and where it fails" page is live.

---

## 17. Risks to manage

| Risk | Mitigation |
|---|---|
| Detectors go stale as generators improve | Layered pipeline, provenance first, quarterly re-evaluation, model adapters that can be swapped |
| False accusations harm real people | Inconclusive band, "likely" wording, no naming individuals, visible limits |
| People over-trust a "real" verdict | State exactly what a pass proves; never say "verified true" |
| Abuse: using Loupe to tune fakes until they pass | Rate limits, no detailed per-detector scores to anonymous users, monitor repeated near-duplicate uploads |
| Cost of GPU and external APIs | Cache by hash, skip expensive stages when earlier ones are decisive, free-tier limits |
| Sensitive uploads (IDs, private images) | Short retention, sandboxing, minimal third-party sharing, clear privacy page |
| Scope creep | Ship one media type at a time and finish the evaluation loop before adding the next |

---

## 18. First three things to build tomorrow

1. The `Signal` and `Report` Pydantic schemas, with TypeScript types generated from them.
2. The **Frame** component in all its states plus the **Develop button**, in Storybook, using fake data.
3. A worker that runs `ingest → exiftool → C2PA read` on an image and streams two real signals to the grid.

Once those three work end to end, everything else is adding adapters behind the same interface.