"""Loupe checks service.

POST /v1/checks/{media}/{check}   body: CheckRequest   → Signal
GET  /v1/checks                   → list of check ids
GET  /health

Runs as a single FastAPI function on Vercel's Python runtime. Each check is a
pure function of (file, request); nothing is stored here.
"""
from __future__ import annotations

import hmac
import os
import traceback

from fastapi import Depends, FastAPI, Header, HTTPException

from . import registry
from .checks import image  # noqa: F401  (registers image checks)
from .fetch import TooLarge, fetch_to_tmp
from .schemas import CheckRequest, Signal

app = FastAPI(title="Loupe checks", version="0.1.0", docs_url=None, redoc_url=None)


def require_key(x_loupe_key: str | None = Header(default=None)) -> None:
    expected = os.environ.get("LOUPE_SHARED_SECRET", "dev-secret")
    if not x_loupe_key or not hmac.compare_digest(x_loupe_key, expected):
        raise HTTPException(status_code=401, detail="Missing or wrong X-Loupe-Key")


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "checks": registry.all_ids()}


@app.get("/v1/checks", dependencies=[Depends(require_key)])
async def list_checks() -> dict:
    return {"checks": registry.all_ids()}


# exclude_none: the TS schema uses optional (absent), not nullable, for unset fields.
@app.post("/v1/checks/{media}/{check}", dependencies=[Depends(require_key)], response_model=Signal, response_model_exclude_none=True)
async def run_check(media: str, check: str, req: CheckRequest) -> Signal:
    check_id = f"{media}.{check}"
    if check_id != req.check_id:
        raise HTTPException(status_code=400, detail="check_id in body does not match path")
    if registry.get(check_id) is None:
        raise HTTPException(status_code=404, detail=f"Unknown check {check_id}")
    try:
        path = await fetch_to_tmp(str(req.blob_url))
    except TooLarge:
        raise HTTPException(status_code=413, detail="File exceeds the size limit")
    except Exception as e:  # network, 404 from blob, etc.
        raise HTTPException(status_code=502, detail=f"Could not fetch file: {type(e).__name__}")
    try:
        return await registry.run(check_id, path, req)
    except Exception as e:
        traceback.print_exc()
        return Signal(
            id=check_id, category="forensics", status="error", weight="weak",
            title=check_id, plain="This check hit an error and produced no result.",
            detail={"error": type(e).__name__},
        )
