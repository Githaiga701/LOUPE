"""Check registry: id → async callable(path, request) -> Signal.

Every check has the same interface so the pipeline can swap or add one
without touching anything else (spec §5).
"""
from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from pathlib import Path

from .schemas import CheckRequest, Signal

CheckFn = Callable[[Path, CheckRequest], Awaitable[Signal]]
_REGISTRY: dict[str, CheckFn] = {}


def check(check_id: str):
    def deco(fn: CheckFn) -> CheckFn:
        _REGISTRY[check_id] = fn
        return fn
    return deco


def get(check_id: str) -> CheckFn | None:
    return _REGISTRY.get(check_id)


def all_ids() -> list[str]:
    return sorted(_REGISTRY)


async def run(check_id: str, path: Path, req: CheckRequest) -> Signal:
    fn = _REGISTRY[check_id]
    t0 = time.perf_counter()
    sig = await fn(path, req)
    sig.ran_ms = int((time.perf_counter() - t0) * 1000)
    return sig
