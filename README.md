# असली Asli — proof at the point of listing

**A point-of-listing, multi-agent trust layer for Meesho.** Before a listing goes live, the seller
must prove they physically **possess** the product and that the **size data is real**. An orchestrator
routes each listing through specialist AI agents *by risk*, with a human-in-the-loop gate and a Unified
Decision Engine that owns the final trust score. Verified listings appear in a real buyer marketplace
carrying an **✓ Asli Verified** badge; risky ones land in a Trust & Safety review queue.

> **Positioning: prevention, not detection.** Asli acts *before* a listing is live and *complements*
> Meesho's Project Suraksha (which acts after). It is not counterfeit detection — it is proactive
> verification at the point of listing.

Most "not as pictured" and sizing problems are created the moment a listing is published — a reused
supplier photo, a guessed size chart, a seller who never held the item. Asli intervenes exactly there.
Reverse-image search is used only as a **trigger** (honest resellers legitimately reuse catalog
photos, so a match never blocks); it fires a **dynamic, single-use, time-bound possession challenge**
the seller answers with a **live camera photo** of the product next to a handwritten code. A shared
vision-language model checks *same-item*, *code-visible*, and *taken-live* as separate gates, while a
beta-reputation trust engine sets a **risk-adaptive confidence bar** and lets trusted sellers skip the
challenge via a fast lane.

The payoff is visible on both sides: buyers see a listing they can trust (measured size chart, an
explainable "why you can trust this" panel, verified-first ranking), and Trust & Safety operators get a
real review queue whose decisions feed back into seller trust. Size drives **40–60% of fashion returns**
[S9]; stopping "not as pictured" and wrong sizing *before* go-live is where the impact is.

---

## The five AI engines

| # | Engine | Question | Status |
|---|--------|----------|--------|
| **1** | **Possession-Proof** ★ | *Do you actually hold it?* | Real VLM, full flow |
| **2** | **Smart Sizing** | *Is the size real?* | Real VLM, full flow |
| **3** | **Risk Radar** | *How risky is this seller/listing?* | Working simulation (beta-reputation engine over persisted signals) |
| **4** | **Promise Keeper** | *Did it arrive as promised?* | Working simulation (delivery-photo vs frozen promise) |
| **★** | **Unified Decision Engine** | *Final trust score + verdict?* | Real — composes all agents into one explainable score |

`✓ Asli Verified` requires **Agent 1 ∧ Agent 2** to pass. Agents 1 & 2 share one self-hosted
**Qwen2.5-VL** (local) or **Gemini 2.0 Flash** (deployed). Simulated agents are labelled `simulated`
in the UI — the reasoning behind them is real, tested code.

---

## Architecture

```
   Seller (mobile/web)      Buyer (marketplace)     T&S reviewer (admin)
        │ catalog·flatlay         │ browse·buy             │ review·decide
        ▼                         ▼                        ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  Next.js App Router — pages (/sell /shop /admin) + API routes        │
   └───────────────────────────────┬─────────────────────────────────────┘
                                    ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  ASLI ORCHESTRATOR (decide()) — routes by RISK · rising strictness   │
   │  on retry · cold-start · fast lane · human-in-the-loop               │
   └──┬──────────────┬──────────────┬──────────────┬─────────────────────┘
      ▼              ▼              ▼              ▼
 ┌────────┐   ┌────────┐   ┌────────┐   ┌──────────┐
 │Agent 1 │   │Agent 2 │   │Agent 3 │   │ Agent 4  │
 │Possess │   │Sizing  │   │Risk    │   │ Promise  │
 └───┬────┘   └───┬────┘   └───┬────┘   └────┬─────┘
     └────────────┴──────┬─────┴────────────┘
      Agents 1 & 2 share ONE VLM (Qwen2.5-VL / Gemini)
                         ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  UNIFIED DECISION ENGINE → Trust Score (explainable, logged)         │
   │  ✓ Asli Verified = Agent1 ∧ Agent2 pass                              │
   └──┬───────────────┬──────────────────┬───────────────────┬───────────┘
      ▼               ▼                  ▼                   ▼
 ✓ Published     ✎ Seller guidance   Human review        Monitoring
  → /shop        (retry / fix)       → /admin queue      (score updates)
```

**Three swap seams keep contracts stable while implementations change:**

- **`Repo`** (`web/lib/db/`) — `InMemoryRepo` (local) ↔ `SupabaseRepo` (deployed), selected by `DATA_BACKEND`.
- **`VlmProvider`** (`web/lib/vlm/`) — `Gemini` ↔ `Ollama` ↔ `Mock`, selected by `VLM_PROVIDER`, wrapped in graceful degradation.
- **`TriggerSource`** (`web/lib/trigger.ts`) — `serpapi` ↔ `qdrant` ↔ `mock`, selected by `TRIGGER_SOURCE`.

Pure, unit-tested engines live in `web/lib/engines/` and `web/lib/orchestrator.ts` (no I/O). Prompts are
single-sourced in `prompts/vlm-prompts.json` (loaded by both the TS Gemini provider and Python `prompts.py`).

---

## Folder structure

```
asli_meesho/
├── web/                          # Next.js frontend + API routes
│   ├── middleware.ts             # Auth0 session + RBAC gating (+ gated E2E bypass)
│   ├── app/
│   │   ├── page.tsx  login/  onboarding/     # landing · Google sign-in · role select + KYC
│   │   ├── sell/                 # SELLER flow (upload→trigger→challenge→sizing→review→live)
│   │   ├── shop/  shop/[id]/  checkout/  orders/[id]/   # BUYER marketplace + commerce
│   │   ├── admin/                # ADMIN console (dashboard · queue · sellers/[id] · users)
│   │   └── api/                  # route handlers (see API docs below)
│   ├── lib/
│   │   ├── orchestrator.ts       # decide() — agentic control core
│   │   ├── engines/              # riskRadar · decisionEngine · promiseKeeper · trust · exif
│   │   ├── db/                   # repo.ts · inMemoryRepo · supabaseRepo · seed · types · index
│   │   ├── vlm/                  # provider · gemini · ollama · mock
│   │   └── auth.ts trigger.ts validation.ts api.ts rateLimit.ts i18n/ store.ts cn.ts motion.ts
│   ├── components/               # ui/ (primitives) · seller/ buyer/ admin/ · flow/
│   ├── e2e/                      # Playwright 3-persona demo spec
│   └── playwright.config.ts vitest.config.ts
├── vlm-service/                  # FastAPI + Ollama/Qwen2.5-VL + Qdrant embed (embed.py, index_catalog.py)
├── prompts/vlm-prompts.json      # SINGLE SOURCE of VLM prompts (TS + Python)
├── supabase/migrations/          # PostgreSQL schema
├── README.md  ATTRIBUTION.md  .env.example
```

---

## Run locally

**Prerequisites:** Node 22+, npm. (Optional for the full local VLM: Python 3.11+ and [Ollama](https://ollama.com).)

### 1. Web app (zero external services needed)

```bash
cd web
npm install
npm run dev                           # http://localhost:3000 — no .env.local needed
```

With **no `.env.local`**, the app defaults to `DATA_BACKEND=memory` (seeded demo data),
`VLM_PROVIDER=mock`, and `TRIGGER_SOURCE=mock` — **every screen is populated on first load, no keys
required.** Copy `.env.example` to `.env.local` only when you want the full local stack (Ollama VLM +
SerpAPI/Qdrant trigger) or the deployed backends.

To exercise all three personas locally without an Auth0 tenant, use the **gated test bypass** (never
active in production — see [Testing](#testing)):

```bash
AUTH_TEST_BYPASS=1 npm run dev
# then set a cookie in the browser console: document.cookie = "x-test-role=seller"  (or buyer / admin)
```

### 2. VLM service (optional — real local vision)

```bash
ollama pull qwen2.5vl                  # CPU-only fallback: ollama pull moondream
ollama serve
cd vlm-service && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
# then run the web app with VLM_PROVIDER=ollama VLM_SERVICE_URL=http://localhost:8000
curl http://localhost:8000/health
```

For the Qdrant embedding trigger (local full demo): `python index_catalog.py` once (uvicorn stopped),
then run the web app with `TRIGGER_SOURCE=qdrant`. Falls back to perceptual hashing if torch wheels are
unavailable, and to the labelled mock if the service is down.

---

## Environment variables

All secrets are server-side only; `NEXT_PUBLIC_*` are non-secret flags. See `.env.example`.

| Variable | Where | Default (local) | Purpose |
|---|---|---|---|
| `DATA_BACKEND` | web | `memory` | `memory` (local) or `supabase` (deployed) |
| `VLM_PROVIDER` | web | `mock` | `ollama` (local) · `gemini` (deployed) · `mock` |
| `VLM_SERVICE_URL` | web | `http://localhost:8000` | vlm-service base URL (ollama provider) |
| `GEMINI_API_KEY` | web | — | Deployed cloud VLM provider |
| `TRIGGER_SOURCE` | web | `mock` | `serpapi` · `qdrant` · `mock` |
| `SERPAPI_KEY` | web | — | Reverse-image TRIGGER (blank ⇒ mock) |
| `CHALLENGE_TTL_SECONDS` | web | `300` | Possession-code time-to-live (invariant #3) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | web | — | Managed PostgreSQL (service key = server-only) |
| `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` / `AUTH0_SECRET` | web | — | Auth0 (Google). Blank ⇒ app degrades to signed-out locally |
| `APP_BASE_URL` | web | `http://localhost:3000` | Auth0 callback base |
| `NEXT_PUBLIC_ENABLE_VOICE` | web | `true` | Web Speech voice guidance |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | web | `en` | `en` or `hi` |
| `AUTH_TEST_BYPASS` | web | *(unset)* | E2E/demo only — never set in production |
| `OLLAMA_URL` / `OLLAMA_MODEL` | vlm-service | `http://localhost:11434` / `qwen2.5vl` | Local model runtime |

---

## API documentation

All routes return typed JSON; errors use the envelope `{ error: { code, message } }`. RBAC is enforced
in middleware **and** re-checked per route from `users.role`.

| Method · Route | Role | Purpose |
|---|---|---|
| `GET/POST /auth/*` | — | Auth0 SDK (login / logout / callback / profile) |
| `POST /api/users/role` · `GET /api/users/me` | auth | First-login role select · current user |
| `POST /api/kyc/submit` | seller | Simulated KYC verify → cold-start trust |
| `POST /api/reverse-image` | seller | Agent 1 **trigger** (never a verdict) |
| `GET /api/challenge` · `POST /api/challenge` | seller | Issue dynamic code · verify possession (single-use claim) |
| `POST /api/sizing` | seller | Agent 2 measurement |
| `POST /api/asli/analyze` | seller | **Orchestrator front door** → `{ action, requiredConfidence, reason, trustScore, nextStep }` |
| `POST /api/listings` · `GET /api/listings/:id` · `GET /api/listings` | seller / — | Draft · bundle (incl. Unified Decision) · feed (`?filter=verified\|all`) |
| `POST /api/agents/risk-radar/score` | seller/admin | Agent 3 — recompute trust; fast-lane eligibility |
| `POST /api/agents/promise-keeper/check` | buyer | Agent 4 — delivery vs frozen promise |
| `POST /api/orders` · `GET /api/orders/:id` · `POST /api/orders/:id/advance` | buyer | Mock checkout · tracking · demo fast-forward |
| `GET /api/review/queue` · `POST /api/review/:id/decision` | admin | HITL queue · approve/reject → seller trust |
| `GET /api/admin/metrics` · `GET /api/admin/agents` · `GET /api/admin/users` · `PATCH /api/admin/users/:id` | admin | Dashboard · agent monitor · role management |
| `GET /api/admin/sellers/:id` | admin | Seller 360 (trust history) |

**VLM service:** `GET /health`, `POST /vlm/match`, `POST /vlm/measure`, `POST /vlm/embed`, `POST /vlm/similar`.

---

## Demo script (reproducible walkthrough)

1. **Sign in with Google** → role **Seller** → KYC (simulated). Upload a supplier catalog photo →
   *"seen on 4 places online — TRIGGER, not a verdict."* Get today's code → camera challenge with the
   slip (voice on; flip the हिंदी toggle) → VLM streams → **PASS** → auto-size chart → **go LIVE** (confetti).
2. **Thief branch** → upload only the downloaded image at the challenge → **BLOCKED — possession not
   proven**, with the explainable reasons.
3. **Buyer** → `/shop` → the verified listing ranks first with ✓ Asli Verified + a *measured* size chart
   → detail → *"Why you can trust this"* (Unified Decision Engine) → **mock checkout (COD)** → tracking →
   fast-forward to delivered → **Promise Keeper** confirms arrived-as-promised.
4. **Admin** → dashboard (verified / blocked / returns-prevented) → review queue → approve an escalated
   listing → Seller 360 shows the trust score move → agent monitor shows the live provider + trigger source.

---

## Testing

```bash
cd web
npm run test -- --run     # Vitest — orchestrator, engines, routes, RBAC matrix, agentic flows (120 tests)
npm run e2e               # Playwright — 3-persona demo (boots the app with the gated bypass)
npx tsc --noEmit          # strict typecheck
npm run lint              # ESLint
npm run build             # production build
```

**Auth test bypass (E2E/demo only):** active only when `AUTH_TEST_BYPASS=1` **and**
`NODE_ENV !== "production"` **and** an explicit `x-test-role` is present (header for Playwright, cookie
for manual use). Production builds never read the flag. It lets the suite act as seller/buyer/admin
without a live Auth0 tenant. See `web/lib/auth.ts` and `web/middleware.ts`.

---

## Deployment (Vercel + Supabase + Auth0)

The app is deployment-ready; provisioning requires your own free-tier accounts.

1. **Supabase** — create a project (region `ap-south-1`), apply `supabase/migrations/*.sql`, seed with
   `DATA_BACKEND=supabase npm run seed`. Copy `SUPABASE_URL` + service-role key.
2. **Auth0** — Regular Web App, enable the **Google** social connection. Allowed callback
   `https://<your-domain>/auth/callback`, logout `https://<your-domain>`. Copy domain/client id/secret;
   generate `AUTH0_SECRET` with `openssl rand -hex 32`.
3. **Gemini** — get a free API key (https://ai.google.dev).
4. **Vercel** — import the repo, set **root directory to `web`**, add env vars: `DATA_BACKEND=supabase`,
   `VLM_PROVIDER=gemini`, `TRIGGER_SOURCE=serpapi`, `GEMINI_API_KEY`, `SUPABASE_*`, `AUTH0_*`,
   `APP_BASE_URL=https://<your-domain>`. **Do not set `AUTH_TEST_BYPASS`.** Deploy.

The deployed demo never hard-fails without a GPU: Gemini degrades to a labelled mock, SerpAPI to mock,
Supabase errors surface as friendly retry states.

**Live demo:** _add your Vercel URL here after deploying._

---

## License & attribution

Full third-party attribution — names, versions, licenses, roles, sources, and research references — is
in [`ATTRIBUTION.md`](ATTRIBUTION.md).
