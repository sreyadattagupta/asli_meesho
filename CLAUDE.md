# CLAUDE.md

Guidance for building the **Asli Meesho** application end-to-end for the **ScriptedBy{Her} 2.0 — Round 3
Prototype Build Phase (13–19 July 2026)**.

> **Read this before writing any app code.** This file is the single authoritative *how-to-build-it*
> companion. The *why* (problem, rationale, impact) lives in [`project.md`](project.md),
> [`AGENTS.md`](AGENTS.md), and the deck; the cited research (91 problems, sources S1–S16) lives in
> `Meesho_Ecosystem_Problem_Solution_Research.xlsx`.

---

## 0. The Round 3 mandate — READ FIRST

**We are NOT building a slide deck. We are shipping a fully functional, dynamic, deployed web
application** that looks and feels like a *real Meesho feature*, not a hackathon mockup.

The bar: **every button, screen, and workflow is meaningful and interactive.** Smooth animations,
modern UI/UX, realistic AI workflows, loading + error states, reusable components, responsive design.
A judge should be able to open the live URL on a phone and *use it* — as a seller, as a buyer, and as a
Trust & Safety reviewer — with nothing feeling like a dead stub.

### The five judging criteria — and how each is won

Everything we build must ladder up to these. When making a trade-off, optimize the criterion the change
touches.

| Criterion | What the judge asks | How Asli wins it |
|---|---|---|
| **Working Prototype** | Is the idea shown through a *functioning* prototype? | Three complete, clickable persona flows (Seller / Buyer / Admin) wired to real API routes + a live VLM. No dead buttons. Deployed public URL. |
| **Innovation & Creativity** | Is it unique / original / creatively applied? | *Prevention at the point of listing* + the **dynamic single-use live-code possession challenge** — nobody else stops "not as pictured" *before* it's live. Multi-agent orchestrator that visibly *reasons*. |
| **High Potential Impact** | Does it solve a real problem with meaningful impact? | Attacks the #1/#2 return drivers: **size = #2 return reason; sizing drives 40–60% of fashion returns** [S9]. Complements Suraksha's **42L delistings/6mo** [S7] by moving upstream. Show the impact math in-product. |
| **Feasibility & Scalability** | Practical to build? Scales across users? | $0/call self-hosted VLM; mock↔real and self-hosted↔cloud swaps behind stable contracts. Integrates *with* Meesho's real stack (PRISM, Suraksha, Vaani, BharatMLStack), not around it. |
| **Technical Excellence** | Strength of foundation, execution, coding quality? | Typed contracts, an explainable orchestrator, agentic state that survives retries, streaming VLM progress, reusable component system, clean folder structure, tests on the decision core. |

### Submission deliverables (the checklist we are graded against)

Build these *into the repo* as we go — do not leave them for the last day:

1. **Live demo URL** — deployed (Vercel for `web/`; VLM service reachable or gracefully mocked so the
   demo never hard-fails without a GPU).
2. **Source-code repository** — public or access-granted, clean history.
3. **README / setup guide** — clear *run-locally* instructions (the `Commands` section is the seed).
4. **Open-source attribution** — for every library/framework/tool: **name & version, license, role in
   our build, source link.** Maintain this in `ATTRIBUTION.md` (seed table at the bottom of this file).
5. **Prototype showcase** — a scripted 3-persona walkthrough the judges can reproduce (see `Demo script`).

---

## 1. What we're building

A **point-of-listing, multi-agent trust layer** for Meesho. Before a listing goes live, the seller must
prove (1) they physically **possess** the product and (2) the **size data is real**. An **orchestrator**
routes each listing through specialist agents *by risk*, with a **human-in-the-loop** gate and a
**Unified Decision Engine** that owns the final trust score. The verified listing then appears in a
**real buyer marketplace** carrying an **✓ Asli Verified** badge; risky listings land in a **Trust &
Safety review queue**.

**Positioning: prevention at the point of listing**, complementary to Meesho's *Project Suraksha* (which
acts *after* a listing is live). We are **not** "counterfeit detection." Keep every string, comment, and
UI label framed as proactive verification.

### The five AI engines

| # | Engine | Question it answers | Round-3 status |
|---|--------|---------------------|----------------|
| **1** | **Possession-Proof** ★ showpiece | *Do you actually hold it?* | **Real VLM, full flow** |
| **2** | **Smart Sizing** | *Is the size real?* | **Real VLM, full flow** |
| **3** | **Risk Radar** | *How risky is this listing/seller?* | **Working simulation** (deterministic scoring engine over persisted seller signals) |
| **4** | **Promise Keeper** | *Did it arrive as promised?* | **Working simulation** (delivery-photo vs frozen-promise check; buyer-side) |
| **★** | **Unified Decision Engine** | *Final trust score + verdict?* | **Real** — composes all agents into one explainable score |

> Round 3 change vs. earlier scope: Agents 3 & 4 are **no longer "roadmap only."** They ship as
> **honest working simulations** — real code, real state, real explainable output — clearly labelled
> `simulated` in the UI where they stand in for a data source Meesho would provide (seller history DB,
> logistics API). A simulation that *reads state and reasons* still demonstrates the system; a dead
> "coming soon" card does not.

- **Agent 1 — Possession-Proof:** catalog upload → reverse-image search (TRIGGER) → dynamic camera-only
  challenge → VLM verifies same-item + live challenge code → pass / retry / block.
- **Agent 2 — Smart Sizing:** flat-lay + reference object (A4 / tape) → VLM calibrates pixels→cm →
  measures chest/length/waist → auto-fills the Meesho size chart. AI chart wins if the listed one is wrong.
- **Agent 3 — Risk Radar:** seller history + listing signals → dynamic **trust score**; routes only
  genuinely risky listings to a human, lets trusted sellers skip the live challenge (fast lane).
- **Agent 4 — Promise Keeper:** freezes each listing's promises into a contract at go-live; on delivery,
  checks the delivery photo against it and surfaces the result to the buyer.

`✓ Asli Verified` requires **Agent 1 ∧ Agent 2** to pass. All engines share **one Qwen2.5-VL** vision model.

---

## 2. The three personas (build ALL of them)

**Real authentication is in scope:** sign in with Google via **Auth0** (the provider declared in the
PPT stack — "Auth0 + JWT"), first-login **role selection** (Seller / Buyer / Admin; labelled demo
provision — production would gate Admin by invite and Seller by KYC), role stored server-side in the
`users` table, RBAC enforced in middleware **and** per-route. A header persona switcher remains as a
labelled demo convenience so judges can hop roles in one click.

### A. Seller flow — `/sell` (the showpiece; already partly built)

**KYC onboarding first** (new sellers): shop details + doc-image upload → simulated verification
(labelled `simulated`) → `kyc_status` feeds Risk Radar's cold-start prior. Then
`Upload → Image check (trigger) → Live proof (challenge) → Auto-size → Review → Live`. This exists in a
plain form today (see current screenshots). **Round 3 job: make it feel real** — animated stepper,
camera with a framing overlay, streaming VLM progress ("checking product… reading code… scoring live…"),
EXIF-freshness signal on the live capture, voice guidance (Web Speech) on every step, a Hindi/English
toggle, confetti on go-live, a genuine "thief blocked" branch, and adaptive re-challenge at a stricter
bar. Trusted sellers get a visible **fast lane** (Risk Radar skips the live challenge).

### B. Buyer marketplace — `/shop` (NEW — build this)

A believable Meesho storefront so the payoff is visible:
- **Product grid** — cards with image, title, price (₹, Meesho-typical AOV ~₹480 [S10]), rating, and an
  **✓ Asli Verified** badge on verified listings; unverified ones show a subtler state.
- **Product detail** — gallery, the **AI-measured size chart** (Agent 2 output) with a *"Measured, not
  guessed"* tag, seller trust band, and a **"Why you can trust this"** panel that expands the agent
  reasons (possession proven 96% · size measured · Promise Keeper armed).
- **Mock checkout + order lifecycle** — address → payment (COD / UPI-mock, no real money, labelled) →
  order placed → **tracking timeline** (placed → shipped → delivered; simulated events with a demo
  fast-forward button).
- **Post-delivery** — a **Promise Keeper** card: "Arrived as promised?" comparing the frozen promise to
  the delivery photo, feeding the outcome back into the seller's trust score.
- **Verified-first ranking** — the feed boosts ✓ Asli Verified listings (PRISM-style, simulated in our
  own query, labelled in the trust panel).
- Purpose: proves the *impact* half of the pitch — buyers see a listing they can trust; returns drop.

### C. Trust & Safety / Admin console — `/admin` (NEW — build this)

The operator's cockpit that makes the "human-in-the-loop" and "continuous learning" claims real:
- **Review queue** — every `ESCALATE_HUMAN` listing with full context (images side-by-side, each agent's
  `reason` + `confidence`, the required bar, why it escalated). **Approve / Reject** with a note.
- **Trust dashboard** — live tiles: listings verified, thieves blocked, avg trust score, escalation rate
  (target <5%), estimated returns prevented (tie to the 40–60% sizing-returns stat [S9]).
- **Seller 360** — a seller's trust band, history of passes/fails, and how a reviewer decision *moves the
  score* (close the learning loop visibly).
- **Agent monitor** — health of the VLM service, per-agent latency, mock/real + degradation state, and
  which trigger source is active (SerpAPI / Qdrant / mock).
- **Role management** — admin lists users and (demo provision) changes roles.

---

## 3. Non-negotiable invariants (do not break these in any code)

### Product invariants

1. **Reverse-image search is a TRIGGER, not a verdict.** "Image seen elsewhere" only *triggers* the
   possession challenge. NEVER auto-block on a reverse-image hit — honest resellers use supplier catalog
   photos and legitimately appear elsewhere.
2. **Challenge capture is camera-only.** The challenge step MUST use a live camera stream
   (`getUserMedia`) or `<input type="file" accept="image/*" capture="environment">`. NEVER silently
   allow a gallery/file upload on the challenge step.
3. **The challenge code is dynamic + time-bound + single-use.** Fresh code per session, short TTL, tied
   to a timestamp. The seller writes it on a slip and photographs the product next to it. One code = one
   listing; a passing photo must not be reusable on another listing.
4. **Positioning is prevention, not detection.** Asli *complements* Suraksha; it never replaces or
   re-implements it. No UI copy reframing this as counterfeit detection.
5. **Secrets live in env vars.** VLM and reverse-image API keys never get committed. Use `.env.local`
   (gitignored) + a populated-with-placeholders `.env.example`.

### Agentic invariants (what makes it "dynamic," not a demo)

6. **The orchestrator decides; routes don't hardcode the path.** The next action (auto-approve /
   re-challenge / escalate / block) is *computed from live agent signals*. Keep it in
   `web/lib/orchestrator.ts` (`decide()`), never scattered in UI/API routes.
7. **The confidence bar is risk-adaptive, not a constant.** New seller, heavily-reused image, and repeat
   attempts each *raise* the required confidence. Never compare against a single magic number.
8. **Every decision is explainable and logged.** Each agent returns a `reason` + `confidence`; the
   orchestrator records the action, the bar it required, and the signals it used. No silent verdicts —
   the buyer, seller, and reviewer all see the *why*.

### Round-3 build invariants (quality bar)

9. **No dead ends.** Every button routes somewhere real or shows a real state (loading / success / error
   / empty). If a feature is simulated, label it `simulated` — never fake it silently, never leave it inert.
10. **Every async action has three visible states** — loading, success, error — with retry on error. VLM
    calls stream progress; nothing spins forever without feedback or a timeout fallback.
11. **Responsive + accessible.** Mobile-first (Meesho is a mobile-first Bharat platform). Keyboard
    focus states, `aria` labels, ≥44px tap targets, prefers-reduced-motion respected.
12. **Reuse, don't repeat.** Shared primitives (Button, Card, Badge, Stepper, StatTile, AgentReasonRow,
    ConfidenceBar, Skeleton, Toast) live in `web/components/ui/*` and are used everywhere.

---

## 4. System architecture

```
   Seller (mobile/web)      Buyer (marketplace)     T&S reviewer (admin)
        │  catalog·flatlay        │  browse·buy            │  review·decide
        ▼                         ▼                        ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  Next.js App Router — pages (/sell /shop /admin) + API routes        │
   │  auth · listing draft · orchestration entry · marketplace · review   │
   └───────────────────────────────┬─────────────────────────────────────┘
                                    ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  ASLI ORCHESTRATOR  (agentic control loop — decide())                │
   │  routes by RISK · rising strictness on retry · cold-start · HITL      │
   └──┬──────────────┬──────────────┬──────────────┬─────────────────────┘
      ▼              ▼              ▼              ▼
 ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌──────────┐
 │ Agent 1 │   │ Agent 2 │   │ Agent 3 │   │ Agent 4  │
 │ Possess │   │ Sizing  │   │ Risk    │   │ Promise  │
 │ -Proof  │   │         │   │ Radar   │   │ Keeper   │
 └────┬────┘   └────┬────┘   └────┬────┘   └────┬─────┘
      └─────────────┴──────┬──────┴─────────────┘
        Agents 1&2 share ONE self-hosted VLM (Qwen2.5-VL)
                           ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  UNIFIED DECISION ENGINE → Trust Score (explainable, logged)         │
   │  ✓ Asli Verified = Agent1 ∧ Agent2 pass                              │
   └──┬───────────────┬──────────────────┬───────────────────┬───────────┘
      ▼               ▼                  ▼                   ▼
 ✓ Published     ✎ Seller guidance   Human review       Monitoring loop
  → /shop        (retry / fix)       → /admin queue     (score updates)

  Integrates WITH Meesho ecosystem (not replace): Suraksha (T&S) · PRISM (ranking) ·
  Vaani (voice fallback) · BharatMLStack (feature store / inference)
```

**Layers:** Client (Seller app · Buyer marketplace · Admin console) → Edge (CDN · WAF · LB) → API
(Gateway · Auth · Listing) → Asli subsystem (Orchestrator · Agents 1–4 · Decision Engine · Trust Score) →
Data (PostgreSQL · Qdrant vectors · Redis TTL) → AI (self-hosted Ollama + Qwen2.5-VL; managed cloud
fallback). For Round 3, Data is a **typed in-memory store with a swappable interface** (see §7).

---

## 5. The complete API surface

Three tiers: **(A)** implemented today, **(B)** internal contracts to build for the 3-persona prototype,
**(C)** external/third-party. Keep *contracts* stable while implementations swap (mock→real,
self-hosted→cloud).

### A. Implemented today (`web/app/api/*` → `vlm-service`)

| Method · Route | Purpose | Request | Response |
|---|---|---|---|
| `POST /api/reverse-image` | Agent 1 trigger. **Trigger only.** | multipart: `catalog` | `{ triggered, matchCount, platforms[], sources[], mocked }` |
| `GET  /api/challenge` | Issue a fresh dynamic code (invariant #3). | — | `{ code, issuedAt, expiresAt }` |
| `POST /api/challenge` | Verify possession → VLM `/vlm/match`. | multipart: `catalog`, `live`, `code` | `{ same_item, code_visible, confidence, reason, passed }` |
| `POST /api/sizing` | Agent 2 measurement → VLM `/vlm/measure`. | multipart: `flatlay`, `reference_object` | `{ chest_cm, length_cm, waist_cm, reference_used, confidence }` |

**VLM service (`vlm-service`, FastAPI, port 8000):** `GET /health`, `POST /vlm/match`,
`POST /vlm/measure`, plus `POST /vlm/embed` (CLIP vector → Qdrant local-mode trigger).
Prompts are single-sourced in **`prompts/vlm-prompts.json`** (repo root) — loaded by both
`vlm-service/prompts.py` and the TS Gemini provider so local and cloud VLM never drift. Both endpoints
force **strict JSON only** and `ollama_client.py` parses defensively (strips fences, retries once at
temperature 0).

**VLM provider seam (`web/lib/vlm/provider.ts`):** one `VlmProvider` interface —
`GeminiProvider` (deployed; PPT-declared cloud fallback) · `OllamaServiceProvider` (local, $0/call) ·
`MockProvider` (labelled degradation). Selected by `VLM_PROVIDER` env; identical JSON contracts.

### B. Internal contracts to build for the prototype

Implement against the `Repo` seam (`DATA_BACKEND=memory|supabase` — in-memory locally, Supabase managed
PostgreSQL deployed; PostgreSQL is the PPT-declared store).

```
# Auth (Auth0 SDK-managed; Google connection)
GET/POST /api/auth/[auth0]           → login / logout / callback / me (@auth0/nextjs-auth0)
POST /api/users/role                 → first-login role selection { seller|buyer|admin } (demo provision)
GET  /api/users/me                   → { role, name, sellerId?, kycStatus? }
GET  /api/admin/users  ·  PATCH /api/admin/users/:id { role }        [admin]

# Seller onboarding
POST /api/kyc/submit                 → multipart doc → simulated verify → { kycStatus }   [seller]

# Commerce (mock, labelled — no real money)
POST /api/orders                     → { listingId, address, paymentMethod: cod|upi_mock } → { orderId }
GET  /api/orders/:id                 → order + tracking timeline
POST /api/orders/:id/advance         → demo fast-forward (placed→shipped→delivered)

# Orchestration entry (the agentic front door)
POST /api/asli/analyze               → orchestrator routes agents, returns a DECISION
     body: { listingId, images, brand, invoice? }
     resp: { action, requiredConfidence, reason, trustScore, nextStep, agentResults{} }

# Listing lifecycle
POST /api/listings                   → create draft → { listingId, flowStep }
GET  /api/listings/:id               → listing + flow state + trust score + agent trail
GET  /api/listings                   → marketplace feed (filter: verified|all)

# Agents 3 & 4 (working simulations)
POST /api/agents/risk-radar/score    → { trustScore, band, contributingSignals[], fastLaneEligible }
POST /api/agents/promise-keeper/check → { promiseKept, confidence, mismatches[], reason }

# Human-in-the-loop
GET  /api/review/queue               → escalated listings + full agent context
POST /api/review/:id/decision        → { approve|reject, reviewerNote } → updates seller trust

# Decision + audit
GET  /api/listings/:id/trust-score   → { score, band, contributingSignals[], explanation }
GET  /api/listings/:id/audit         → append-only decision trail (who/what/why/when)

# Admin dashboard
GET  /api/admin/metrics              → { verified, blocked, avgTrust, escalationRate, returnsPrevented }
```

**Orchestrator decision contract** (in `web/lib/orchestrator.ts` — keep authoritative):

```ts
type OrchestratorAction = "AUTO_APPROVE" | "RE_CHALLENGE" | "ESCALATE_HUMAN" | "BLOCK";
decide(signals: AgentSignals): { action, requiredConfidence, reason }
// signals: reverseImageMatches, sameItem, codeVisible, matchConfidence, sellerIsNew, attempt
```

### C. External / third-party APIs

| API | Used by | Notes |
|---|---|---|
| **Ollama** `POST /api/generate` (`:11434`) | VLM service | Self-hosted, **$0/call**. `OLLAMA_MODEL=qwen2.5vl`; CPU fallback `moondream`. |
| **SerpAPI — Google Lens** | `reverseImage.ts` | TRIGGER only. Free tier ~100/mo → **cache by image hash**. No key ⇒ built-in mock (demo still works). |
| **catbox.moe** | `reverseImage.ts` | Keyless temp image host so SerpAPI can fetch by URL. |
| **Web Speech API** (browser) | `web/lib/voice.ts` | Voice-guided steps for low-literacy Bharat sellers. Client-side, no key. |
| **Gemini 2.0 Flash** (ACTIVE — deployed provider) | `web/lib/vlm/gemini.ts` | PPT-declared cloud VLM fallback, now the deployed demo's provider (Vercel has no GPU). Same JSON contract as Ollama. Degrades to labelled MockProvider on quota/outage. |
| **Auth0** (Google connection) | auth + RBAC | PPT-declared ("Auth0 + JWT"). Universal Login, encrypted httpOnly session, roles in our `users` table. |
| **Supabase** (managed PostgreSQL) | `web/lib/db/supabaseRepo.ts` | PostgreSQL is the PPT-declared store; Supabase hosts it for the deployed demo. Server-side service key only; RLS deny-all. |
| **Qdrant** (local mode via `qdrant-client(path=…)`) | `vlm-service/embed.py` | PPT-declared vector DB. CLIP embeddings → similarity trigger in the local full demo; deployed keeps SerpAPI/mock. |
| **Meesho PRISM / Suraksha / Vaani / BharatMLStack** | Decision Engine (integration) | Asli *feeds* PRISM, *complements* Suraksha, *reuses* Vaani + BharatMLStack. |

**Env vars** (`.env.example` / `vlm-service/.env.example`):

```
# web/.env.local
SERPAPI_KEY=                      # blank ⇒ next trigger source. TRIGGER only.
TRIGGER_SOURCE=serpapi            # serpapi | qdrant (local full demo) | mock
VLM_PROVIDER=ollama               # ollama (local) | gemini (deployed) | mock
VLM_SERVICE_URL=http://localhost:8000
GEMINI_API_KEY=                   # deployed VLM provider
DATA_BACKEND=memory               # memory (local) | supabase (deployed)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=        # server-side ONLY — never NEXT_PUBLIC
AUTH0_SECRET=                     # openssl rand -hex 32
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
CHALLENGE_TTL_SECONDS=300         # invariant #3
NEXT_PUBLIC_ENABLE_VOICE=true
NEXT_PUBLIC_DEFAULT_LOCALE=en     # en | hi

# vlm-service/.env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5vl            # CPU fallback: moondream
OLLAMA_NUM_GPU=                   # set 0 to force full CPU on small-VRAM cards
VLM_TIMEOUT=120
```

---

## 6. Making it DYNAMIC, not a static demo

Each piece must *read state and decide*, not replay a script. This is the core of "Working Prototype" +
"Technical Excellence."

1. **Orchestrator reasons on real signals** — `reverseImageMatches` from the actual trigger result;
   `sellerIsNew` from the persisted trust record (cold-start → stricter bar); `attempt` from session
   state surviving a retry. Its output *drives the UI's next step*, including re-challenge at a stricter bar.
2. **Persist state (no memory = no agent).** Seller (`trust_level`, history), Listing (`flowStep`,
   attempts, decisions), Challenge (`code`, `expiresAt`, `usedForListingId` — enforce single-use),
   AuthenticityCheck (every VLM result + action + reason), ProductImage (`image_hash` + vector).
3. **Real trigger, not "always triggers."** SerpAPI hit count, or at scale Qdrant embedding similarity.
   Keep the mock only behind "no `SERPAPI_KEY`," never as default logic.
4. **Trust Score Engine (Agent 3)** turns scattered signals (image reuse, match confidence, seller age,
   past passes/fails, return-reason spikes) into one explainable score that sets the bar, decides who
   skips the challenge, and routes the risky <5% to a human. It *updates* as outcomes land.
5. **Human-in-the-loop as a real queue.** `ESCALATE_HUMAN` lands in the `/admin` queue with full context;
   the reviewer's decision feeds back into the seller's trust record.
6. **Anti-spoof is behavioural.** Screenshot / screen-of-a-screen must fail: camera-only, dynamic code,
   and where available EXIF/liveness. Treat `same_item` / `code_visible` / "taken live" as separate gates.
7. **Streaming + graceful degradation.** Stream VLM progress; degrade cleanly (GPU→CPU model swap, cloud
   VLM fallback, SerpAPI→mock) behind the same contracts. The deployed demo must never hard-fail if no GPU.
8. **Explainability everywhere.** UI shows the *why*: "same product 96% · code visible 98% · taken live
   94% → PASS." Product requirement *and* audit trail.

---

## 7. Data model & persistence (Round 3)

**Dual-impl `Repo` seam:** `InMemoryRepo` (local dev, zero setup) and `SupabaseRepo` (deployed —
Supabase = managed PostgreSQL, the PPT-declared store) implement the same interface; selected by
`DATA_BACKEND`. Schema lives in `supabase/migrations/*.sql`; idempotent `npm run seed` populates demo
data for both backends (3 sellers of varying trust, ~16 listings across ≥4 categories, 2 pre-escalated
reviews, 1 delivered + 1 in-transit order) so every screen is populated on first load.

```
USER   (id PK, auth0_sub UNIQUE, email, name, role seller|buyer|admin, seller_id FK?, created_at)
SELLER (seller_id PK, user_id FK?, name, shop_name, trust_score, trust_band,
        kyc_status pending|submitted|verified, kyc_doc_url?, is_new, passes, fails, created_at)
  └─┬─ 1:N ─ LISTING (listing_id PK, seller_id FK, title, price, category, status, flow_step,
    │                 verified, size_chart JSON, rank_boost, created_at)
    ├─ PRODUCT_IMAGE     (image_id PK, listing_id FK, url, image_hash, embedding_id?,
    │                     kind catalog|live|flatlay|delivery|kyc)
    ├─ AUTHENTICITY_CHECK(id PK, listing_id FK, agent, payload JSON, confidence,
    │                     action, required_confidence, reason, checked_at)
    ├─ CHALLENGE         (code PK, listing_id FK?, issued_at, expires_at, used_at?  ← atomic single-use claim)
    ├─ SIZE_MEASUREMENT  (chest_cm, length_cm, waist_cm, reference_used, confidence, mapped_size)
    ├─ ORDER             (order_id PK, listing_id FK, buyer_user_id FK, address JSON,
    │                     payment_method cod|upi_mock, status placed|shipped|delivered, timestamps)
    ├─ PROMISE           (listing_id FK, order_id FK?, frozen JSON, delivery_photo?, kept?, checked_at)
    ├─ TRUST_EVENT       (seller_id FK, delta, reason, source, created_at)
    ├─ REVIEW            (listing_id FK, status, reviewer_note, reviewer_user_id FK, decided_at)
    └─ AUDIT_LOG         (listing_id FK?, actor, event, data JSON, created_at  ← append-only)
```

Store lives in `web/lib/db/` — `repo.ts` (interface), `inMemoryRepo.ts`, `supabaseRepo.ts`, `seed.ts`,
`types.ts`. Every API route talks to `repo`, never to a global object or the Supabase client directly.
Supabase access is server-side only (`SUPABASE_SERVICE_ROLE_KEY`); RLS deny-all.

---

## 8. Stack

Goal: **near-zero per-call cost** for the MVP; a clear path to horizontal scale. Invariants hold at every
scale — mock↔real and self-hosted↔cloud swaps never change the contracts above them.

| Layer | Round 3 (now) | Scales to |
|------|-----------|-----------|
| Frontend | **Next.js 15 (App Router) + TypeScript + React 19** | same |
| Styling | **Tailwind CSS 3** — palette in §9 | same |
| **Animation** | **Framer Motion** (page/step transitions, layout, gestures) + Tailwind keyframes | same |
| Client state | **Zustand** (`web/lib/store.ts`, per-persona slices) | same |
| Icons | **lucide-react** (tree-shaken, consistent set) | same |
| **Auth** | **Auth0 + JWT** (PPT-declared) — Google connection, RBAC via `users.role` | same (org SSO, invited admins) |
| i18n | hand-rolled EN/HI dictionary provider (zero deps) | full i18n lib if locales grow |
| **VLM (own API)** | **Ollama + Qwen2.5-VL** in **FastAPI** (local, `$0/call`; CPU fallback `moondream`) · **Gemini 2.0 Flash** (deployed provider) · Mock (labelled degradation) — one `VlmProvider` contract | self-hosted GPU fleet behind the same contract |
| Reverse image | **SerpAPI Google Lens** (deployed, cached, mockable) · **Qdrant local-mode + CLIP** (local full demo) — one `TriggerSource` contract | hosted Qdrant cluster |
| Orchestration | **State machine + `decide()` in Next.js** | LangGraph / function-calling |
| Data | **`Repo` seam: InMemoryRepo (local) · SupabaseRepo (deployed managed PostgreSQL)** | dedicated PostgreSQL · Qdrant · Redis |
| Deploy | **Vercel** (`web/`) + Supabase + Auth0 | Docker + K8s on AWS, WAF + CDN |
| Test | **Vitest** (engines, routes) + **Playwright** E2E (3-persona script — in scope) | same, expanded |

> Billable: SerpAPI (free tier, mockable) + Gemini free tier (deployed demo only). Local demo fully free.

**Deps to add (all declared in `ATTRIBUTION.md`):** `framer-motion`, `lucide-react`,
`clsx` + `tailwind-merge`, `@auth0/nextjs-auth0`, `@supabase/supabase-js`, `zod`,
`vitest` + `@playwright/test` (dev); Python: `qdrant-client`, CLIP weights (openai/clip-vit-base-patch32
via transformers — falls back to `imagehash` perceptual hashing if torch wheels fail on Python 3.14).
**No other new dependency without explicit user approval** (declared-stack rule).

---

## 9. UI design system — "a real Meesho feature"

Two coherent surfaces, one system. The **buyer marketplace** wears Meesho's bright, mobile-first retail
skin; the **seller verification + admin** surfaces wear Asli's darker, cinematic *trust* skin. The shared
tokens and components make them feel like one product.

### Palette (Tailwind tokens — extend `tailwind.config`)

```
Meesho brand   meesho-pink   #F43397   ← marketplace primary (buyer)
               meesho-deep   #9F2089   ← pressed / gradients
Asli trust     asli-violet   #8B5CF6   ← seller/admin primary, "verify" actions
               asli-pink     #EC4899   ← accents, highlights
               asli-amber    #F59E0B   ← TRIGGER / caution ("not a verdict")
               asli-green    #22C55E   ← PASS / verified / live
               asli-red      #EF4444   ← BLOCK / failure
Surfaces (dark) bg #0B0715 · card white/[0.04] · border white/10 · text #F5F3FF
Surfaces (light,buyer) bg #FFFFFF/#FFF5FB · card white · border zinc-200 · text zinc-900
```

- **Verdict colour is semantic and consistent everywhere:** amber = trigger (not a verdict), green =
  pass/verified, red = block, violet = in-progress/verify. Never mix these meanings.
- **✓ Asli Verified badge** is a first-class reusable component (green, shield/check, subtle glow) — it
  appears on marketplace cards, product detail, and the seller's go-live screen. It is the brand payoff.

### Typography & layout

- Display headings: heavy weight, tight tracking (current `font-black` look). Hindi + English lockup
  (`असली Asli`) stays the wordmark.
- Mobile-first: design at 390px, enhance up. Max content width ~640px for flows, wider grid for `/shop`.
- Card style: `rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm` on dark; clean white
  cards with soft shadow on the buyer light surface.
- Spacing rhythm on a 4px scale; generous whitespace; never cramped.

### Components — reusable primitives (`web/components/ui/`)

Build these once, use everywhere. Each: typed props, all states, `cn()` for class merging, motion-ready.

`Button` (primary/ghost/danger, loading spinner, disabled) · `Card` · `Badge` (verified/trigger/blocked
variants) · `Stepper` (animated progress, current pulses) · `ConfidenceBar` (animated fill, colour by
band) · `AgentReasonRow` (icon + label + confidence + pass/fail) · `StatTile` (admin metrics, count-up) ·
`Skeleton` (loading) · `Toast` (success/error) · `Modal` · `EmptyState` · `CameraCapture` (camera-only,
invariant #2) · `PersonaSwitcher` (header) · `VerifiedBadge`.

Feature components live in `web/components/{seller,buyer,admin}/*` and compose the `ui/` primitives.

---

## 10. Animation & micro-interaction guidelines

Motion sells "working prototype." Purposeful, fast, never gratuitous.

- **Library:** Framer Motion for anything stateful (mount/unmount, layout shifts, gestures, shared-layout
  badge). Tailwind keyframes for ambient loops (pulse, shimmer, gradient drift).
- **Durations:** micro 120–180ms; standard 200–300ms; page/step 300–450ms. Easing `easeOut` for enters,
  `easeInOut` for moves. Nothing slower than ~500ms except deliberate hero moments.
- **Page/step transitions:** `AnimatePresence` between flow steps (slide + fade). The **Stepper** animates
  the active pill and draws the connector as steps complete.
- **VLM streaming:** show a live checklist that fills in — "Checking product ✓ → Reading code ✓ → Scoring
  live…" — with a shimmer on the pending row. This is the moment that reads as "real AI at work."
- **Verdict reveals:** PASS → green check scales in + subtle confetti on go-live; BLOCK → card shakes once,
  red states cascade in. `ConfidenceBar` fills from 0 with a spring.
- **Micro-interactions:** buttons scale to 0.97 on press; cards lift on hover (`translateY(-2px)` + shadow);
  badges have a soft entrance glow; count-up numbers on admin tiles.
- **Loading:** skeletons that match final layout (no layout shift); marketplace grid shimmers in.
- **Respect `prefers-reduced-motion`** — swap transforms for instant/opacity-only. Gate via a `useReducedMotion` hook.
- **Camera:** framing overlay (target reticle for the product + code slip), a soft scan-line while
  "capturing," flash on shutter.

---

## 11. Coding standards

- **TypeScript strict.** No `any` in shared contracts; export types from `lib/`. API responses are typed
  end-to-end (route → client → store → component).
- **Server vs client:** default to Server Components; `"use client"` only where interactivity/state needs
  it (flows, camera, stores, motion).
- **Match the surrounding code** — comment density, naming, idiom. Current files are cleanly commented;
  keep that.
- **`decide()` and the agent engines stay pure and unit-tested** — deterministic functions over typed
  signals, no I/O inside. I/O lives in routes/clients.
- **Every async path:** loading + error + retry. Wrap fetches in a typed client (`lib/*Client.ts`) that
  normalizes errors. Never let a promise reject into a blank screen.
- **Accessibility is not optional** (invariant #11). Semantic elements, focus-visible rings, labels.
- **Keep VLM prompts in `prompts/vlm-prompts.json`** (single source — loaded by both `prompts.py` and
  the TS Gemini provider). Cache SerpAPI by image hash; mock at cap.
- **Zod schema per route** in `lib/validation.ts`; normalized error envelope `{ error: { code, message } }`.
- **RBAC defense in depth:** middleware gate + per-route role re-check (role from `users` table, never client-supplied).
- **i18n keys, not hardcoded strings, in the seller flow** — missing Hindi keys fall back to English.
- **No secret in client code or git.** `NEXT_PUBLIC_*` only for non-secret flags.
- **Declared-stack rule:** no new third-party service/library/model without explicit user approval —
  everything used must land in `ATTRIBUTION.md`.
- **Git identity rules (non-negotiable):** all commits under the repository owner's git identity ONLY.
  Never add Claude/Anthropic/AI as author, co-author, committer, or collaborator; never include
  `Co-authored-by:` trailers; never modify `git config user.*`; never change GitHub
  collaborators/permissions; never sign commits for anyone. No automated commits unless explicitly
  requested. If a git operation needs author info or permissions — stop and ask.

---

## 12. Folder structure

```
asli_meesho/
├── web/                              # Next.js frontend + API routes
│   ├── middleware.ts                 # Auth0 session + RBAC gating
│   ├── app/
│   │   ├── page.tsx                  # landing (pitch + sign-in CTA)
│   │   ├── login/page.tsx            # Google sign-in (Auth0 Universal Login trigger)
│   │   ├── onboarding/page.tsx       # role select + seller KYC (simulated verify)
│   │   ├── sell/page.tsx             # SELLER flow (upload→trigger→challenge→sizing→review→live)
│   │   ├── shop/                     # BUYER marketplace
│   │   │   ├── page.tsx              #   product grid (verified-first ranking)
│   │   │   └── [id]/page.tsx         #   product detail + trust panel + BuyBox
│   │   ├── checkout/page.tsx         # mock checkout (address → COD/UPI-mock)
│   │   ├── orders/[id]/page.tsx      # tracking timeline + Promise Keeper card
│   │   ├── admin/                    # TRUST & SAFETY console
│   │   │   ├── page.tsx              #   dashboard (metrics + agent monitor)
│   │   │   ├── queue/page.tsx        #   review queue + decision
│   │   │   ├── sellers/[id]/page.tsx #   seller 360
│   │   │   └── users/page.tsx        #   role management
│   │   └── api/
│   │       ├── auth/[auth0]/                          # Auth0 SDK routes
│   │       ├── users/ kyc/ orders/                    # role select · KYC sim · commerce mock
│   │       ├── reverse-image/ challenge/ sizing/      # (exist)
│   │       ├── asli/analyze/                          # orchestrator entry
│   │       ├── listings/ [id]/                        # lifecycle + feed
│   │       ├── agents/risk-radar/ promise-keeper/     # Agents 3 & 4
│   │       ├── review/                                # HITL queue + decision
│   │       └── admin/metrics/ admin/users/ admin/agents/
│   ├── lib/
│   │   ├── orchestrator.ts           # FlowStep machine + decide() — AGENTIC CORE
│   │   ├── engines/                  # riskRadar.ts, promiseKeeper.ts, decisionEngine.ts, exif.ts
│   │   ├── db/                        # repo.ts, inMemoryRepo.ts, supabaseRepo.ts, seed.ts, types.ts
│   │   ├── vlm/                       # provider.ts, gemini.ts, ollama.ts, mock.ts
│   │   ├── auth.ts trigger.ts validation.ts           # Auth0 helpers · TriggerSource seam · zod
│   │   ├── i18n/                      # provider + en.ts + hi.ts (hand-rolled)
│   │   ├── reverseImage.ts challenge.ts sizing.ts voice.ts
│   │   ├── store.ts                  # Zustand (sellerFlow/session/ui/locale slices)
│   │   └── cn.ts motion.ts           # class-merge helper + shared motion variants
│   ├── components/
│   │   ├── ui/                        # reusable primitives (§9)
│   │   ├── seller/ buyer/ admin/      # persona feature components
│   │   └── flow/*                     # existing step components (upgrade w/ motion)
│   └── public/proof/ public/mock/     # sample catalog + "thief" gallery + marketplace imagery
├── vlm-service/                       # FastAPI + Ollama/Qwen2.5-VL (exists)
│   ├── main.py prompts.py ollama_client.py compose.py embed.py requirements.txt
│   │                                  # embed.py: CLIP → Qdrant local mode (imagehash fallback)
├── prompts/vlm-prompts.json           # SINGLE SOURCE of VLM prompts (py + ts)
├── supabase/migrations/*.sql          # schema + seed
├── e2e/                               # Playwright 3-persona specs
├── .github/workflows/ci.yml           # lint + typecheck + vitest (+ Playwright on main)
├── docs/superpowers/specs/            # design docs (implementation spec lives here)
├── ATTRIBUTION.md   README.md   .env.example   CLAUDE.md
```

---

## 13. Build roadmap (7-day, 13–19 July)

Ordered to keep a *demoable build at every checkpoint*. Do not start UI polish before the flow
underneath works. The spec's priority table (design doc §3) is the cut line — P10–P14 degrade to
labelled-simulated or drop before P1–P7 ever slip.

**Day 1 (13 Jul) — Foundation, auth, infra.** `git init` + GitHub + CI workflow + Vercel + Supabase
project (migrations + seed). **Auth0 app (Google connection) + login + role selection + RBAC
middleware.** Add declared deps; Tailwind tokens (§9); `ui/` primitives; `lib/db` dual repo. Landing +
login pages.

**Day 2 (14 Jul) — Seller flow, real & animated.** Upgrade all `flow/*` steps with motion + streaming
VLM progress. Thief-blocked branch, adaptive re-challenge, confetti go-live. Voice guide (Web Speech) +
i18n scaffold with EN/HI seller-flow strings. The showpiece lands first.

**Day 3 (15 Jul) — Buyer journey end-to-end.** `/shop` grid (verified-first ranking, simulated
PRISM-style boost) + product detail + trust panel. **Mock checkout (address → COD/UPI-mock) → order
tracking timeline (demo fast-forward) → Promise Keeper card on delivery.**

**Day 4 (16 Jul) — Admin console + KYC.** Review queue with full agent context + approve/reject feeding
trust back. Dashboard metrics (count-up tiles). Seller 360. Agent/VLM monitor (provider + trigger
source). Role management. **Seller KYC onboarding sim wired into cold-start trust.**

**Day 5 (17 Jul) — Engines + providers.** `riskRadar.ts` (beta-reputation score → fast lane / bar /
escalate), `promiseKeeper.ts`, `decisionEngine.ts` composing the final explainable score. **Gemini
provider + degradation chain (deployed real AI).** EXIF freshness signal. **Qdrant local-mode embedding
trigger** (`/vlm/embed`, imagehash fallback if torch wheels fail on py3.14).

**Day 6 (18 Jul) — Tests + resilience.** Vitest suites (decide matrix, engines, TTL/single-use, RBAC) +
**Playwright E2E of the 3-persona script.** Degradation drills (Gemini→mock, SerpAPI→qdrant→mock,
camera-denied). Error/empty/loading audit on every screen. A11y + reduced-motion + 390px passes. Hindi
string fill.

**Day 7 (19 Jul) — Deploy + submission.** Vercel prod (Auth0 callbacks on the prod domain), smoke
script, README (run-locally) + ATTRIBUTION (libraries AND research papers). Rehearse the demo script ×3
personas. Seed polish, final QA, submit.

---

## 14. Demo script (the reproducible walkthrough judges follow)

1. **Sign in with Google** (Auth0) → role select: **Seller** → KYC onboarding (simulated verify).
   Upload a supplier catalog photo → *"seen on 4 places online — TRIGGER, not a verdict."* Get today's
   live code → camera challenge with the slip (voice guidance on; flip the हिंदी toggle for one step) →
   VLM streams → **PASS** → auto-size chart built → **go LIVE** (confetti).
2. **Thief branch** → start over, upload only the downloaded image at the challenge (no live product) →
   **BLOCKED — possession not proven**, with the explainable reasons. *This is the money shot.*
3. Switch to **Buyer** → `/shop` → the just-verified listing ranks first with **✓ Asli Verified** + a
   *measured* size chart → detail → "Why you can trust this" → **mock checkout (COD)** → order tracking
   → fast-forward to delivered → **Promise Keeper** confirms arrived-as-promised.
4. Switch to **Admin** → dashboard (verified / blocked / returns-prevented) → review queue → approve an
   escalated listing → open Seller 360 and watch the trust score move → agent monitor shows the live
   provider + trigger source.

---

## 15. Working agreements

- **This is a working prototype, not a deck and not a throwaway demo.** Depth on the three flows beats
  breadth of half-features. But *no dead ends* (invariant #9) — everything visible must do something real.
- **Keep the agentic core honest** — never auto-block on reverse-image hits; never allow gallery upload on
  the challenge; keep codes dynamic + single-use; keep `decide()` reading *real* signals. These are what
  make it agentic *and* what score "Innovation" + "Technical Excellence."
- **Positioning stays prevention at point-of-listing**, complementary to Suraksha — never reframe as
  counterfeit detection.
- **Label simulations honestly.** Agents 3 & 4 and any mocked data show a `simulated` tag; the reasoning
  behind them is real code.
- When in doubt on flow/positioning, re-read [`AGENTS.md`](AGENTS.md) — invariants there win.

## 16. Commands

```bash
# VLM service — terminal 1
ollama pull qwen2.5vl          # CPU-only fallback: ollama pull moondream
ollama serve
cd vlm-service && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# Web — terminal 2
cd web && npm install && npm run dev   # http://localhost:3000

# Tests
cd web && npm run test                 # vitest — orchestrator + engines

# Health check
curl http://localhost:8000/health
```

## 17. Open-source attribution (seed → maintain in `ATTRIBUTION.md`)

For submission, every dependency needs **name & version · license · role · source link**. Seed:

| Name | Version | License | Role | Source |
|---|---|---|---|---|
| Next.js | ^15 | MIT | App framework (pages + API) | github.com/vercel/next.js |
| React | 19 | MIT | UI runtime | github.com/facebook/react |
| Tailwind CSS | ^3 | MIT | Styling | github.com/tailwindlabs/tailwindcss |
| Framer Motion | ^11 | MIT | Animation | github.com/framer/motion |
| Zustand | ^5 | MIT | Client state | github.com/pmndrs/zustand |
| lucide-react | latest | ISC | Icon set | github.com/lucide-icons/lucide |
| FastAPI | latest | MIT | VLM service API | github.com/tiangolo/fastapi |
| Ollama | latest | MIT | Local model runtime | github.com/ollama/ollama |
| Qwen2.5-VL | — | Apache-2.0 (Qwen) | Vision-language model (local) | huggingface.co/Qwen |
| SerpAPI | — | Commercial (free tier) | Reverse-image TRIGGER | serpapi.com |
| @auth0/nextjs-auth0 | ^4 | MIT | Google auth + sessions (PPT: Auth0+JWT) | github.com/auth0/nextjs-auth0 |
| @supabase/supabase-js | ^2 | MIT | Managed PostgreSQL client (deployed repo) | github.com/supabase/supabase-js |
| Gemini 2.0 Flash | — | Commercial (free tier) | Deployed cloud VLM (PPT-declared fallback) | ai.google.dev |
| zod | ^3 | MIT | Route input validation | github.com/colinhacks/zod |
| clsx + tailwind-merge | latest | MIT | `cn()` class merging | github.com/lukeed/clsx |
| Vitest | ^2 | MIT | Unit/integration tests (dev) | github.com/vitest-dev/vitest |
| Playwright | ^1 | Apache-2.0 | E2E tests (dev) | github.com/microsoft/playwright |
| qdrant-client | latest | Apache-2.0 | Vector similarity, local mode (PPT: Qdrant) | github.com/qdrant/qdrant-client |
| CLIP (clip-vit-base-patch32) | — | MIT (weights: OpenAI) | Image embeddings for trigger | github.com/openai/CLIP |
| imagehash (fallback) | latest | BSD-2 | Perceptual-hash trigger fallback | github.com/JohannesBuchner/imagehash |

Research references (also declared): Bai et al. 2025 (Qwen2.5-VL, arXiv:2502.13923) · Criminisi/Reid/
Zisserman IJCV 2000 (single-view metrology) · ISO/IEC 30107-1 (PAD) · Jøsang & Ismail 2002 (beta
reputation) · Chow 1970 + Geifman & El-Yaniv 2017 (reject-option/selective prediction) · Radford et al.
2021 (CLIP) · Malkov & Yashunin 2018 (HNSW).

## 18. Related docs

- [`project.md`](project.md) — problem statement + rationale + impact
- [`AGENTS.md`](AGENTS.md) — contributor guidance + invariants (invariants there win)
- [`README.md`](README.md) — overview + run-locally (submission deliverable)
- `Meesho_Ecosystem_Problem_Solution_Research.xlsx` — 91 problems, sources S1–S16 (impact numbers)
