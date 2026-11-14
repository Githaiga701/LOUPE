import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";

/** POST /v1/reports/{id}/share → { share_id, expires_at }. Shared reports hide the original file. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [rep] = await db().select().from(schema.reports).where(eq(schema.reports.id, id));
  if (!rep) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const shareId = rep.shareId ?? newId("shr").slice(4, 16);
  const sharedUntil = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await db().update(schema.reports).set({ shareId, sharedUntil }).where(eq(schema.reports.id, id));
  return NextResponse.json({ share_id: shareId, expires_at: sharedUntil.toISOString() });
}
