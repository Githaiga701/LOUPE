// Regression cases for lib/aggregate.ts. Run: node --experimental-strip-types scripts/aggregate-cases.mts
// Each case pins the verdict label for a realistic signal mix. Change only with a reason in the commit.
import { aggregate } from "../lib/aggregate.ts";
import type { Signal } from "@loupe/schema";

const mk = (id: string, status: Signal["status"], weight: Signal["weight"], category: Signal["category"] = "forensics", detail: Record<string, unknown> = {}): Signal =>
  ({ id, category, status, weight, title: id, plain: "", detail, ran_ms: 0 });

const fileChecks: Signal[] = [
  mk("image.ingest", "pass", "weak", "ingest"), mk("image.exif", "not_found", "medium"),
  mk("image.c2pa", "not_found", "strong", "provenance"), mk("image.generator_tags", "not_found", "weak", "provenance"),
  mk("image.ela", "pass", "weak"), mk("image.jpeg_quant", "pass", "weak"),
  mk("image.reverse_search", "not_run", "weak", "context", { configured: false }),
];
const se = (s: Signal["status"]) => mk("image.detector.sightengine", s, s === "warn" || s === "not_run" ? "weak" : "medium", "detector");
const hv = (s: Signal["status"]) => mk("image.detector.hive", s, s === "warn" || s === "not_run" ? "weak" : "medium", "detector");

const cases: [string, Signal[], string][] = [
  ["file checks only", fileChecks, "inconclusive"],
  ["consistent EXIF only", fileChecks.map((s) => (s.id === "image.exif" ? { ...s, status: "pass" as const } : s)), "inconclusive"],
  ["both detectors: real", [...fileChecks, se("pass"), hv("pass")], "likely_authentic"],
  ["both detectors: AI", [...fileChecks, se("fail"), hv("fail")], "likely_manipulated"],
  ["detectors disagree", [...fileChecks, se("pass"), hv("fail")], "inconclusive"],
  ["one real, one down", [...fileChecks, se("pass"), hv("not_run")], "inconclusive"],
  ["one AI, one down", [...fileChecks, se("fail"), hv("not_run")], "inconclusive"],
  ["generator tag in metadata", fileChecks.map((s) => (s.id === "image.generator_tags" ? { ...s, status: "fail" as const, weight: "strong" as const } : s)), "likely_manipulated"],
  ["broken C2PA signature", fileChecks.map((s) => (s.id === "image.c2pa" ? { ...s, status: "fail" as const } : s)), "likely_manipulated"],
  ["nothing ran", fileChecks.map((s) => ({ ...s, status: "not_run" as const })), "inconclusive"],
];

let failed = 0;
for (const [name, signals, want] of cases) {
  const { verdict } = aggregate(signals);
  const ok = verdict.label === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(28)} ${verdict.label} ${verdict.confidence}${ok ? "" : `  (want ${want})`}`);
}
if (failed) { console.error(`${failed} case(s) failed`); process.exit(1); }
