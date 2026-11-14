import type { SignalStatus } from "@loupe/schema";

export type FrameState = "queued" | "developing" | SignalStatus;

/** Each state has its own shape as well as its colour (spec §9.5). */
export function StatusIcon({ state, size = 20 }: { state: FrameState; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 20 20", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 2 };
  switch (state) {
    case "pass": // circle check
      return <svg {...common}><circle cx="10" cy="10" r="8" /><path d="M6 10.5l2.5 2.5L14 7.5" /></svg>;
    case "warn": // triangle
      return <svg {...common}><path d="M10 2.5l8 14H2z" strokeLinejoin="round" /><path d="M10 8v4" /><circle cx="10" cy="14.2" r=".6" fill="currentColor" /></svg>;
    case "fail": // square cross
    case "error":
      return <svg {...common}><rect x="2.5" y="2.5" width="15" height="15" /><path d="M7 7l6 6M13 7l-6 6" /></svg>;
    case "not_found": // open circle
      return <svg {...common}><circle cx="10" cy="10" r="8" strokeDasharray="3 3" /></svg>;
    case "not_run": // dash
      return <svg {...common}><path d="M4 10h12" /></svg>;
    case "developing":
      return <svg {...common}><circle cx="10" cy="10" r="8" opacity=".35" /><path d="M10 2a8 8 0 0 1 8 8" /></svg>;
    default: // queued
      return <svg {...common}><path d="M3 10h2M9 10h2M15 10h2" opacity=".5" /></svg>;
  }
}

export const STATE_COLOR: Record<FrameState, string> = {
  pass: "text-authentic",
  warn: "text-uncertain",
  fail: "text-manipulated",
  error: "text-manipulated",
  not_found: "text-ink-soft",
  not_run: "text-ink-soft",
  developing: "text-ink-soft",
  queued: "text-ink-soft",
};

export const STATE_WORD: Record<FrameState, string> = {
  pass: "Passed",
  warn: "Flagged",
  fail: "Failed",
  error: "Error",
  not_found: "Nothing found",
  not_run: "Not run",
  developing: "Checking",
  queued: "Queued",
};
