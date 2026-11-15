"""Detector adapters against recorded vendor response shapes (no network)."""
import json
from pathlib import Path

import httpx
import pytest
from PIL import Image

from loupe_checks import registry
from loupe_checks.checks import detectors
from loupe_checks.schemas import CheckRequest


@pytest.fixture
def jpg(tmp_path: Path) -> Path:
    p = tmp_path / "x.jpg"
    Image.new("RGB", (64, 64), "white").save(p, "JPEG")
    return p


def req(cid: str) -> CheckRequest:
    return CheckRequest(job_id="j", check_id=cid, media_type="image", blob_url="https://e.com/x", content_type="image/jpeg")


def mock_vendor(monkeypatch, handler):
    real = httpx.AsyncClient

    def factory(*a, **kw):
        kw["transport"] = httpx.MockTransport(handler)
        return real(*a, **kw)

    monkeypatch.setattr(detectors.httpx, "AsyncClient", factory)


def hive_body(ai: float, deepfake: float = 0.01, gen: dict | None = None):
    classes = [{"class": "ai_generated", "value": ai}, {"class": "not_ai_generated", "value": 1 - ai},
               {"class": "deepfake", "value": deepfake}, {"class": "none", "value": 0.9}]
    for k, v in (gen or {}).items():
        classes.append({"class": k, "value": v})
    return {"task_id": "t1", "model": "ai-generated-and-deepfake-content-detection", "output": [{"classes": classes}]}


async def test_unconfigured_is_not_run(monkeypatch, jpg):
    monkeypatch.delenv("SIGHTENGINE_API_USER", raising=False)
    monkeypatch.delenv("HIVE_API_KEY", raising=False)
    for cid in ("image.detector.sightengine", "image.detector.hive"):
        s = await registry.run(cid, jpg, req(cid))
        assert s.status == "not_run" and s.detail["configured"] is False


@pytest.mark.parametrize("score,status", [(0.97, "fail"), (0.03, "pass"), (0.5, "warn")])
async def test_sightengine_thresholds(monkeypatch, jpg, score, status):
    monkeypatch.setenv("SIGHTENGINE_API_USER", "u")
    monkeypatch.setenv("SIGHTENGINE_API_SECRET", "s")
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["body"] = request.content
        return httpx.Response(200, json={"status": "success", "request": {"id": "r1"}, "type": {"ai_generated": score}})

    mock_vendor(monkeypatch, handler)
    s = await registry.run("image.detector.sightengine", jpg, req("image.detector.sightengine"))
    assert s.status == status
    assert seen["url"] == "https://api.sightengine.com/1.0/check.json"
    assert b'name="media"' in seen["body"] and b"genai" in seen["body"]
    assert b"blob.vercel-storage" not in seen["body"]  # never forward our storage URL


async def test_sightengine_quota_error_is_not_run(monkeypatch, jpg):
    monkeypatch.setenv("SIGHTENGINE_API_USER", "u")
    monkeypatch.setenv("SIGHTENGINE_API_SECRET", "s")
    mock_vendor(monkeypatch, lambda r: httpx.Response(429, json={"status": "failure", "error": {"type": "usage_limit", "message": "Daily usage limit reached"}}))
    s = await registry.run("image.detector.sightengine", jpg, req("image.detector.sightengine"))
    assert s.status == "not_run" and "usage limit" in s.plain


async def test_hive_bearer_and_generator(monkeypatch, jpg):
    monkeypatch.setenv("HIVE_API_KEY", "k")
    seen = {}

    def handler(request: httpx.Request):
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json=hive_body(0.95, gen={"midjourney": 0.8}))

    mock_vendor(monkeypatch, handler)
    s = await registry.run("image.detector.hive", jpg, req("image.detector.hive"))
    assert seen["auth"] == "Bearer k"
    assert s.status == "fail" and "midjourney" in s.plain
    assert s.detail["generators"]["midjourney"] == 0.8


async def test_hive_deepfake_flag_on_otherwise_clean_image(monkeypatch, jpg):
    monkeypatch.setenv("HIVE_API_KEY", "k")
    mock_vendor(monkeypatch, lambda r: httpx.Response(200, json=hive_body(0.05, deepfake=0.92)))
    s = await registry.run("image.detector.hive", jpg, req("image.detector.hive"))
    assert s.status == "warn" and "deepfake" in s.plain


async def test_hive_bad_key(monkeypatch, jpg):
    monkeypatch.setenv("HIVE_API_KEY", "k")
    mock_vendor(monkeypatch, lambda r: httpx.Response(401, text="Unauthorized"))
    s = await registry.run("image.detector.hive", jpg, req("image.detector.hive"))
    assert s.status == "not_run" and "credentials" in s.plain


def test_http_route_handles_dotted_ids(monkeypatch, jpg):
    from fastapi.testclient import TestClient
    import loupe_checks.main as m

    monkeypatch.delenv("HIVE_API_KEY", raising=False)

    async def fake_fetch(url):
        return jpg

    monkeypatch.setattr(m, "fetch_to_tmp", fake_fetch)
    r = TestClient(m.app).post("/v1/checks/image/detector/hive",
                               json={"job_id": "j", "check_id": "image.detector.hive", "media_type": "image", "blob_url": "https://e.com/x"},
                               headers={"x-loupe-key": "dev-secret"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "not_run" and None not in r.json().values()
