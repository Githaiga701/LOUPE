import { eq } from "drizzle-orm";
import type { Report, Signal } from "@loupe/schema";
import { db, schema } from "./db";

export async function loadReport(id: string): Promise<Report | null> {
  const [rep] = await db().select().from(schema.reports).where(eq(schema.reports.id, id));
  if (!rep) return null;
  return assemble(rep);
}

export async function loadReportByJob(jobId: string): Promise<Report | null> {
  const [rep] = await db().select().from(schema.reports).where(eq(schema.reports.jobId, jobId));
  if (!rep) return null;
  return assemble(rep);
}

export async function loadReportByShare(shareId: string): Promise<Report | null> {
  const [rep] = await db().select().from(schema.reports).where(eq(schema.reports.shareId, shareId));
  if (!rep) return null;
  if (rep.sharedUntil && rep.sharedUntil < new Date()) return null;
  return assemble(rep);
}

async function assemble(rep: typeof schema.reports.$inferSelect): Promise<Report> {
  const rows = await db().select().from(schema.signals).where(eq(schema.signals.jobId, rep.jobId));
  const signals: Signal[] = rows.map((s) => ({
    id: s.checkId,
    category: s.category as Signal["category"],
    status: s.status as Signal["status"],
    weight: s.weight as Signal["weight"],
    title: s.title,
    plain: s.plain,
    why: s.why ?? undefined,
    reliability: s.reliability ?? undefined,
    detail: s.detail,
    ran_ms: s.ranMs,
    tool: s.tool ?? undefined,
  }));
  return {
    job_id: rep.jobId,
    media_type: rep.mediaType as Report["media_type"],
    verdict: {
      label: rep.verdictLabel as Report["verdict"]["label"],
      confidence: rep.confidence,
      summary: rep.summary,
      next_steps: rep.nextSteps,
    },
    signals,
    limits: rep.limits,
    versions: rep.versions,
    created_at: rep.createdAt.toISOString(),
  };
}
