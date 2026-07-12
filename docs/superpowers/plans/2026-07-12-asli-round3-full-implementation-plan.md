# Asli Round 3 — Full Implementation Plan (dependency-ordered)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. Execute workstreams in dependency order, NOT by calendar.

**Goal:** The deployed, judge-usable Asli prototype — 3 role-gated personas, 5 AI engines, real Google
auth — per the approved spec `docs/superpowers/specs/2026-07-12-asli-round3-implementation-design.md`.

**Architecture:** Next.js 15 monolith on Vercel; three swap seams (`Repo`, `VlmProvider`,
`TriggerSource`); pure TS engines; Auth0 v4 Google auth; Supabase managed Postgres; local
FastAPI + Ollama VLM with Gemini 2.0 Flash as the deployed provider.

**Tech stack (closed set — declared-stack rule):** Next.js 15 · React 19 · TS strict · Tailwind 3 ·
framer-motion · zustand · lucide-react · clsx + tailwind-merge · zod · @auth0/nextjs-auth0 v4 ·
@supabase/supabase-js v2 · vitest · @playwright/test · FastAPI · Ollama qwen2.5vl · Gemini 2.0 Flash
(REST, no SDK) · SerpAPI · qdrant-client + CLIP (imagehash fallback). **Nothing else without explicit
user approval.**

## Global Constraints

- CLAUDE.md §3 invariants #1–#12 verbatim. AGENTS.md wins conflicts.
- Engines pure (no I/O); routes = zod validate → engine/repo → typed JSON; error envelope
  `{ error: { code, message } }`.
- Prompts single-sourced in `prompts/vlm-prompts.json`. Secrets server env only.
- RBAC defense in depth: middleware auth gate AND per-route `requireRole()` re-check.
- Verdict colours fixed: amber=trigger · green=pass · red=block · violet=in-progress.
- Label every simulation `simulated`. Loading/error/retry on every async path. 390 px mobile-first,
  a11y, reduced-motion.
- Conventional commits, commit per green task, CI green before next workstream.
- Palette / motion rules: CLAUDE.md §9–§10. All npm work in `web/`.

## Dependency graph (execution order)

```
A Repo+CI ─► B Design system ─► C Data layer ─► D Validation ─► E Auth+RBAC ─► F i18n+Shell
                                                                      │
              ┌───────────────────────────────────────────────────────┤
              ▼                        ▼                              ▼
      G Seller flow             H Buyer commerce                I Admin+KYC
              └───────────┬───────────┴───────────┬──────────────────┘
                          ▼                       │
                J AI engines & providers ◄────────┘   (J.1–J.3 pure engines can start any time after C)
                          ▼
                K Testing & resilience
                          ▼
                L Deployment & submission
```

Cut-line (needs user sign-off to invoke): J.6 EXIF → J.7 Qdrant → K Playwright breadth → F Hindi fill →
I.4 role-mgmt extras degrade/drop first. A–E, G, H.1–H.3, I.1–I.2, J.1–J.5 never slip.

---

## Workstream A — Repository & CI foundation

### Task A1: git init, .gitignore, GitHub, CI workflow

Step-level detail (all code, commands, expected output): **Annex plan
`2026-07-13-phase1-foundation-auth.md` Task 1** — execute as written.

**Produces:** git repo `main` on GitHub; CI = `npm ci` → `lint` → `tsc --noEmit` → `vitest run` in `web/`.

- [ ] A1 complete (CI runs; vitest may fail until B1 — re-verify at B1)

---

## Workstream B — Design system & UI primitives

### Task B1: deps, Tailwind tokens, cn(), motion variants, vitest

Detail: **Annex Task 2**. Produces `cn()`, `fadeSlideUp`/`stepTransition`/`staggerChildren`, palette
tokens (`meesho-pink #F43397`, `meesho-deep #9F2089`, `asli-violet #8B5CF6`, `asli-pink #EC4899`,
`asli-amber #F59E0B`, `asli-green #22C55E`, `asli-red #EF4444`), `npm run test`.

- [ ] B1 complete (cn tests green)

### Task B2: UI primitives batch 1

Detail: **Annex Task 10**. Locked props:

```tsx
Button:  { variant?: "primary"|"ghost"|"danger"; loading?: boolean } & ComponentProps<"button">
Card:    { className?: string; children: ReactNode; as?: "div"|"section" }
Badge:   { variant: "verified"|"trigger"|"blocked"|"progress"|"neutral"; children: ReactNode }
VerifiedBadge: { size?: "sm"|"md" }
Skeleton:{ className?: string }
EmptyState: { icon: LucideIcon; title: string; hint?: string; action?: ReactNode }
Modal:   { open: boolean; onClose: () => void; title: string; children: ReactNode }
useToast(): { toast: (t: { kind: "success"|"error"; message: string }) => void }
```

- [ ] B2 complete

### Task B3: UI primitives batch 2

Detail: **Annex Task 11**. Locked props:

```tsx
Stepper:            { steps: { id: string; label: string }[]; currentId: string; doneIds: string[] }
ConfidenceBar:      { value: number; bar?: number }
AgentReasonRow:     { icon: LucideIcon; label: string; confidence?: number; passed?: boolean; note?: string }
StatTile:           { label: string; value: number; suffix?: string; countUp?: boolean }
StreamingChecklist: { items: { id: string; label: string; state: "pending"|"active"|"done"|"failed" }[] }
PersonaSwitcher:    { current: Role; onSwitch: (r: Role) => void }
LanguageToggle:     { locale: "en"|"hi"; onToggle: () => void }
```

- [ ] B3 complete

---

## Workstream C — Data layer (the `Repo` seam)

### Task C1: domain types + `Repo` interface — **Annex Task 3** (interface locked there; every later
workstream imports it exactly).
### Task C2: `InMemoryRepo` (TDD: single-use claim, TTL, order lifecycle, feed filter) — **Annex Task 4**.
### Task C3: seed data + `getRepo()/repoReady()` factory — **Annex Task 5** (fixed identities:
Priya Sharma 88/verified, Rohan Verma 55, Fresh Finds 40/new/pending; ≥16 listings across
sarees|kurtis|footwear|jewellery; 2 pending reviews; 1 delivered + 1 placed order).
### Task C4: Supabase project + migration + `SupabaseRepo` + contract tests — **Annex Task 6**
(atomic conditional-update claim; RLS deny-all; seed via Node 22 type-stripping runner).

- [ ] C1 · - [ ] C2 · - [ ] C3 · - [ ] C4 complete

---

## Workstream D — Validation & API envelope

### Task D1: zod schemas + ok/fail helpers — **Annex Task 7**. Produces `roleSelectSchema`,
`listingCreateSchema`, `orderCreateSchema`, `reviewDecisionSchema`, `kycSubmitSchema`,
`ok<T>()`, `fail(status, code, message)`.

- [ ] D1 complete

---

## Workstream E — Auth & RBAC (Auth0 v4)

### Task E1: Auth0 tenant + SDK + middleware — **Annex Task 8** (v4 mounts `/auth/*`;
`getSessionUser()` auto-provisions DB user; `requireRole(role)` throws `HttpError`).
### Task E2: role selection + users API + onboarding page — **Annex Task 9**
(`POST /api/users/role` creates seller record for role=seller; demo-provision disclaimer copy fixed).
### Task E3: login + landing pages — **Annex Task 13 steps 1–2** (Vercel deploy moves to Workstream L).

- [ ] E1 · - [ ] E2 · - [ ] E3 complete

---

## Workstream F — i18n & App shell

### Task F1: i18n provider + EN/HI dictionaries + store slices + AppShell header — **Annex Task 12**
(`translate(locale, key)` pure core, hi→en fallback, tested; header = wordmark + LanguageToggle +
PersonaSwitcher + user menu).

- [ ] F1 complete

---

## Workstream G — Seller verification flow

### Task G1: listing draft API + flow entry

**Files:** Create `web/app/api/listings/route.ts`, `web/app/api/listings/[id]/route.ts`; modify
`web/app/sell/page.tsx`, `web/lib/store.ts`.

**Interfaces:**
- Produces: `POST /api/listings` (body `listingCreateSchema`) → `{ listingId, flowStep: "upload" }`
  [seller]; `GET /api/listings/:id` → `{ listing, images, checks, measurement, trustScore }`;
  store gains `listingId?: string`.

- [ ] **Step 1: Route test** (mock `getSessionUser` seller, POST valid/invalid body → 200 with
  listingId / 400 envelope). Pattern identical to Annex Task 9 Step 1.
- [ ] **Step 2: Implement** — `requireRole("seller")` → `repo.createListing({ sellerId: user.sellerId!,
  status: "draft", flowStep: "upload", verified: false, rankBoost: 0, ...parsed })` →
  `repo.appendAudit`. GET assembles the bundle via `listChecks/listImages/getMeasurement`.
- [ ] **Step 3: Tests pass → commit** `feat: listing draft API`.

### Task G2: TriggerSource seam + upgraded reverse-image route

**Files:** Create `web/lib/trigger.ts`; modify `web/app/api/reverse-image/route.ts`,
`web/lib/reverseImage.ts`, `web/components/flow/TriggerStep.tsx`.

**Interfaces:**
- Produces (locked):

```ts
export interface TriggerResult {
  triggered: boolean; matchCount: number;
  platforms: { name: string; category: "marketplace" | "web"; count: number; url: string }[];
  source: "serpapi" | "qdrant" | "mock";
}
export async function getTrigger(imageHash: string, bytes: Buffer): Promise<TriggerResult>;
```

- [ ] **Step 1: Unit test** — `TRIGGER_SOURCE=mock` returns `source:"mock"`, `triggered:true`;
  `TRIGGER_SOURCE=serpapi` without key falls through to mock (invariant: mock only as keyless fallback).
- [ ] **Step 2: Implement** `trigger.ts`: switch on `process.env.TRIGGER_SOURCE`; `serpapi` branch =
  existing `reverseImage.ts` (hash-cached); `qdrant` branch = POST `${VLM_SERVICE_URL}/vlm/embed` then
  local similarity call (wired fully in J7 — until then this branch throws `TriggerUnavailable`, caught
  → fallthrough to mock with `source:"mock"`). Route persists `repo.addImage({ kind:"catalog",
  imageHash })` + audit. TriggerStep UI: keep TRIGGER-not-verdict copy; show `source` chip
  (`demo/mock` chip only when source=mock).
- [ ] **Step 3: Tests pass → commit** `feat: TriggerSource seam behind reverse-image trigger`.

### Task G3: challenge issue/verify against Repo (single-use enforced end-to-end)

**Files:** Modify `web/app/api/challenge/route.ts`, `web/lib/challenge.ts`.

**Interfaces:**
- Consumes: `repo.issueChallenge/claimChallenge` (C1), `VlmProvider` placeholder = existing
  `vlmClient.ts` until J5 swaps it (same JSON contract, so route code doesn't change at J5).
- Produces: `GET /api/challenge` → `{ code, issuedAt, expiresAt }` (crypto-random 4-char A–Z2–9 code
  via `crypto.getRandomValues`, TTL `CHALLENGE_TTL_SECONDS`); `POST /api/challenge` fields
  `catalog, live, code, listingId` → claim first (`null` ⇒ `fail(409, "code_used_or_expired", …)`),
  then VLM match, then `repo.addCheck` + audit. Issuance rate-limit: ≥5 codes issued within 60 s by
  the same seller ⇒ `fail(429, "rate_limited", …)` (count via repo audit query).

- [ ] **Step 1: Route tests** — claim-once (second verify with same code → 409); expired → 409;
  rate-limit → 429. Mock the VLM call (`vi.mock` on vlmClient) to isolate.
- [ ] **Step 2: Implement.** — [ ] **Step 3: Green → commit** `feat: single-use time-bound challenge, repo-backed`.

### Task G4: CameraCapture overlay + StreamingChecklist challenge UX

**Files:** Modify `web/components/CameraCapture.tsx`, `web/components/flow/ChallengeStep.tsx`.

**Interfaces:** consumes `StreamingChecklist` (B3). CameraCapture stays camera-only (invariant #2):
`getUserMedia` primary, `<input type="file" accept="image/*" capture="environment">` fallback; keeps
existing `code` prop (demo fixtures draw the live code client-side — memory gotcha, do not remove).

- [ ] **Step 1: Implement** — framing overlay (product reticle + slip zone), scan-line while capturing,
  shutter flash; during verify render StreamingChecklist items
  `[checking product, reading code, scoring live]` driven by request lifecycle: submit ⇒ item 1
  `active`; response arrived ⇒ map `same_item`→1, `code_visible`→2, `passed`→3 to `done|failed`
  sequentially (300 ms stagger — perceived streaming; true SSE is YAGNI at this latency).
- [ ] **Step 2: Manual check both fixture paths (honest/thief) on local Ollama. Commit**
  `feat: camera framing overlay + streaming verify checklist`.

### Task G5: orchestrator-driven step routing (kill the linear march)

**Files:** Modify `web/lib/orchestrator.ts`, `web/lib/store.ts`, `web/app/sell/page.tsx`,
`web/components/flow/ReviewStep.tsx`; create `web/app/api/asli/analyze/route.ts`,
`web/lib/orchestrator.test.ts` (move/extend existing tests if present).

**Interfaces (locked):**

```ts
// orchestrator.ts additions — decide() signature UNCHANGED, plus:
export interface AnalyzeResponse {
  action: OrchestratorAction; requiredConfidence: number; reason: string;
  trustScore: number; nextStep: FlowStep; agentResults: Record<string, unknown>;
}
export function stepForAction(a: OrchestratorAction): FlowStep;
// AUTO_APPROVE→"sizing"|"review" (sizing done?), RE_CHALLENGE→"challenge",
// ESCALATE_HUMAN→"review" (locked, banner), BLOCK→"review" (blocked card)
```

`POST /api/asli/analyze { listingId }`:

```ts
export async function POST(req: Request) {
  try {
    const user = await requireRole("seller");
    const { listingId } = z.object({ listingId: z.string() }).parse(await req.json());
    const repo = await repoReady();
    const listing = await repo.getListing(listingId);
    if (!listing || listing.sellerId !== user.sellerId) return fail(404, "not_found", "Listing not found.");
    const seller = (await repo.getSeller(listing.sellerId))!;
    const checks = await repo.listChecks(listingId);
    const last = checks.filter(c => c.agent === "possession").at(-1);
    const attempts = checks.filter(c => c.agent === "possession").length;
    const images = await repo.listImages(listingId);
    const signals: AgentSignals = {
      reverseImageMatches: Number(last?.payload["matchCount"] ?? 0),
      sameItem: Boolean(last?.payload["same_item"]),
      codeVisible: Boolean(last?.payload["code_visible"]),
      matchConfidence: last?.confidence ?? 0,
      sellerIsNew: seller.isNew,
      attempt: Math.max(0, attempts - 1),
    };
    const decision = decide(signals);
    await repo.addCheck({ listingId, agent: "orchestrator", payload: { signals } as Record<string, unknown>,
      confidence: signals.matchConfidence, action: decision.action,
      requiredConfidence: decision.requiredConfidence, reason: decision.reason });
    await repo.appendAudit({ listingId, actor: "orchestrator", event: decision.action,
      data: { bar: decision.requiredConfidence, reason: decision.reason } });
    if (decision.action === "ESCALATE_HUMAN") await repo.createReview({ listingId, status: "pending" });
    if (decision.action === "BLOCK") await repo.updateListing(listingId, { status: "blocked" });
    return ok<AnalyzeResponse>({ ...decision, trustScore: seller.trustScore,
      nextStep: stepForAction(decision.action), agentResults: { possession: last?.payload ?? null } });
  } catch (e) { /* HttpError → fail(e.status,…); ZodError → fail(400,…); else 500 */ }
}
```

- [ ] **Step 1: Vitest — decide() matrix** (the core test asset):

```ts
import { describe, expect, it } from "vitest";
import { decide, requiredConfidence, MAX_ATTEMPTS } from "./orchestrator";

const base = { reverseImageMatches: 3, sameItem: true, codeVisible: true,
  matchConfidence: 0.9, sellerIsNew: false, attempt: 0 };

describe("requiredConfidence", () => {
  it("base bar 0.70", () => expect(requiredConfidence(base)).toBeCloseTo(0.7));
  it("cold-start +0.10", () => expect(requiredConfidence({ ...base, sellerIsNew: true })).toBeCloseTo(0.8));
  it("heavy reuse +0.10", () => expect(requiredConfidence({ ...base, reverseImageMatches: 12 })).toBeCloseTo(0.8));
  it("caps at 0.95", () => expect(requiredConfidence({ ...base, sellerIsNew: true,
    reverseImageMatches: 12, attempt: 9 })).toBeLessThanOrEqual(0.95));
});
describe("decide", () => {
  it("AUTO_APPROVE above bar", () => expect(decide(base).action).toBe("AUTO_APPROVE"));
  it("BLOCK wrong item at floor confidence", () =>
    expect(decide({ ...base, sameItem: false, matchConfidence: 0.1 }).action).toBe("BLOCK"));
  it("RE_CHALLENGE close miss with attempts left", () =>
    expect(decide({ ...base, codeVisible: false, matchConfidence: 0.6 }).action).toBe("RE_CHALLENGE"));
  it("ESCALATE_HUMAN when out of retries", () =>
    expect(decide({ ...base, codeVisible: false, matchConfidence: 0.6, attempt: MAX_ATTEMPTS }).action)
      .toBe("ESCALATE_HUMAN"));
});
```

- [ ] **Step 2: Run — decide tests pass against existing implementation** (they document current
  behavior; fix only if red). Implement `stepForAction` + analyze route + store `applyDecision`
  (UI sets step from `nextStep`, shows re-challenge banner with new bar).
- [ ] **Step 3: Route test (mocked session) → green → commit** `feat: orchestrator front door /api/asli/analyze drives flow`.

### Task G6: sizing step persist + review/live + promise freeze

**Files:** Modify `web/app/api/sizing/route.ts` (persist `repo.addMeasurement`),
`web/components/flow/{SizingStep,ReviewStep,ResultStep}.tsx`.

- [ ] **Step 1:** Sizing route: after VLM measure → `addMeasurement` + audit; SizingStep gets editable
  chart (`SizeChartEditor` inline component — AI values prefilled, seller can nudge ±, AI badge
  "Measured, not guessed").
- [ ] **Step 2:** ReviewStep = DecisionPanel: AgentReasonRow list (possession/size/risk), ConfidenceBar
  vs bar, actions per orchestrator verdict. Going live: `updateListing({ status:"live",
  verified: true, flowStep:"live" })` + **freeze promise**:
  `upsertPromise({ listingId, frozen: { title, price, sizeChart, category, imageUrl } })` + audit +
  confetti (~40 canvas particles, `prefers-reduced-motion` ⇒ static ✓).
- [ ] **Step 3: Manual: full honest + thief paths vs local Ollama. Commit**
  `feat: sizing persistence, decision review, go-live with promise freeze`.

### Task G7: voice guide + seller-flow i18n strings

**Files:** Modify `web/lib/voice.ts`, all `components/flow/*`, `web/lib/i18n/{en,hi}.ts`.

- [ ] **Step 1:** `voice.ts`: `speak(text: string, locale: "en"|"hi")` via `speechSynthesis`
  (`lang: "hi-IN" | "en-IN"`, cancel-before-speak, no-op when unsupported or
  `NEXT_PUBLIC_ENABLE_VOICE!=="true"`); mute toggle in AppShell (store `ui.voiceOn`).
- [ ] **Step 2:** Every flow step announces its i18n'd instruction on mount. All seller-flow strings →
  `t()` keys; `hi.ts` filled for the full seller flow (fallback covers stragglers).
- [ ] **Step 3: i18n key-coverage test** (every `t()` key used in `components/flow` exists in `en`) →
  green → commit `feat: voice-guided, bilingual seller flow`.

---

## Workstream H — Buyer marketplace & commerce

### Task H1: verified-first feed + shop grid

**Files:** Modify `web/app/api/listings/route.ts` (GET); create `web/app/shop/page.tsx`,
`web/components/buyer/ProductCard.tsx`.

**Interfaces:** `GET /api/listings?filter=verified|all` → `Listing[]` ordered
`verified DESC, rankBoost DESC, createdAt DESC` (already the C2 `listListings` sort — PRISM-style
boost, simulated; feed only returns `status === "live"`).

- [ ] **Step 1: Feed test** (seeded repo → verified first; drafts/blocked excluded).
- [ ] **Step 2:** Shop = server component, light Meesho-pink skin (`bg-white text-zinc-900` scope
  wrapper class `buyer-surface`), responsive grid 2-col @390px / 4-col desktop, ProductCard: image,
  title, ₹price, rating stub (seeded), `<VerifiedBadge size="sm">` on verified; unverified = neutral.
  Skeleton grid while streaming.
- [ ] **Step 3: Green + 390 px check → commit** `feat: buyer shop grid with verified-first ranking (simulated PRISM boost)`.

### Task H2: product detail + trust panel

**Files:** Create `web/app/shop/[id]/page.tsx`, `web/components/buyer/{TrustPanel,SizeChartTable,BuyBox}.tsx`.

**Interfaces:** consumes `GET /api/listings/:id` bundle (G1). TrustPanel (expandable "Why you can trust
this"): AgentReasonRow per check — possession %, size measured (chart source), seller trust band, and
`Promise Keeper armed` row; each simulated datum tagged `simulated`. SizeChartTable renders
`sizeChart` cm values + mapped size, "Measured, not guessed" Badge. BuyBox → `/checkout?listing=:id`.

- [ ] **Step 1: Implement.** — [ ] **Step 2: Manual on seeded verified + unverified listings → commit**
  `feat: product detail with explainable trust panel`.

### Task H3: orders API + mock checkout

**Files:** Create `web/app/api/orders/route.ts`, `web/app/api/orders/[id]/route.ts`,
`web/app/api/orders/[id]/advance/route.ts`, `web/app/checkout/page.tsx`.

**Interfaces:** `POST /api/orders` (body `orderCreateSchema`) [buyer] → `{ orderId }`;
`GET /api/orders/:id` [buyer, own orders only] → `{ order, listing, timeline }`;
`POST /api/orders/:id/advance` [buyer — demo fast-forward, labelled] → `{ order }`. On create:
audit + copy listing's promise `orderId` link (`upsertPromise({ ...existing, orderId })`).

- [ ] **Step 1: Route tests** — create valid/invalid; ownership check (other buyer's order → 404);
  advance placed→shipped→delivered idempotent (reuses C2 semantics through the route).
- [ ] **Step 2:** Checkout page: address form (zod client-side too), payment method radio
  (COD / UPI-mock with `simulated` Badge), place order → success screen → link to `/orders/:id`.
- [ ] **Step 3: Green → commit** `feat: mock checkout and order lifecycle (labelled simulated)`.

### Task H4: tracking timeline + Promise Keeper card

**Files:** Create `web/app/orders/[id]/page.tsx`,
`web/components/buyer/{TrackingTimeline,PromiseKeeperCard}.tsx`,
`web/app/api/agents/promise-keeper/check/route.ts`.

**Interfaces:** `POST /api/agents/promise-keeper/check { orderId }` → `PromiseVerdict` (J3 engine;
until J3 lands the route returns `fail(503, "engine_pending", …)` — build UI against the J3 contract:
`{ promiseKept: boolean; confidence: number; mismatches: string[]; reason: string }`). Verdict
persists to `promises` + `addTrustEvent(sellerId, kept ? +2 : -5, …, "promise_keeper")`.

- [ ] **Step 1:** TrackingTimeline: 3 nodes animated progress, "Fast-forward (demo)" ghost Button →
  advance route. PromiseKeeperCard appears at `delivered`: frozen promise summary vs delivery photo
  (seeded photo for the demo order), CTA "Check promise" → verdict reveal (green tick / amber
  mismatch list), `simulated` tag on the logistics events.
- [ ] **Step 2: Manual seeded-order run (engine may 503 until J3 — verify graceful error+retry UI).
  Commit** `feat: order tracking + Promise Keeper card`.

---

## Workstream I — Admin console & KYC

### Task I1: metrics API + dashboard

**Files:** Create `web/app/api/admin/metrics/route.ts`, `web/app/admin/page.tsx`,
`web/app/admin/layout.tsx` (role gate + tab nav).

**Interfaces:** `GET /api/admin/metrics` [admin] →
`{ verified, blocked, avgTrust, escalationRate, returnsPrevented }` — computed from repo:
`verified = live&verified count`, `blocked = blocked count`, `avgTrust = mean seller trustScore`,
`escalationRate = pendingReviews / totalDecisions`, `returnsPrevented = Math.round(verified * 0.5)`
(midpoint of the 40–60% sizing-returns stat [S9]; UI footnote cites it, tagged `estimated`).

- [ ] **Step 1: Metrics test on seeded repo (exact expected numbers).**
- [ ] **Step 2:** Dashboard: 5 `StatTile` (countUp), Suraksha-complement note, AgentMonitor placeholder
  (filled I5). Layout: dark Asli skin, tabs Dashboard/Queue/Sellers/Users.
- [ ] **Step 3: Green → commit** `feat: admin dashboard with live metrics`.

### Task I2: review queue + decision → trust feedback

**Files:** Create `web/app/api/review/queue/route.ts`, `web/app/api/review/[id]/decision/route.ts`,
`web/app/admin/queue/page.tsx`, `web/components/admin/ReviewDetailDrawer.tsx`.

**Interfaces:** `GET /api/review/queue` [admin] → `{ review, listing, seller, checks, images }[]`;
`POST /api/review/:id/decision` (body `reviewDecisionSchema`) [admin] → decided review; side effects:
approve ⇒ `updateListing(status:"live", verified:true)` + `addTrustEvent(+5, "review_approved")`;
reject ⇒ `status:"rejected"` + `addTrustEvent(-10, "review_rejected")`; both update seller
passes/fails + recompute `trustScore/trustBand` via J1 engine (until J1: delta-add clamp 0–100,
marked `// TODO(J1)` is a plan failure — instead call a local
`applyTrustDelta(seller, delta): { trustScore, trustBand }` helper defined NOW in
`web/lib/engines/trust.ts`: `score = clamp(seller.trustScore + delta, 0, 100)`, band thresholds
70/45; J1 replaces internals, signature stays).

- [ ] **Step 1: Route tests** — queue returns seeded 2; decision flips listing status, writes trust
  event, second decision on same review → 409.
- [ ] **Step 2:** Queue UI: list → drawer with side-by-side catalog/live images, AgentReasonRow per
  check, required bar, approve/reject + note (required), optimistic update + toast.
- [ ] **Step 3: Green → commit** `feat: human-in-the-loop review queue feeding seller trust`.

### Task I3: Seller 360

**Files:** Create `web/app/admin/sellers/[id]/page.tsx`, `web/components/admin/TrustSparkline.tsx`.

- [ ] **Step 1:** Page: seller header (band Badge, KYC status), trust sparkline from `listTrustEvents`
  (SVG polyline — no chart lib, declared-stack), events feed, listings table with statuses.
- [ ] **Step 2: Manual: approve in I2 → sparkline moves. Commit** `feat: seller 360 with live trust history`.

### Task I4: role management

**Files:** Create `web/app/api/admin/users/route.ts`, `web/app/api/admin/users/[id]/route.ts`,
`web/app/admin/users/page.tsx`.

- [ ] **Step 1: Route tests** — list users [admin]; PATCH role validates via `roleSelectSchema`;
  non-admin → 403.
- [ ] **Step 2:** Table + role select dropdown + `demo provision` note. Commit
  `feat: admin role management`.

### Task I5: agent monitor

**Files:** Create `web/app/api/admin/agents/route.ts`, `web/components/admin/AgentMonitor.tsx`.

**Interfaces:** `GET /api/admin/agents` [admin] → `{ vlmProvider: "gemini"|"ollama"|"mock",
vlmHealthy: boolean, vlmLatencyMs: number|null, triggerSource: string, dataBackend: string,
degraded: boolean }` — provider self-report + a live `/health` ping (2 s timeout) when
provider=ollama.

- [ ] **Step 1: Implement + render on dashboard (green/amber/red dots). Commit**
  `feat: agent monitor — monitoring as a feature`.

### Task I6: KYC onboarding sim

**Files:** Create `web/app/api/kyc/submit/route.ts`; modify `web/app/onboarding/page.tsx`.

**Interfaces:** `POST /api/kyc/submit` [seller] multipart `{ shopName, doc }` → 1.2 s simulated
verify → `updateSeller({ kycStatus: "verified", shopName })` + audit + trust event (+3,
"kyc_verified"). Upload hygiene: jpeg/png/webp, ≤8 MB, else 422.

- [ ] **Step 1: Route test (happy, oversize→422, wrong type→422).**
- [ ] **Step 2:** Onboarding seller branch: shop name + doc upload card → StreamingChecklist
  (`reading document → verifying → done`, all `simulated`-tagged) → redirect `/sell`.
- [ ] **Step 3: Green → commit** `feat: seller KYC onboarding (simulated) wired to cold-start trust`.

---

## Workstream J — AI engines & providers

### Task J1: riskRadar engine (beta reputation)

**Files:** Create `web/lib/engines/riskRadar.ts`, `web/lib/engines/riskRadar.test.ts`; modify
`web/lib/engines/trust.ts` (I2 helper now delegates), `web/app/api/agents/risk-radar/score/route.ts` (create).

**Interfaces (locked):**

```ts
export interface SellerSignals {
  passes: number; fails: number; isNew: boolean; kycVerified: boolean;
  imageReuseCount: number;
  recentEvents: { delta: number; ageDays: number }[];
}
export interface RiskResult {
  trustScore: number; band: "high" | "medium" | "low";
  contributingSignals: { label: string; impact: number; detail: string }[];
  fastLaneEligible: boolean;
}
export function scoreSeller(s: SellerSignals): RiskResult;
```

- [ ] **Step 1: Failing tests (properties, not just examples):**

```ts
import { describe, expect, it } from "vitest";
import { scoreSeller } from "./riskRadar";

const base = { passes: 0, fails: 0, isNew: true, kycVerified: false, imageReuseCount: 0, recentEvents: [] };

describe("scoreSeller — beta reputation (Jøsang & Ismail 2002)", () => {
  it("cold-start prior α=β=2 ⇒ 50", () => expect(scoreSeller(base).trustScore).toBe(50));
  it("monotonic in passes", () => {
    expect(scoreSeller({ ...base, passes: 10 }).trustScore)
      .toBeGreaterThan(scoreSeller({ ...base, passes: 2 }).trustScore);
  });
  it("recent negative event outweighs old one of same size", () => {
    const fresh = scoreSeller({ ...base, recentEvents: [{ delta: -10, ageDays: 1 }] });
    const stale = scoreSeller({ ...base, recentEvents: [{ delta: -10, ageDays: 90 }] });
    expect(fresh.trustScore).toBeLessThan(stale.trustScore);
  });
  it("fast lane needs score≥85, not new, kyc verified", () => {
    const vet = { ...base, passes: 60, fails: 1, isNew: false, kycVerified: true };
    expect(scoreSeller(vet).fastLaneEligible).toBe(true);
    expect(scoreSeller({ ...vet, kycVerified: false }).fastLaneEligible).toBe(false);
  });
  it("bounded 0..100 and explains itself", () => {
    const r = scoreSeller({ ...base, fails: 500 });
    expect(r.trustScore).toBeGreaterThanOrEqual(0);
    expect(r.contributingSignals.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement:**

```ts
const ALPHA = 2, BETA = 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function scoreSeller(s: SellerSignals): RiskResult {
  const signals: RiskResult["contributingSignals"] = [];
  // Beta reputation: E[Beta(α+passes, β+fails)] scaled to 0–100.
  const base = (100 * (ALPHA + s.passes)) / (ALPHA + BETA + s.passes + s.fails);
  signals.push({ label: "Track record", impact: Math.round(base - 50),
    detail: `${s.passes} passes / ${s.fails} fails (beta prior α=β=2)` });
  // Recency-weighted event adjustment, half-life ~21 days, capped ±15.
  const recency = clamp(
    s.recentEvents.reduce((sum, e) => sum + e.delta * Math.exp(-e.ageDays / 30), 0), -15, 15);
  if (s.recentEvents.length) signals.push({ label: "Recent outcomes", impact: Math.round(recency),
    detail: `${s.recentEvents.length} events, recency-weighted` });
  const reuse = s.imageReuseCount >= 10 ? -5 : 0;
  if (reuse) signals.push({ label: "Image reuse", impact: reuse,
    detail: `Catalog image seen ${s.imageReuseCount}× online` });
  const kyc = s.kycVerified ? 3 : 0;
  if (kyc) signals.push({ label: "KYC", impact: kyc, detail: "Documents verified" });
  const trustScore = Math.round(clamp(base + recency + reuse + kyc, 0, 100));
  const band = trustScore >= 70 ? "high" : trustScore >= 45 ? "medium" : "low";
  return { trustScore, band, contributingSignals: signals,
    fastLaneEligible: trustScore >= 85 && !s.isNew && s.kycVerified };
}
```

- [ ] **Step 3: Route** `POST /api/agents/risk-radar/score { sellerId }` → assemble `SellerSignals`
  from repo (`recentEvents` from trust_events with `ageDays` computed) → `RiskResult`; persist score:
  `updateSeller({ trustScore, trustBand })`. `trust.ts.applyTrustDelta` now recomputes via
  `scoreSeller` after appending the event.
- [ ] **Step 4: Green → commit** `feat: Risk Radar — beta-reputation trust engine`.

### Task J2: decisionEngine (Unified Decision Engine)

**Files:** Create `web/lib/engines/decisionEngine.ts` + test.

**Interfaces (locked):**

```ts
export interface AgentOutputs {
  possession?: { passed: boolean; confidence: number; sameItem: boolean; codeVisible: boolean };
  sizing?: { confidence: number };
  risk: RiskResult;
  orchestratorAction: OrchestratorAction;
}
export interface FinalDecision {
  trustScore: number; asliVerified: boolean;
  verdict: "verified" | "pending" | "blocked" | "escalated";
  explanation: string[];
}
export function unify(o: AgentOutputs): FinalDecision;
// asliVerified = possession.passed && (sizing?.confidence ?? 0) >= 0.6  (CLAUDE.md: Agent1 ∧ Agent2)
// verdict: BLOCK→blocked, ESCALATE_HUMAN→escalated, AUTO_APPROVE+asliVerified→verified, else pending
// trustScore = risk.trustScore nudged +3 verified / −8 blocked, clamped 0–100
// explanation: one human line per contributing agent, e.g. "Possession proven at 96%".
```

- [ ] **Step 1: Failing tests (4 verdict paths + explanation lines non-empty). Step 2: Implement
  (~30 lines, pure). Step 3: Wire into ReviewStep DecisionPanel + listing GET bundle. Green → commit**
  `feat: Unified Decision Engine composes explainable final verdict`.

### Task J3: promiseKeeper engine

**Files:** Create `web/lib/engines/promiseKeeper.ts` + test; unstub H4 route.

**Interfaces (locked):**

```ts
export interface FrozenPromise { title: string; price: number; category: string;
  sizeChart?: Record<string, number>; imageUrl?: string; }
export interface DeliveryObservation { titleSeen?: string; observedSize?: Record<string, number>;
  photoPresent: boolean; }
export interface PromiseVerdict { promiseKept: boolean; confidence: number;
  mismatches: string[]; reason: string; }
export function checkPromise(frozen: FrozenPromise, obs: DeliveryObservation): PromiseVerdict;
// Rules: no photo ⇒ kept=false conf 0.3 "no delivery evidence"; size dims differing >2cm ⇒ mismatch
// per dimension; title token overlap <0.5 ⇒ mismatch; kept = mismatches.length===0;
// confidence = photoPresent ? 0.9 − 0.15·mismatches : 0.3.
```

- [ ] **Step 1: Failing tests (kept-clean, size-drift, no-photo). Step 2: Implement pure. Step 3:**
  H4 route: build `obs` from seeded delivery data (photo present, observedSize = frozen ± seeded
  drift for the demo mismatch case), persist verdict + trust event. **Green → commit**
  `feat: Promise Keeper engine + delivery verdict wiring`.

### Task J4: fast-lane wiring

**Files:** Modify `web/lib/orchestrator.ts` (optional `fastLane` input — when true and trigger fired,
`decide` returns `AUTO_APPROVE` with reason "Trusted seller fast lane (score ≥85, KYC verified)"
BEFORE the possession gate; possession signals may be absent), `app/sell/page.tsx` (skip challenge
step, show violet "Fast lane" Badge + reason), analyze route (compute via J1 before Agent 1).

- [ ] **Step 1: decide() fast-lane tests (eligible skips, ineligible unaffected). Step 2: Implement +
  UI. Green → commit** `feat: Risk-Radar fast lane skips live challenge for trusted sellers`.

### Task J5: VlmProvider seam + Gemini + prompts extraction

**Files:** Create `prompts/vlm-prompts.json`, `web/lib/vlm/{provider,ollama,gemini,mock}.ts`;
modify `vlm-service/prompts.py` (load JSON), `web/lib/vlmClient.ts` (re-export seam),
challenge + sizing routes (import provider).

**Interfaces (locked):**

```ts
export interface MatchResult { same_item: boolean; code_visible: boolean; confidence: number;
  reason: string; passed: boolean; }
export interface MeasureResult { chest_cm: number; length_cm: number; waist_cm: number;
  reference_used: string; confidence: number; }
export interface VlmProvider {
  name: "gemini" | "ollama" | "mock";
  match(catalog: Blob, live: Blob, code: string): Promise<MatchResult>;
  measure(flatlay: Blob, referenceObject: "a4" | "tape"): Promise<MeasureResult>;
}
export function getVlmProvider(): VlmProvider;      // env VLM_PROVIDER; wraps with degradation
export function withDegradation(p: VlmProvider): VlmProvider; // error → 1 retry → MockProvider,
                                                              // sets global degraded flag for I5
```

`prompts/vlm-prompts.json` keys: `match_prompt` (with `{{code}}` placeholder), `measure_prompt`
(with `{{reference}}`), copied verbatim from current `prompts.py`; `prompts.py` becomes a thin
`json.load` of the file (keep public names `MATCH_PROMPT`, `MEASURE_PROMPT` so `main.py` is untouched).

Gemini (REST, **no SDK** — declared-stack):

```ts
async function geminiGenerate(parts: unknown[], key: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }],
        generationConfig: { temperature: 0, response_mime_type: "application/json" } }) });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
// match(): parts = [{text: renderedPrompt}, {inline_data:{mime_type, data: b64(catalog)}},
//                   {inline_data:{…live}}]; JSON.parse defensively (strip ``` fences) → MatchResult.
```

- [ ] **Step 1: Provider unit tests** — mock `fetch`: happy JSON, fenced JSON, 500→retry→mock
  fallback (`name` becomes "mock", degraded flag set). Prompt render test (`{{code}}` substituted).
- [ ] **Step 2: Implement all four files + prompts.json + prompts.py loader.** Ollama provider =
  existing vlmClient HTTP calls moved behind the interface (contract identical — routes unchanged
  beyond the import swap).
- [ ] **Step 3: Local check `VLM_PROVIDER=ollama` (full flow) and `VLM_PROVIDER=gemini` with a real
  key (one match call). Green → commit** `feat: VlmProvider seam — Gemini deployed, Ollama local, mock degradation`.

### Task J6: EXIF freshness signal

**Files:** Create `web/lib/engines/exif.ts` + test; modify challenge route (advisory weight into
check payload + AgentReasonRow in UI: "Capture freshness").

**Interfaces:** `exifFreshness(buf: ArrayBuffer, now?: Date): { hasExif: boolean;
capturedWithinMinutes: number | null; weight: number }` — weight: +0.05 if captured <10 min ago,
0 if no EXIF (strippable — NEVER a lone gate, invariant #6 anti-spoof is behavioural), −0.05 if
EXIF present but >24 h old. Minimal JPEG APP1 parser (no new dep): scan for `0xFFE1` + `Exif\0\0`,
TIFF endianness, IFD0 → tag `0x8769` (ExifIFD) → tag `0x9003` DateTimeOriginal
(`"YYYY:MM:DD HH:MM:SS"`); any parse failure ⇒ `{ hasExif:false, … , weight: 0 }`.

- [ ] **Step 1: Tests with two tiny fixture JPEGs** (one with DateTimeOriginal — generate once with
  Pillow in `vlm-service` venv and commit under `web/lib/engines/__fixtures__/`; one stripped).
  **Step 2: Implement parser (~60 lines). Step 3: Wire as advisory: matchConfidence adjusted by
  weight before decide(), shown in UI. Green → commit** `feat: EXIF freshness as advisory anti-spoof signal`.

### Task J7: Qdrant local-mode embedding trigger

**Files:** Create `vlm-service/embed.py`, `vlm-service/index_catalog.py` (seed script); modify
`vlm-service/main.py` (mount `/vlm/embed`, `/vlm/similar`), `vlm-service/requirements.txt`
(`qdrant-client`, `transformers`, `torch` — **if torch cp314 wheel install fails** (known box risk):
drop to `imagehash` + `Pillow`, same endpoints, `method: "phash"` in responses), `web/lib/trigger.ts`
(unstub qdrant branch).

**Interfaces:** `POST /vlm/embed` (multipart image) → `{ vector: number[], method: "clip"|"phash" }`;
`POST /vlm/similar` (multipart image, `top_k=5`) → `{ matches: { score: number; payload: { title,
url } }[], method }`. Trigger branch: `matches.filter(score ≥ 0.86).length` (clip cosine) or
phash Hamming ≤ 10 ⇒ `matchCount`, `triggered = matchCount > 0`, `source: "qdrant"`.

- [ ] **Step 1:** `embed.py`: CLIP `openai/clip-vit-base-patch32` via transformers, L2-normalized
  512-d vectors; `QdrantClient(path="./qdrant_data")`, collection `catalog`, cosine distance.
  `index_catalog.py` indexes `web/public/mock/*` with titles.
- [ ] **Step 2:** Python smoke test (pytest not in stack — a `if __name__ == "__main__"` self-check
  asserting self-similarity > 0.99 run via `python embed.py --selftest`).
- [ ] **Step 3:** Wire trigger branch + TriggerStep shows `source: qdrant` chip in local mode.
  **Commit** `feat: Qdrant local-mode embedding trigger (CLIP, phash fallback)`.

---

## Workstream K — Testing & resilience

### Task K1: integration test sweep (Vitest, MockProvider + InMemoryRepo)

**Files:** Create `web/lib/__tests__/rbac.test.ts`, `web/app/api/__tests__/flows.test.ts`.

- [ ] **Step 1: RBAC matrix test** — for each gated route handler × role (seller/buyer/admin/anon):
  expected 200/401/403 (table-driven; mock `getSessionUser` per case).
- [ ] **Step 2: Flow tests** — honest path (listing→trigger→challenge claim→analyze AUTO_APPROVE→
  live+promise frozen); thief path (wrong-item mock → BLOCK, listing blocked); escalate path
  (close-miss ×3 → review created → I2 decision → trust event exists); order path (create→advance×2→
  promise check verdict persisted).
- [ ] **Step 3: Green → commit** `test: integration sweep over agentic flows and RBAC`.

### Task K2: Playwright E2E — 3-persona demo script

**Files:** Create `e2e/playwright.config.ts`, `e2e/demo.spec.ts`; modify `web/middleware.ts` +
`web/lib/auth.ts` (test bypass).

**Auth bypass (strictly gated):** when `AUTH_TEST_BYPASS=1` **and** `process.env.NODE_ENV !==
"production"` **and** header `x-test-role` present, `getSessionUser` returns a fixture user of that
role. Refuse to even read the env in production builds (`if (process.env.NODE_ENV === "production")
never bypass`). Document in README testing section.

- [ ] **Step 1:** `npm i -D @playwright/test && npx playwright install chromium`. Config: baseURL
  `http://localhost:3000`, `webServer: { command: "npm run dev", env: { AUTH_TEST_BYPASS: "1",
  VLM_PROVIDER: "mock", DATA_BACKEND: "memory", TRIGGER_SOURCE: "mock" } }`.
- [ ] **Step 2:** `demo.spec.ts` — the CLAUDE.md §14 script: seller happy path (fixture uploads →
  live), thief blocked (mock provider's wrong-item fixture), buyer shop→checkout→fast-forward→promise,
  admin queue approve→trust visible. Assertions on visible verdict text + badges.
- [ ] **Step 3: Green locally → CI job (main only) → commit** `test: Playwright E2E of the judge demo script`.

### Task K3: degradation drills + UX audits

- [ ] **Step 1: Drills (manual, checklist in PR description):** `VLM_PROVIDER=mock` full flow;
  Gemini with invalid key → retry → mock + AgentMonitor `degraded`; `TRIGGER_SOURCE=qdrant` with
  vlm-service down → mock fallthrough; camera permission denied → capture-input fallback path;
  Supabase URL broken → friendly error + retry UI (no white screen).
- [ ] **Step 2: Audits:** every page at 390 px; keyboard-only pass; `prefers-reduced-motion` pass;
  Hindi toggle across seller flow (fallbacks fire, no raw keys on screen); empty states (fresh DB,
  empty queue).
- [ ] **Step 3: Fix findings → commit** `fix: resilience + a11y audit findings`.

---

## Workstream L — Deployment & submission

### Task L1: Vercel production + Auth0 prod config

- [ ] **Step 1:** `npx vercel link`; set prod env: `DATA_BACKEND=supabase`, `VLM_PROVIDER=gemini`,
  `TRIGGER_SOURCE=serpapi` (mock fallthrough), `GEMINI_API_KEY`, `SUPABASE_*`, `AUTH0_*` with
  `APP_BASE_URL=https://<prod-domain>`; Auth0 console: add prod callback
  `https://<prod-domain>/auth/callback` + logout URL. `AUTH_TEST_BYPASS` **absent** in prod.
- [ ] **Step 2:** Deploy `npx vercel --prod`. Smoke script (`scripts/smoke.mjs`, plain node):
  GET `/` 200 → GET `/api/admin/agents` (with a real admin session cookie or temporarily via
  documented manual check) → one `POST /api/asli/analyze` on a seeded listing with mock header off →
  `select count(*) from listings` via Supabase MCP ≥ 16. Expected: all green.
- [ ] **Step 3: Phone test:** Google login on a real phone, camera capture works over HTTPS.
- [ ] **Step 4: Commit + tag** `chore: production deployment` + `git tag round3-rc1`.

### Task L2: README + ATTRIBUTION (submission deliverables)

- [ ] **Step 1:** `README.md`: what/why (3 paragraphs, prevention-not-detection framing), architecture
  diagram (ASCII from CLAUDE.md §4), **run-locally** (Commands §16 + Auth0/Supabase setup steps
  captured during E1/C4), env table, demo script (§14), testing (`npm test`, Playwright), live URL.
- [ ] **Step 2:** `ATTRIBUTION.md`: full CLAUDE.md §17 table with exact installed versions
  (`npm ls --depth=0` / `pip freeze`), license per dep, role, source link; research-paper list
  (spec §5.3). Verify no dependency exists outside the table (`npm ls`, `pip freeze` diff).
- [ ] **Step 3: Commit** `docs: README + open-source attribution for submission`.

### Task L3: demo rehearsal + submit

- [ ] **Step 1:** Run the §14 script ×3 on the prod URL (desktop + phone). Record fallback video of the
  local full-stack demo (Ollama + Qdrant) as backup.
- [ ] **Step 2:** Fix rehearsal nits (copy, timing, seed polish). Final `git push`, CI green.
- [ ] **Step 3:** Submit: live URL, repo access, README, ATTRIBUTION per checklist. **Done.**

---

## Model delegation

| Work | Model |
|---|---|
| Engine logic review (J1–J4), prompt tuning (J5), architecture calls, plan amendments | Opus (this session) |
| All task implementation (A–L features, routes, UI, tests) | Sonnet subagents |
| L2 docs drafting, C3 seed authoring, boilerplate | Haiku subagents |

Protocol: fresh subagent per task → two-stage review (spec compliance, then code quality) → commit per
green task → next task. User checkpoints at each workstream boundary (G, H, I, J minimum).

## Self-review

- **Spec coverage:** every spec §3 MVP item P1–P14 maps to a task (P1→G, P2→E, P3→C, P4→H1–H2, P5→I1–I3,
  P6→J1/J2/J4, P7→J5, P8→H3–H4, P9→I6, P10→G7/F1, P11→J6, P12→J7, P13→K2, P14→I4/I5). §11 security
  items land in E1 (RBAC), G3 (rate-limit/single-use), I6 (upload hygiene), K2 (bypass gating), L1
  (prod env hygiene). §15 monitoring → I5 + L1 smoke.
- **Placeholders:** none — every stub has a defined interim behavior (H4 503 until J3; G2 qdrant branch
  throws-and-falls-through until J7; I2 `applyTrustDelta` defined immediately, upgraded by J1).
- **Type consistency:** `RiskResult`/`PromiseVerdict`/`MatchResult`/`TriggerResult`/`AnalyzeResponse`
  names identical across G/H/I/J references; `Repo` methods used (G–I) all exist in C1's locked
  interface; `stepForAction` defined in G5 and consumed only there and sell page.
