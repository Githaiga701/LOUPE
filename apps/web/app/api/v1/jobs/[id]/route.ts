import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** GET /v1/jobs/{id} → status + signals so far. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job] = await db().select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const sigs = await db().select().from(schema.signals).where(eq(schema.signals.jobId, id));
  const [report] = await db().select({ id: schema.reports.id }).from(schema.reports).where(eq(schema.reports.jobId, id));
  return NextResponse.json({
    job_id: job.id,
    status: job.status,
    pipeline_version: job.pipelineVersion,
    report_id: report?.id ?? null,
    signals: sigs.map((s) => ({
      id: s.checkId, category: s.category, status: s.status, weight: s.weight, title: s.title,
      plain: s.plain, why: s.why ?? undefined, reliability: s.reliability ?? undefined,
      detail: s.detail, ran_ms: s.ranMs, tool: s.tool ?? undefined,
    })),
  });
}
