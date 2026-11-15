"""Fetch the working copy of an upload into a sandboxed temp file.

The original is never modified. Downloads are capped and the file is cached
per URL for the life of the process so parallel checks on a warm function
share one download.
"""
from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path

import httpx

MAX_BYTES = int(os.environ.get("CHECKS_MAX_BYTES", 200 * 1024 * 1024))
_CACHE_DIR = Path(tempfile.gettempdir()) / "loupe-checks"


class TooLarge(Exception):
    pass


async def fetch_to_tmp(url: str) -> Path:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(url.encode()).hexdigest()[:32]
    path = _CACHE_DIR / key
    if path.exists() and path.stat().st_size > 0:
        return path

    data = await _download(url)
    tmp = path.with_suffix(".part")
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return path


async def _download(url: str) -> bytes:
    """Plain capped GET. The web app passes a short-lived signed URL scoped to one file."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True, max_redirects=3) as client:
        async with client.stream("GET", url) as r:
            r.raise_for_status()
            chunks: list[bytes] = []
            total = 0
            async for chunk in r.aiter_bytes():
                total += len(chunk)
                if total > MAX_BYTES:
                    raise TooLarge()
                chunks.append(chunk)
            return b"".join(chunks)
