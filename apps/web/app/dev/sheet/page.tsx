"use client";

import { useEffect, useMemo, useState } from "react";
import type { Signal } from "@loupe/schema";
import { CHECKS } from "@/lib/checks";
import { aggregate } from "@/lib/aggregate";
import { ProofSheet } from "@/components/proof-sheet/ProofSheet";
import { DevelopButton } from "@/components/buttons/DevelopButton";
import { Frame } from "@/components/proof-sheet/Frame";
import type { FrameState } from "@/components/proof-sheet/StatusIcon";

/**
 * Dev-only: plays the developing sequence with fake signals and shows every
 * Frame / Develop-button state. No network, no database. Not linked from the UI.
 */
const FAKE: Signal[] = [
  { id: "image.ingest", category: "ingest", status: "warn", weight: "weak", title: "File identity", plain: "JPEG, 1600×1200, 180 KB. Looks like it was recompressed before it reached you (likely a messaging app).", detail: { recompressed: true }, ran_ms: 120 },
  { id: "image.exif", category: "forensics", status: "not_found", weight: "medium", title: "Camera metadata", plain: "No camera metadata is present. Phones write it; messaging apps and most editors strip it.", detail: {}, ran_ms: 40 },
  { id: "image.c2pa", category: "provenance", status: "not_found", weight: "strong", title: "Content Credentials", plain: "This file carries no signed record of where it came from.", detail: { manifest: null }, ran_ms: 60 },
  { id: "image.generator_tags", category: "provenance", status: "not_found", weight: "weak", title: "AI generator tags", plain: "The file has no text metadata to inspect. Many apps strip it, so this proves nothing either way.", detail: {}, ran_ms: 30 },
  { id: "image.ela", category: "forensics", status: "warn", weight: "weak", title: "Error level analysis", plain: "A small region re-saves differently from the rest of the image, which can mean pasted-in content, or just a flat area like sky or text.", detail: { cv: 1.4 }, ran_ms: 900 },
  { id: "image.jpeg_quant", category: "forensics", status: "pass", weight: "weak", title: "JPEG compression history", plain: "Last saved at about JPEG quality 75. That is the range messaging apps and web uploads use; cameras save higher.", detail: { estimated_quality: 75 }, ran_ms: 25 },
];

export default function DevSheetPage() {
  const [tick, setTick] = useState(0);
  const started = useMemo(() => new Set(CHECKS.map((c) => c.id)), []);
  const [signals, setSignals] = useState<Record<string, Signal>>({});

  useEffect(() => {
    const order = [2, 0, 3, 1, 5, 4];
    const timers: ReturnType<typeof setTimeout>[] = [];
    order.forEach((idx, i) => {
      timers.push(setTimeout(() => setSignals((s) => ({ ...s, [FAKE[idx].id]: FAKE[idx] })), 700 + i * 650 + Math.random() * 300));
    });
    return () => timers.forEach(clearTimeout);
  }, [tick]);

  const done = Object.keys(signals).length;
  const result = useMemo(() => (done === FAKE.length ? aggregate(Object.values(signals)) : null), [signals, done]);
  const states: FrameState[] = ["queued", "developing", "pass", "warn", "fail", "not_found", "not_run", "error"];

  return (
    <div className="space-y-12">
      <section>
        <div className="flex items-center justify-between mb-6">
          <h1 className="wide text-[25px]">Dev: developing sequence</h1>
          <div className="flex gap-3">
            <button className="h-10 px-4 border border-rule rounded-[var(--radius)]" onClick={() => { setSignals({}); setTick((t) => t + 1); }}>Replay</button>
            <DevelopButton state={result ? { kind: "done", verdict: result.verdict.label } : { kind: "pressed", done, total: FAKE.length }} />
          </div>
        </div>
        <ProofSheet
          previewUrl={null}
          checks={CHECKS}
          started={started}
          signals={signals}
          verdict={result?.verdict}
          limits={result?.limits}
          analysing={!result}
          actions={<button className="h-10 px-4 bg-ink text-frame rounded-[var(--radius)]">Share link</button>}
        />
      </section>

      <section>
        <h2 className="wide text-[20px] mb-4">Frame states</h2>
        <div className="grid gap-[var(--gap)] grid-cols-[repeat(auto-fill,var(--frame-size))]">
          {states.map((s) => <Frame key={s} checkId={s} title="Content Credentials" state={s} plain="One-line plain result goes here, up to three lines of text." inspected={s === "pass"} onOpen={() => {}} />)}
        </div>
      </section>

      <section>
        <h2 className="wide text-[20px] mb-4">Develop button states</h2>
        <div className="flex flex-wrap gap-3">
          <DevelopButton state={{ kind: "disabled", reason: "Add a file first" }} />
          <DevelopButton state={{ kind: "idle" }} />
          <DevelopButton state={{ kind: "pressed", done: 3, total: 7 }} />
          <DevelopButton state={{ kind: "done", verdict: "likely_authentic" }} />
          <DevelopButton state={{ kind: "done", verdict: "inconclusive" }} />
          <DevelopButton state={{ kind: "done", verdict: "likely_manipulated" }} />
          <DevelopButton state={{ kind: "failed" }} />
        </div>
      </section>
    </div>
  );
}
