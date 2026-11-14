"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Verdict, VerdictLabel } from "@loupe/schema";
import { ConfidenceBar } from "./ConfidenceBar";
import { StatusIcon } from "../proof-sheet/StatusIcon";

const META: Record<VerdictLabel, { word: string; color: "authentic" | "uncertain" | "manipulated"; text: string; bar: string; icon: "pass" | "warn" | "fail" }> = {
  likely_authentic: { word: "Likely authentic", color: "authentic", text: "text-authentic", bar: "bg-authentic", icon: "pass" },
  inconclusive: { word: "Inconclusive", color: "uncertain", text: "text-ink", bar: "bg-uncertain", icon: "warn" },
  likely_manipulated: { word: "Likely manipulated", color: "manipulated", text: "text-manipulated", bar: "bg-manipulated", icon: "fail" },
};

export interface VerdictPlateProps {
  verdict: Verdict;
  limits: string[];
  actions?: React.ReactNode;
}

/** Wide, square-cornered block; the print pulled from the tray. */
export function VerdictPlate({ verdict, limits, actions }: VerdictPlateProps) {
  const reduce = useReducedMotion();
  const m = META[verdict.label];
  return (
    <motion.section
      aria-labelledby="verdict-word"
      initial={{ y: reduce ? 0 : 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: reduce ? 0.15 : 0.5, ease: "easeOut" }}
      className="relative bg-frame border border-rule rounded-[var(--radius)] pl-8 pr-6 py-6"
    >
      <span className={`absolute left-0 top-0 bottom-0 w-3 ${m.bar}`} aria-hidden />
      <div className={`flex items-center gap-3 ${m.text}`}>
        <StatusIcon state={m.icon} size={28} />
        <h2 id="verdict-word" className="wide text-[39px] leading-none">{m.word}</h2>
      </div>
      <div className="mt-4"><ConfidenceBar value={verdict.confidence} color={m.color} /></div>
      <p className="measure mt-4">{verdict.summary}</p>
      {verdict.next_steps.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13px] text-ink-soft">What to do next</h3>
          <ul className="measure list-disc pl-5 mt-1 space-y-1">{verdict.next_steps.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      {limits.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13px] text-ink-soft">Limits of this check</h3>
          <ul className="measure list-disc pl-5 mt-1 space-y-1">{limits.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
    </motion.section>
  );
}
