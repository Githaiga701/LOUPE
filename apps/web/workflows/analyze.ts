import { getWritable, FatalError } from "workflow";
import { eq } from "drizzle-orm";
import { type JobEvent, type Signal, type MediaType, PIPELINE_VERSION } from "@loupe/schema";
import { checksFor } from "@/lib/checks";
import { runCheck, notRunSignal } from "@/lib/checks-client";
import { aggregate } from "@/lib/aggregate";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { signedReadUrl } from "@/lib/blob-sign";

/**
 * The analysis pipeline as a durable workflow (spec §6).
 *
 *   plan → [checks in parallel, each its own step] → aggregate → report → done
 *
 * Every step writes JobEvents to the run's stream; the SSE route forwards them
 * to the browser, which "develops" each frame as its signal arrives.
 * Steps are retried by the SDK on transient failure; a check that still fails
 * becomes a `not_run` signal and the report ships anyway (principle 5).
 */
export interface AnalyzeInput {
  jobId: string;
  mediaType: MediaType;
  /** Private Blob pathname of the original. The checks service gets a short-lived signed URL, never the token. */
  blobPathname: string;
  contentType?: string;
  sizeBytes?: number;
}

export async function analyzeWorkflow(input: AnalyzeInput) {
  "use workflow";

  const plan = checksFor(input.mediaType);
  await emitPlan(input.jobId, plan);
  const fileUrl = await signFile(input.blobPathname);

  // Cheap/deterministic first, but run in parallel; order of completion is real.
  const signals = await Promise.all(plan.map((c) => runOneCheck(input, fileUrl, c.id)));

  const reportId = await finalise(input, signals);
  return { reportId };
}

// ---------------------------------------------------------------------------
// Steps

async function emitPlan(jobId: string, checks: ReturnType<typeof checksFor>) {
  "use step";
  await markRunning(jobId);
  await emit({ type: "plan", job_id: jobId, checks });
}

async function signFile(pathname: string): Promise<string> {
  "use step";
  return signedReadUrl(pathname);
}

async function runOneCheck(input: AnalyzeInput, fileUrl: string, checkId: string): Promise<Signal> {
  "use step";
  await emit({ type: "stage_started", check_id: checkId });
  let signal: Signal;
  try {
    signal = await runCheck({
      job_id: input.jobId,
      check_id: checkId,
      media_type: input.mediaType,
      blob_url: fileUrl,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError"
      ? "This check took too long and was skipped."
      : "This check could not run.";
    signal = notRunSignal(checkId, reason);
    await emit({ type: "stage_failed", check_id: checkId, reason: String(err instanceof Error ? err.message : err).slice(0, 200) });
  }
  await persistSignal(input.jobId, signal);
  await emit({ type: "signal", signal });
  return signal;
}
runOneCheck.maxRetries = 1; // the adapter already applies the per-check timeout

async function finalise(input: AnalyzeInput, signals: Signal[]): Promise<string> {
  "use step";
  const { verdict, limits } = aggregate(signals);
  const reportId = newId("rep");
  const checksVersions: Record<string, string> = {};
  for (const s of signals) if (s.tool) checksVersions[s.id] = `${s.tool.name}@${s.tool.version ?? "?"}`;

  await db().insert(schema.reports).values({
    id: reportId,
    jobId: input.jobId,
    mediaType: input.mediaType,
    verdictLabel: verdict.label,
    confidence: verdict.confidence,
    summary: verdict.summary,
    nextSteps: verdict.next_steps,
    limits,
    versions: { pipeline: PIPELINE_VERSION, checks: checksVersions },
  });
  await db().update(schema.jobs).set({ status: "done", finishedAt: new Date() }).where(eq(schema.jobs.id, input.jobId));

  await emit({ type: "verdict", verdict, limits });
  await emit({ type: "done", report_id: reportId });
  return reportId;
}

// ---------------------------------------------------------------------------
// Helpers (called from inside steps only)

async function emit(event: JobEvent) {
  const writable = getWritable<string>();
  const writer = writable.getWriter();
  try {
    await writer.write(JSON.stringify(event) + "\n");
  } finally {
    writer.releaseLock();
  }
}

async function markRunning(jobId: string) {
  const [row] = await db().select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!row) throw new FatalError(`Job ${jobId} does not exist`);
  await db().update(schema.jobs).set({ status: "running" }).where(eq(schema.jobs.id, jobId));
}

async function persistSignal(jobId: string, s: Signal) {
  await db().insert(schema.signals).values({
    id: newId("sig"),
    jobId,
    checkId: s.id,
    category: s.category,
    status: s.status,
    weight: s.weight,
    title: s.title,
    plain: s.plain,
    why: s.why,
    reliability: s.reliability,
    detail: s.detail,
    tool: s.tool ?? null,
    ranMs: s.ran_ms,
  });
}
