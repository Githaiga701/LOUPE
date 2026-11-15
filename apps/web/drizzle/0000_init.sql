CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"rating" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"upload_id" text,
	"user_id" text,
	"input_kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"run_id" text,
	"pipeline_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"media_type" text NOT NULL,
	"verdict_label" text NOT NULL,
	"confidence" real NOT NULL,
	"summary" text NOT NULL,
	"next_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"versions" jsonb NOT NULL,
	"share_id" text,
	"shared_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"check_id" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"weight" text NOT NULL,
	"title" text NOT NULL,
	"plain" text NOT NULL,
	"why" text,
	"reliability" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tool" jsonb,
	"ran_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"sha256" text,
	"phash" text,
	"media_type" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_user_created" ON "jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "signals_job" ON "signals" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "uploads_sha256" ON "uploads" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "uploads_expires" ON "uploads" USING btree ("expires_at");