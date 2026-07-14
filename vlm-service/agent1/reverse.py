"""Component 4+5 — live reverse image search (SerpAPI Google Lens) + metadata extraction.

TRIGGER only (invariant #1). Extracts full per-match evidence (title/price/thumbnail/source).
Network isolated in `reverse_search`; `parse_lens` is pure so it is unit-tested without SerpAPI.
"""
from __future__ import annotations

from typing import Optional, TypedDict
from urllib.parse import urlparse

import httpx


class MatchEvidence(TypedDict):
    title: Optional[str]
    price: Optional[float]
    currency: Optional[str]
    thumbnail: Optional[str]
    source: Optional[str]
    link: str
    platform: str
    category: str  # "marketplace" | "web"


class ReverseResult(TypedDict):
    available: bool
    triggered: bool
    match_count: int
    matches: list[MatchEvidence]
    platforms: list[dict]
    reason: str


# domain fragment → display name; first substring hit wins.
_MARKETPLACES = [
    ("flipkart", "Flipkart"), ("myntra", "Myntra"), ("amazon", "Amazon"),
    ("meesho", "Meesho"), ("ajio", "AJIO"), ("snapdeal", "Snapdeal"),
    ("nykaa", "Nykaa"), ("tatacliq", "Tata CLiQ"), ("indiamart", "IndiaMART"),
    ("shopsy", "Shopsy"), ("limeroad", "LimeRoad"),
]


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or url).replace("www.", "")
    except Exception:  # noqa: BLE001
        return url


def classify_platform(link: str, source: Optional[str]) -> tuple[str, str]:
    """Classify a match link/source into (display_name, "marketplace"|"web")."""
    hay = f"{_host(link)} {source or ''}".lower()
    for frag, name in _MARKETPLACES:
        if frag in hay:
            return name, "marketplace"
    return (source or _host(link)), "web"


def _price(raw) -> tuple[Optional[float], Optional[str]]:
    """Coerce a Lens price object into (value, currency); both may be None."""
    if not isinstance(raw, dict):
        return None, None
    val = raw.get("extracted_value")
    cur = raw.get("currency")
    try:
        return (float(val) if val is not None else None), cur
    except (TypeError, ValueError):
        return None, cur


def parse_lens(visual_matches: list[dict]) -> ReverseResult:
    """Pure core — turn SerpAPI `visual_matches` into evidence + aggregated platforms."""
    matches: list[MatchEvidence] = []
    counts: dict[str, dict] = {}
    for m in visual_matches:
        link = m.get("link")
        if not link:
            continue
        name, cat = classify_platform(link, m.get("source"))
        price, cur = _price(m.get("price"))
        matches.append(MatchEvidence(
            title=m.get("title"), price=price, currency=cur,
            thumbnail=m.get("thumbnail"), source=m.get("source"), link=link,
            platform=name, category=cat,
        ))
        agg = counts.setdefault(name, {"name": name, "category": cat, "count": 0, "url": link})
        agg["count"] += 1
    platforms = sorted(counts.values(),
                       key=lambda p: (0 if p["category"] == "marketplace" else 1, -p["count"]))
    return ReverseResult(
        available=True, triggered=len(matches) > 0, match_count=len(matches),
        matches=matches, platforms=platforms,
        reason=f"{len(matches)} visual match(es) across {len(platforms)} source(s).",
    )


_UA = {"User-Agent": "Mozilla/5.0 AsliVerify/1.0"}


async def _uguu(c: httpx.AsyncClient, image: bytes) -> str:
    r = await c.post("https://uguu.se/upload?output=text", headers=_UA,
                     files={"files[]": ("catalog.jpg", image, "image/jpeg")})
    url = r.text.strip()
    if r.status_code != 200 or not url.startswith("http"):
        raise RuntimeError(f"uguu {r.status_code}: {url[:80]!r}")
    return url


async def _catbox(c: httpx.AsyncClient, image: bytes) -> str:
    r = await c.post("https://catbox.moe/user/api.php",
                     data={"reqtype": "fileupload"},
                     files={"fileToUpload": ("catalog.jpg", image, "image/jpeg")})
    url = r.text.strip()
    if r.status_code != 200 or not url.startswith("http"):
        raise RuntimeError(f"catbox {r.status_code}: {url[:80]!r}")
    return url


async def _litterbox(c: httpx.AsyncClient, image: bytes) -> str:
    r = await c.post("https://litterbox.catbox.moe/resources/internals/api.php",
                     data={"reqtype": "fileupload", "time": "1h"},
                     files={"fileToUpload": ("catalog.jpg", image, "image/jpeg")})
    url = r.text.strip()
    if r.status_code != 200 or not url.startswith("http"):
        raise RuntimeError(f"litterbox {r.status_code}: {url[:80]!r}")
    return url


async def _tmpfiles(c: httpx.AsyncClient, image: bytes) -> str:
    r = await c.post("https://tmpfiles.org/api/v1/upload",
                     files={"file": ("catalog.jpg", image, "image/jpeg")})
    # tmpfiles returns a viewer URL; the direct-fetch URL SerpAPI needs adds "/dl/".
    url = (r.json().get("data") or {}).get("url", "")
    if r.status_code != 200 or not url.startswith("http"):
        raise RuntimeError(f"tmpfiles {r.status_code}: {url[:80]!r}")
    return url.replace("tmpfiles.org/", "tmpfiles.org/dl/", 1)


async def _zerox(c: httpx.AsyncClient, image: bytes) -> str:
    r = await c.post("https://0x0.st", headers=_UA,
                     files={"file": ("catalog.jpg", image, "image/jpeg")})
    url = r.text.strip()
    if r.status_code != 200 or not url.startswith("http"):
        raise RuntimeError(f"0x0 {r.status_code}: {url[:80]!r}")
    return url


# Keyless temp hosts, tried in order — first success wins. uguu leads (currently the most
# reliable); catbox/litterbox/tmpfiles/0x0 cover it when any single host is down or rate-limited.
_HOSTS = [("uguu", _uguu), ("catbox", _catbox), ("litterbox", _litterbox),
          ("tmpfiles", _tmpfiles), ("0x0", _zerox)]


async def _upload_temp(image: bytes) -> str:
    """Keyless temp host so SerpAPI can fetch the query image by URL.

    Any single free host flakes (empty 200, paused uploads, timeouts), so we walk the whole
    chain and take the first that yields a real URL. Raises only if every host fails (caller
    degrades — no fabricated result). Per-host timeout keeps a dead host from stalling the chain.
    """
    errors: list[str] = []
    async with httpx.AsyncClient(timeout=15) as c:
        for name, host in _HOSTS:
            try:
                return await host(c, image)
            except Exception as e:  # noqa: BLE001
                errors.append(f"{name}: {e}")
    raise RuntimeError("temp upload failed on all hosts: " + "; ".join(errors))


async def reverse_search(image: bytes, api_key: Optional[str]) -> ReverseResult:
    """Live Google Lens reverse search. No key ⇒ available=False (caller degrades, no fake)."""
    if not api_key:
        return ReverseResult(available=False, triggered=False, match_count=0,
                             matches=[], platforms=[], reason="No SERPAPI_KEY configured.")
    image_url = await _upload_temp(image)
    params = {"engine": "google_lens", "url": image_url, "api_key": api_key}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get("https://serpapi.com/search.json", params=params)
    if r.status_code != 200:
        raise RuntimeError(f"SerpAPI {r.status_code}: {r.text[:200]}")
    return parse_lens(r.json().get("visual_matches", []))
