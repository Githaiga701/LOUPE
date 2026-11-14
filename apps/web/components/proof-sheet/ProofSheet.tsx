"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { CheckDescriptor, Signal, Verdict } from "@loupe/schema";
import { Frame } from "./Frame";
import type { FrameState } from "./StatusIcon";
import { VerdictPlate } from "../verdict/VerdictPlate";
import { EvidenceDrawer } from "../evidence/EvidenceDrawer";

export interface ProofSheetProps {
  /** Preview of the uploaded item (object URL or blob URL). Hidden on shared reports. */
  previewUrl?: string | null;
  previewAlt?: string;
  checks: CheckDescriptor[];
  started?: Set<string>;
  signals: Record<string, Signal>;
  verdict?: Verdict;
  limits?: string[];
  analysing: boolean;
  announce?: string;
  actions?: React.ReactNode;
}

/**
 * The contact sheet. Grid is laid out from `checks` before anything runs so
 * nothing shifts; frames develop as their signals arrive, in whatever order
 * they complete. The verdict plate slides up 400 ms after the last frame.
 */
export function ProofSheet({ previewUrl, previewAlt, checks, started, signals, verdict, limits = [], analysing, announce, actions }: ProofSheetProps) {
  const reduce = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [showPlate, setShowPlate] = useState(false);

  // A beat of 400 ms after the last frame develops, then the plate slides up (spec §9.6).
  useEffect(() => {
    if (!verdict) return;
    const t = setTimeout(() => setShowPlate(true), reduce ? 0 : 400);
    return () => clearTimeout(t);
  }, [verdict, reduce]);

  const slow = useMemo(() => checks.filter((c) => c.timeout_s >= 25 && started?.has(c.id) && !signals[c.id]), [checks, started, signals]);

  // Arrow-key navigation across frames (spec §9.9).
  const onGridKey = (e: React.KeyboardEvent) => {
    const items = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[role="button"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const cols = Math.max(1, Math.floor((gridRef.current?.clientWidth ?? 1) / (items[0]?.offsetWidth + 12 || 1)));
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    items[Math.max(0, Math.min(items.length - 1, next))]?.focus();
  };

  const stateFor = (c: CheckDescriptor): FrameState => signals[c.id]?.status ?? (started?.has(c.id) ? "developing" : "queued");

  return (
    <div className="grid gap-8 md:grid-cols-[var(--frame-size)_1fr] lg:grid-cols-[calc(var(--frame-size)*1.6)_1fr]">
      {/* The item under inspection */}
      <div className={`relative self-start ${analysing ? "crop" : ""}`}>
        {analysing && <span className="crop-b" aria-hidden />}
        <div className="relative aspect-square bg-frame border border-rule rounded-[var(--radius)] overflow-hidden flex items-center justify-center">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={previewAlt ?? "The uploaded image"} className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-ink-soft text-[13px] px-4 text-center">Original hidden</span>
          )}
          {analysing && !reduce && (
            <motion.span aria-hidden className="scanline absolute left-0 right-0 top-0 h-[2px] bg-ink/60" />
          )}
        </div>
      </div>

      {/* Frames */}
      <div>
        <div
          ref={gridRef}
          onKeyDown={onGridKey}
          role="list"
          aria-label="Checks"
          className="grid gap-[var(--gap)] grid-cols-[repeat(auto-fill,var(--frame-size))]"
        >
          {checks.map((c) => (
            <div key={c.id} role="listitem">
              <Frame
                checkId={c.id}
                title={c.title}
                state={stateFor(c)}
                plain={signals[c.id]?.plain}
                inspected={openId === c.id}
                caption={slow.some((s) => s.id === c.id) ? `This can take up to ${c.timeout_s} seconds.` : undefined}
                onOpen={signals[c.id] ? setOpenId : undefined}
              />
            </div>
          ))}
        </div>
        {slow.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-soft" aria-live="polite">
            {slow[0].title} is still running. This can take up to {slow[0].timeout_s} seconds.
          </p>
        )}
        <div className="sr-only" aria-live="polite" aria-atomic="true">{announce}</div>

        {verdict && showPlate && (
          <div className="mt-8">
            <VerdictPlate verdict={verdict} limits={limits} actions={actions} />
          </div>
        )}
      </div>

      <EvidenceDrawer signal={openId ? signals[openId] ?? null : null} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}
