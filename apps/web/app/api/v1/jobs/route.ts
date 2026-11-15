import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { PIPELINE_VERSION } from "@loupe/schema";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { analyzeWorkflow } from "@/workflows/analyze";

const Body = z.object({
  upload_id: z.string().optional(),
  /** Fallback when the Blob completion webhook has not landed yet (local dev). */
  blob: z.object({ url: z.string().url(), pathname: z.string(), contentType: z.string().optional(), size: z.number().optional() }).optional(),
});

/** POST /v1/jobs { upload_id } → { job_id }  — creates the job and starts the workflow. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Send upload_id or blob." }, { status: 400 });
  const { upload_id, blob } = parsed.data;

  let upload = upload_id
    ? (await db().select().from(schema.uploads).where(eq(schema.uploads.id, upload_id)))[0]
    : undefined;

  if (!upload && blob) {
    const id = upload_id ?? newId("upl");
    const [row] = await db().insert(schema.uploads).values({
      id,
      mediaType: "image",
      contentType: blob.contentType,
      sizeBytes: blob.size,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    }).onConflictDoNothing().returning();
    upload = row ?? (await db().select().from(schema.uploads).where(eq(schema.uploads.id, id)))[0];
  }
  if (!upload) return NextResponse.json({ error: "Upload not found. Add a file first." }, { status: 404 });

  const jobId = newId("job");
  await db().insert(schema.jobs).values({
    id: jobId,
    uploadId: upload.id,
    inputKind: "upload",
    status: "queued",
    pipelineVersion: PIPELINE_VERSION,
  });

  const run = await start(analyzeWorkflow, [{
    jobId,
    mediaType: "image",
    blobPathname: upload.blobPathname,
    contentType: upload.contentType ?? undefined,
    sizeBytes: upload.sizeBytes ?? undefined,
  }]);
  await db().update(schema.jobs).set({ runId: run.runId }).where(eq(schema.jobs.id, jobId));

  return NextResponse.json({ job_id: jobId }, { status: 201 });
}
