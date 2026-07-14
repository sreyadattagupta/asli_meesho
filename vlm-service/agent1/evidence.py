"""Component 6 — web evidence collection. Bounded, structured, robots-respecting: fetch the top-N
retrieved hit pages and read ONLY structured product data (schema.org/Product JSON-LD + OpenGraph).
No crawler, no arbitrary-HTML heuristics — resilient and low ToS risk. `parse_product_html` is pure
so it unit-tests without the network; `enrich` adds confirmed fields to matches and skips on any error.
"""
from __future__ import annotations

import json
from typing import Optional

import httpx
from selectolax.parser import HTMLParser

_UA = {"User-Agent": "AsliVerify/1.0 (+product-verification)"}


def _to_price(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _walk_products(node):
    """Yield every dict whose @type is (or includes) Product, anywhere in a JSON-LD tree."""
    if isinstance(node, dict):
        t = node.get("@type")
        if t == "Product" or (isinstance(t, list) and "Product" in t):
            yield node
        for v in node.values():
            yield from _walk_products(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk_products(v)


def parse_product_html(html: str) -> dict:
    """Extract {title, price, currency, brand, seller} — JSON-LD first, OpenGraph fallback."""
    out = {"title": None, "price": None, "currency": None, "brand": None, "seller": None}
    tree = HTMLParser(html)

    for tag in tree.css('script[type="application/ld+json"]'):
        try:
            data = json.loads(tag.text() or "")
        except (json.JSONDecodeError, ValueError):
            continue
        for p in _walk_products(data):
            out["title"] = out["title"] or p.get("name")
            brand = p.get("brand")
            if brand and not out["brand"]:
                out["brand"] = brand.get("name") if isinstance(brand, dict) else str(brand)
            offers = p.get("offers")
            if isinstance(offers, list):
                offers = offers[0] if offers else None
            if isinstance(offers, dict):
                out["price"] = out["price"] if out["price"] is not None else _to_price(offers.get("price"))
                out["currency"] = out["currency"] or offers.get("priceCurrency")
                seller = offers.get("seller")
                if isinstance(seller, dict):
                    out["seller"] = out["seller"] or seller.get("name")

    # OpenGraph / product meta fallback for anything still missing.
    def meta(prop: str) -> Optional[str]:
        el = tree.css_first(f'meta[property="{prop}"]')
        return el.attributes.get("content") if el else None

    out["title"] = out["title"] or meta("og:title")
    if out["price"] is None:
        out["price"] = _to_price(meta("product:price:amount"))
    out["currency"] = out["currency"] or meta("product:price:currency")
    return out


async def enrich(matches: list, limit: int = 5) -> list:
    """Fetch structured data for the top marketplace matches; merge confirmed fields in place.

    Bounded (limit), 5s timeout per URL, skips silently on any error — evidence collection must
    never crash or slow the pipeline. Returns the same list (mutated) for convenience.
    """
    targets = [m for m in matches if m.get("category") == "marketplace" and m.get("link")][:limit]
    async with httpx.AsyncClient(timeout=5, headers=_UA, follow_redirects=True) as c:
        for m in targets:
            try:
                r = await c.get(m["link"])
                if r.status_code != 200 or "html" not in r.headers.get("content-type", ""):
                    continue
                d = parse_product_html(r.text)
            except Exception:  # noqa: BLE001 — one bad page must not sink the batch
                continue
            # only fill gaps; never overwrite the direct Lens fields
            if m.get("price") is None and d["price"] is not None:
                m["price"] = d["price"]
                m["currency"] = m.get("currency") or d["currency"]
            if not m.get("title") and d["title"]:
                m["title"] = d["title"]
            if d["seller"]:
                m["seller"] = d["seller"]
            if d["brand"]:
                m["brand"] = d["brand"]
    return matches
