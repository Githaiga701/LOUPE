"""Golden-ish tests: synthetic images through every registered image check."""
import io
from pathlib import Path

import pytest
from PIL import Image, PngImagePlugin

from loupe_checks import registry
from loupe_checks.checks import image  # noqa: F401
from loupe_checks.schemas import CheckRequest


def _req(check_id: str, ct: str = "image/jpeg") -> CheckRequest:
    return CheckRequest(job_id="job_test", check_id=check_id, media_type="image", blob_url="https://example.com/x", content_type=ct)


@pytest.fixture
def jpeg(tmp_path: Path) -> Path:
    im = Image.radial_gradient("L").convert("RGB").resize((640, 480))
    p = tmp_path / "a.jpg"
    im.save(p, "JPEG", quality=85)
    return p


@pytest.fixture
def sd_png(tmp_path: Path) -> Path:
    im = Image.new("RGB", (256, 256), (120, 30, 200))
    meta = PngImagePlugin.PngInfo()
    meta.add_text("parameters", "a cat, Steps: 20, Sampler: Euler a")
    p = tmp_path / "sd.png"
    im.save(p, "PNG", pnginfo=meta)
    return p


async def test_all_checks_registered():
    assert {"image.ingest", "image.exif", "image.c2pa", "image.generator_tags", "image.ela", "image.jpeg_quant"} <= set(registry.all_ids())


async def test_ingest_jpeg(jpeg):
    sig = await registry.run("image.ingest", jpeg, _req("image.ingest"))
    assert sig.detail["mime"] == "image/jpeg"
    assert sig.status in ("pass", "warn")
    assert len(sig.detail["sha256"]) == 64


async def test_ingest_mismatch(jpeg):
    sig = await registry.run("image.ingest", jpeg, _req("image.ingest", ct="image/png"))
    assert sig.status == "warn" and "Declared as image/png" in sig.plain


async def test_exif_absent(jpeg):
    sig = await registry.run("image.exif", jpeg, _req("image.exif"))
    assert sig.status == "not_found"


async def test_c2pa_absent(jpeg):
    sig = await registry.run("image.c2pa", jpeg, _req("image.c2pa"))
    assert sig.status in ("not_found", "not_run")  # not_run only if c2pa-python is missing


async def test_generator_tags_detects_sd(sd_png):
    sig = await registry.run("image.generator_tags", sd_png, _req("image.generator_tags", ct="image/png"))
    assert sig.status == "fail" and "Stable Diffusion" in sig.plain


async def test_ela_and_quant_run(jpeg):
    for cid in ("image.ela", "image.jpeg_quant"):
        sig = await registry.run(cid, jpeg, _req(cid))
        assert sig.status in ("pass", "warn")
        assert sig.ran_ms >= 0


async def test_quant_skips_png(sd_png):
    sig = await registry.run("image.jpeg_quant", sd_png, _req("image.jpeg_quant", ct="image/png"))
    assert sig.status == "not_run"


async def test_signal_schema_matches_ts():
    """Field names must match packages/schema/src/index.ts Signal."""
    sig = (await registry.run("image.ingest", _blank_jpeg(), _req("image.ingest"))).model_dump()
    assert set(sig) == {"id", "category", "status", "weight", "title", "plain", "why", "reliability", "detail", "ran_ms", "tool"}


def _blank_jpeg() -> Path:
    import tempfile

    p = Path(tempfile.mkdtemp()) / "b.jpg"
    Image.new("RGB", (64, 64), "white").save(p, "JPEG")
    return p


def test_http_response_has_no_nulls(tmp_path):
    """Contract with packages/schema: optional fields are omitted, never null (Zod .optional() rejects null)."""
    from fastapi.testclient import TestClient
    import loupe_checks.main as m

    img = tmp_path / "w.jpg"
    Image.new("RGB", (64, 64), "white").save(img, "JPEG")

    async def fake_fetch(url):
        return img

    original = m.fetch_to_tmp
    m.fetch_to_tmp = fake_fetch
    try:
        client = TestClient(m.app)
        for cid in ("image.ingest", "image.exif", "image.c2pa", "image.generator_tags", "image.ela", "image.jpeg_quant"):
            media, name = cid.split(".", 1)
            r = client.post(f"/v1/checks/{media}/{name}",
                            json={"job_id": "j", "check_id": cid, "media_type": "image", "blob_url": "https://e.com/x"},
                            headers={"x-loupe-key": "dev-secret"})
            assert r.status_code == 200, r.text
            body = r.json()
            assert None not in body.values(), f"{cid} returned nulls: {[k for k, v in body.items() if v is None]}"
            if body.get("tool"):
                assert None not in body["tool"].values()
    finally:
        m.fetch_to_tmp = original
