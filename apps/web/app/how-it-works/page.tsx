import { CHECKS } from "@/lib/checks";

/** The "How Loupe works and where it fails" page is part of the MVP definition of done. */
export default function HowItWorksPage() {
  return (
    <article className="measure">
      <h1 className="wide text-[31px]">How Loupe works, and where it fails</h1>
      <p className="mt-4">Loupe runs a file through a series of independent checks and shows you every result. It never returns a bare &ldquo;real&rdquo; or &ldquo;fake&rdquo;.</p>

      <h2 className="text-[20px] font-semibold mt-8">Order of trust</h2>
      <ol className="list-decimal pl-5 mt-2 space-y-1">
        <li><strong>Provenance first.</strong> A valid, signed origin record (Content Credentials) beats any guess from pixels.</li>
        <li><strong>Forensics second.</strong> Metadata consistency and compression history can reveal editing but are easy to strip.</li>
        <li><strong>Detectors last.</strong> Model-based detectors are useful and fallible. Loupe runs more than one and treats disagreement as a reason to say &ldquo;inconclusive&rdquo;.</li>
      </ol>

      <h2 className="text-[20px] font-semibold mt-8">Checks in this version</h2>
      <ul className="mt-2 space-y-1">
        {CHECKS.map((c) => <li key={c.id}><span className="mono">{c.id}</span> &mdash; {c.title}</li>)}
      </ul>

      <h2 className="text-[20px] font-semibold mt-8">Who sees your file</h2>
      <ul className="list-disc pl-5 mt-2 space-y-1">
        <li>Your file is stored privately and deleted after 24 hours unless you save the report.</li>
        <li>To run the AI-generation detectors, a copy of the image is sent to two outside services: Sightengine and Hive. Nothing else about you is sent.</li>
        <li>Shared report links never include the original file.</li>
      </ul>

      <h2 className="text-[20px] font-semibold mt-8">Known weaknesses</h2>
      <ul className="list-disc pl-5 mt-2 space-y-1">
        <li>Files forwarded through WhatsApp or screenshotted lose metadata and are recompressed. Pixel checks become unreliable; the report says so.</li>
        <li>A &ldquo;likely authentic&rdquo; result means no sign of manipulation was found. It does not mean the scene happened as described.</li>
        <li>AI-image detectors are often wrong, especially on real photos. Loupe runs two and treats disagreement as &ldquo;inconclusive&rdquo;; neither one decides the result alone.</li>
        <li>Detectors go stale as generators improve. Every report records the pipeline version so old results can be explained.</li>
        <li>Loupe does not detect AI-written text. Those detectors produce false accusations.</li>
      </ul>
    </article>
  );
}
