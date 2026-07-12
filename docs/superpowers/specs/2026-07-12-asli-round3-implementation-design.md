# Asli Meesho — Round 3 Implementation Design (v2)

**Date:** 2026-07-12 (v2, same day — scope expanded per user direction) · **Author:** Claude (Chief
Solution Architect role) · **Status:** awaiting approval
**Companion to:** `CLAUDE.md` (build guide), `AGENTS.md` (invariants). Where this doc and `AGENTS.md`
conflict on product invariants, `AGENTS.md` wins.

**v2 changes:** real Google authentication via **Auth0 + JWT** (the provider declared in the PPT stack —
user ruled out non-PPT providers like Clerk); every roadmap feature pulled into Round 3 unless it
requires an unavailable external Meesho API; mock checkout/COD, seller KYC onboarding sim, Qdrant
embedding reverse-image (local mode), and Hindi/English toggle all approved into scope.

**Declared-stack rule (user constraint):** only technologies named in the PPT/research docs, or
explicitly user-approved, may be used. Approvals on record (2026-07-12): Gemini Flash as the cloud VLM
fallback (PPT already plans "GPT-4o / Gemini"), Supabase as the managed PostgreSQL host (PPT declares
PostgreSQL), Auth0 (PPT declares "Auth0 + JWT"), Qdrant (PPT declares Qdrant), framer-motion /
lucide-react / clsx / tailwind-merge / vitest / Playwright as build-time libraries (declared in
ATTRIBUTION.md). Anything else: ask first.

---

## 1. Product vision & scope

**Vision.** Asli is a point-of-listing, multi-agent trust layer for Meesho: before a listing goes live,
the seller proves they physically possess the product and that the size data is measured, not guessed.
Prevention at the source — complementary to Project Suraksha (post-listing enforcement), never
"counterfeit detection."

**Round 3 scope (13–19 July 2026).** A deployed, production-feeling prototype with real authentication
and three role-gated personas:

- **Seller** — KYC onboarding + the verification showpiece flow (`/sell`).
- **Buyer** — marketplace with browse → detail → mock checkout → delivery → Promise Keeper (`/shop`).
- **Trust & Safety Admin** — review queue, trust dashboard, seller 360, agent monitor, role management
  (`/admin`).

Five AI engines: Possession-Proof (real VLM), Smart Sizing (real VLM), Risk Radar (working engine over
persisted signals), Promise Keeper (working engine, simulated logistics), Unified Decision Engine
(real, composes all).

**Out of scope for Round 3 — ONLY features blocked on unavailable external services:**
- Real money movement (payments are a full mock checkout: address → COD/UPI-mock → order → tracking).
- Real Meesho internal APIs: logistics (Promise Keeper uses simulated delivery events), PRISM
  (ranking boost is simulated in our own feed), BharatMLStack (represented in architecture, not called).
- Native mobile apps (the web app is fully responsive, mobile-first).

Everything else previously deferred is now **in scope**: real Google auth + RBAC, KYC onboarding (sim),
checkout/order lifecycle (sim), EXIF/liveness signals, voice-guided flow (Web Speech, in PPT),
Hindi/English toggle, Qdrant embedding reverse-image (local mode), PRISM-style verified-ranking boost
(simulated), Playwright E2E, multi-category seed data.

**Success criteria:** a judge opens the live URL on a phone, signs in with Google, picks a role,
completes the seller happy path AND the thief-blocked path with real AI verdicts, buys the verified
listing as a buyer through mock checkout, sees Promise Keeper confirm delivery, and approves an
escalation in the admin queue — zero dead buttons, zero hard failures.

---

## 2. Personas & end-to-end journeys

### 2.0 Authentication (all personas)

1. `/login` → **Sign in with Google** (Auth0 Universal Login, Google social connection).
2. First login → **role selection screen** (Seller / Buyer / Admin). Demo provision: judges may take any
   role; the screen notes that production would gate Admin by invitation and Seller by KYC. Role stored
   in our `users` table keyed by Auth0 `sub`; changeable later via the header PersonaSwitcher (also a
   demo provision, labelled).
3. Session = Auth0-managed (encrypted httpOnly cookie via `@auth0/nextjs-auth0`). Route protection =
   middleware + per-route role checks reading our `users.role`.

### 2.1 Seller — "Priya", saree reseller, mobile-first, moderate literacy

1. Google sign-in → role: Seller → **KYC onboarding** (first time): name, shop name, doc-image upload →
   simulated verification (labelled `simulated`) → `kyc_status=verified`, trust record initialized
   (cold-start prior). Skippable for returning demo sellers (already seeded).
2. **Upload** catalog photo (supplier image is fine).
3. **Image check** — reverse-image TRIGGER: deployed = SerpAPI/mock; local full demo = **Qdrant
   embedding similarity** against seeded catalog vectors. Either way: "seen elsewhere — normal for
   resellers; prove possession." Never a block.
4. **Live proof** — dynamic code on a slip; camera-only capture; VLM streams progress; EXIF freshness
   checked as an additional signal. Verdict explainable. Close miss → re-challenge at stricter bar.
   Wrong item → blocked. Trusted sellers (Risk Radar fast lane) skip this step, visibly labelled.
5. **Auto-size** — flat-lay + A4 → measured chart → seller confirms.
6. **Review → Live** — Unified Decision Engine verdict → ✓ Asli Verified, confetti.
7. Voice guidance (Web Speech, in PPT) narrates each step; **भाषा toggle** switches Hindi/English strings.

**Thief variant:** downloaded image only, cannot produce live-code photo → blocked with reasons.

### 2.2 Buyer — "Anjali"

1. Google sign-in → role: Buyer → `/shop` grid. **Verified listings rank first** (PRISM-style boost,
   simulated in our feed query, labelled in the trust panel).
2. Product detail: gallery, measured size chart, seller trust band, "Why you can trust this" panel.
3. **Mock checkout:** address form → payment method (COD / UPI-mock, no real money, labelled) → order
   placed → **tracking timeline** (placed → shipped → delivered, simulated events, fast-forward button
   for the demo).
4. On delivered: **Promise Keeper** card — delivery photo vs frozen promise → verdict → feeds seller
   trust score.

### 2.3 Admin — "Meera", T&S reviewer

1. Google sign-in → role: Admin → `/admin` dashboard: verified / blocked / avg trust / escalation rate /
   returns-prevented estimate [S9].
2. Review queue: full agent context per escalation; approve/reject + note → seller trust updates live.
3. Seller 360: trust sparkline, trust_events feed, KYC status.
4. Agent monitor: VLM provider (gemini/ollama/mock), latency, degradation state, Qdrant/SerpAPI trigger
   source.
5. **Role management:** admin can view users and (demo provision) change roles.

---

## 3. Feature prioritization

### MVP — all judged, ordered by cut-line priority (bottom gets cut first if time collapses)

| P | Feature | Persona |
|---|---------|---------|
| 1 | Seller flow with real VLM verdicts + thief branch + adaptive re-challenge + motion | Seller |
| 2 | Auth0 Google login + role selection + RBAC middleware | All |
| 3 | Supabase persistence + seeded demo data + audit trail | System |
| 4 | Buyer shop grid + detail + trust panel + verified-first ranking (sim) | Buyer |
| 5 | Admin dashboard + review queue + approve/reject → trust feedback | Admin |
| 6 | Risk Radar + fast lane + Unified Decision Engine + explainability UI | System |
| 7 | Gemini provider (deployed) + degradation chain | System |
| 8 | Mock checkout + order tracking + Promise Keeper on delivery | Buyer |
| 9 | KYC onboarding sim → cold-start trust wiring | Seller |
| 10 | Voice guidance + Hindi/English toggle | Seller |
| 11 | EXIF/liveness signal in challenge verification | System |
| 12 | Qdrant embedding reverse-image (local full-demo mode) | System |
| 13 | Playwright E2E of the 3-persona demo script | System |
| 14 | Admin role management + agent monitor extras | Admin |

### Remaining Phase 2 / roadmap (external-blocked or judged-invisible only)

Real Meesho logistics API (Promise Keeper's real data source) · real PRISM/BharatMLStack integration ·
real payment rails · Redis challenge cache (PPT-declared; Postgres atomic claim covers judging — swap is
one repo impl) · Qdrant in the deployed path (needs hosted Qdrant + GPU embedder; local mode proves it).

---

## 4. System architecture

### Approaches considered (v1, unchanged)

Next.js monolith + swappable seams **chosen** over separate Node backend (doubles deploy surface, zero
judge value) and LangGraph service (`decide()` is a pure function; graph runtime adds failure modes —
roadmap note only).

### Chosen architecture

```
Browser (Seller / Buyer / Admin)
   │ HTTPS
   ▼
Auth0 (Universal Login, Google connection) ──┐ session cookie (@auth0/nextjs-auth0)
   ▼                                          │
Next.js on Vercel ── middleware (auth + role gate) ── pages (/login /onboarding /sell /shop /admin)
   │            │
   │            ├── lib/engines/*   orchestrator · riskRadar · promiseKeeper · decisionEngine (pure TS)
   │            ├── lib/db/repo     Repo → InMemoryRepo | SupabaseRepo   (DATA_BACKEND env)
   │            ├── lib/vlm/provider VlmProvider → GeminiProvider | OllamaServiceProvider | MockProvider (VLM_PROVIDER env)
   │            └── lib/i18n        hand-rolled en/hi dictionary provider (zero new deps)
   │
   ├──► Supabase Postgres (managed PostgreSQL — PPT-declared DB; server-side service key only)
   ├──► Gemini 2.0 Flash (deployed VLM; PPT-declared cloud fallback; same JSON contract)
   └──► [local full demo] vlm-service FastAPI :8000
            ├── Ollama Qwen2.5-VL  ($0/call — PPT core)
            └── /vlm/embed → CLIP embeddings → Qdrant (local mode, qdrant-client path=… — PPT-declared)
```

**Swap seams (the scaling story):** `Repo` (memory → Supabase → Postgres+Redis+Qdrant fleet) and
`VlmProvider` (mock → Gemini → self-hosted GPU) — contracts never change above them. Trigger source is a
third mini-seam: `TriggerSource = serpapi | qdrant | mock`, selected by env + availability.

**Prompt single source moves** to `prompts/vlm-prompts.json` (root) — loaded by both `prompts.py` and
the TS Gemini provider. (CLAUDE.md invariant amended accordingly.)

---

## 5. AI agent architecture & orchestration

### 5.1 Engine inventory

| Engine | Kind | Where |
|---|---|---|
| Agent 1 Possession-Proof | Real VLM (`match`) + EXIF freshness signal | `VlmProvider.match` + `lib/engines/exif.ts` |
| Agent 2 Smart Sizing | Real VLM (`measure`) | `VlmProvider.measure` |
| Agent 3 Risk Radar | Beta-reputation engine over persisted signals | `lib/engines/riskRadar.ts` |
| Agent 4 Promise Keeper | Frozen-promise vs delivery check (sim logistics; VLM compare when photo present) | `lib/engines/promiseKeeper.ts` |
| Orchestrator | Pure `decide()` (exists) | `lib/orchestrator.ts` |
| Unified Decision Engine | Pure composition → final trust score + verdict + explanation | `lib/engines/decisionEngine.ts` |

### 5.2 Orchestration loop

`POST /api/asli/analyze`: load seller+listing → Risk Radar (bar, fast lane, cold-start) → collect Agent
1/2 results (incl. EXIF signal) → `decide()` → persist `authenticity_checks` + `audit_log` → return
`{action, requiredConfidence, reason, trustScore, nextStep, agentResults}`. UI renders whatever the
orchestrator says. Bar: base 0.70, +0.10 cold-start, +0.10 heavy image reuse, +0.05/attempt, cap 0.95.

### 5.3 Research backing (no invented algorithms)

| Feature | Reference | Why suitable |
|---|---|---|
| VLM same-item match + code OCR | **Qwen2.5-VL Technical Report** — Bai et al., 2025, arXiv:2502.13923 | Multi-image grounding + document/text reading — exactly the same-item + handwritten-code task. |
| Cloud fallback vision | **Gemini 2.0 Flash** docs (PPT-declared fallback) | Multimodal JSON-mode matching our strict-JSON contract. |
| Anti-spoof challenge | **ISO/IEC 30107-1** (PAD framework); challenge-response nonce — Menezes et al., *Handbook of Applied Cryptography*, ch.10 | Dynamic time-bound single-use code = challenge-response nonce for physical possession; screenshot/replay = presentation attacks, gated separately. |
| EXIF freshness signal | ISO/IEC 30107 PAD taxonomy (artefact detection) | Capture-time metadata as an auxiliary liveness signal; advisory (weight, not gate) since EXIF is strippable. |
| Pixels→cm (A4 reference) | **Single-View Metrology** — Criminisi, Reid, Zisserman, IJCV 2000 | Metric measurement from one image with a known in-plane reference (A4 = 210×297 mm). |
| Embedding reverse-image | **CLIP** — Radford et al., 2021, arXiv:2103.00020; **HNSW** — Malkov & Yashunin, 2018, arXiv:1603.09320 (Qdrant's index) | Catalog-reuse detection as nearest-neighbour search in embedding space — the PPT's declared at-scale trigger, now real in local mode. |
| Trust score | **Beta Reputation System** — Jøsang & Ismail, 2002; survey Jøsang et al., 2007 | Evidence-based score with prior → natural cold-start; updates as outcomes land. `score = 100·(α+passes)/(α+β+passes+fails)` with recency weighting. |
| Escalate-below-bar | **Reject-option classification** — Chow, 1970; **selective prediction** — Geifman & El-Yaniv, NeurIPS 2017 | Risk-adaptive bar + human escalation = selective prediction; <5% routing is a coverage/risk trade-off. |

---

## 6. Database design (Supabase Postgres; mirrored by InMemoryRepo)

v1 schema plus auth + commerce tables:

```sql
users              (id uuid PK, auth0_sub text UNIQUE, email text, name text,
                    role text CHECK (seller|buyer|admin), seller_id uuid FK NULL, created_at)
sellers            (id uuid PK, user_id FK NULL, name, shop_name, avatar_url, trust_score int,
                    trust_band text, kyc_status text CHECK (pending|submitted|verified),
                    kyc_doc_url text NULL, is_new bool, passes int, fails int, created_at)
listings           (id uuid PK, seller_id FK, title, description, price int, category,
                    status CHECK (draft|pending|live|blocked|escalated|rejected),
                    flow_step, verified bool, size_chart jsonb, rank_boost numeric, created_at)
product_images     (id, listing_id FK, url, image_hash, embedding_id text NULL,
                    kind CHECK (catalog|live|flatlay|delivery|kyc))
challenges         (code text PK, listing_id FK NULL, issued_at, expires_at, used_at NULL)
authenticity_checks(id, listing_id FK, agent, payload jsonb, confidence, action,
                    required_confidence, reason, created_at)
size_measurements  (id, listing_id FK, chest_cm, length_cm, waist_cm, reference_used,
                    confidence, mapped_size)
orders             (id uuid PK, listing_id FK, buyer_user_id FK, address jsonb,
                    payment_method CHECK (cod|upi_mock), status CHECK (placed|shipped|delivered),
                    placed_at, delivered_at NULL)
promises           (id, listing_id FK, order_id FK NULL, frozen jsonb, delivery_photo_url NULL,
                    kept bool NULL, confidence NULL, checked_at NULL)
trust_events       (id, seller_id FK, delta int, reason, source, created_at)
reviews            (id, listing_id FK, status CHECK (pending|approved|rejected),
                    reviewer_note, reviewer_user_id FK, decided_at NULL)
audit_log          (id bigint PK, listing_id FK NULL, actor, event, data jsonb, created_at)
```

- Server-side only (`SUPABASE_SERVICE_ROLE_KEY`, never client). RLS deny-all; service role bypasses.
- Single-use code claim stays atomic (v1 §6).
- Seed: 3 sellers (trusted/average/new), ~16 listings across ≥4 categories, 2 escalations, 1 delivered
  order awaiting Promise Keeper, 1 in-transit order. Idempotent `npm run seed`.

---

## 7. API design

Zod-validated, typed, error envelope `{error:{code,message}}`, honest HTTP codes.

```
# Auth (Auth0 SDK-managed)
GET/POST /api/auth/[auth0]         # login / logout / callback / me — @auth0/nextjs-auth0 routes
POST /api/users/role               { role }        → first-login role selection (demo provision)
GET  /api/users/me                                 → { role, name, sellerId?, kycStatus? }
GET  /api/admin/users              → list users    [admin]   ·  PATCH /api/admin/users/:id { role } [admin]

# Seller onboarding
POST /api/kyc/submit               multipart doc   → simulated verify → { kycStatus }   [seller]

# Agent 1 + trigger
POST /api/reverse-image            multipart catalog → { triggered, matchCount, platforms[], source: serpapi|qdrant|mock }
GET  /api/challenge                                → { code, issuedAt, expiresAt }        [seller]
POST /api/challenge                multipart catalog,live,code → match result + EXIF signal [seller]

# Agent 2
POST /api/sizing                   multipart flatlay,reference_object → measurements       [seller]

# Orchestration
POST /api/asli/analyze             { listingId }   → decision envelope                     [seller]

# Listings
POST /api/listings · GET /api/listings?filter · GET /api/listings/:id · GET /api/listings/:id/audit
     (feed applies verified-first rank_boost — PRISM-style, simulated)

# Commerce (mock, labelled)
POST /api/orders                   { listingId, address, paymentMethod } → { orderId }     [buyer]
GET  /api/orders/:id                                → order + tracking timeline            [buyer]
POST /api/orders/:id/advance                        → demo fast-forward (placed→shipped→delivered)
POST /api/agents/promise-keeper/check { orderId, deliveryPhoto? } → verdict

# Agents 3
POST /api/agents/risk-radar/score  { sellerId }     → trust envelope

# HITL + admin
GET  /api/review/queue [admin] · POST /api/review/:id/decision [admin]
GET  /api/admin/metrics [admin] · GET /api/admin/agents [admin]

# vlm-service (local) — existing /health /vlm/match /vlm/measure, plus:
POST /vlm/embed                    multipart image  → { vector }   (CLIP; feeds Qdrant local)
```

RBAC: middleware verifies Auth0 session; role from `users` table cached in session claims; each
protected route re-checks role server-side (defense in depth).

---

## 8. Frontend architecture

```
RootLayout (fonts, theme, I18nProvider, Toaster)
└─ AppShell (Header: logo · LanguageToggle(EN/हि) · PersonaSwitcher · UserMenu(Auth0))
   ├─ /login              GoogleSignInCard (Auth0 Universal Login trigger)
   ├─ /onboarding         RoleSelect → (seller) KycOnboarding (doc upload, simulated verify)
   ├─ /sell               SellerFlowPage — Stepper + AnimatePresence:
   │                      Upload → Trigger → Challenge(CameraCapture, StreamingChecklist, ExifBadge)
   │                      → Sizing(SizeChartEditor) → Review(DecisionPanel) → Live(Confetti)
   │                      + VoiceGuide (Web Speech) on every step
   ├─ /shop               ShopGrid (verified-first) → ProductCard[]
   │    ├─ /shop/[id]     ProductDetail + TrustPanel + SizeChartTable + BuyBox
   │    ├─ /checkout      AddressForm → PaymentMock(COD/UPI) → OrderConfirm
   │    └─ /orders/[id]   TrackingTimeline (+ demo fast-forward) → PromiseKeeperCard
   └─ /admin              AdminLayout (role-gated)
        ├─ Dashboard: StatTile[] + AgentMonitor (provider, latency, trigger source)
        ├─ /admin/queue: ReviewQueueList → ReviewDetailDrawer
        ├─ /admin/sellers/[id]: Seller360 (trust sparkline, events, KYC)
        └─ /admin/users: RoleManagement

ui/ primitives: Button · Card · Badge · VerifiedBadge · Stepper · ConfidenceBar · AgentReasonRow ·
StatTile · Skeleton · Toast · Modal · EmptyState · CameraCapture · PersonaSwitcher · StreamingChecklist ·
LanguageToggle · TrackingTimeline
```

**State:** Zustand slices — `sellerFlow` (orchestrator-driven), `session` (role/user from Auth0 +
`users.me`), `ui` (toasts/modals), `locale` (en|hi, persisted localStorage). Server state stays in
Server Components / route fetches (no client cache lib — YAGNI). i18n = hand-rolled dictionary provider
(`lib/i18n/{en,hi}.ts`), zero new deps, seller-flow strings first, rest best-effort.

---

## 9. Backend architecture

Routes thin (validate → engine/repo → HTTP). Engines pure + unit-tested; I/O only in `repo`,
`vlm/provider`, `trigger` source. `vlm-service` FastAPI = local provider + `/vlm/embed` (CLIP →
Qdrant local mode via `qdrant-client(path=…)` — no server process needed). Degradation chain
(never hard-fail): Gemini → retry → Mock (labelled); SerpAPI → Qdrant (local) → mock (labelled);
Supabase down → friendly retry UI. Order tracking advances via explicit demo endpoint — no cron needed.

## 10. Folder structure

CLAUDE.md §12 plus:

```
web/app/onboarding/  checkout/  orders/[id]/  admin/users/
web/app/api/auth/[auth0]/  users/  kyc/  orders/  admin/users/
web/lib/auth.ts             # Auth0 helpers + role guard
web/lib/i18n/               # provider + en.ts + hi.ts
web/lib/engines/exif.ts     # EXIF freshness signal
web/lib/trigger.ts          # TriggerSource seam (serpapi|qdrant|mock)
web/middleware.ts           # Auth0 session + role gating
web/lib/vlm/{provider,gemini,ollama,mock}.ts
web/lib/db/{repo,inMemoryRepo,supabaseRepo,seed,types}.ts
prompts/vlm-prompts.json
supabase/migrations/*.sql
vlm-service/embed.py        # CLIP + qdrant-client local mode
.github/workflows/ci.yml
e2e/                        # Playwright specs (3-persona script)
```

## 11. Security considerations

- Auth0: Universal Login (Google connection), encrypted httpOnly session cookie, JWT validation by SDK;
  `AUTH0_SECRET/BASE_URL/ISSUER/CLIENT_ID/CLIENT_SECRET` server env only.
- RBAC: role lives in our `users` table (not client-editable); middleware gate + per-route re-check;
  admin APIs verify `role=admin` server-side every call.
- Upload hygiene: `image/jpeg|png|webp`, 8 MB cap, re-encode server-side; never trust client MIME.
- Challenge codes: crypto-random, TTL 300 s, atomic single-use claim, issuance rate-limit 5/min/session.
- Supabase RLS deny-all; service key server-only. Zod on every input. No real PII beyond Google
  name/email (judges' own accounts) — state that in the privacy note on /login.

## 12. CI/CD pipeline

Git init (root not yet a repo — Day 1). GitHub Actions on push/PR: `npm ci` → lint → `tsc --noEmit` →
`vitest run`; Playwright job on `main` (mock provider). Vercel Git integration: branch previews +
`main` → production (submission URL). `vlm-service`: `ruff` + import smoke test.

## 13. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | `decide()` matrix, `requiredConfidence()`, riskRadar beta-reputation properties, promiseKeeper mismatches, decisionEngine composition, challenge TTL/single-use, sizing mapping, exif signal, i18n key coverage |
| Integration | Vitest + routes (Mock provider + InMemoryRepo) | analyze paths, review→trust feedback, order lifecycle→promise check, RBAC (each role vs each gated route) |
| E2E | Playwright (in scope, P13) | full 3-persona demo script incl. Google-auth bypass via Auth0 test session |
| Manual (Day 7) | checklist | 390 px + desktop, reduced-motion, degradation modes, Hindi toggle |

## 14. Deployment strategy

- Vercel prod: `VLM_PROVIDER=gemini`, `DATA_BACKEND=supabase`, `TRIGGER_SOURCE=serpapi|mock`, Auth0 prod
  app (callback URLs for the Vercel domain).
- Local full demo (pitch + backup): `VLM_PROVIDER=ollama`, `DATA_BACKEND=memory|supabase`,
  `TRIGGER_SOURCE=qdrant` — the fully self-hosted, $0/call story.
- Pre-judging smoke script + Vercel instant rollback; additive-only migrations during judging week.

## 15. Monitoring & logging

Structured JSON request logs (route, ms, status, provider, action) → Vercel logs; `audit_log` as
product-visible event history; `/admin` Agent Monitor = monitoring-as-a-feature; Vercel Analytics.

## 16. Coding standards

CLAUDE.md §11 verbatim, plus: zod schemas in `lib/validation.ts`; `cn()` everywhere; motion variants in
`lib/motion.ts`; i18n keys not hardcoded strings in seller flow; prompts single-sourced in
`prompts/vlm-prompts.json`; conventional commits.

## 17. Scalability considerations

Seams: `Repo`, `VlmProvider`, `TriggerSource` — laptop → BharatMLStack-scale without contract changes.
Stateless routes; DB-atomic single-use codes = multi-instance safe. Qdrant local mode → hosted Qdrant is
a connection-string change. Redis swap for challenge cache = one repo impl (declared, deferred —
Postgres atomicity covers judging load).

## 18. Risk analysis

| Risk | L | I | Mitigation |
|---|---|---|---|
| Auth0 misconfig locks judges out | M | High | Set up Day 1, test on phone + incognito; fallback demo-session cookie route kept behind env flag |
| Gemini quota/outage | M | High | Retry → labelled Mock; local Ollama backup; smoke test before judging |
| torch/CLIP wheels on Python 3.14 (known box issue) | M | Med | Qdrant path is local-only P12; fallback = perceptual hash (imagehash) similarity, same TriggerSource contract |
| Scope (14 MVP items / 7 days) | High | High | §3 priority order IS the cut line; P10–P14 degrade to labelled-simulated or drop before P1–P7 slip |
| Camera denied on judge device | M | High | `capture` file fallback (camera-only preserved); fixtures + backup video |
| VLM misreads handwritten code | M | Med | temp-0 retry; framing overlay; re-challenge absorbs |
| Serverless statelessness | M | Med | No module-level mutable state; state in DB/cookie |
| Hindi toggle half-translated | M | Low | Seller flow first; untranslated keys fall back to English automatically |

## 19. Build schedule & model delegation

| Day | Deliverable (demoable at day end) |
|---|---|
| 1 (13 Jul) | git init + GitHub + CI + Vercel + Supabase (schema+seed) + **Auth0 Google login + role select + middleware** + design tokens + ui/ primitives |
| 2 (14 Jul) | Seller flow upgraded: motion, streaming checklist, thief branch, re-challenge, voice guide, i18n scaffold (EN/HI seller strings) |
| 3 (15 Jul) | Buyer: shop grid (verified-first), product detail + trust panel, **mock checkout + tracking + Promise Keeper** |
| 4 (16 Jul) | Admin: dashboard, review queue → trust feedback, seller 360, agent monitor, role mgmt + **KYC onboarding sim** |
| 5 (17 Jul) | Engines: riskRadar + decisionEngine + fast lane; **Gemini provider + degradation chain**; EXIF signal; **Qdrant local embed path** |
| 6 (18 Jul) | Vitest suites + Playwright E2E; a11y/reduced-motion/responsive audit; Hindi fill; degradation drills |
| 7 (19 Jul) | Deploy prod, README + ATTRIBUTION (incl. papers), demo rehearsal ×3 personas, polish, submit |

| Work | Model |
|---|---|
| Architecture, spec, engine logic review, prompts, risk calls | **Opus** |
| Features: UI, flows, routes, repos, providers, auth, tests | **Sonnet** |
| README, ATTRIBUTION, seed data, boilerplate, cleanup | **Haiku** |

## 20. Decisions on record

- Cloud VLM: **Gemini 2.0 Flash** (PPT-declared fallback; user-approved 2026-07-12).
- Persistence: **Repo dual-impl — InMemory local + Supabase (managed PostgreSQL, PPT-declared) deployed**.
- Auth: **Auth0 + JWT with Google connection** — user directive: "which is on the PPT, use that only."
  Clerk rejected (not in PPT).
- Scope pulls approved: mock checkout/COD · KYC onboarding sim · Qdrant embedding trigger (local mode) ·
  Hindi/English toggle · plus defaults (EXIF, voice, PRISM-sim ranking, delivery sim, Playwright, categories).
- Declared-stack rule: no new third-party tech without explicit user approval.
