import type { Signal, Verdict, VerdictLabel } from "@loupe/schema";

/**
 * Scoring, spec §8. Hard rules first, then weighted evidence, then the
 * inconclusive band. Hand-set weights for now; replace with a fitted logistic
 * model + calibration once eval/datasets has labelled data.
 *
 * Output `confidence` is P(item is what it claims to be). The verdict label is
 * derived from it plus the band rules.
 */

const WEIGHT: Record<Signal["weight"], number> = { strong: 1.6, medium: 0.9, weak: 0.4 };

export interface Aggregate {
  verdict: Verdict;
  limits: string[];
}

export function aggregate(signals: Signal[], priorLimits: string[] = []): Aggregate {
  const limits = [...priorLimits];
  const by = (id: string) => signals.find((s) => s.id === id);

  // --- 1. Hard rules -------------------------------------------------------
  const c2pa = by("image.c2pa");
  if (c2pa?.status === "pass" && c2pa.detail?.ai_generated === false && c2pa.detail?.trusted_issuer === true) {
    return finish(0.9, signals, limits, "A valid signed origin record was found and it does not declare AI generation. This proves where the file came from and how it was edited, not that the scene it shows happened as described.");
  }
  if (c2pa?.status === "fail") {
    return finish(0.12, signals, limits, "The file carries an origin record whose signature is broken or which declares AI generation.");
  }
  const gen = by("image.generator_tags");
  if (gen?.status === "fail") {
    return finish(0.15, signals, limits, "The file's own metadata names an AI image generator.");
  }

  // --- 2. Weighted evidence -------------------------------------------------
  let score = 0;
  let evidence = 0;
  for (const s of signals) {
    const w = WEIGHT[s.weight];
    switch (s.status) {
      case "pass": score += w; evidence += w; break;
      case "warn": score -= 0.5 * w; evidence += w; break;
      case "fail": score -= w; evidence += w; break;
      case "not_found": evidence += 0.25 * w; break; // absence is weak evidence
      case "not_run":
      case "error": break;
    }
  }
  const ran = signals.filter((s) => s.status !== "not_run" && s.status !== "error").length;
  // Services that aren't connected yet are a product gap, not a failure on this file.
  const notConnected = signals.filter((s) => s.status === "not_run" && s.detail?.configured === false).length;
  const notRun = signals.length - ran - notConnected;
  if (signals.length > 0 && ran === 0) {
    // Spec §9.8: say so plainly instead of dressing up an empty result as "inconclusive, 50%".
    return {
      verdict: {
        label: "inconclusive",
        confidence: 0.5,
        summary: "None of the checks could run, so there is no evidence either way. This is a problem on our side, not a finding about your file.",
        next_steps: ["Try again in a minute."],
      },
      limits: [...limits, "No checks produced a result."],
    };
  }
  if (notRun > 0) limits.push(`${notRun} of ${signals.length} checks did not run. The result rests on fewer signals than usual.`);
  if (!signals.some((s) => s.category === "detector" && (s.status === "pass" || s.status === "fail" || s.status === "warn"))) {
    limits.push("No AI-generation detector produced a result for this file.");
  }

  // Logistic squash around zero; k chosen so 2 strong passes ≈ 0.8.
  const k = 0.55;
  let p = evidence === 0 ? 0.5 : 1 / (1 + Math.exp(-k * score));

  // --- 2b. Detector consensus ------------------------------------------------
  // Weak file checks must not cancel out two independent detectors that agree,
  // and a disagreement must read as "no answer", not as a lean either way.
  const decided = signals.filter((s) => s.category === "detector" && (s.status === "pass" || s.status === "fail"));
  if (decided.length >= 2) {
    const allFail = decided.every((s) => s.status === "fail");
    const allPass = decided.every((s) => s.status === "pass");
    if (allFail) {
      p = Math.min(p, 0.28);
      limits.push("Two independent detectors agree this looks AI-generated. Detectors are sometimes wrong on real photos, so check the other frames before acting on it.");
    } else if (allPass) {
      p = Math.min(Math.max(p, 0.72), 0.8);
      limits.push("Detectors look for AI generation. They do not rule out editing, cropping or a misleading caption.");
    } else {
      p = 0.5 + (p - 0.5) * 0.3;
      limits.push("The two detectors disagree, so their results cancel out.");
    }
  }

  // --- 3. Confidence dampers -------------------------------------------------
  const ingest = by("image.ingest");
  if (ingest?.detail?.recompressed === true) {
    limits.push("This file was compressed (likely by WhatsApp or a screenshot). Pixel-level checks are less reliable.");
    p = 0.5 + (p - 0.5) * 0.7;
  }
  if (evidence < 1.5) {
    limits.push("Few checks produced evidence. Treat this result as a starting point, not a conclusion.");
    p = 0.5 + (p - 0.5) * 0.6;
  }

  // Weak checks and metadata can't separate a camera photo from a generated or
  // edited one (metadata is trivially copied), so they may never move the result
  // out of the inconclusive band. "Likely authentic" needs a strong pass (signed
  // origin) or a detector/context signal; "likely manipulated" needs a strong or
  // medium flag.
  // A single detector never decides: it needs a second independent one agreeing.
  const detectorPasses = signals.filter((s) => s.category === "detector" && s.status === "pass").length;
  const detectorFails = signals.filter((s) => s.category === "detector" && s.status === "fail").length;
  const strongPass =
    signals.some((s) => s.status === "pass" && (s.weight === "strong" || (s.weight === "medium" && s.category === "context"))) ||
    detectorPasses >= 2;
  const strongFlag =
    signals.some((s) => (s.status === "fail" || s.status === "warn") && s.weight !== "weak" && s.category !== "detector") ||
    detectorFails >= 2;
  if (p > BAND[1] && !strongPass) {
    p = BAND[1] - 0.01;
    limits.push(detectorPasses === 1
      ? "Only one detector produced a clear result. One detector alone is not enough to call an image authentic, so the result stays inconclusive."
      : "Only file and metadata checks passed. They cannot tell a camera photo from a generated or edited image, so the result stays inconclusive.");
  }
  if (p < BAND[0] && !strongFlag) {
    p = BAND[0] + 0.01;
    limits.push(detectorFails === 1
      ? "Only one detector flagged this image. One detector alone is not enough to call it manipulated."
      : "Only weak checks raised concerns. That is not enough to call the image manipulated.");
  }

  return finish(p, signals, limits);
}

function finish(p: number, signals: Signal[], limits: string[], forcedSummary?: string): Aggregate {
  p = Math.min(0.98, Math.max(0.02, p));
  const label = labelFor(p, signals);
  return {
    verdict: {
      label,
      confidence: Number(p.toFixed(2)),
      summary: forcedSummary ?? summarise(label, signals),
      next_steps: nextSteps(label, signals),
    },
    limits,
  };
}

/** Inconclusive band 0.35–0.65 (spec §8.4); tune from evaluation data. */
export const BAND: [number, number] = [0.35, 0.65];

function labelFor(p: number, signals: Signal[]): VerdictLabel {
  const detectors = signals.filter((s) => s.category === "detector" && (s.status === "pass" || s.status === "fail"));
  const disagree = detectors.some((s) => s.status === "pass") && detectors.some((s) => s.status === "fail");
  if (disagree) return "inconclusive";
  if (p >= BAND[1]) return "likely_authentic";
  if (p <= BAND[0]) return "likely_manipulated";
  return "inconclusive";
}

const n = (c: number, word: string) => `${c} ${word}${c === 1 ? "" : "s"}`;

function summarise(label: VerdictLabel, signals: Signal[]): string {
  const found = signals.filter((s) => s.status === "pass").length;
  const flagged = signals.filter((s) => s.status === "warn" || s.status === "fail").length;
  const missing = signals.filter((s) => s.status === "not_found").length;
  const origin = signals.find((s) => s.id === "image.c2pa");
  const originLine = origin?.status === "not_found" ? "No origin record was found. " : "";
  switch (label) {
    case "likely_authentic":
      return `${originLine}${n(found, "check")} passed and ${flagged} raised concerns. Nothing here points to manipulation, which is not the same as proof that the scene happened as described.`;
    case "likely_manipulated":
      return `${originLine}${n(flagged, "check")} found signs consistent with editing or generation. Review the flagged frames before drawing conclusions.`;
    default:
      return `${originLine}${n(found, "check")} passed, ${flagged} raised concerns and ${missing} found nothing to go on. The evidence does not point clearly either way.`;
  }
}

function nextSteps(label: VerdictLabel, signals: Signal[]): string[] {
  const steps: string[] = [];
  if (signals.some((s) => s.id === "image.c2pa" && s.status === "not_found"))
    steps.push("Ask the sender for the original file. Forwarded copies lose their origin record.");
  if (label === "inconclusive") steps.push("Run a reverse image search for earlier copies with a different caption or date.");
  if (label === "likely_manipulated") steps.push("Do not share the image further until a second source confirms it.");
  steps.push("Open any flagged frame to see the evidence behind it.");
  return steps;
}
