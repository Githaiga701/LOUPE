"""Pydantic mirror of packages/schema/src/index.ts. Keep the two in step."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl

MediaType = Literal["image", "video", "audio", "document", "claim"]
SignalStatus = Literal["pass", "warn", "fail", "not_found", "not_run", "error"]
SignalWeight = Literal["strong", "medium", "weak"]
SignalCategory = Literal["ingest", "provenance", "forensics", "detector", "context"]


class Tool(BaseModel):
    name: str
    version: str | None = None
    licence: str | None = None


class Signal(BaseModel):
    id: str
    category: SignalCategory
    status: SignalStatus
    weight: SignalWeight
    title: str
    plain: str
    why: str | None = None
    reliability: str | None = None
    detail: dict[str, Any] = Field(default_factory=dict)
    ran_ms: int = 0
    tool: Tool | None = None


class CheckRequest(BaseModel):
    job_id: str
    check_id: str
    media_type: MediaType
    blob_url: HttpUrl
    content_type: str | None = None
    size_bytes: int | None = None
