import { NextResponse } from "next/server";
import { eq, lt } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Vercel Cron: delete expired anonymous uploads and everything derived from
 * them (jobs, signals, reports cascade). Schedule lives in vercel.json.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expired = await db().select().from(schema.uploads).where(lt(schema.uploads.expiresAt, new Date()));
  let deleted = 0;
  for (const up of expired) {
    await del(up.blobUrl).catch(() => {});
    await db().delete(schema.uploads).where(eq(schema.uploads.id, up.id));
    deleted += 1;
  }
  return NextResponse.json({ deleted });
}
