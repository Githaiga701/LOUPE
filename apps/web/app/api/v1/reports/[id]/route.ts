import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db, schema } from "@/lib/db";
import { loadReport } from "@/lib/reports";

/** GET /v1/reports/{id} → final report JSON (schema Report). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  return NextResponse.json(report);
}

/** DELETE /v1/reports/{id} → deletes report, job, signals and the stored file. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [rep] = await db().select().from(schema.reports).where(eq(schema.reports.id, id));
  if (!rep) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const [job] = await db().select().from(schema.jobs).where(eq(schema.jobs.id, rep.jobId));
  if (job?.uploadId) {
    const [up] = await db().select().from(schema.uploads).where(eq(schema.uploads.id, job.uploadId));
    if (up) {
      await del(up.blobUrl).catch(() => {});
      await db().delete(schema.uploads).where(eq(schema.uploads.id, up.id)); // cascades to jobs/signals/reports
    }
  }
  await db().delete(schema.reports).where(eq(schema.reports.id, id));
  return new NextResponse(null, { status: 204 });
}
