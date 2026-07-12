# AGENTS.md

Guidance for any AI agent or contributor working in this repo.

## Project: Asli Meesho — Point-of-Listing Verification Agents

A **proactive, multi-agent verification system** that forces every Meesho seller to prove
two things **before** a listing goes live:

1. They physically **possess** the product (not just a stolen catalog photo).
2. The **size data is real** (measured, not guessed).

Prevention at the point of creation — not moderation after bad listings are already live.

See [`project.md`](project.md) for the full problem statement and rationale.

## Core concept (the one thing that must not get lost)

- **Reverse-image search is a TRIGGER, not a verdict.** "Image seen elsewhere" is normal for an
  honest reseller using a supplier's catalog photo. Never auto-block on it. It only *triggers*
  a live-possession challenge.
- **The live-possession challenge is the showpiece.** Seller must capture a **fresh camera photo**
  (gallery uploads forbidden) of the real product next to a **dynamic, time-bound code**
  (e.g., today's number on a slip of paper) from a specified angle. A VLM verifies same-item +
  challenge satisfied. A thief with only a downloaded image cannot produce this.
- **Two agents chain:** shared-image-is-fine + you-proved-you-hold-it + your-sizes-are-measured
  → trustworthy listing.

## Architecture

```
Orchestrator (branching flow + human-in-the-loop)
├── Agent 1 — Possession-Proof
│   upload catalog img → reverse-image search (trigger)
│   → if seen elsewhere: issue dynamic challenge (camera-only + time-bound code)
│   → VLM verifies item-match + challenge → pass / retry
└── Agent 2 — Smart Sizing
    flat-lay capture + reference object (tape / A4) for scale
    → VLM calibrates pixels→cm, measures chest/length/waist
    → map to Meesho size taxonomy → auto-fill size chart for confirmation
```

## Tech stack (intended)

- **VLM** — image matching, challenge verification, measurement extraction.
- **Reverse-image-search API** — Google Lens / Bing Visual Search / TinEye / SerpAPI.
- **Front end** — must enforce **camera capture, not gallery** for the challenge step.
- **Orchestration** — LangGraph or function-calling to manage branching + human-approval step.

## MVP scope (4-day, focus over breadth)

- Build **Agent 1 end-to-end** as the showpiece.
- Ship a **lighter Agent 2** (flat-lay + tape → extracted measurements).
- Mock seller flow + sample catalog images.
- **Demo must land visually:** a "thief" submitting only a gallery image is *stopped* at the
  possession challenge; an honest seller passes the live check, gets an auto-built size chart,
  and goes live.

## Working agreements

- Keep the **trigger-not-verdict** logic intact in any code touching Agent 1. Do not add
  auto-block on reverse-image hits.
- Enforce **camera-only** capture on challenge UI; never silently allow gallery upload there.
- Positioning stays **prevention at point-of-listing**, not "we detect counterfeits" (Meesho
  already runs takedowns/AI moderation). Don't reframe it as counterfeit detection.
- Demo polish matters — this is a pitch/hackathon build. Prioritize a working, visual happy-path
  over breadth of features.
- Secrets (API keys for VLM / reverse-image search) go in env vars, never committed.

## Design & diagrams

- [`design.md`](design.md) — locked design system (colors, type, motion, slide map).
- [`diagram.md`](diagram.md) — all deck diagrams in traditional notation + static/animated treatment.
- [`ppt.md`](ppt.md) — full 15-slide deck build spec.
- [`diagram/`](diagram/) — rendered diagram sources + images.

## Status

Greenfield. No app code yet. Spec + docs + diagrams only.
