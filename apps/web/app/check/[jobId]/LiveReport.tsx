"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useJobStream } from "@/lib/use-job-stream";
import { ProofSheet } from "@/components/proof-sheet/ProofSheet";
import { DevelopButton } from "@/components/buttons/DevelopButton";

/** Analysing + report screens: the same contact sheet, developing live. */
export function LiveReport({ jobId }: { jobId: string }) {
  const view = useJobStream(jobId);
  const [toast, setToast] = useState<string | null>(null);
  // The preview object URL only exists in this tab's session; never rendered on the server.
  const preview = useSyncExternalStore(
    () => () => {},
    () => sessionStorage.getItem(`preview:${jobId}`),
    () => null,
  );

  const done = Object.keys(view.signals).length;
  const total = view.checks.length;
  const analysing = !view.verdict;

  async function share() {
    if (!view.reportId) return;
    const res = await fetch(`/api/v1/reports/${view.reportId}/share`, { method: "POST" });
    const { share_id } = (await res.json()) as { share_id: string };
    const url = `${location.origin}/r/${share_id}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setToast("Copied share link");
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="wide text-[25px]">{analysing ? "Checking" : "Report"}</h1>
        <DevelopButton
          state={view.error ? { kind: "failed" } : view.verdict ? { kind: "done", verdict: view.verdict.label } : { kind: "pressed", done, total: Math.max(total, 1) }}
          onPress={() => (view.error ? location.reload() : document.getElementById("verdict-word")?.scrollIntoView({ behavior: "smooth" }))}
        />
      </div>

      {view.error && <p role="alert" className="mb-4 text-manipulated">{view.error}</p>}
      {view.connection === "connecting" && !view.verdict && total > 0 && (
        <p className="mb-4 text-[13px] text-ink-soft">Reconnecting to the live result…</p>
      )}

      <ProofSheet
        previewUrl={preview}
        checks={view.checks}
        started={view.started}
        signals={view.signals}
        verdict={view.verdict}
        limits={view.limits}
        analysing={analysing}
        announce={view.announce}
        actions={
          <>
            <button type="button" onClick={share} className="h-10 px-4 bg-ink text-frame rounded-[var(--radius)]">Share link</button>
            <a href={view.reportId ? `/api/v1/reports/${view.reportId}` : "#"} className="h-10 px-4 inline-flex items-center border border-rule rounded-[var(--radius)]">Report JSON</a>
            <Link href="/" className="h-10 px-4 inline-flex items-center border border-rule rounded-[var(--radius)]">Check another file</Link>
          </>
        }
      />

      {toast && <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-frame px-4 py-2 rounded-[var(--radius)]">{toast}</div>}
    </div>
  );
}
