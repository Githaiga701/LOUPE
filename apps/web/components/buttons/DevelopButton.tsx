"use client";

import type { VerdictLabel } from "@loupe/schema";

export type DevelopState =
  | { kind: "idle" }
  | { kind: "disabled"; reason: string }
  | { kind: "pressed"; done: number; total: number }
  | { kind: "done"; verdict: VerdictLabel }
  | { kind: "failed" };

const VERDICT_BG: Record<VerdictLabel, string> = {
  likely_authentic: "bg-authentic",
  inconclusive: "bg-uncertain",
  likely_manipulated: "bg-manipulated",
};

/**
 * The primary action (spec §9.5). Width never changes, so nothing jumps.
 * The progress sweep is driven by real completed stages, never a timer.
 */
export function DevelopButton({ state, onPress }: { state: DevelopState; onPress?: () => void }) {
  const base = "relative inline-flex items-center justify-center h-12 min-w-[220px] px-6 rounded-[var(--radius)] text-[16px] font-semibold overflow-hidden transition-colors";
  switch (state.kind) {
    case "disabled":
      return (
        <button type="button" disabled title={state.reason} aria-describedby="develop-reason" className={`${base} bg-frame-dim text-ink-soft border border-rule cursor-not-allowed`}>
          Check this file
          <span id="develop-reason" className="sr-only">{state.reason}</span>
        </button>
      );
    case "pressed": {
      const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
      return (
        <button type="button" disabled aria-live="polite" className={`${base} bg-ink text-frame`}>
          <span className="absolute inset-y-0 left-0 bg-frame/20 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} aria-hidden />
          <span className="relative tabular-nums">Checking {Math.min(state.done + 1, state.total)} of {state.total}</span>
        </button>
      );
    }
    case "done":
      return (
        <button type="button" onClick={onPress} className={`${base} ${VERDICT_BG[state.verdict]} ${state.verdict === "inconclusive" ? "text-ink" : "text-frame"}`}>
          See result
        </button>
      );
    case "failed":
      return (
        <button type="button" onClick={onPress} className={`${base} border-2 border-manipulated text-manipulated bg-transparent`}>
          Check failed. Try again.
        </button>
      );
    default:
      return (
        <button type="button" onClick={onPress} className={`${base} bg-ink text-frame hover:bg-ink/90`}>
          Check this file
        </button>
      );
  }
}
