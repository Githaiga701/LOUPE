"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { Signal } from "@loupe/schema";
import { StatusIcon, STATE_COLOR, STATE_WORD } from "../proof-sheet/StatusIcon";

const WHY: Record<string, string> = {
  "image.ingest": "Knowing what the file is, and whether it was recompressed, tells you how much the pixel checks can be trusted.",
  "image.exif": "Cameras write a consistent set of metadata. Gaps or contradictions suggest the file was edited or passed through an app that strips it.",
  "image.c2pa": "Content Credentials are a signed record of origin and edits. When present and valid, they beat any guess from pixels.",
  "image.generator_tags": "Many AI generators label their output in metadata. A label is strong evidence; its absence proves nothing.",
  "image.ela": "Error level analysis highlights regions saved a different number of times, which can reveal pasted-in content.",
  "image.jpeg_quant": "A JPEG saved twice carries traces of both saves. Mismatched tables suggest the image was opened and re-saved by an editor.",
  "image.detector.sightengine": "A model trained on real and AI-generated images. Loupe runs two independent detectors; when they disagree, the result is inconclusive.",
  "image.detector.hive": "A second, independent model, which also estimates which generator may have produced the image and whether faces were swapped.",
  "image.reverse_search": "Finding the earliest copy of an image often settles more than any pixel check: an old photo reposted with a new caption is the most common kind of fake.",
};
const RELIABILITY: Record<string, string> = {
  "image.ingest": "Reliable for what the file is; the recompression guess is a heuristic.",
  "image.exif": "Metadata is easy to strip and easy to forge. Treat it as a hint, not proof.",
  "image.c2pa": "Cryptographically verified. Reliable when present; most files do not have it yet.",
  "image.generator_tags": "Reliable when a tag is present. Tags are often removed by messaging apps.",
  "image.ela": "Experimental. Heavy recompression produces false alarms.",
  "image.jpeg_quant": "Moderate. Some apps re-save every image, which looks the same as editing.",
  "image.detector.sightengine": "Useful but fallible. Independent audits in 2026 found leading detectors often call real photos fake, so a single detector never decides the verdict.",
  "image.detector.hive": "Useful but fallible, for the same reason. Recompressed or screenshotted images are harder for every detector.",
  "image.reverse_search": "Reliable at finding exact and near copies; it cannot find images that were never posted publicly.",
};

/**
 * Slides from the right on desktop, from the bottom on mobile. Contents in
 * order: plain result, why it matters, technical detail (collapsed), visual,
 * and an honest reliability note.
 */
export function EvidenceDrawer({ signal, open, onOpenChange }: { signal: Signal | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/30 data-[state=open]:animate-in" />
        <Dialog.Content
          className="fixed z-50 bg-frame border-rule shadow-none outline-none overflow-y-auto
                     bottom-0 left-0 right-0 max-h-[85vh] border-t
                     md:top-0 md:bottom-0 md:left-auto md:right-0 md:w-[440px] md:max-h-none md:border-t-0 md:border-l p-6"
        >
          {signal && (
            <>
              <Dialog.Title className={`flex items-center gap-2 text-[25px] font-semibold ${STATE_COLOR[signal.status]}`}>
                <StatusIcon state={signal.status} size={24} />
                {signal.title}
              </Dialog.Title>
              <Dialog.Description className="text-ink-soft text-[13px] mt-1">{STATE_WORD[signal.status]} · {signal.weight} evidence · {signal.ran_ms} ms</Dialog.Description>

              <p className="mt-4 text-[16px]">{signal.plain}</p>

              <h3 className="mt-6 text-[13px] text-ink-soft">Why it matters</h3>
              <p className="mt-1">{signal.why ?? WHY[signal.id] ?? "This check contributes one piece of evidence to the overall result."}</p>

              <details className="mt-6 border border-rule rounded-[var(--radius)]">
                <summary className="cursor-pointer px-3 py-2 text-[13px] text-ink-soft select-none">Technical detail</summary>
                <pre className="mono px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(signal.detail, null, 2)}</pre>
                {signal.tool && <div className="mono px-3 pb-2 text-ink-soft">tool: {signal.tool.name}{signal.tool.version ? `@${signal.tool.version}` : ""}{signal.tool.licence ? ` (${signal.tool.licence})` : ""}</div>}
              </details>

              <h3 className="mt-6 text-[13px] text-ink-soft">How reliable is this check?</h3>
              <p className="mt-1">{signal.reliability ?? RELIABILITY[signal.id] ?? "Reliability for this check has not been measured yet."}</p>

              <Dialog.Close className="mt-8 inline-flex h-10 items-center px-4 border border-rule rounded-[var(--radius)] hover:bg-frame-dim">Close</Dialog.Close>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
