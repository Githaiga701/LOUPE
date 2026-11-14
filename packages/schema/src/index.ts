/**
 * Loupe result schema — the single source of truth for what a check emits
 * and what a report contains. The Python checks service mirrors this in
 * services/checks/loupe_checks/schemas.py; keep the two in step.
 */
import { z } from "zod";

export const MediaType = z.enum(["image", "video", "audio", "document", "claim"]);
export type MediaType = z.infer<typeof MediaType>;

export const SignalStatus = z.enum(["pass", "warn", "fail", "not_found", "not_run", "error"]);
export type SignalStatus = z.infer<typeof SignalStatus>;

export const SignalWeight = z.enum(["strong", "medium", "weak"]);
export type SignalWeight = z.infer<typeof SignalWeight>;

export const SignalCategory = z.enum(["ingest", "provenance", "forensics", "detector", "context"]);
export type SignalCategory = z.infer<typeof SignalCategory>;

export const Signal = z.object({
  /** Stable check id, e.g. "image.c2pa", "image.exif", "image.detector.a" */
  id: z.string().min(1),
  category: SignalCategory,
  status: SignalStatus,
  weight: SignalWeight,
  /** Short check name shown on the frame, e.g. "Content Credentials" */
  title: z.string().min(1),
  /** One plain-language sentence. No jargon without a gloss. */
  plain: z.string().min(1),
  /** Why it matters, one sentence. Shown in the evidence drawer. */
  why: z.string().optional(),
  /** One-line honesty note: how reliable is this check? */
  reliability: z.string().optional(),
  /** Raw technical detail for the drawer; never rendered unescaped. */
  detail: z.record(z.string(), z.unknown()).default({}),
  ran_ms: z.number().int().nonnegative().default(0),
  /** Tool/model/version that produced this signal */
  tool: z.object({ name: z.string(), version: z.string().optional(), licence: z.string().optional() }).optional(),
});
export type Signal = z.infer<typeof Signal>;

export const VerdictLabel = z.enum(["likely_authentic", "inconclusive", "likely_manipulated"]);
export type VerdictLabel = z.infer<typeof VerdictLabel>;

export const Verdict = z.object({
  label: VerdictLabel,
  /** Calibrated probability that the item is as it claims (0..1). */
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  next_steps: z.array(z.string()).default([]),
});
export type Verdict = z.infer<typeof Verdict>;

export const Report = z.object({
  job_id: z.string(),
  media_type: MediaType,
  verdict: Verdict,
  signals: z.array(Signal),
  /** Anything that reduces confidence, stated not hidden. */
  limits: z.array(z.string()).default([]),
  versions: z.object({
    pipeline: z.string(),
    checks: z.record(z.string(), z.string()).default({}),
  }),
  created_at: z.string(),
});
export type Report = z.infer<typeof Report>;

/** Static description of a check so the UI can lay out the grid before anything runs. */
export const CheckDescriptor = z.object({
  id: z.string(),
  category: SignalCategory,
  title: z.string(),
  media_types: z.array(MediaType),
  /** Expected wall time; drives the "this can take up to N seconds" caption. */
  timeout_s: z.number().int().positive(),
});
export type CheckDescriptor = z.infer<typeof CheckDescriptor>;

/** Events streamed over SSE while a job runs. */
export const JobEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan"), job_id: z.string(), checks: z.array(CheckDescriptor) }),
  z.object({ type: z.literal("stage_started"), check_id: z.string() }),
  z.object({ type: z.literal("signal"), signal: Signal }),
  z.object({ type: z.literal("stage_failed"), check_id: z.string(), reason: z.string() }),
  z.object({ type: z.literal("verdict"), verdict: Verdict, limits: z.array(z.string()) }),
  z.object({ type: z.literal("done"), report_id: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type JobEvent = z.infer<typeof JobEvent>;

export const JobStatus = z.enum(["queued", "running", "done", "failed"]);
export type JobStatus = z.infer<typeof JobStatus>;

/** Request body the web app sends to the Python checks service. */
export const CheckRequest = z.object({
  job_id: z.string(),
  check_id: z.string(),
  media_type: MediaType,
  /** Where the working copy lives. The service fetches it; it never receives the bytes inline. */
  blob_url: z.string().url(),
  content_type: z.string().optional(),
  size_bytes: z.number().int().optional(),
});
export type CheckRequest = z.infer<typeof CheckRequest>;

export const PIPELINE_VERSION = "0.1.0";
