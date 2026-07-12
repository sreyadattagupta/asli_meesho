# Asli Meesho — MVP Showpiece Design Spec

**Date:** 2026-07-08
**Scope:** MVP showpiece slice (CLAUDE.md build order 1–5, 7). Not the full dynamic system.
**Environment:** Ollama live locally, `qwen2.5vl:latest` (8.3B) pulled. node 22, python 3.14.

## Goal

Build the demo that must land: a **thief** with only a gallery screenshot is **BLOCKED** at the
possession challenge; an **honest seller** takes a live photo of the product next to today's dynamic
code → **PASS** → auto-built size chart → listing goes **LIVE, Asli Verified**.

## Architecture (two services)

```
web/ (Next.js App Router + TS + Tailwind + Zustand)      vlm-service/ (FastAPI + Ollama)
  seller flow UI + thin API routes  ───HTTP multipart──►   /vlm/match  (Agent 1)
  upload→trigger→challenge→sizing→review→live              /vlm/measure (Agent 2)
                                                           /health
```

### vlm-service (Python FastAPI, port 8000)

- `GET /health` → `{status, ollama_reachable, model}`
- `POST /vlm/match` — multipart `catalog`, `live`, `code`. Compose one labeled `CATALOG | LIVE`
  side-by-side image (Pillow), one VLM call → `{same_item, code_visible, confidence, reason, passed}`.
  `passed = same_item && code_visible`.
- `POST /vlm/measure` — multipart `flatlay`, `reference_object` (`a4`|`tape`) →
  `{chest_cm, length_cm, waist_cm, reference_used, confidence}`.
- Files: `main.py`, `prompts.py` (single source, strict-JSON), `ollama_client.py` (defensive parse,
  1 retry, temp 0, model from `OLLAMA_MODEL`), `compose.py` (Pillow side-by-side), `requirements.txt`,
  `.env.example`.

### web (Next.js, port 3000)

- Flow steps in Zustand `store.ts`: `upload → trigger → challenge → sizing → review → live`.
- API routes (server-side proxies):
  - `POST /api/reverse-image` — SerpAPI Google Lens with hash cache; **mock fallback** when no key.
    **TRIGGER ONLY** (invariant #1) — never a block.
  - `GET /api/challenge` — issue dynamic code. `POST /api/challenge` — verify → vlm `/vlm/match`.
  - `POST /api/sizing` — → vlm `/vlm/measure`.
- `components/CameraCapture.tsx` — **camera-only** (`getUserMedia` + `<input capture=environment>`),
  gallery forbidden (invariant #2). Demo toggle to load the seeded "thief" screenshot for the block path.
- `lib/orchestrator.ts` — `decide(signals)` → `AUTO_APPROVE | RE_CHALLENGE | ESCALATE_HUMAN | BLOCK`,
  risk-adaptive `requiredConfidence` (new seller / heavy reuse / attempt count raise the bar).
- `lib/challenge.ts` — 6-char code (no ambiguous chars), TTL, single-use (invariant #3).
- `lib/vlmClient.ts`, `lib/reverseImage.ts`, `lib/sizing.ts` (size-taxonomy mapping).
- `components/flow/*` — Upload, Trigger, Challenge, Sizing, Review, Result, Live, Stepper.

## Invariants (must hold)

1. Reverse-image = TRIGGER not verdict. Never auto-block on a hit.
2. Challenge capture is camera-only. No gallery on challenge step.
3. Code is dynamic + time-bound + single-use.
4. Positioning = prevention at point-of-listing, complementary to Suraksha.
5. Secrets in env vars; `.env.local` gitignored, `.env.example` with placeholders.
6. Orchestrator `decide()` reads real signals — no hardcoded happy path.
7. Confidence bar is risk-adaptive, not a constant.
8. Every decision carries `reason` + `confidence`.

## Out of scope this slice

Postgres/Redis/Qdrant persistence, Trust Score Engine (Agent 3), Promise Keeper (Agent 4),
human review queue backend, auth, K8s. Persistence is in-memory. Agentic seams (real decide(),
adaptive bar, single-use codes, explainable results) are in from day 1 so the dynamic layer bolts on later.

## Demo seed assets

`web/public/proof/`: `catalog_real.jpg`, `live_genuine.jpg` (product + code slip), `live_wrongcode.jpg`,
`live_otheritem.jpg`, `flatlay_real.jpg`. Thief path uses a gallery screenshot with no/absent code.

## Success criteria

- `curl :8000/health` → ok, ollama_reachable true.
- `/vlm/match` on genuine sample → `passed: true`; on wrong-code/other-item → `passed: false`.
- Web flow clicks end-to-end: honest → LIVE with size chart; thief → BLOCKED at challenge.
- Camera-only enforced on challenge; reverse-image never blocks.
