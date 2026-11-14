import { notFound } from "next/navigation";
import { loadReportByShare } from "@/lib/reports";
import { checksFor } from "@/lib/checks";
import { ProofSheet } from "@/components/proof-sheet/ProofSheet";

/** Public shared report: read-only, original hidden. */
export default async function SharedReportPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const report = await loadReportByShare(shareId);
  if (!report) notFound();

  const signals = Object.fromEntries(report.signals.map((s) => [s.id, s]));
  const checks = checksFor(report.media_type).filter((c) => signals[c.id]);
  const date = new Date(report.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <p className="mb-6 text-[13px] text-ink-soft">
        This report was made on {date} with pipeline {report.versions.pipeline}. Results can change as tools improve.
      </p>
      <ProofSheet previewUrl={null} checks={checks} signals={signals} verdict={report.verdict} limits={report.limits} analysing={false} />
    </div>
  );
}
