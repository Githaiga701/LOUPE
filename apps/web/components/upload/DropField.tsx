"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { SUPPORTED_EXTENSIONS, SUPPORTED_IMAGE_TYPES, UPLOAD_MAX_MB } from "@/lib/checks";

export interface Picked {
  file: File;
  previewUrl: string;
}

/**
 * A large square with a dashed rule border; crop marks appear only while a
 * file is dragged over it. Accepts drop, click, paste and the share sheet.
 */
export function DropField({ picked, onPick, onError }: { picked: Picked | null; onPick: (p: Picked | null) => void; onError: (msg: string) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback((file: File | undefined | null) => {
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      const ext = file.name.split(".").pop() ?? "this";
      return onError(`Loupe can't read .${ext} files yet. Supported: ${SUPPORTED_EXTENSIONS}.`);
    }
    if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
      return onError(`This file is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${UPLOAD_MAX_MB} MB. Export a smaller copy and try again.`);
    }
    onPick({ file, previewUrl: URL.createObjectURL(file) });
  }, [onPick, onError]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? [])[0];
      if (f) accept(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a file here, paste a link, or paste a claim"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files[0]); }}
        className={`relative mx-auto aspect-square w-full max-w-[420px] border-2 border-dashed border-rule rounded-[var(--radius)] bg-frame flex items-center justify-center cursor-pointer ${over ? "crop" : ""}`}
      >
        {over && <span className="crop-b" aria-hidden />}
        {picked ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picked.previewUrl} alt={picked.file.name} className="max-w-full max-h-full object-contain p-2" />
        ) : (
          <div className="text-center px-6">
            <p className="text-[20px]">Drop a file here</p>
            <p className="text-ink-soft mt-1">or click to choose. {SUPPORTED_EXTENSIONS}, up to {UPLOAD_MAX_MB} MB.</p>
          </div>
        )}
        <input ref={inputRef} type="file" accept={SUPPORTED_IMAGE_TYPES.join(",")} className="sr-only" onChange={(e) => accept(e.target.files?.[0])} />
      </div>
      <div className="mx-auto mt-3 grid max-w-[420px] grid-cols-3 gap-[var(--gap)]">
        <SourceTile label="Upload a file" active onClick={() => inputRef.current?.click()} />
        <SourceTile label="Paste a link" soon />
        <SourceTile label="Paste a claim" soon />
      </div>
    </div>
  );
}

function SourceTile({ label, active, soon, onClick }: { label: string; active?: boolean; soon?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={soon}
      onClick={onClick}
      title={soon ? "Coming in a later phase" : undefined}
      className={`aspect-square border rounded-[var(--radius)] text-[13px] p-2 text-left align-bottom flex items-end ${active ? "border-ink bg-frame" : "border-rule bg-frame-dim text-ink-soft"}`}
    >
      {label}{soon ? " (soon)" : ""}
    </button>
  );
}

/** Uploads straight to Vercel Blob with a token from /api/v1/uploads. */
export async function uploadToBlob(file: File) {
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  return upload(`uploads/${safe}`, file, {
    access: "private",
    handleUploadUrl: "/api/v1/uploads",
    contentType: file.type,
  });
}
