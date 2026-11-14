import { CheckFlow } from "@/components/upload/CheckFlow";

/** Home and tool are the same page (spec §9.7). */
export default function HomePage() {
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_1fr] items-start">
      <div>
        <h1 className="wide text-[39px] md:text-[61px] leading-[1.02] max-w-[14ch]">Check what you were sent.</h1>
        <p className="measure mt-4 text-[20px] text-ink-soft">Images, documents, audio, video and claims. You get the evidence, not just a score.</p>
        <ul className="measure mt-6 space-y-2 text-ink-soft">
          <li>Signed origin records are checked before any guess from pixels.</li>
          <li>Every conclusion links to the signal behind it.</li>
          <li>Three honest outcomes: likely authentic, inconclusive, likely manipulated.</li>
          <li>Anonymous uploads are deleted after 24 hours.</li>
        </ul>
      </div>
      <CheckFlow />
    </div>
  );
}
