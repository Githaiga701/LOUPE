import { Signal, type CheckRequest } from "@loupe/schema";
import { env } from "./env";
import { checkById } from "./checks";

/**
 * Adapter that calls the Python checks service. One HTTP call per check so
 * each one can time out, retry and fail independently (spec §5 "every
 * detector lives behind an adapter with the same interface").
 */
export async function runCheck(req: CheckRequest): Promise<Signal> {
  if (env.CHECKS_MODE === "fake") return fakeSignal(req);

  const desc = checkById(req.check_id);
  const timeoutMs = (desc?.timeout_s ?? 30) * 1000;
  const started = Date.now();
  const path = req.check_id.replace(/\./g, "/"); // image.exif -> /v1/checks/image/exif
  const res = await fetch(`${env.CHECKS_URL}/v1/checks/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-loupe-key": env.CHECKS_SHARED_SECRET,
      ...(env.CHECKS_BYPASS_SECRET ? { "x-vercel-protection-bypass": env.CHECKS_BYPASS_SECRET } : {}),
    },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`checks service ${res.status} for ${req.check_id}: ${text.slice(0, 200)}`);
  }
  const parsed = Signal.parse(await res.json());
  return { ...parsed, ran_ms: parsed.ran_ms || Date.now() - started };
}

/** Marks a check that could not run. The report still ships (spec principle 5). */
export function notRunSignal(check_id: string, reason: string): Signal {
  const desc = checkById(check_id);
  return {
    id: check_id,
    category: desc?.category ?? "forensics",
    status: "not_run",
    weight: "weak",
    title: desc?.title ?? check_id,
    plain: reason,
    detail: {},
    ran_ms: 0,
  };
}

// ---------------------------------------------------------------------------
// Fake mode: deterministic-ish synthetic signals so the contact sheet can be
// developed without the Python service. Never used when CHECKS_MODE=live.
async function fakeSignal(req: CheckRequest): Promise<Signal> {
  const desc = checkById(req.check_id)!;
  const delay = 400 + Math.random() * 1800;
  await new Promise((r) => setTimeout(r, delay));
  const table: Record<string, Partial<Signal>> = {
    "image.ingest": { status: "pass", weight: "weak", plain: "JPEG, 1.2 MB. Looks like it was recompressed before it reached you.", detail: { recompressed: true, mime: "image/jpeg" } },
    "image.exif": { status: "warn", weight: "medium", plain: "No camera make or model recorded. Most phones write this; messaging apps strip it.", detail: {} },
    "image.c2pa": { status: "not_found", weight: "strong", plain: "This file carries no signed record of where it came from.", detail: { manifest: null } },
    "image.generator_tags": { status: "pass", weight: "medium", plain: "No AI generator named in the file's metadata.", detail: {} },
    "image.ela": { status: "warn", weight: "weak", plain: "Compression levels vary across the image, which can mean editing or just heavy recompression.", detail: {} },
    "image.jpeg_quant": { status: "pass", weight: "weak", plain: "Compression tables match a single save from a common encoder.", detail: {} },
  };
  const t = table[req.check_id] ?? { status: "not_run", weight: "weak", plain: "No fake data for this check." };
  return {
    id: req.check_id,
    category: desc.category,
    title: desc.title,
    status: t.status!,
    weight: t.weight!,
    plain: t.plain!,
    detail: t.detail ?? {},
    ran_ms: Math.round(delay),
    tool: { name: "fake", version: "0" },
  };
}
