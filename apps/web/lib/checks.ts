import type { CheckDescriptor, MediaType } from "@loupe/schema";

/**
 * The check registry. Order matters: cheap, deterministic checks first.
 * The grid is laid out from this list before anything runs, so nothing shifts later.
 * Adding a check = one entry here + one adapter in the checks service.
 */
export const CHECKS: CheckDescriptor[] = [
  { id: "image.ingest", category: "ingest", title: "File identity", media_types: ["image"], timeout_s: 15 },
  { id: "image.exif", category: "forensics", title: "Camera metadata", media_types: ["image"], timeout_s: 15 },
  { id: "image.c2pa", category: "provenance", title: "Content Credentials", media_types: ["image"], timeout_s: 20 },
  { id: "image.generator_tags", category: "provenance", title: "AI generator tags", media_types: ["image"], timeout_s: 10 },
  { id: "image.ela", category: "forensics", title: "Error level analysis", media_types: ["image"], timeout_s: 30 },
  { id: "image.jpeg_quant", category: "forensics", title: "JPEG compression history", media_types: ["image"], timeout_s: 15 },
  // Detectors last (spec §6): two independent vendors; disagreement lowers confidence.
  { id: "image.detector.sightengine", category: "detector", title: "Detector A (Sightengine)", media_types: ["image"], timeout_s: 30 },
  { id: "image.detector.hive", category: "detector", title: "Detector B (Hive)", media_types: ["image"], timeout_s: 30 },
  { id: "image.reverse_search", category: "context", title: "Earlier copies", media_types: ["image"], timeout_s: 30 },
];

export function checksFor(media: MediaType): CheckDescriptor[] {
  return CHECKS.filter((c) => c.media_types.includes(media));
}

export function checkById(id: string): CheckDescriptor | undefined {
  return CHECKS.find((c) => c.id === id);
}

export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const SUPPORTED_EXTENSIONS = "JPG, PNG, WebP, HEIC";
export const UPLOAD_MAX_MB = Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_MB ?? 50);
