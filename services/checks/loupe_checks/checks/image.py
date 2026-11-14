"""Image checks. Each is a pure function of (file path, request) → Signal.

Plain-language rules (spec §8): say "likely", never "is"; say "no origin
record found", not "fake"; never name a person.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops
from PIL.ExifTags import TAGS

from ..registry import check
from ..schemas import CheckRequest, Signal, Tool

try:  # HEIC from iPhones
    from pillow_heif import register_heif_opener

    register_heif_opener()
except Exception:  # pragma: no cover
    pass

PIL_TOOL = Tool(name="Pillow", version=getattr(Image, "__version__", None), licence="HPND")

MAGIC = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"RIFF": "image/webp",  # + WEBP at offset 8
    b"GIF8": "image/gif",
}

# Typical WhatsApp output: JPEG, long edge ≤ 1600 (older) or 2048/4096 with HD, quality ~ 70-80, no EXIF.
WHATSAPP_EDGES = {1600, 1280, 2048, 4096, 1024, 960, 720}


def _sniff(data: bytes) -> str | None:
    for magic, mime in MAGIC.items():
        if data.startswith(magic):
            if mime == "image/webp" and data[8:12] != b"WEBP":
                continue
            return mime
    if data[4:12] in (b"ftypheic", b"ftypheix", b"ftypmif1", b"ftypmsf1", b"ftyphevc"):
        return "image/heic"
    return None


@check("image.ingest")
async def ingest(path: Path, req: CheckRequest) -> Signal:
    data = path.read_bytes()
    mime = _sniff(data)
    sha = hashlib.sha256(data).hexdigest()
    if mime is None:
        return Signal(id="image.ingest", category="ingest", status="fail", weight="strong", title="File identity",
                      plain="This file does not start like any supported image, whatever its name says.",
                      detail={"sha256": sha, "declared": req.content_type}, tool=PIL_TOOL)
    declared = req.content_type
    mismatch = bool(declared and declared != mime and not (declared == "image/heif" and mime == "image/heic"))

    with Image.open(io.BytesIO(data)) as im:
        w, h = im.size
        fmt = im.format
        has_exif = bool(im.getexif())
        quality_hint = None
        if fmt == "JPEG":
            q = getattr(im, "quantization", None) or {}
            luma = np.array(list(q.get(0, [])), dtype=np.float32) if q else np.array([])
            quality_hint = _estimate_quality(luma) if luma.size == 64 else None
        phash = _phash(im)

    # Heuristic, weak evidence: WhatsApp and most share sheets strip EXIF, cap the long edge and save at q≈70-80.
    recompressed = fmt == "JPEG" and not has_exif and (max(w, h) in WHATSAPP_EDGES or (quality_hint is not None and 60 <= quality_hint <= 82))
    size_kb = len(data) // 1024
    plain = f"{fmt}, {w}×{h}, {size_kb} KB."
    if recompressed:
        plain += " Looks like it was recompressed before it reached you (likely a messaging app or a screenshot)."
    elif not has_exif:
        plain += " No camera metadata is present."
    status = "warn" if mismatch else ("warn" if recompressed else "pass")
    if mismatch:
        plain = f"Declared as {declared} but the bytes are {mime}. " + plain
    return Signal(id="image.ingest", category="ingest", status=status, weight="weak" if not mismatch else "medium",
                  title="File identity", plain=plain,
                  detail={"mime": mime, "declared": declared, "width": w, "height": h, "bytes": len(data),
                          "sha256": sha, "phash": phash, "has_exif": has_exif, "recompressed": recompressed,
                          "estimated_jpeg_quality": quality_hint},
                  tool=PIL_TOOL)


def _phash(im: Image.Image) -> str | None:
    try:
        import imagehash

        return str(imagehash.phash(im))
    except Exception:
        return None


@check("image.exif")
async def exif(path: Path, req: CheckRequest) -> Signal:
    with Image.open(path) as im:
        ex = im.getexif()
        w, h = im.size
        if not ex:
            return Signal(id="image.exif", category="forensics", status="not_found", weight="medium", title="Camera metadata",
                          plain="No camera metadata is present. Phones write it; messaging apps and most editors strip it.",
                          detail={}, tool=PIL_TOOL)
        base = {TAGS.get(k, str(k)): _jsonable(v) for k, v in ex.items()}
        ifd = {}
        try:
            from PIL.ExifTags import IFD

            ifd = {TAGS.get(k, str(k)): _jsonable(v) for k, v in ex.get_ifd(IFD.Exif).items()}
        except Exception:
            pass
    merged = {**base, **ifd}
    make, model, software = merged.get("Make"), merged.get("Model"), merged.get("Software")
    px_w, px_h = merged.get("ExifImageWidth"), merged.get("ExifImageHeight")
    dt_orig, dt_mod = merged.get("DateTimeOriginal"), merged.get("DateTime")

    issues: list[str] = []
    if px_w and px_h and (int(px_w), int(px_h)) not in {(w, h), (h, w)}:
        issues.append(f"Metadata says {px_w}×{px_h} but the image is {w}×{h}, so it was resized or cropped after capture.")
    if software and any(k in str(software).lower() for k in ("photoshop", "gimp", "lightroom", "affinity", "snapseed", "pixelmator", "canva", "picsart")):
        issues.append(f"Edited with {software}.")
    if dt_orig and dt_mod and dt_orig != dt_mod:
        issues.append("Capture time and last-modified time differ, which happens after editing or re-saving.")
    if not make and not model:
        issues.append("No camera make or model recorded, although other metadata survived.")

    if issues:
        status, plain = "warn", " ".join(issues)
    else:
        status, plain = "pass", f"Metadata is internally consistent. Recorded on a {make} {model}." if make else "Metadata is internally consistent."
    keep = {k: merged[k] for k in ("Make", "Model", "Software", "DateTimeOriginal", "DateTime", "ExifImageWidth", "ExifImageHeight", "Orientation", "LensModel") if k in merged}
    return Signal(id="image.exif", category="forensics", status=status, weight="medium", title="Camera metadata",
                  plain=plain, detail={"exif": keep, "issues": issues}, tool=PIL_TOOL)


def _jsonable(v):
    if isinstance(v, bytes):
        return v[:32].hex()
    if isinstance(v, (int, float, str)):
        return v
    try:
        return float(v)
    except Exception:
        return str(v)[:200]


@check("image.c2pa")
async def c2pa(path: Path, req: CheckRequest) -> Signal:
    """Read and verify Content Credentials (C2PA). Strong evidence when present."""
    try:
        import c2pa  # type: ignore
    except Exception:
        return Signal(id="image.c2pa", category="provenance", status="not_run", weight="strong", title="Content Credentials",
                      plain="The Content Credentials reader is not installed on this server.", detail={})
    tool = Tool(name="c2pa-python", version=getattr(c2pa, "__version__", None), licence="MIT/Apache-2.0")
    try:
        with c2pa.Reader(str(path)) as reader:  # type: ignore[attr-defined]
            manifest = json.loads(reader.json())
    except Exception as e:
        name = type(e).__name__
        msg = str(e)
        if "ManifestNotFound" in name or "no manifest" in msg.lower() or "JumbfNotFound" in name:
            return Signal(id="image.c2pa", category="provenance", status="not_found", weight="strong", title="Content Credentials",
                          plain="This file carries no signed record of where it came from.", detail={"manifest": None}, tool=tool)
        return Signal(id="image.c2pa", category="provenance", status="error", weight="strong", title="Content Credentials",
                      plain="The origin record could not be read.", detail={"error": name}, tool=tool)

    active = manifest.get("active_manifest")
    m = (manifest.get("manifests") or {}).get(active, {}) if active else {}
    statuses = manifest.get("validation_status") or []
    failures = [s for s in statuses if "failure" in str(s.get("code", "")).lower() or s.get("explanation", "").lower().startswith("fail")]
    sig_info = m.get("signature_info") or {}
    issuer = sig_info.get("issuer")
    claim_gen = m.get("claim_generator") or m.get("claim_generator_info", [{}])[0].get("name")
    assertions = m.get("assertions") or []
    ai_generated = False
    for a in assertions:
        if "actions" in str(a.get("label", "")):
            for act in (a.get("data") or {}).get("actions", []):
                src = str(act.get("digitalSourceType", "")).lower()
                if "trainedalgorithmicmedia" in src or "compositewithtrainedalgorithmicmedia" in src:
                    ai_generated = True
    edits = [act.get("action") for a in assertions if "actions" in str(a.get("label", "")) for act in (a.get("data") or {}).get("actions", [])]

    detail = {"issuer": issuer, "claim_generator": claim_gen, "edits": edits, "ai_generated": ai_generated,
              "validation_failures": failures, "trusted_issuer": bool(issuer) and not failures}
    if failures:
        return Signal(id="image.c2pa", category="provenance", status="fail", weight="strong", title="Content Credentials",
                      plain="An origin record is present but its signature does not verify. The file was changed after signing, or the record was tampered with.",
                      detail=detail, tool=tool)
    if ai_generated:
        return Signal(id="image.c2pa", category="provenance", status="fail", weight="strong", title="Content Credentials",
                      plain=f"A valid origin record declares this image as AI-generated{f' by {claim_gen}' if claim_gen else ''}.",
                      detail=detail, tool=tool)
    return Signal(id="image.c2pa", category="provenance", status="pass", weight="strong", title="Content Credentials",
                  plain=f"A valid signed origin record was found{f', issued by {issuer}' if issuer else ''}{f', created with {claim_gen}' if claim_gen else ''}. It records {len(edits)} edit action(s).",
                  detail=detail, tool=tool)


GENERATOR_MARKERS = {
    "dall-e": "DALL·E", "openai": "OpenAI", "midjourney": "Midjourney", "stable diffusion": "Stable Diffusion",
    "stablediffusion": "Stable Diffusion", "comfyui": "ComfyUI", "automatic1111": "AUTOMATIC1111", "novelai": "NovelAI",
    "firefly": "Adobe Firefly", "imagen": "Google Imagen", "gemini": "Google Gemini", "flux": "FLUX", "leonardo": "Leonardo",
    "ideogram": "Ideogram", "bing image creator": "Bing Image Creator", "grok": "Grok", "sora": "Sora",
}


@check("image.generator_tags")
async def generator_tags(path: Path, req: CheckRequest) -> Signal:
    """Look for AI generator names in text metadata (PNG tEXt, EXIF Software/ImageDescription, XMP)."""
    found: dict[str, str] = {}
    with Image.open(path) as im:
        texts: dict[str, str] = {}
        for k, v in (im.info or {}).items():
            if isinstance(v, (str, bytes)) and k.lower() not in ("icc_profile", "exif"):
                texts[k] = v.decode("utf-8", "ignore") if isinstance(v, bytes) else v
        ex = im.getexif()
        for tag in (305, 270, 315):  # Software, ImageDescription, Artist
            if tag in ex:
                texts[TAGS.get(tag, str(tag))] = str(ex[tag])
        xmp = im.info.get("xmp")
        if xmp:
            texts["xmp"] = xmp.decode("utf-8", "ignore") if isinstance(xmp, bytes) else str(xmp)
    for k, v in texts.items():
        low = v.lower()
        for marker, name in GENERATOR_MARKERS.items():
            if marker in low:
                found[k] = name
    # Stable Diffusion WebUI writes a "parameters" chunk with the prompt.
    if "parameters" in texts and ("steps:" in texts["parameters"].lower() or "sampler:" in texts["parameters"].lower()):
        found["parameters"] = "Stable Diffusion WebUI"
    if found:
        names = sorted(set(found.values()))
        return Signal(id="image.generator_tags", category="provenance", status="fail", weight="strong", title="AI generator tags",
                      plain=f"The file's own metadata names {', '.join(names)}, which generates images.",
                      detail={"found": found}, tool=PIL_TOOL)
    return Signal(id="image.generator_tags", category="provenance", status="pass" if texts else "not_found", weight="medium" if texts else "weak",
                  title="AI generator tags",
                  plain="No AI generator is named in the file's metadata." if texts else "The file has no text metadata to inspect. Many apps strip it, so this proves nothing either way.",
                  detail={"fields": sorted(texts)}, tool=PIL_TOOL)


@check("image.ela")
async def ela(path: Path, req: CheckRequest) -> Signal:
    """Error level analysis: re-save at q90 and measure where the difference is uneven. Experimental."""
    with Image.open(path) as im:
        rgb = im.convert("RGB")
        if max(rgb.size) > 1600:
            rgb.thumbnail((1600, 1600))
        buf = io.BytesIO()
        rgb.save(buf, "JPEG", quality=90)
        buf.seek(0)
        resaved = Image.open(buf).convert("RGB")
        diff = ImageChops.difference(rgb, resaved)
        arr = np.asarray(diff, dtype=np.float32).mean(axis=2)
    # Compare block-wise energy: a pasted region often shows a distinct error level.
    bs = 32
    h, w = arr.shape
    blocks = arr[: h // bs * bs, : w // bs * bs].reshape(h // bs, bs, w // bs, bs).mean(axis=(1, 3))
    if blocks.size < 4:
        return Signal(id="image.ela", category="forensics", status="not_run", weight="weak", title="Error level analysis",
                      plain="The image is too small for this check.", detail={})
    mean, std = float(blocks.mean()), float(blocks.std())
    hot = float((blocks > mean + 2.5 * std).mean()) if std > 0 else 0.0
    cv = std / mean if mean > 0 else 0.0
    detail = {"block_mean": round(mean, 3), "block_std": round(std, 3), "cv": round(cv, 3), "hot_fraction": round(hot, 4), "block_px": bs}
    if cv > 1.2 and 0.002 < hot < 0.2:
        return Signal(id="image.ela", category="forensics", status="warn", weight="weak", title="Error level analysis",
                      plain="A small region re-saves differently from the rest of the image, which can mean pasted-in content, or just a flat area like sky or text.",
                      detail=detail, tool=PIL_TOOL)
    return Signal(id="image.ela", category="forensics", status="pass", weight="weak", title="Error level analysis",
                  plain="Compression error is spread evenly across the image.", detail=detail, tool=PIL_TOOL)


@check("image.jpeg_quant")
async def jpeg_quant(path: Path, req: CheckRequest) -> Signal:
    """JPEG quantization tables: standard-vs-custom and a double-compression heuristic."""
    with Image.open(path) as im:
        if im.format != "JPEG":
            return Signal(id="image.jpeg_quant", category="forensics", status="not_run", weight="weak", title="JPEG compression history",
                          plain=f"Only applies to JPEG files; this is {im.format}.", detail={"format": im.format})
        q = getattr(im, "quantization", None) or {}
        gray = np.asarray(im.convert("L"), dtype=np.float32)
    luma = np.array(list(q.get(0, [])), dtype=np.float32) if q else np.array([])
    if luma.size != 64:
        return Signal(id="image.jpeg_quant", category="forensics", status="not_run", weight="weak", title="JPEG compression history",
                      plain="No readable quantization table.", detail={})
    est_quality = _estimate_quality(luma)
    # Double-compression heuristic: periodicity in the DCT DC-coefficient histogram.
    periodic = _dc_histogram_periodicity(gray)
    detail = {"estimated_quality": est_quality, "luma_table_mean": round(float(luma.mean()), 2),
              "dc_periodicity_experimental": round(periodic, 3),
              "note": "dc_periodicity is recorded for evaluation only and does not affect the verdict yet."}
    plain = f"Last saved at about JPEG quality {est_quality}."
    if est_quality <= 82:
        plain += " That is the range messaging apps and web uploads use; cameras save higher."
    return Signal(id="image.jpeg_quant", category="forensics", status="pass", weight="weak", title="JPEG compression history",
                  plain=plain, detail=detail, tool=PIL_TOOL)


_STD_LUMA = np.array([
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99], dtype=np.float32)


def _estimate_quality(luma: np.ndarray) -> int:
    """Invert the IJG scaling formula against the standard table."""
    scale = float(np.median(luma / _STD_LUMA)) * 100
    if scale <= 0:
        return 100
    quality = (200 - scale) / 2 if scale < 100 else 5000 / scale
    return int(max(1, min(100, round(quality))))


def _dc_histogram_periodicity(gray: np.ndarray) -> float:
    """Crude double-quantization detector: comb pattern in the histogram of 8x8 block means."""
    h, w = gray.shape
    if h < 64 or w < 64:
        return 0.0
    blocks = gray[: h // 8 * 8, : w // 8 * 8].reshape(h // 8, 8, w // 8, 8).mean(axis=(1, 3)).ravel()
    hist, _ = np.histogram(blocks, bins=256, range=(0, 256))
    hist = hist.astype(np.float32)
    if hist.sum() == 0:
        return 0.0
    hist /= hist.sum()
    spec = np.abs(np.fft.rfft(hist - hist.mean()))
    spec[:3] = 0  # ignore DC/low frequencies
    return float(spec.max() / (spec.mean() + 1e-9) / 20.0)
