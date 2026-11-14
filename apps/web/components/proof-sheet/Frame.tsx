"use client";

import { motion, useReducedMotion } from "motion/react";
import { StatusIcon, STATE_COLOR, STATE_WORD, type FrameState } from "./StatusIcon";

export interface FrameProps {
  checkId: string;
  title: string;
  state: FrameState;
  /** One-line plain result; shown at the bottom once developed. */
  plain?: string;
  /** This frame is open in the drawer: show crop marks. */
  inspected?: boolean;
  /** Live caption for slow checks, e.g. "This can take up to 30 seconds." */
  caption?: string;
  onOpen?: (checkId: string) => void;
}

/**
 * A square check frame on the contact sheet. Fixed corner structure:
 * icon top-left, name under it, one-line result at the bottom. Position is
 * information; the user learns where to look.
 */
export function Frame({ checkId, title, state, plain, inspected, caption, onOpen }: FrameProps) {
  const reduce = useReducedMotion();
  const developed = state !== "queued" && state !== "developing";
  const interactive = developed && !!onOpen;
  const color = STATE_COLOR[state];

  return (
    <motion.div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-label={`${title}: ${STATE_WORD[state]}${plain ? `. ${plain}` : ""}`}
      aria-disabled={!interactive}
      onClick={interactive ? () => onOpen?.(checkId) : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(checkId); } } : undefined}
      data-state={state}
      data-check={checkId}
      className={[
        "relative flex flex-col justify-between border border-rule select-none",
        "w-[var(--frame-size)] h-[var(--frame-size)] p-3 rounded-[var(--radius)]",
        developed ? "bg-frame" : "bg-frame-dim",
        !developed ? "grain" : "",
        state === "developing" ? "shimmer" : "",
        interactive ? "cursor-pointer hover:shadow-[3px_3px_0_0_rgba(23,33,43,0.12)] focus-visible:shadow-[3px_3px_0_0_rgba(23,33,43,0.12)]" : "",
        inspected ? "crop" : "",
      ].join(" ")}
      initial={false}
      animate={developed ? { filter: "grayscale(0%)", opacity: 1 } : { filter: "grayscale(100%)", opacity: 0.85 }}
      transition={{ duration: reduce ? 0.15 : 0.75, ease: "easeOut" }}
    >
      {inspected && <span className="crop-b" aria-hidden />}
      <div className={`flex items-start gap-2 ${color}`}>
        <motion.span
          initial={false}
          animate={{ scale: developed ? 1 : 0.9, opacity: developed ? 1 : 0.6 }}
          transition={{ duration: reduce ? 0.15 : 0.6, ease: "easeOut", delay: reduce ? 0 : 0.2 }}
          className="shrink-0 mt-0.5"
        >
          <StatusIcon state={state} />
        </motion.span>
        <div className="min-w-0">
          <div className="text-[13px] text-ink-soft leading-tight">{title}</div>
          <div className={`text-[16px] font-semibold leading-tight ${developed ? "" : "text-ink-soft"}`}>{STATE_WORD[state]}</div>
        </div>
      </div>
      <div className="text-[13px] text-ink leading-snug line-clamp-3">
        {developed ? plain : caption ?? (state === "developing" ? "Checking…" : "")}
      </div>
    </motion.div>
  );
}
