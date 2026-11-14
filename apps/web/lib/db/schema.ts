import { pgTable, text, integer, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";

/** Spec §11, trimmed to what Phase 0/1 needs. users/api_keys/claims/audit_log arrive with Phase 5. */

export const uploads = pgTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    sha256: text("sha256"),
    phash: text("phash"),
    mediaType: text("media_type").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    /** Vercel Blob URL of the original. Never modified. */
    blobUrl: text("blob_url").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [index("uploads_sha256").on(t.sha256), index("uploads_expires").on(t.expiresAt)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id").references(() => uploads.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    inputKind: text("input_kind").notNull(), // upload | url | claim
    status: text("status").notNull().default("queued"), // queued | running | done | failed
    /** Workflow SDK run id; the SSE route reads the run's stream. */
    runId: text("run_id"),
    pipelineVersion: text("pipeline_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("jobs_user_created").on(t.userId, t.createdAt)],
);

export const signals = pgTable(
  "signals",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
    checkId: text("check_id").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    weight: text("weight").notNull(),
    title: text("title").notNull(),
    plain: text("plain").notNull(),
    why: text("why"),
    reliability: text("reliability"),
    detail: jsonb("detail").$type<Record<string, unknown>>().default({}).notNull(),
    tool: jsonb("tool").$type<{ name: string; version?: string; licence?: string } | null>(),
    ranMs: integer("ran_ms").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("signals_job").on(t.jobId)],
);

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
  mediaType: text("media_type").notNull(),
  verdictLabel: text("verdict_label").notNull(),
  confidence: real("confidence").notNull(),
  summary: text("summary").notNull(),
  nextSteps: jsonb("next_steps").$type<string[]>().default([]).notNull(),
  limits: jsonb("limits").$type<string[]>().default([]).notNull(),
  versions: jsonb("versions").$type<{ pipeline: string; checks: Record<string, string> }>().notNull(),
  shareId: text("share_id"),
  sharedUntil: timestamp("shared_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  reportId: text("report_id").references(() => reports.id, { onDelete: "cascade" }).notNull(),
  rating: text("rating").notNull(), // helpful | wrong
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
