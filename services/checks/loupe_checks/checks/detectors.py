"""Third-party AI-generation detectors. One adapter per vendor, same interface.

Rules (spec §6.4, §8):
- Run two independent detectors; disagreement is itself a signal (handled in aggregate).
- A detector score is evidence, never a verdict. Thresholds are deliberately wide:
  only very confident scores count as pass/fail, everything else is "unsure".
- If a vendor is not configured, out of quota or down, the check is `not_run`
  with the reason, and the report still ships.
- Files are uploaded as bytes; vendors never receive our storage URLs.
"""
from __future__ import annotations

import os
from pathlib import Path

import httpx

from ..registry import check
from ..schemas import CheckRequest, Signal, Tool

# A score at or beyond these counts as evidence; in between is "unsure".
AI_FAIL_AT = 0.85
AI_PASS_AT = 0.15

TIMEOUT = httpx.Timeout(25.0, connect=5.0)


def _not_run(check_id: str, title: str, plain: str, **detail) -> Signal:
    return Signal(id=check_id, category="detector", status="not_run", weight="weak", title=title, plain=plain, detail=detail)


def _from_score(check_id: str, title: str, vendor: str, p_ai: float, tool: Tool, extra: dict) -> Signal:
    pct = round(p_ai * 100)
    detail = {"ai_generated": round(p_ai, 4), "thresholds": {"fail_at": AI_FAIL_AT, "pass_at": AI_PASS_AT}, **extra}
    if p_ai >= AI_FAIL_AT:
        return Signal(id=check_id, category="detector", status="fail", weight="medium", title=title,
                      plain=f"{vendor}'s model rates this image {pct}% likely to be AI-generated.", detail=detail, tool=tool)
    if p_ai <= AI_PASS_AT:
        return Signal(id=check_id, category="detector", status="pass", weight="medium", title=title,
                      plain=f"{vendor}'s model found no sign of AI generation ({pct}% likely AI).", detail=detail, tool=tool)
    return Signal(id=check_id, category="detector", status="warn", weight="weak", title=title,
                  plain=f"{vendor}'s model is unsure ({pct}% likely AI-generated). Treat this as no answer.", detail=detail, tool=tool)


def _vendor_error(check_id: str, title: str, vendor: str, status: int | None, body: str) -> Signal:
    low = body.lower()
    if status in (401, 403) or "credential" in low or "unauthori" in low or "api_user" in low:
        reason = f"{vendor} rejected our credentials, so this check was skipped."
    elif status == 429 or "limit" in low or "quota" in low:
        reason = f"{vendor}'s usage limit was reached, so this check was skipped."
    else:
        reason = f"{vendor} could not be reached, so this check was skipped."
    return _not_run(check_id, title, reason, vendor_status=status, vendor_error=body[:200])


# ---------------------------------------------------------------------------
# Sightengine — POST /1.0/check.json, models=genai, multipart field `media`.
# Response: {"status":"success","type":{"ai_generated":0.01}, ...}

SE_ID, SE_TITLE = "image.detector.sightengine", "Detector A (Sightengine)"


@check(SE_ID)
async def sightengine(path: Path, req: CheckRequest) -> Signal:
    user, secret = os.environ.get("SIGHTENGINE_API_USER"), os.environ.get("SIGHTENGINE_API_SECRET")
    if not user or not secret:
        return _not_run(SE_ID, SE_TITLE, "This detector isn't connected yet.", configured=False)
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(
                "https://api.sightengine.com/1.0/check.json",
                data={"models": "genai", "api_user": user, "api_secret": secret},
                files={"media": (path.name + _ext(req), path.read_bytes(), req.content_type or "application/octet-stream")},
            )
    except httpx.HTTPError as e:
        return _vendor_error(SE_ID, SE_TITLE, "Sightengine", None, type(e).__name__)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 or body.get("status") != "success":
        err = body.get("error", {}) if isinstance(body, dict) else {}
        return _vendor_error(SE_ID, SE_TITLE, "Sightengine", r.status_code, str(err.get("message") or err or r.text))
    p_ai = float((body.get("type") or {}).get("ai_generated", 0.0))
    return _from_score(SE_ID, SE_TITLE, "Sightengine", p_ai,
                       Tool(name="sightengine/genai", version="1.0"),
                       {"request_id": (body.get("request") or {}).get("id")})


# ---------------------------------------------------------------------------
# Hive — POST /api/v3/hive/ai-generated-and-deepfake-content-detection,
# Bearer auth, multipart field `media`. Read output[0].classes[] by class name.

HIVE_ID, HIVE_TITLE = "image.detector.hive", "Detector B (Hive)"
HIVE_URL = "https://api.thehive.ai/api/v3/hive/ai-generated-and-deepfake-content-detection"
HIVE_NON_GENERATOR = {"ai_generated", "not_ai_generated", "deepfake", "not_deepfake", "none",
                      "ai_generated_audio", "not_ai_generated_audio", "inconclusive", "inconclusive_video"}


HIVE_V2_URL = "https://api.thehive.ai/api/v2/task/sync"


async def _hive_call(key: str, path: Path, req: CheckRequest) -> tuple[int, dict | None, str, str]:
    """Try the v3 endpoint (Bearer secret key); on 401 fall back to v2 (Token project key).
    Returns (status, classes or None, raw text, api version)."""
    files = {"media": (path.name + _ext(req), path.read_bytes(), req.content_type or "application/octet-stream")}
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(HIVE_URL, headers={"authorization": f"Bearer {key}"}, files=files)
        if r.status_code == 200:
            body = r.json()
            try:
                return 200, {"_body": body, **{c["class"]: float(c["value"]) for c in body["output"][0]["classes"]}}, r.text, "v3"
            except (KeyError, IndexError, TypeError):
                return 200, None, "unexpected v3 response shape", "v3"
        if r.status_code != 401:
            return r.status_code, None, r.text, "v3"
        r2 = await client.post(HIVE_V2_URL, headers={"authorization": f"Token {key}"}, files=files)
        if r2.status_code != 200:
            return r2.status_code, None, r2.text, "v2"
        body = r2.json()
        try:
            out = body["status"][0]["response"]["output"][0]["classes"]
            return 200, {"_body": body, **{c["class"]: float(c["score"]) for c in out}}, r2.text, "v2"
        except (KeyError, IndexError, TypeError):
            return 200, None, "unexpected v2 response shape", "v2"


@check(HIVE_ID)
async def hive(path: Path, req: CheckRequest) -> Signal:
    key = os.environ.get("HIVE_API_KEY")
    if not key:
        return _not_run(HIVE_ID, HIVE_TITLE, "This detector isn't connected yet.", configured=False)
    try:
        status, classes, raw, api = await _hive_call(key, path, req)
    except httpx.HTTPError as e:
        return _vendor_error(HIVE_ID, HIVE_TITLE, "Hive", None, type(e).__name__)
    if classes is None:
        sig = _vendor_error(HIVE_ID, HIVE_TITLE, "Hive", status, raw)
        if status in (401, 403):
            sig.detail["hint"] = ("Hive rejected the key on both the v3 (Bearer) and v2 (Token) endpoints. "
                                  "In the Hive dashboard, open the project's API keys and copy the Secret Key "
                                  "(not the Access Key ID) into HIVE_API_KEY.")
        return sig

    body = classes.pop("_body")
    p_ai = classes.get("ai_generated", 0.0)
    gens = {k: round(v, 3) for k, v in classes.items() if k not in HIVE_NON_GENERATOR and v >= 0.05}
    top_gen = max(gens, key=gens.get) if gens else None
    extra = {"deepfake": round(classes.get("deepfake", 0.0), 4), "generators": gens,
             "task_id": body.get("task_id") or body.get("id"), "api": api}
    sig = _from_score(HIVE_ID, HIVE_TITLE, "Hive", p_ai, Tool(name="hive/ai-generated-and-deepfake-content-detection", version=api), extra)
    if sig.status == "fail" and top_gen and gens[top_gen] >= 0.5:
        sig.plain += f" It most resembles output from {top_gen}."
    if classes.get("deepfake", 0.0) >= AI_FAIL_AT and sig.status != "fail":
        sig.status, sig.weight = "warn", "medium"
        sig.plain += f" Separately, it rates the faces {round(classes['deepfake'] * 100)}% likely to be a deepfake."
    return sig


# ---------------------------------------------------------------------------
# Reverse image search — adapter slot. TinEye wiring lands when a key exists.

RS_ID, RS_TITLE = "image.reverse_search", "Earlier copies"


@check(RS_ID)
async def reverse_search(path: Path, req: CheckRequest) -> Signal:
    if not os.environ.get("TINEYE_API_KEY"):
        return Signal(id=RS_ID, category="context", status="not_run", weight="weak", title=RS_TITLE,
                      plain="Reverse image search isn't connected yet. Search for this image on TinEye or Google Lens yourself to find earlier copies.",
                      detail={"configured": False})
    return Signal(id=RS_ID, category="context", status="not_run", weight="weak", title=RS_TITLE,
                  plain="Reverse image search is configured but not implemented in this version.", detail={"configured": True})


def _ext(req: CheckRequest) -> str:
    return {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heic"}.get(req.content_type or "", "")
