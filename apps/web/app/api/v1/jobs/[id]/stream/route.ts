import { getRun } from "workflow/api";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const maxDuration = 120;

/**
 * GET /v1/jobs/{id}/stream — Server-Sent Events.
 * Forwards the workflow run's durable stream as SSE. Reconnect with
 * ?startIndex=N (or Last-Event-ID) to resume after a drop.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job] = await db().select({ runId: schema.jobs.runId, status: schema.jobs.status }).from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job?.runId) return new Response("event: error\ndata: {\"type\":\"error\",\"message\":\"Job not found.\"}\n\n", { status: 404, headers: sseHeaders() });

  const url = new URL(request.url);
  const lastId = request.headers.get("last-event-id") ?? url.searchParams.get("startIndex");
  const startIndex = lastId ? Number(lastId) + 1 : undefined;

  const run = getRun(job.runId);
  const source = run.getReadable({ startIndex });
  let index = startIndex ?? 0;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(`retry: 2000\n\n`));
      const reader = source.getReader();
      const onAbort = () => reader.cancel().catch(() => {});
      request.signal.addEventListener("abort", onAbort);
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const text = typeof value === "string" ? value : new TextDecoder().decode(value as Uint8Array);
          for (const line of text.split("\n")) {
            if (!line.trim()) continue;
            let type = "message";
            try { type = JSON.parse(line).type ?? "message"; } catch { /* forward as-is */ }
            controller.enqueue(enc.encode(`id: ${index}\nevent: ${type}\ndata: ${line}\n\n`));
            index += 1;
          }
        }
      } catch (err) {
        controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`));
      } finally {
        request.signal.removeEventListener("abort", onAbort);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
