"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DropField, uploadToBlob, type Picked } from "./DropField";
import { DevelopButton, type DevelopState } from "../buttons/DevelopButton";

/** Upload screen: pick → upload to Blob → create job → go to /check/{jobId}. */
export function CheckFlow() {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const state: DevelopState = busy
    ? { kind: "pressed", done: 0, total: 1 }
    : picked ? { kind: "idle" } : { kind: "disabled", reason: "Add a file first" };

  async function run() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await uploadToBlob(picked.file);
      const res = await fetch("/api/v1/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blob: { url: blob.url, pathname: blob.pathname, contentType: blob.contentType, size: picked.file.size } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? "Could not start the check.");
      const { job_id } = (await res.json()) as { job_id: string };
      sessionStorage.setItem(`preview:${job_id}`, picked.previewUrl);
      router.push(`/check/${job_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again in a minute.");
      setBusy(false);
    }
  }

  return (
    <div>
      <DropField picked={picked} onPick={(p) => { setPicked(p); setError(null); }} onError={setError} />
      <div className="mt-6 flex flex-col items-center gap-3">
        <DevelopButton state={state} onPress={run} />
        {picked && !busy && (
          <button type="button" className="text-[13px] text-ink-soft underline" onClick={() => setPicked(null)}>Choose a different file</button>
        )}
        {error && <p role="alert" className="text-manipulated text-[13px] max-w-[420px] text-center">{error}</p>}
      </div>
    </div>
  );
}
