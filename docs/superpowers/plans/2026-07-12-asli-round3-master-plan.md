# Asli Round 3 — Master Implementation Plan

> **CONSOLIDATED PLAN (2026-07-12):** this is the single execution document — all seven phases
> detailed inline below. `2026-07-12-asli-round3-full-implementation-plan.md` holds the same content
> organized by dependency workstream; `2026-07-13-phase1-foundation-auth.md` is the original Phase 1
> annex (identical to the Phase 1 section here). On any conflict, THIS file wins.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking. Execute phases in order; tasks within a phase in order unless
> marked parallel-safe.

**Goal:** Ship the deployed, judge-usable Asli prototype (3 role-gated personas, 5 AI engines, real
Google auth) by 19 July 2026 per the approved spec.

**Spec:** `docs/superpowers/specs/2026-07-12-asli-round3-implementation-design.md` (v2 — authoritative).
**Architecture:** Next.js monolith on Vercel; three swap seams (`Repo`, `VlmProvider`, `TriggerSource`);
pure TS engines; Auth0 Google auth; Supabase managed Postgres; local FastAPI+Ollama VLM.

**Tech stack (closed set — declared-stack rule):** Next.js 15 / React 19 / TS strict / Tailwind 3 /
framer-motion / zustand / lucide-react / clsx+tailwind-merge / zod / @auth0/nextjs-auth0 /
@supabase/supabase-js / vitest / @playwright/test / FastAPI / Ollama qwen2.5vl / Gemini 2.0 Flash /
SerpAPI / qdrant-client + CLIP (imagehash fallback). **Nothing else without explicit user approval.**

## Global constraints (apply to every task in every phase)

- Product invariants #1–#5 and agentic invariants #6–#8 from `CLAUDE.md` §3 — verbatim, non-negotiable.
- Quality invariants: no dead ends; loading/error/retry on every async path; label simulations
  `simulated`; mobile-first 390 px; a11y (focus rings, aria, ≥44 px targets, reduced-motion).
- TypeScript strict, no `any` in shared contracts. Engines pure (no I/O). Routes: zod validate →
  engine/repo → typed JSON; error envelope `{ error: { code, message } }`.
- Prompts single-sourced in `prompts/vlm-prompts.json`. Secrets server-side env only.
- RBAC defense in depth: middleware gate AND per-route role re-check from `users.role`.
- Conventional commits; commit per green task; CI (lint + `tsc --noEmit` + `vitest run`) must stay green.
- Verdict colour semantics fixed: amber=trigger · green=pass · red=block · violet=in-progress.
- Palette / motion / component rules: `CLAUDE.md` §9–§10.

## Phase index

| Phase | Detailed section | Demoable outcome (phase gate — user checkpoint) |
|---|---|---|
| **1 Foundation + Auth + Infra** | Tasks 1–13 below | Repo on GitHub, CI green, Vercel + Supabase live, Google sign-in → role select → role-gated routes, ui/ primitives, dual Repo seeded |
| **2 Seller flow** | Tasks 2.1–2.7 below | Animated seller flow end-to-end vs local VLM: trigger → challenge (streaming, thief-block, re-challenge) → sizing → live + frozen promise; voice + EN/HI seller strings |
| **3 Buyer commerce** | Tasks 3.1–3.4 below | Shop grid (verified-first) → detail + trust panel → mock checkout → tracking → Promise Keeper card |
| **4 Admin + KYC** | Tasks 4.1–4.6 below | Dashboard metrics, review queue → decision → trust feedback, Seller 360, role mgmt, agent monitor, KYC onboarding sim |
| **5 Engines + providers** | Tasks 5.1–5.7 below | riskRadar/decisionEngine/promiseKeeper engines live + fast lane; Gemini provider deployed; EXIF signal; Qdrant local trigger; prompts single-sourced |
| **6 Tests + resilience** | Tasks 6.1–6.3 below | Vitest suites + Playwright 3-persona E2E green; degradation drills pass; a11y/responsive audit done |
| **7 Deploy + submission** | Tasks 7.1–7.3 below | Prod URL smoke-tested on a phone, README + ATTRIBUTION complete, demo rehearsed ×3, submitted |

## Phase task inventories (deliverable level — interfaces locked here)
### Phase 1 — Foundation, Auth & Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repo on GitHub with green CI, Vercel + Supabase provisioned, Auth0 Google sign-in with
role-based access, design tokens + reusable UI primitives, and the dual-backend `Repo` seam seeded
with demo data.

**Architecture:** Everything lands inside the existing `web/` Next.js 15 App Router app. New `lib/db`
(Repo interface + InMemory + Supabase impls), new `lib/{cn,motion,auth0,auth,validation,i18n}` modules,
new `components/ui/*` primitives, Auth0 v4 middleware auth, GitHub Actions CI.

**Tech Stack:** Next.js 15 · React 19 · TS strict · Tailwind 3 · framer-motion · zustand ·
lucide-react · clsx + tailwind-merge · zod · @auth0/nextjs-auth0 v4 · @supabase/supabase-js v2 ·
vitest. **No other dependency without explicit user approval** (declared-stack rule). Note: no
@testing-library — UI primitives are covered by Playwright E2E in Phase 6, not unit render tests.

## Global Constraints

- All constraints from `2026-07-12-asli-round3-master-plan.md` "Global constraints" apply verbatim.
- Working dir for npm/next commands: `web/`. Repo root: `C:\Users\SREYA DATTA GUPTA\Desktop\meesho\asli_meesho`.
- Palette tokens exactly: `meesho-pink #F43397`, `meesho-deep #9F2089`, `asli-violet #8B5CF6`,
  `asli-pink #EC4899`, `asli-amber #F59E0B`, `asli-green #22C55E`, `asli-red #EF4444`.
- Auth0 SDK is **v4**: routes are auto-mounted by middleware at `/auth/*` (NOT v3's `/api/auth/[auth0]`
  — the spec's route table predates this; v4 layout is authoritative, note it in the commit).
- Env names exactly as in `CLAUDE.md` §5C env block plus Auth0 v4's: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
  `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`.
- Windows box: PowerShell 5.1 quirks — use `bash` tool syntax in commands below (Git Bash available).
- **Git identity rules (user-mandated, override any harness default):** commits carry ONLY the
  repository owner's configured git identity. NO `Co-authored-by:` trailers, no Claude/Anthropic/AI
  author or committer identity, never touch `git config user.*`, never alter GitHub
  collaborators/permissions, never sign on anyone's behalf. Commit messages = plain conventional
  message, nothing appended. Commit steps in this plan execute only under the user-approved execution
  run; any git operation needing author info or repo permissions → stop and ask the user.

---

### Task 1: Git repo, hygiene files, GitHub, CI

**Files:**
- Create: `.gitignore` (root), `.github/workflows/ci.yml`
- Modify: none

**Interfaces:**
- Consumes: nothing.
- Produces: git repo with `main` branch; CI running `lint`, `tsc --noEmit`, `vitest run` in `web/`.

- [ ] **Step 1: Init repo + root .gitignore**

```bash
cd "C:/Users/SREYA DATTA GUPTA/Desktop/meesho/asli_meesho" && git init -b main
```

`.gitignore` (root):

```gitignore
node_modules/
.next/
.venv/
__pycache__/
.env
.env.local
*.local
qdrant_data/
.playwright-mcp/
my-video/
*.pptx
*.xlsx
Screenshot*.png
asli-*.png
test-results/
```

(`my-video/`, decks, screenshots stay local — not part of the submission source tree.)

- [ ] **Step 2: Verify clean status view**

Run: `git status --short | head -30`
Expected: source dirs (`web/`, `vlm-service/`, `docs/`, `*.md`) listed; NO `node_modules`, `.next`, `.venv`.

- [ ] **Step 3: CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
jobs:
  web:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: web } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: web/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run test -- --run
```

- [ ] **Step 4: Initial commit**

```bash
git add -A && git commit -m "chore: init repo, gitignore, CI workflow"
```

- [ ] **Step 5: Create GitHub repo + push**

```bash
gh repo create asli-meesho --private --source . --push
```

Expected: repo URL printed; `git push` succeeds. (If `gh` unauthenticated: user runs `! gh auth login`.)

- [ ] **Step 6: Verify CI**

Run: `gh run watch --exit-status` (after a minute)
Expected: lint may pass trivially; `vitest run` FAILS (no tests yet) — acceptable: Task 2 adds vitest +
first test; re-check CI there. If lint script missing, note and fix in Task 2.

---

### Task 2: Dependencies, Tailwind tokens, cn(), motion variants, vitest

**Files:**
- Modify: `web/package.json`, `web/tailwind.config.ts` (or `.js` — match existing)
- Create: `web/lib/cn.ts`, `web/lib/motion.ts`, `web/vitest.config.ts`, `web/lib/__tests__/cn.test.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` · motion variants `fadeSlideUp`, `stepTransition`,
  `staggerChildren` · Tailwind color tokens listed in Global Constraints · `npm run test` script.

- [ ] **Step 1: Install declared deps**

```bash
cd web && npm i framer-motion lucide-react clsx tailwind-merge zod zustand@latest && npm i -D vitest
```

- [ ] **Step 2: Write failing cn test**

`web/lib/__tests__/cn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cn } from "../cn";

describe("cn", () => {
  it("merges tailwind conflicts, last wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});
```

`web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts", "app/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```

Add to `web/package.json` scripts: `"test": "vitest"`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npm run test -- --run`
Expected: FAIL — `Cannot find module '../cn'`.

- [ ] **Step 4: Implement cn**

`web/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names with Tailwind conflict resolution (last wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npm run test -- --run` — Expected: 2 passed.

- [ ] **Step 6: Tailwind tokens + motion variants**

Extend `web/tailwind.config.*` `theme.extend.colors` (keep existing `asli-*` if present, add the rest):

```ts
colors: {
  "meesho-pink": "#F43397",
  "meesho-deep": "#9F2089",
  "asli-violet": "#8B5CF6",
  "asli-pink": "#EC4899",
  "asli-amber": "#F59E0B",
  "asli-green": "#22C55E",
  "asli-red": "#EF4444",
},
```

`web/lib/motion.ts`:

```ts
// Shared Framer Motion variants — durations per CLAUDE.md §10.
import type { Variants } from "framer-motion";

export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

export const stepTransition: Variants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut" } },
  exit: { opacity: 0, x: -24, transition: { duration: 0.2, ease: "easeInOut" } },
};

export const staggerChildren: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
```

- [ ] **Step 7: Verify build still compiles**

Run: `cd web && npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: design tokens, cn helper, motion variants, vitest setup"
```

---

### Task 3: Domain types + Repo interface

**Files:**
- Create: `web/lib/db/types.ts`, `web/lib/db/repo.ts`

**Interfaces:**
- Produces (locked for ALL later phases — copy exactly):

```ts
// types.ts — every entity from CLAUDE.md §7
export type Role = "seller" | "buyer" | "admin";
export type ListingStatus = "draft" | "pending" | "live" | "blocked" | "escalated" | "rejected";
export type KycStatus = "pending" | "submitted" | "verified";
export type OrderStatus = "placed" | "shipped" | "delivered";
export type ImageKind = "catalog" | "live" | "flatlay" | "delivery" | "kyc";
export type PaymentMethod = "cod" | "upi_mock";
export type TrustBand = "high" | "medium" | "low";

export interface User { id: string; auth0Sub: string; email: string; name: string; role: Role; sellerId?: string; createdAt: string; }
export interface Seller { id: string; userId?: string; name: string; shopName: string; trustScore: number; trustBand: TrustBand; kycStatus: KycStatus; kycDocUrl?: string; isNew: boolean; passes: number; fails: number; createdAt: string; }
export interface Listing { id: string; sellerId: string; title: string; description: string; price: number; category: string; status: ListingStatus; flowStep: string; verified: boolean; sizeChart?: Record<string, number>; rankBoost: number; createdAt: string; }
export interface ProductImage { id: string; listingId: string; url: string; imageHash: string; embeddingId?: string; kind: ImageKind; }
export interface Challenge { code: string; listingId?: string; issuedAt: string; expiresAt: string; usedAt?: string; }
export interface AuthenticityCheck { id: string; listingId: string; agent: string; payload: Record<string, unknown>; confidence: number; action: string; requiredConfidence: number; reason: string; createdAt: string; }
export interface SizeMeasurement { id: string; listingId: string; chestCm: number; lengthCm: number; waistCm: number; referenceUsed: string; confidence: number; mappedSize: string; }
export interface Order { id: string; listingId: string; buyerUserId: string; address: Record<string, string>; paymentMethod: PaymentMethod; status: OrderStatus; placedAt: string; deliveredAt?: string; }
export interface PromiseRecord { id: string; listingId: string; orderId?: string; frozen: Record<string, unknown>; deliveryPhotoUrl?: string; kept?: boolean; confidence?: number; checkedAt?: string; }
export interface TrustEvent { id: string; sellerId: string; delta: number; reason: string; source: string; createdAt: string; }
export interface Review { id: string; listingId: string; status: "pending" | "approved" | "rejected"; reviewerNote?: string; reviewerUserId?: string; decidedAt?: string; }
export interface AuditEntry { id: number; listingId?: string; actor: string; event: string; data: Record<string, unknown>; createdAt: string; }
```

```ts
// repo.ts — the seam. Both impls must satisfy this exactly.
export interface Repo {
  // users
  getUserByAuth0Sub(sub: string): Promise<User | null>;
  createUser(u: Omit<User, "id" | "createdAt">): Promise<User>;
  setUserRole(id: string, role: Role, sellerId?: string): Promise<User>;
  listUsers(): Promise<User[]>;
  // sellers
  getSeller(id: string): Promise<Seller | null>;
  createSeller(s: Omit<Seller, "id" | "createdAt">): Promise<Seller>;
  updateSeller(id: string, patch: Partial<Seller>): Promise<Seller>;
  // listings
  createListing(l: Omit<Listing, "id" | "createdAt">): Promise<Listing>;
  getListing(id: string): Promise<Listing | null>;
  listListings(filter?: { verified?: boolean; sellerId?: string; status?: ListingStatus }): Promise<Listing[]>;
  updateListing(id: string, patch: Partial<Listing>): Promise<Listing>;
  // images
  addImage(i: Omit<ProductImage, "id">): Promise<ProductImage>;
  listImages(listingId: string): Promise<ProductImage[]>;
  // challenges (invariant #3)
  issueChallenge(code: string, ttlSeconds: number): Promise<Challenge>;
  /** Atomic single-use claim: null if unknown, expired, or already used. */
  claimChallenge(code: string, listingId: string): Promise<Challenge | null>;
  // checks + measurements
  addCheck(c: Omit<AuthenticityCheck, "id" | "createdAt">): Promise<AuthenticityCheck>;
  listChecks(listingId: string): Promise<AuthenticityCheck[]>;
  addMeasurement(m: Omit<SizeMeasurement, "id">): Promise<SizeMeasurement>;
  getMeasurement(listingId: string): Promise<SizeMeasurement | null>;
  // orders + promises
  createOrder(o: Omit<Order, "id" | "placedAt">): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  listOrdersByBuyer(buyerUserId: string): Promise<Order[]>;
  advanceOrder(id: string): Promise<Order>; // placed→shipped→delivered (idempotent at delivered)
  upsertPromise(p: Omit<PromiseRecord, "id">): Promise<PromiseRecord>;
  getPromiseByListing(listingId: string): Promise<PromiseRecord | null>;
  // trust + reviews + audit
  addTrustEvent(e: Omit<TrustEvent, "id" | "createdAt">): Promise<TrustEvent>;
  listTrustEvents(sellerId: string): Promise<TrustEvent[]>;
  createReview(r: Omit<Review, "id">): Promise<Review>;
  listPendingReviews(): Promise<Review[]>;
  decideReview(id: string, status: "approved" | "rejected", note: string, reviewerUserId: string): Promise<Review>;
  appendAudit(a: Omit<AuditEntry, "id" | "createdAt">): Promise<AuditEntry>;
  listAudit(listingId: string): Promise<AuditEntry[]>;
}
```

- [ ] **Step 1: Write both files exactly as above** (types.ts gets the full type block; repo.ts imports
      from `./types` and exports `interface Repo` — add the import line
      `import type { User, Role, Seller, Listing, ListingStatus, ProductImage, Challenge, AuthenticityCheck, SizeMeasurement, Order, PromiseRecord, TrustEvent, Review, AuditEntry } from "./types";`).

- [ ] **Step 2: Verify compile**

Run: `cd web && npx tsc --noEmit` — Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/lib/db && git commit -m "feat: domain types and Repo interface (dual-backend seam)"
```

---

### Task 4: InMemoryRepo (TDD on the risky bits)

**Files:**
- Create: `web/lib/db/inMemoryRepo.ts`, `web/lib/db/__tests__/inMemoryRepo.test.ts`

**Interfaces:**
- Consumes: `Repo`, types (Task 3).
- Produces: `class InMemoryRepo implements Repo` with `constructor(seed?: SeedData)`; export
  `function newId(): string` (crypto.randomUUID wrapper) reused by SupabaseRepo mappers.

- [ ] **Step 1: Write failing tests for the contract's sharp edges**

`web/lib/db/__tests__/inMemoryRepo.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryRepo } from "../inMemoryRepo";

describe("InMemoryRepo challenges (invariant #3)", () => {
  let repo: InMemoryRepo;
  beforeEach(() => { repo = new InMemoryRepo(); });

  it("claims a fresh code exactly once", async () => {
    await repo.issueChallenge("AX42", 300);
    const first = await repo.claimChallenge("AX42", "listing-1");
    const second = await repo.claimChallenge("AX42", "listing-2");
    expect(first?.listingId).toBe("listing-1");
    expect(second).toBeNull(); // single-use
  });

  it("rejects expired codes", async () => {
    vi.useFakeTimers();
    await repo.issueChallenge("OLD1", 300);
    vi.advanceTimersByTime(301_000);
    expect(await repo.claimChallenge("OLD1", "l")).toBeNull();
    vi.useRealTimers();
  });

  it("rejects unknown codes", async () => {
    expect(await repo.claimChallenge("NOPE", "l")).toBeNull();
  });
});

describe("InMemoryRepo orders", () => {
  it("advances placed→shipped→delivered and stops", async () => {
    const repo = new InMemoryRepo();
    const o = await repo.createOrder({
      listingId: "l1", buyerUserId: "u1", address: { city: "Pune" },
      paymentMethod: "cod", status: "placed",
    });
    expect((await repo.advanceOrder(o.id)).status).toBe("shipped");
    expect((await repo.advanceOrder(o.id)).status).toBe("delivered");
    const done = await repo.advanceOrder(o.id);
    expect(done.status).toBe("delivered"); // idempotent
    expect(done.deliveredAt).toBeTruthy();
  });
});

describe("InMemoryRepo listings feed", () => {
  it("filters by verified", async () => {
    const repo = new InMemoryRepo();
    const s = await repo.createSeller({ name: "A", shopName: "A", trustScore: 50, trustBand: "medium", kycStatus: "verified", isNew: false, passes: 0, fails: 0 });
    await repo.createListing({ sellerId: s.id, title: "t1", description: "", price: 100, category: "sarees", status: "live", flowStep: "live", verified: true, rankBoost: 1 });
    await repo.createListing({ sellerId: s.id, title: "t2", description: "", price: 100, category: "sarees", status: "live", flowStep: "live", verified: false, rankBoost: 0 });
    expect((await repo.listListings({ verified: true })).map(l => l.title)).toEqual(["t1"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npm run test -- --run` — Expected: FAIL `Cannot find module '../inMemoryRepo'`.

- [ ] **Step 3: Implement InMemoryRepo**

`web/lib/db/inMemoryRepo.ts` — full implementation. Core patterns (write the whole class; every method
is a Map operation following these examples):

```ts
import type { Repo } from "./repo";
import type { /* all types */ } from "./types";

export function newId(): string { return crypto.randomUUID(); }
const now = () => new Date().toISOString();

export class InMemoryRepo implements Repo {
  private users = new Map<string, User>();
  private sellers = new Map<string, Seller>();
  private listings = new Map<string, Listing>();
  private images = new Map<string, ProductImage>();
  private challenges = new Map<string, Challenge>();
  private checks = new Map<string, AuthenticityCheck>();
  private measurements = new Map<string, SizeMeasurement>();
  private orders = new Map<string, Order>();
  private promises = new Map<string, PromiseRecord>();
  private trustEvents = new Map<string, TrustEvent>();
  private reviews = new Map<string, Review>();
  private audit: AuditEntry[] = [];

  async issueChallenge(code: string, ttlSeconds: number): Promise<Challenge> {
    const c: Challenge = {
      code, issuedAt: now(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
    this.challenges.set(code, c);
    return c;
  }

  async claimChallenge(code: string, listingId: string): Promise<Challenge | null> {
    const c = this.challenges.get(code);
    if (!c || c.usedAt || Date.parse(c.expiresAt) <= Date.now()) return null;
    const claimed = { ...c, usedAt: now(), listingId };
    this.challenges.set(code, claimed);
    return claimed;
  }

  async advanceOrder(id: string): Promise<Order> {
    const o = this.orders.get(id);
    if (!o) throw new Error("order not found");
    const next: Order =
      o.status === "placed" ? { ...o, status: "shipped" }
      : o.status === "shipped" ? { ...o, status: "delivered", deliveredAt: now() }
      : o;
    this.orders.set(id, next);
    return next;
  }

  async listListings(filter?: { verified?: boolean; sellerId?: string; status?: ListingStatus }) {
    return [...this.listings.values()]
      .filter(l => filter?.verified === undefined || l.verified === filter.verified)
      .filter(l => !filter?.sellerId || l.sellerId === filter.sellerId)
      .filter(l => !filter?.status || l.status === filter.status)
      .sort((a, b) =>
        Number(b.verified) - Number(a.verified) || b.rankBoost - a.rankBoost ||
        b.createdAt.localeCompare(a.createdAt));
  }
  // …remaining methods: same create/get/list/update Map patterns, ids via newId(), createdAt via now().
  // appendAudit uses this.audit.push({ ...a, id: this.audit.length + 1, createdAt: now() }).
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npm run test -- --run` — Expected: all pass (cn + repo suites).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: InMemoryRepo with atomic single-use challenge claim"
```

---

### Task 5: Seed data + repo factory

**Files:**
- Create: `web/lib/db/seed.ts`, `web/lib/db/index.ts`, `web/lib/db/__tests__/seed.test.ts`

**Interfaces:**
- Produces: `seedRepo(repo: Repo): Promise<void>` (idempotent — keys off fixed seller names);
  `getRepo(): Repo` singleton factory reading `DATA_BACKEND` (`memory` default; `supabase` after Task 6).
  Fixed demo identities later tasks rely on: sellers `"Priya Sharma"` (trusted, trustScore 88, kyc
  verified, isNew false), `"Rohan Verma"` (average, 55), `"Fresh Finds"` (new, 40, isNew true,
  kyc pending); ≥16 listings across categories `sarees | kurtis | footwear | jewellery`; 2 pending
  reviews on escalated listings; 1 delivered + 1 placed order.

- [ ] **Step 1: Failing test**

`web/lib/db/__tests__/seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryRepo } from "../inMemoryRepo";
import { seedRepo } from "../seed";

describe("seedRepo", () => {
  it("populates every screen's data and is idempotent", async () => {
    const repo = new InMemoryRepo();
    await seedRepo(repo);
    await seedRepo(repo); // second run must not duplicate
    const listings = await repo.listListings();
    expect(listings.length).toBeGreaterThanOrEqual(16);
    expect(new Set(listings.map(l => l.category)).size).toBeGreaterThanOrEqual(4);
    expect((await repo.listPendingReviews()).length).toBe(2);
    expect(listings.some(l => l.verified)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — FAIL** (`seedRepo` missing).

- [ ] **Step 3: Implement seed.ts + index.ts**

`seed.ts`: create the 3 sellers (skip-if-exists by shop name via `listListings` guard — track with a
`seeded` marker listing title `__seed_marker__` status `draft`, checked at entry:
`if ((await repo.listListings()).some(l => l.title === "__seed_marker__")) return;`), then listings
(realistic titles/prices ₹199–₹899, image URLs under `/mock/`), 2 escalated listings + `createReview`
pending each, orders + a frozen promise for the delivered one.

`index.ts`:

```ts
import { InMemoryRepo } from "./inMemoryRepo";
import { seedRepo } from "./seed";
import type { Repo } from "./repo";

let repo: Repo | undefined;
let ready: Promise<void> | undefined;

/** Singleton Repo. Serverless-safe: module scope per instance, seeded once per instance. */
export function getRepo(): Repo {
  if (!repo) {
    // DATA_BACKEND=supabase branch added in Task 6.
    repo = new InMemoryRepo();
    ready = seedRepo(repo);
  }
  return repo;
}
export async function repoReady(): Promise<Repo> { getRepo(); await ready; return repo!; }
```

- [ ] **Step 4: Run tests — PASS.** `cd web && npm run test -- --run`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: demo seed data + repo factory"`

---

### Task 6: Supabase project, migration, SupabaseRepo

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `web/lib/db/supabaseRepo.ts`
- Modify: `web/lib/db/index.ts` (backend switch), `web/.env.local` (user supplies keys), `.env.example`

**Interfaces:**
- Consumes: `Repo` (Task 3), seed (Task 5 — runs against either backend).
- Produces: `class SupabaseRepo implements Repo`; `getRepo()` honors `DATA_BACKEND=supabase`.

- [ ] **Step 1: Provision Supabase project** (via Supabase MCP `create_project` or dashboard — org's
      free tier; region ap-south-1). Record `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` into
      `web/.env.local`; placeholders into `.env.example`.

- [ ] **Step 2: Migration SQL** — `supabase/migrations/0001_init.sql`: the exact schema from spec §6
      (all 12 tables, snake_case columns, `CHECK` constraints as written, FK indexes:
      `create index on listings (seller_id); create index on authenticity_checks (listing_id);`
      etc. for every FK), plus `alter table <each> enable row level security;` (no policies — service
      role only). Apply via MCP `apply_migration`.

- [ ] **Step 3: Verify schema** — MCP `list_tables` → expect the 12 tables.

- [ ] **Step 4: SupabaseRepo** — implements `Repo` with `@supabase/supabase-js` (`npm i @supabase/supabase-js`).
      camelCase↔snake_case mappers per entity (`toDb`/`fromDb`). The one non-CRUD method:

```ts
async claimChallenge(code: string, listingId: string): Promise<Challenge | null> {
  const { data, error } = await this.sb
    .from("challenges")
    .update({ used_at: new Date().toISOString(), listing_id: listingId })
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select()
    .maybeSingle();               // atomic conditional update → 0 rows = already used/expired
  if (error) throw error;
  return data ? challengeFromDb(data) : null;
}
```

`index.ts` switch:

```ts
repo = process.env.DATA_BACKEND === "supabase" ? new SupabaseRepo() : new InMemoryRepo();
```

- [ ] **Step 5: Contract test both backends** — extend `inMemoryRepo.test.ts` into
      `web/lib/db/__tests__/repoContract.test.ts`: wrap the existing describe blocks in
      `function repoContract(make: () => Repo)`; run `repoContract(() => new InMemoryRepo())` always,
      and `describe.skipIf(!process.env.SUPABASE_URL)("SupabaseRepo", ...)` locally.

Run: `cd web && npm run test -- --run` — Expected: InMemory suite passes; Supabase suite passes locally
with keys (CI skips it).

- [ ] **Step 6: Seed deployed DB** — add `web/package.json` script
      `"seed": "tsx lib/db/runSeed.ts"`? **No — tsx is an undeclared dep.** Instead:
      `"seed": "node --experimental-strip-types lib/db/runSeed.ts"` (Node 22+ built-in TS stripping;
      zero new deps). `runSeed.ts`: `import { repoReady } from "./index"; await repoReady();` with
      `DATA_BACKEND=supabase` env. Run once; verify via MCP `execute_sql`
      `select count(*) from listings;` → ≥ 16.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: Supabase migration + SupabaseRepo behind Repo seam"`

---

### Task 7: Validation schemas + error envelope

**Files:**
- Create: `web/lib/validation.ts`, `web/lib/api.ts`, `web/lib/__tests__/validation.test.ts`

**Interfaces:**
- Produces: zod schemas `roleSelectSchema`, `orderCreateSchema`, `reviewDecisionSchema`,
  `listingCreateSchema`, `kycSubmitSchema`; helpers
  `ok<T>(data: T): Response` · `fail(status: number, code: string, message: string): Response`
  (`fail` body: `{ error: { code, message } }`) · `parseOr400<T>(schema, body): T | Response`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { orderCreateSchema, roleSelectSchema } from "../validation";

describe("validation", () => {
  it("accepts a valid role", () => {
    expect(roleSelectSchema.parse({ role: "seller" }).role).toBe("seller");
  });
  it("rejects unknown role", () => {
    expect(() => roleSelectSchema.parse({ role: "root" })).toThrow();
  });
  it("rejects order without address city", () => {
    expect(orderCreateSchema.safeParse({
      listingId: "x", paymentMethod: "cod", address: {},
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

```ts
// validation.ts
import { z } from "zod";

export const roleSelectSchema = z.object({ role: z.enum(["seller", "buyer", "admin"]) });
export const listingCreateSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).default(""),
  price: z.number().int().min(1).max(100000),
  category: z.enum(["sarees", "kurtis", "footwear", "jewellery"]),
});
export const orderCreateSchema = z.object({
  listingId: z.string().min(1),
  paymentMethod: z.enum(["cod", "upi_mock"]),
  address: z.object({
    name: z.string().min(1), line1: z.string().min(1),
    city: z.string().min(1), pincode: z.string().regex(/^\d{6}$/),
  }),
});
export const reviewDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]), note: z.string().min(1).max(500),
});
export const kycSubmitSchema = z.object({ shopName: z.string().min(2).max(80) });
```

```ts
// api.ts
export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}
export function fail(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: zod validation schemas + API error envelope"`

---

### Task 8: Auth0 — app setup, SDK wiring, middleware RBAC

**Files:**
- Create: `web/lib/auth0.ts`, `web/lib/auth.ts`, `web/middleware.ts`
- Modify: `web/.env.local`, `.env.example`, `web/package.json`

**Interfaces:**
- Consumes: `getRepo()` (Task 5/6).
- Produces: `auth0` client export; `getSessionUser(): Promise<User | null>` (our DB user, auto-created
  as `role: "buyer"` placeholder on first sight, redirect target `/onboarding` until role confirmed —
  tracked via `user.role` plus a `roleConfirmed` convention: sellerId set OR role !== default);
  `requireRole(role: Role): Promise<User>` (throws `fail(403,…)`-compatible error object); middleware
  protecting `/sell`, `/admin`, `/checkout`, `/orders`, `/onboarding` (auth) and `/admin` (role).

- [ ] **Step 1: Manual/console setup (document in README as you go):** Auth0 free tenant → Regular Web
      App → enable **Google** social connection → Allowed Callback `http://localhost:3000/auth/callback`,
      Allowed Logout `http://localhost:3000`. Fill `web/.env.local`:

```
AUTH0_DOMAIN=<tenant>.us.auth0.com
AUTH0_CLIENT_ID=…
AUTH0_CLIENT_SECRET=…
AUTH0_SECRET=<openssl rand -hex 32>
APP_BASE_URL=http://localhost:3000
```

- [ ] **Step 2: Install + client**

```bash
cd web && npm i @auth0/nextjs-auth0
```

`web/lib/auth0.ts`:

```ts
import { Auth0Client } from "@auth0/nextjs-auth0/server";
// v4: middleware auto-mounts /auth/login, /auth/logout, /auth/callback, /auth/profile.
export const auth0 = new Auth0Client();
```

- [ ] **Step 3: Middleware with RBAC gate**

`web/middleware.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

const AUTHED = [/^\/sell/, /^\/admin/, /^\/checkout/, /^\/orders/, /^\/onboarding/];

export async function middleware(req: NextRequest) {
  const res = await auth0.middleware(req); // mounts /auth/*, refreshes session
  if (req.nextUrl.pathname.startsWith("/auth")) return res;

  if (AUTHED.some(r => r.test(req.nextUrl.pathname))) {
    const session = await auth0.getSession(req);
    if (!session) {
      const login = new URL("/auth/login", req.url);
      login.searchParams.set("returnTo", req.nextUrl.pathname);
      return NextResponse.redirect(login);
    }
    // NOTE: role check happens server-side in pages/routes via requireRole —
    // middleware can't hit the DB cheaply on every request (edge runtime).
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mock|proof).*)"],
};
```

- [ ] **Step 4: Session→DB bridge + role guard**

`web/lib/auth.ts`:

```ts
import { auth0 } from "./auth0";
import { repoReady } from "./db";
import type { Role, User } from "./db/types";

/** Our DB user for the current Auth0 session; auto-provisioned on first login. */
export async function getSessionUser(): Promise<User | null> {
  const session = await auth0.getSession();
  if (!session) return null;
  const repo = await repoReady();
  const sub = session.user.sub!;
  const existing = await repo.getUserByAuth0Sub(sub);
  if (existing) return existing;
  return repo.createUser({
    auth0Sub: sub,
    email: session.user.email ?? "",
    name: session.user.name ?? "Guest",
    role: "buyer", // provisional until /onboarding confirms
  });
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Per-route RBAC re-check (defense in depth — middleware only checks authentication). */
export async function requireRole(role: Role): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "unauthenticated", "Sign in required.");
  if (user.role !== role) throw new HttpError(403, "forbidden", `Requires ${role} role.`);
  return user;
}
```

- [ ] **Step 5: Verify** — `cd web && npx tsc --noEmit` clean; `npm run dev`, open
      `http://localhost:3000/auth/login` → Google login round-trips → `/auth/profile` returns JSON.

- [ ] **Step 6: Commit** — `git commit -am "feat: Auth0 v4 Google auth, session-to-DB bridge, RBAC guard"`

---

### Task 9: Role selection + users API + onboarding page

**Files:**
- Create: `web/app/api/users/role/route.ts`, `web/app/api/users/me/route.ts`,
  `web/app/onboarding/page.tsx`, `web/app/api/users/__tests__/role.test.ts`

**Interfaces:**
- Consumes: `requireRole`/`getSessionUser` (Task 8), `roleSelectSchema` (Task 7), Repo.
- Produces: `POST /api/users/role { role } → { user }` (creates seller record when role=seller,
  `kycStatus:"pending"`, `isNew:true`); `GET /api/users/me → { role, name, sellerId?, kycStatus? }`.
  `/onboarding` page: 3 role cards (Seller/Buyer/Admin) + demo-provision disclaimer copy exactly:
  *"Demo provision: in production, Admin is invite-only and Seller requires KYC."* → on select POST →
  redirect seller→/onboarding KYC section (Phase 4 fills it; Phase 1 stubs to /sell), buyer→/shop,
  admin→/admin.

- [ ] **Step 1: Failing route test** (route handlers are plain functions — test directly with a mocked
      session):

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, getSessionUser: vi.fn(async () => ({
    id: "u1", auth0Sub: "s", email: "e@x.com", name: "E", role: "buyer", createdAt: "",
  })) };
});

import { POST } from "@/app/api/users/role/route";

describe("POST /api/users/role", () => {
  it("sets seller role and creates a seller record", async () => {
    const res = await POST(new Request("http://x/api/users/role", {
      method: "POST", body: JSON.stringify({ role: "seller" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.role).toBe("seller");
    expect(body.user.sellerId).toBeTruthy();
  });
  it("400s on bad role", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ role: "root" }) }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — FAIL.** (Also add `environment: "node"` alias works — already configured Task 2.)

- [ ] **Step 3: Implement route**

```ts
// app/api/users/role/route.ts
import { getSessionUser, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { roleSelectSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail(401, "unauthenticated", "Sign in required.");
    const parsed = roleSelectSchema.safeParse(await req.json());
    if (!parsed.success) return fail(400, "invalid_role", "Role must be seller, buyer or admin.");
    const repo = await repoReady();
    let sellerId = user.sellerId;
    if (parsed.data.role === "seller" && !sellerId) {
      const seller = await repo.createSeller({
        userId: user.id, name: user.name, shopName: `${user.name}'s Shop`,
        trustScore: 40, trustBand: "low", kycStatus: "pending",
        isNew: true, passes: 0, fails: 0,
      });
      sellerId = seller.id;
    }
    const updated = await repo.setUserRole(user.id, parsed.data.role, sellerId);
    await repo.appendAudit({ actor: user.id, event: "role_selected", data: { role: parsed.data.role } });
    return ok({ user: updated });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
```

`me/route.ts`: GET → `getSessionUser()` → 401 or `{ role, name, sellerId, kycStatus }` (kycStatus via
`repo.getSeller(sellerId)` when present). `onboarding/page.tsx`: client component, 3 `<Card>` role
tiles using Task 10 primitives, `fadeSlideUp` motion, POST + `router.push`.

- [ ] **Step 4: Run — PASS.** Manual: dev server → login → /onboarding → pick Seller → lands /sell.
- [ ] **Step 5: Commit** — `git commit -am "feat: role selection onboarding + users API"`

---

### Task 10: UI primitives (batch 1 — used by every later phase)

**Files:**
- Create under `web/components/ui/`: `Button.tsx`, `Card.tsx`, `Badge.tsx`, `VerifiedBadge.tsx`,
  `Skeleton.tsx`, `EmptyState.tsx`, `Toast.tsx` (+ `ToastProvider`), `Modal.tsx`
- Modify: `web/app/layout.tsx` (mount ToastProvider), `web/app/globals.css` (extend `.card/.btn` layer
  to component-level parity — keep existing classes working)

**Interfaces (props locked — later phases import these exactly):**

```tsx
Button:  { variant?: "primary"|"ghost"|"danger"; loading?: boolean } & ComponentProps<"button">
Card:    { className?: string; children: ReactNode; as?: "div"|"section" }
Badge:   { variant: "verified"|"trigger"|"blocked"|"progress"|"neutral"; children: ReactNode }
VerifiedBadge: { size?: "sm"|"md" }        // green shield-check, "✓ Asli Verified"
Skeleton:{ className?: string }            // shimmer block, matches final layout
EmptyState: { icon: LucideIcon; title: string; hint?: string; action?: ReactNode }
Modal:   { open: boolean; onClose: () => void; title: string; children: ReactNode }
useToast(): { toast: (t: { kind: "success"|"error"; message: string }) => void }
```

- [ ] **Step 1: Implement all eight** — each ~20–40 lines: `cn()` for classes, semantic colors
      (Badge variant→ `asli-green/asli-amber/asli-red/asli-violet/white-10`), Button press-scale
      `active:scale-[0.97]`, focus rings `focus-visible:ring-2 ring-asli-violet`, ≥44 px tap targets,
      Modal with `AnimatePresence` + `role="dialog"` + Escape/backdrop close, Toast auto-dismiss 4 s
      rendered via portal, `motion.div` entrances gated by `useReducedMotion()` from framer-motion.
      Example — `Badge.tsx` in full (pattern for the rest):

```tsx
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

const styles = {
  verified: "bg-asli-green/15 text-asli-green ring-asli-green/30",
  trigger: "bg-asli-amber/15 text-asli-amber ring-asli-amber/30",
  blocked: "bg-asli-red/15 text-asli-red ring-asli-red/30",
  progress: "bg-asli-violet/15 text-asli-violet ring-asli-violet/30",
  neutral: "bg-white/5 text-white/60 ring-white/10",
} as const;

export function Badge({ variant, children, className }: {
  variant: keyof typeof styles; children: ReactNode; className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1", styles[variant], className)}>
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; temporary showcase check: render a few primitives
      on the landing page locally, view at 390 px, then remove the scratch usage.
- [ ] **Step 3: Commit** — `git commit -am "feat: ui primitives batch 1 (Button, Card, Badge, VerifiedBadge, Skeleton, EmptyState, Toast, Modal)"`

---

### Task 11: UI primitives (batch 2 — flow & data components)

**Files:**
- Create under `web/components/ui/`: `Stepper.tsx`, `ConfidenceBar.tsx`, `AgentReasonRow.tsx`,
  `StatTile.tsx`, `StreamingChecklist.tsx`, `PersonaSwitcher.tsx`, `LanguageToggle.tsx`

**Interfaces (locked):**

```tsx
Stepper:            { steps: { id: string; label: string }[]; currentId: string; doneIds: string[] }
ConfidenceBar:      { value: number; bar?: number }        // 0..1; animated spring fill; color by value vs bar
AgentReasonRow:     { icon: LucideIcon; label: string; confidence?: number; passed?: boolean; note?: string }
StatTile:           { label: string; value: number; suffix?: string; countUp?: boolean }
StreamingChecklist: { items: { id: string; label: string; state: "pending"|"active"|"done"|"failed" }[] }
PersonaSwitcher:    { current: Role; onSwitch: (r: Role) => void }   // labelled "demo" pill
LanguageToggle:     { locale: "en"|"hi"; onToggle: () => void }      // "EN | हि"
```

- [ ] **Step 1: Implement all seven.** Stepper: animated active pill (framer `layoutId="step-pill"`),
      connectors fill `asli-green` for done. ConfidenceBar: `motion.div` width spring from 0, color
      `value >= (bar ?? 0.7) ? asli-green : asli-amber`, optional bar marker line. StatTile count-up:
      `useEffect` + `requestAnimationFrame` 800 ms ease-out (respect reduced motion → instant).
      StreamingChecklist: pending=shimmer row, active=pulsing violet dot, done=green check scale-in,
      failed=red x + shake once.
- [ ] **Step 2: Verify** — `npx tsc --noEmit`; scratch-render at 390 px; remove scratch.
- [ ] **Step 3: Commit** — `git commit -am "feat: ui primitives batch 2 (Stepper, ConfidenceBar, StreamingChecklist, StatTile, …)"`

---

### Task 12: i18n provider + locale slice + AppShell header

**Files:**
- Create: `web/lib/i18n/index.tsx`, `web/lib/i18n/en.ts`, `web/lib/i18n/hi.ts`,
  `web/lib/__tests__/i18n.test.ts`, `web/components/AppShell.tsx`
- Modify: `web/app/layout.tsx`, `web/lib/store.ts` (add `locale` + `session` slices)

**Interfaces:**
- Produces: `I18nProvider`, `useT(): (key: keyof typeof en) => string` — hi missing key ⇒ en fallback;
  `en.ts` starts with header/auth/onboarding keys (`app.tagline`, `nav.signin`, `nav.signout`,
  `onboarding.title`, `onboarding.seller`, …); AppShell header = wordmark `असली Asli` +
  `LanguageToggle` + `PersonaSwitcher` (visible when authed) + user menu (name, `/auth/logout`).

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { translate } from "../i18n";

describe("i18n", () => {
  it("returns hindi when present", () => {
    expect(translate("hi", "nav.signin")).toBe("साइन इन");
  });
  it("falls back to english for missing hindi keys", () => {
    expect(translate("hi", "app.tagline")).toBe(translate("en", "app.tagline"));
  });
});
```

(`translate(locale, key)` is the pure core; `useT` wraps it with the store's locale.)

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — `en.ts` full record; `hi.ts` `Partial<typeof en>` with `"nav.signin": "साइन इन"`
      seeded; `translate` = `hi[key] ?? en[key]`. Store slices: `locale` persisted to localStorage
      (`zustand/middleware` persist — part of zustand, no new dep); `session` hydrated from
      `/api/users/me` on mount.
- [ ] **Step 4: Run — PASS.** Header renders on all pages; toggle flips a visible string.
- [ ] **Step 5: Commit** — `git commit -am "feat: i18n provider (EN/HI), locale+session store, AppShell header"`

---

### Task 13: Landing + login pages, Vercel deploy, phase gate

**Files:**
- Create: `web/app/login/page.tsx`
- Modify: `web/app/page.tsx` (CTA → login/role-aware), `.env.example` (complete final list from
  CLAUDE.md §5C + Auth0 v4 names)

**Interfaces:**
- Produces: `/login` — Card with "Sign in with Google" `Button` → `/auth/login?returnTo=/onboarding`,
  privacy note ("Only your Google name/email are used; demo data is fictional."); landing CTA:
  signed-out → /login, signed-in → role home (`seller→/sell, buyer→/shop, admin→/admin`).

- [ ] **Step 1: Implement pages** (reuse primitives; `fadeSlideUp`; landing keeps existing pitch copy +
      three feature cards, adds persona-value row per CLAUDE.md §2).
- [ ] **Step 2: Full local check** — `npm run dev`: signed-out landing → login → Google → onboarding →
      each role's home redirect works; 390 px pass; `npm run test -- --run` green; `npx tsc --noEmit` clean.
- [ ] **Step 3: Vercel link + deploy preview**

```bash
cd web && npx vercel link && npx vercel env add AUTH0_DOMAIN … (all envs) && npx vercel
```

Set `DATA_BACKEND=supabase`, `VLM_PROVIDER=mock` (until Phase 5), Auth0 prod callback
`https://<preview-domain>/auth/callback` added in Auth0 console.
Expected: preview URL serves landing; Google login round-trips on the deployed domain.

- [ ] **Step 4: Push + CI green**

```bash
git add -A && git commit -m "feat: landing + login pages, Vercel deployment" && git push
gh run watch --exit-status
```

Expected: CI green (lint, tsc, vitest all pass).

- [ ] **Step 5: PHASE GATE** — demo to user: deployed URL, Google sign-in, role select, role-gated
      redirects, seeded Supabase data visible via a temporary `/api/listings` curl. User approves →
      write Phase 2 detailed plan.

---

## Self-review notes

- Spec coverage: Phase 1 scope of spec §19 Day 1 fully tasked (git/CI/Vercel/Supabase/Auth0/roles/
  tokens/primitives/dual repo/i18n scaffold). Login page + landing included (spec §8). Seed fixtures
  match spec §6 counts.
- Deviation logged: Auth0 v4 mounts `/auth/*` (spec table said v3-style `/api/auth/[auth0]`) — v4 is
  correct; spec note added in Task commit message. `next-intl`/`tsx`/`@testing-library` deliberately
  NOT used (declared-stack rule); Node 22 type-stripping used for the seed runner.
- Type consistency: `Repo` methods referenced by Tasks 5–9 all exist in Task 3's interface;
  `PromiseRecord` (not `Promise`) avoids the global name clash.

---

## Phase 2 — Seller flow (the showpiece)

Task renumbering vs the old inventory: old 2.6+2.7 and old 3.6 (promise freeze) merge into Task 2.6;
old 2.8 becomes 2.7.

### Task 2.1: Listing draft API + flow entry

**Files:**
- Create: `web/app/api/listings/route.ts`, `web/app/api/listings/[id]/route.ts`
- Modify: `web/app/sell/page.tsx`, `web/lib/store.ts`
- Test: `web/app/api/__tests__/listings.test.ts`

**Interfaces:**
- Consumes: `requireRole` (Task 8), `repoReady` (Task 5), `listingCreateSchema` (Task 7).
- Produces: `POST /api/listings` (body `listingCreateSchema`) → `{ listingId, flowStep: "upload" }`
  [seller]; `GET /api/listings/:id` → `{ listing, images, checks, measurement, trustScore }`;
  store gains `listingId?: string` set on flow entry.

- [ ] **Step 1: Write failing route test** — mock `getSessionUser` as a seller (pattern from Task 9
  Step 1): POST valid body → 200 + `listingId`; POST `{ title: "x" }` → 400 envelope; buyer role → 403.
- [ ] **Step 2: Run — FAIL** (`route.ts` missing). `cd web && npm run test -- --run`
- [ ] **Step 3: Implement** — `requireRole("seller")` → `repo.createListing({ sellerId:
  user.sellerId!, status: "draft", flowStep: "upload", verified: false, rankBoost: 0, ...parsed })` →
  `repo.appendAudit({ listingId, actor: user.id, event: "listing_created", data: {} })`. GET
  assembles bundle via `getListing/listImages/listChecks/getMeasurement` + seller trustScore; 404
  envelope when missing. Sell page creates the draft on first upload and stores `listingId`.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat: listing draft API + flow entry`

### Task 2.2: TriggerSource seam + upgraded reverse-image route

**Files:**
- Create: `web/lib/trigger.ts`, `web/lib/__tests__/trigger.test.ts`
- Modify: `web/app/api/reverse-image/route.ts`, `web/lib/reverseImage.ts`,
  `web/components/flow/TriggerStep.tsx`

**Interfaces (locked):**

```ts
export interface TriggerResult {
  triggered: boolean; matchCount: number;
  platforms: { name: string; category: "marketplace" | "web"; count: number; url: string }[];
  source: "serpapi" | "qdrant" | "mock";
}
export async function getTrigger(imageHash: string, bytes: Buffer): Promise<TriggerResult>;
```

- [ ] **Step 1: Failing unit tests** — `TRIGGER_SOURCE=mock` ⇒ `source:"mock"`, `triggered:true`;
  `TRIGGER_SOURCE=serpapi` with no `SERPAPI_KEY` ⇒ falls through to mock (invariant: mock only as
  keyless fallback, never default logic); unknown source value ⇒ mock + console warn.
- [ ] **Step 2: Implement** — switch on `process.env.TRIGGER_SOURCE`; `serpapi` branch = existing
  `reverseImage.ts` (keep hash cache); `qdrant` branch: POST `${VLM_SERVICE_URL}/vlm/similar` —
  until Task 5.7 lands this branch throws `TriggerUnavailable`, caught → fallthrough to mock with
  `source:"mock"`. Route persists `repo.addImage({ listingId, url, imageHash, kind: "catalog" })` +
  audit. TriggerStep UI keeps TRIGGER-not-verdict copy; `source` chip shows `demo / mock` only when
  source=mock.
- [ ] **Step 3: Run — PASS. Commit** `feat: TriggerSource seam behind reverse-image trigger`

### Task 2.3: Challenge issue/verify against Repo (single-use end-to-end)

**Files:**
- Modify: `web/app/api/challenge/route.ts`, `web/lib/challenge.ts`
- Test: `web/app/api/__tests__/challenge.test.ts`

**Interfaces:**
- Consumes: `repo.issueChallenge/claimChallenge` (Task 3 contract), VLM call via existing
  `vlmClient.ts` (Task 5.5 swaps the import to the provider seam — same JSON, route unchanged).
- Produces: `GET /api/challenge` → `{ code, issuedAt, expiresAt }` — code = 4 chars from A–Z2–9
  (no 0/O/1/I) via `crypto.getRandomValues`, TTL `CHALLENGE_TTL_SECONDS`. `POST /api/challenge`
  multipart `catalog, live, code, listingId`: **claim first** — `claimChallenge` null ⇒
  `fail(409, "code_used_or_expired", …)`; then VLM match; then `repo.addCheck({ agent: "possession",
  payload: { ...matchResult, matchCount }, … })` + audit. Rate limit: >5 issues per seller per 60 s ⇒
  `fail(429, "rate_limited", …)`.

- [ ] **Step 1: Failing route tests** (VLM mocked via `vi.mock`): verify-once (second verify same code
  → 409); expired code → 409; 6th issue in a minute → 429.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run — PASS. Commit** `feat: single-use time-bound challenge, repo-backed`

### Task 2.4: CameraCapture overlay + streaming verify UX

**Files:**
- Modify: `web/components/CameraCapture.tsx`, `web/components/flow/ChallengeStep.tsx`

**Interfaces:**
- Consumes: `StreamingChecklist` (Task 11). CameraCapture stays camera-only (invariant #2):
  `getUserMedia` primary, `<input type="file" accept="image/*" capture="environment">` fallback.
  KEEP the existing `code` prop — demo fixtures draw the live code client-side on a canvas slip;
  a static baked code would fail `code_visible` (known gotcha).

- [ ] **Step 1: Implement** — framing overlay (product reticle + slip zone, SVG), soft scan-line
  while capturing, shutter flash. During verify, StreamingChecklist items
  `[checking product, reading code, scoring live]`: submit ⇒ item 1 `active`; on response, map
  `same_item`→1, `code_visible`→2, `passed`→3 to `done|failed` with 300 ms stagger (perceived
  streaming — real SSE is YAGNI at this latency).
- [ ] **Step 2: Manual check honest + thief fixture paths vs local Ollama at 390 px.**
- [ ] **Step 3: Commit** `feat: camera framing overlay + streaming verify checklist`

### Task 2.5: Orchestrator front door — /api/asli/analyze drives the flow

**Files:**
- Create: `web/app/api/asli/analyze/route.ts`
- Modify: `web/lib/orchestrator.ts` (add `stepForAction`, keep `decide()` signature), `web/lib/store.ts`
  (`applyDecision`), `web/app/sell/page.tsx` (render step from `nextStep` only — kill linear march)
- Test: `web/lib/orchestrator.test.ts`, `web/app/api/__tests__/analyze.test.ts`

**Interfaces (locked):**

```ts
export interface AnalyzeResponse {
  action: OrchestratorAction; requiredConfidence: number; reason: string;
  trustScore: number; nextStep: FlowStep; agentResults: Record<string, unknown>;
}
export function stepForAction(a: OrchestratorAction): FlowStep;
// AUTO_APPROVE → "sizing" (or "review" if measurement exists) · RE_CHALLENGE → "challenge"
// ESCALATE_HUMAN → "review" (locked banner) · BLOCK → "review" (blocked card)
```

- [ ] **Step 1: decide() matrix test (documents current behavior — fix impl only if red):**

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

- [ ] **Step 2: Implement analyze route** (full logic):

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
    const possession = checks.filter(c => c.agent === "possession");
    const last = possession.at(-1);
    const signals: AgentSignals = {
      reverseImageMatches: Number(last?.payload["matchCount"] ?? 0),
      sameItem: Boolean(last?.payload["same_item"]),
      codeVisible: Boolean(last?.payload["code_visible"]),
      matchConfidence: last?.confidence ?? 0,
      sellerIsNew: seller.isNew,
      attempt: Math.max(0, possession.length - 1),
    };
    const decision = decide(signals);
    await repo.addCheck({ listingId, agent: "orchestrator",
      payload: { signals } as Record<string, unknown>,
      confidence: signals.matchConfidence, action: decision.action,
      requiredConfidence: decision.requiredConfidence, reason: decision.reason });
    await repo.appendAudit({ listingId, actor: "orchestrator", event: decision.action,
      data: { bar: decision.requiredConfidence, reason: decision.reason } });
    if (decision.action === "ESCALATE_HUMAN") await repo.createReview({ listingId, status: "pending" });
    if (decision.action === "BLOCK") await repo.updateListing(listingId, { status: "blocked" });
    const measurement = await repo.getMeasurement(listingId);
    const nextStep = decision.action === "AUTO_APPROVE" && !measurement ? "sizing"
      : stepForAction(decision.action);
    return ok<AnalyzeResponse>({ ...decision, trustScore: seller.trustScore, nextStep,
      agentResults: { possession: last?.payload ?? null } });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    if (e instanceof z.ZodError) return fail(400, "invalid_body", e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
```

- [ ] **Step 3: Route test** (mocked session + seeded repo): thief payload ⇒ BLOCK + listing.status
  blocked; close-miss ⇒ RE_CHALLENGE + `nextStep:"challenge"`; repeat past MAX_ATTEMPTS ⇒ review row
  created. Store `applyDecision` sets step + shows re-challenge banner with the new bar.
- [ ] **Step 4: Run — PASS. Commit** `feat: orchestrator front door /api/asli/analyze drives flow`

### Task 2.6: Sizing persistence + decision review + go-live with promise freeze

**Files:**
- Modify: `web/app/api/sizing/route.ts`, `web/components/flow/{SizingStep,ReviewStep,ResultStep}.tsx`

**Interfaces:**
- Produces: sizing route persists `repo.addMeasurement` + audit. ReviewStep = DecisionPanel:
  `AgentReasonRow` per check, `ConfidenceBar value vs bar`, action per verdict. Go-live:
  `updateListing({ status: "live", verified: true, flowStep: "live" })` + **promise freeze**
  `repo.upsertPromise({ listingId, frozen: { title, price, category, sizeChart, imageUrl } })` +
  audit + confetti (~40 canvas particles; `prefers-reduced-motion` ⇒ static ✓). SizingStep gains
  inline `SizeChartEditor`: AI values prefilled ±-nudgeable, Badge "Measured, not guessed".

- [ ] **Step 1: Implement sizing persistence + editor.**
- [ ] **Step 2: Implement ReviewStep/ResultStep + freeze + confetti.**
- [ ] **Step 3: Manual full honest + thief paths vs local Ollama. Commit**
  `feat: sizing persistence, decision review, go-live with promise freeze`

### Task 2.7: Voice guide + bilingual seller flow

**Files:**
- Modify: `web/lib/voice.ts`, all `web/components/flow/*`, `web/lib/i18n/{en,hi}.ts`
- Test: `web/lib/__tests__/i18nCoverage.test.ts`

- [ ] **Step 1:** `voice.ts`: `speak(text: string, locale: "en"|"hi")` via `speechSynthesis`
  (`lang: "hi-IN"|"en-IN"`, cancel-before-speak, no-op when unsupported or
  `NEXT_PUBLIC_ENABLE_VOICE !== "true"`); mute toggle in AppShell (store `ui.voiceOn`).
- [ ] **Step 2:** Every flow step announces its i18n'd instruction on mount; all seller-flow strings →
  `t()` keys; `hi.ts` filled for the whole seller flow.
- [ ] **Step 3: Key-coverage test** — every `t()` key referenced in `components/flow` exists in `en`
  (regex-scan the files in the test). **Run — PASS. Commit** `feat: voice-guided, bilingual seller flow`

**PHASE GATE 2:** honest seller → LIVE with frozen promise; thief → BLOCKED; re-challenge shows a
stricter bar; voice + Hindi work. Demo to user before Phase 3.

---

## Phase 3 — Buyer commerce

Old 3.1+3.2 merged into Task 3.1; old 3.6 moved into Task 2.6; old 3.3→3.2, 3.4→3.3, 3.5→3.4.

### Task 3.1: Verified-first feed + shop grid

**Files:**
- Modify: `web/app/api/listings/route.ts` (add GET)
- Create: `web/app/shop/page.tsx`, `web/components/buyer/ProductCard.tsx`
- Test: `web/app/api/__tests__/feed.test.ts`

**Interfaces:**
- Produces: `GET /api/listings?filter=verified|all` → live listings only, ordered
  `verified DESC, rankBoost DESC, createdAt DESC` (C-layer sort — PRISM-style boost, simulated).

- [ ] **Step 1: Failing feed test** — seeded repo: verified first; drafts/blocked excluded; filter
  works.
- [ ] **Step 2: Implement route + grid** — server component; buyer light skin (`buyer-surface`
  wrapper: `bg-white text-zinc-900`, meesho-pink accents); 2-col grid @390 px, 4-col desktop;
  ProductCard = image, title, ₹price, seeded rating, `<VerifiedBadge size="sm">`; Skeleton grid
  fallback via `<Suspense>`.
- [ ] **Step 3: Run — PASS; 390 px check. Commit**
  `feat: buyer shop grid with verified-first ranking (simulated PRISM boost)`

### Task 3.2: Product detail + explainable trust panel

**Files:**
- Create: `web/app/shop/[id]/page.tsx`,
  `web/components/buyer/{TrustPanel,SizeChartTable,BuyBox}.tsx`

**Interfaces:**
- Consumes: `GET /api/listings/:id` bundle (Task 2.1).
- Produces: TrustPanel (expandable "Why you can trust this"): AgentReasonRow per check — possession %,
  size measured, seller trust band, "Promise Keeper armed" row; simulated data tagged `simulated`.
  SizeChartTable: cm values + mapped size + "Measured, not guessed" Badge. BuyBox →
  `/checkout?listing=:id`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Manual verified + unverified seeded listings. Commit**
  `feat: product detail with explainable trust panel`

### Task 3.3: Orders API + mock checkout

**Files:**
- Create: `web/app/api/orders/route.ts`, `web/app/api/orders/[id]/route.ts`,
  `web/app/api/orders/[id]/advance/route.ts`, `web/app/checkout/page.tsx`
- Test: `web/app/api/__tests__/orders.test.ts`

**Interfaces:**
- Produces: `POST /api/orders` (body `orderCreateSchema`) [buyer] → `{ orderId }` (+ audit; links
  the listing's promise: `upsertPromise({ ...existing, orderId })`). `GET /api/orders/:id` [buyer,
  own orders only — others 404]. `POST /api/orders/:id/advance` [buyer] — demo fast-forward,
  labelled `simulated`.

- [ ] **Step 1: Failing route tests** — create valid/invalid; ownership (other buyer → 404); advance
  placed→shipped→delivered idempotent.
- [ ] **Step 2: Implement routes + checkout page** — address form (zod client-side too), payment radio
  COD / UPI-mock with `simulated` Badge, success screen → `/orders/:id`.
- [ ] **Step 3: Run — PASS. Commit** `feat: mock checkout and order lifecycle (labelled simulated)`

### Task 3.4: Tracking timeline + Promise Keeper card

**Files:**
- Create: `web/app/orders/[id]/page.tsx`,
  `web/components/buyer/{TrackingTimeline,PromiseKeeperCard}.tsx`,
  `web/app/api/agents/promise-keeper/check/route.ts`

**Interfaces:**
- Produces: `POST /api/agents/promise-keeper/check { orderId }` → `PromiseVerdict`
  `{ promiseKept: boolean; confidence: number; mismatches: string[]; reason: string }` (engine lands
  in Task 5.3 — until then route returns `fail(503, "engine_pending", "Promise engine not yet
  enabled.")` and the card shows graceful error + retry; UI built against the locked contract).
  Verdict persists to `promises` + `addTrustEvent(sellerId, kept ? +2 : -5, reason, "promise_keeper")`.

- [ ] **Step 1: Implement** — TrackingTimeline: 3 animated nodes + "Fast-forward (demo)" ghost Button
  → advance route; PromiseKeeperCard at `delivered`: frozen summary vs seeded delivery photo, CTA
  "Check promise" → verdict reveal (green tick / amber mismatch list); logistics events tagged
  `simulated`.
- [ ] **Step 2: Manual seeded order run (503 path shows retry UI, no white screen). Commit**
  `feat: order tracking + Promise Keeper card`

**PHASE GATE 3:** buyer journey browse → buy → delivered → promise card. Demo to user.

---

## Phase 4 — Admin + KYC

### Task 4.1: Metrics API + dashboard

**Files:**
- Create: `web/app/api/admin/metrics/route.ts`, `web/app/admin/page.tsx`, `web/app/admin/layout.tsx`
- Test: `web/app/api/__tests__/metrics.test.ts`

**Interfaces:**
- Produces: `GET /api/admin/metrics` [admin] → `{ verified, blocked, avgTrust, escalationRate,
  returnsPrevented }`: verified = live∧verified count; blocked = blocked count; avgTrust = mean
  seller trustScore; escalationRate = pendingReviews / max(1, orchestrator check count);
  returnsPrevented = `Math.round(verified * 0.5)` — midpoint of the 40–60% sizing-returns stat [S9],
  UI footnote cites it, tile tagged `estimated`.

- [ ] **Step 1: Failing metrics test on seeded repo (exact numbers).**
- [ ] **Step 2: Implement** — admin layout: role gate + tabs (Dashboard/Queue/Sellers/Users), dark
  Asli skin; dashboard: 5 `StatTile` (countUp) + AgentMonitor slot (filled 4.5) + Suraksha-complement
  note.
- [ ] **Step 3: Run — PASS. Commit** `feat: admin dashboard with live metrics`

### Task 4.2: Review queue + decision → trust feedback

**Files:**
- Create: `web/app/api/review/queue/route.ts`, `web/app/api/review/[id]/decision/route.ts`,
  `web/app/admin/queue/page.tsx`, `web/components/admin/ReviewDetailDrawer.tsx`,
  `web/lib/engines/trust.ts`
- Test: `web/app/api/__tests__/review.test.ts`

**Interfaces:**
- Produces: `GET /api/review/queue` [admin] → `{ review, listing, seller, checks, images }[]`.
  `POST /api/review/:id/decision` (body `reviewDecisionSchema`) [admin]: approve ⇒
  `updateListing(status:"live", verified:true)` + trust event +5 `review_approved` + seller
  `passes+1`; reject ⇒ `status:"rejected"` + trust event −10 `review_rejected` + `fails+1`; second
  decision on decided review ⇒ 409. Trust recompute NOW via
  `applyTrustDelta(seller, delta): { trustScore, trustBand }` in `lib/engines/trust.ts`
  (`clamp(score+delta, 0, 100)`, bands 70/45) — Task 5.1 swaps its internals to `scoreSeller`,
  signature unchanged. No TODO stubs.

- [ ] **Step 1: Failing route tests** — queue returns seeded 2; approve flips listing + writes event;
  double-decide → 409; non-admin → 403.
- [ ] **Step 2: Implement API + queue UI** — list → drawer: catalog/live images side-by-side,
  AgentReasonRow per check, required bar, approve/reject + required note, optimistic update + toast.
- [ ] **Step 3: Run — PASS. Commit** `feat: human-in-the-loop review queue feeding seller trust`

### Task 4.3: Seller 360

**Files:**
- Create: `web/app/admin/sellers/[id]/page.tsx`, `web/components/admin/TrustSparkline.tsx`

- [ ] **Step 1: Implement** — header (band Badge, KYC status), TrustSparkline = plain SVG polyline
  over `listTrustEvents` cumulative scores (no chart lib — declared-stack), events feed, listings
  table with statuses.
- [ ] **Step 2: Manual: approve in 4.2 → sparkline moves. Commit**
  `feat: seller 360 with live trust history`

### Task 4.4: Role management

**Files:**
- Create: `web/app/api/admin/users/route.ts`, `web/app/api/admin/users/[id]/route.ts`,
  `web/app/admin/users/page.tsx`
- Test: `web/app/api/__tests__/adminUsers.test.ts`

- [ ] **Step 1: Failing tests** — GET list [admin]; PATCH validates `roleSelectSchema`; non-admin 403.
- [ ] **Step 2: Implement** — table + role dropdown + `demo provision` note (production = invite-only
  admin).
- [ ] **Step 3: Run — PASS. Commit** `feat: admin role management`

### Task 4.5: Agent monitor

**Files:**
- Create: `web/app/api/admin/agents/route.ts`, `web/components/admin/AgentMonitor.tsx`

**Interfaces:**
- Produces: `GET /api/admin/agents` [admin] → `{ vlmProvider: "gemini"|"ollama"|"mock",
  vlmHealthy: boolean, vlmLatencyMs: number|null, triggerSource: string, dataBackend: string,
  degraded: boolean }` — env self-report + live `${VLM_SERVICE_URL}/health` ping (2 s timeout) when
  provider=ollama; `degraded` flag read from the provider module (set by 5.5's fallback).

- [ ] **Step 1: Implement + render on dashboard (green/amber/red dots). Commit**
  `feat: agent monitor — monitoring as a feature`

### Task 4.6: KYC onboarding sim

**Files:**
- Create: `web/app/api/kyc/submit/route.ts`
- Modify: `web/app/onboarding/page.tsx`
- Test: `web/app/api/__tests__/kyc.test.ts`

**Interfaces:**
- Produces: `POST /api/kyc/submit` [seller] multipart `{ shopName, doc }` → 1.2 s simulated verify →
  `updateSeller({ kycStatus: "verified", shopName })` + audit + trust event +3 `kyc_verified`.
  Upload hygiene: jpeg/png/webp only, ≤8 MB, else 422 envelope.

- [ ] **Step 1: Failing tests (happy / oversize 422 / wrong type 422).**
- [ ] **Step 2: Implement** — onboarding seller branch: shop name + doc upload Card →
  StreamingChecklist (`reading document → verifying → done`, all tagged `simulated`) → redirect
  `/sell`.
- [ ] **Step 3: Run — PASS. Commit** `feat: seller KYC onboarding (simulated) wired to cold-start trust`

**PHASE GATE 4:** dashboard live, queue decision moves a trust score visibly, KYC feeds cold-start.
Demo to user.

---

## Phase 5 — Engines + providers

Old 5.8 (prompts extraction) merged into Task 5.5.

### Task 5.1: riskRadar engine (beta reputation — Jøsang & Ismail 2002)

**Files:**
- Create: `web/lib/engines/riskRadar.ts`, `web/lib/engines/riskRadar.test.ts`,
  `web/app/api/agents/risk-radar/score/route.ts`
- Modify: `web/lib/engines/trust.ts` (delegate internals to `scoreSeller`)

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

- [ ] **Step 1: Failing property tests:**

```ts
import { describe, expect, it } from "vitest";
import { scoreSeller } from "./riskRadar";

const base = { passes: 0, fails: 0, isNew: true, kycVerified: false,
  imageReuseCount: 0, recentEvents: [] };

describe("scoreSeller — beta reputation", () => {
  it("cold-start prior α=β=2 ⇒ 50", () => expect(scoreSeller(base).trustScore).toBe(50));
  it("monotonic in passes", () =>
    expect(scoreSeller({ ...base, passes: 10 }).trustScore)
      .toBeGreaterThan(scoreSeller({ ...base, passes: 2 }).trustScore));
  it("recent negative outweighs stale negative", () => {
    const fresh = scoreSeller({ ...base, recentEvents: [{ delta: -10, ageDays: 1 }] });
    const stale = scoreSeller({ ...base, recentEvents: [{ delta: -10, ageDays: 90 }] });
    expect(fresh.trustScore).toBeLessThan(stale.trustScore);
  });
  it("fast lane: score≥85 ∧ !new ∧ kyc", () => {
    const vet = { ...base, passes: 60, fails: 1, isNew: false, kycVerified: true };
    expect(scoreSeller(vet).fastLaneEligible).toBe(true);
    expect(scoreSeller({ ...vet, kycVerified: false }).fastLaneEligible).toBe(false);
  });
  it("bounded 0..100, explains itself", () => {
    const r = scoreSeller({ ...base, fails: 500 });
    expect(r.trustScore).toBeGreaterThanOrEqual(0);
    expect(r.contributingSignals.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — FAIL.** **Step 3: Implement:**

```ts
const ALPHA = 2, BETA = 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function scoreSeller(s: SellerSignals): RiskResult {
  const signals: RiskResult["contributingSignals"] = [];
  // Beta reputation: E[Beta(α+passes, β+fails)] scaled 0–100.
  const base = (100 * (ALPHA + s.passes)) / (ALPHA + BETA + s.passes + s.fails);
  signals.push({ label: "Track record", impact: Math.round(base - 50),
    detail: `${s.passes} passes / ${s.fails} fails (beta prior α=β=2)` });
  // Recency-weighted events, ~30-day decay, capped ±15.
  const recency = clamp(
    s.recentEvents.reduce((sum, e) => sum + e.delta * Math.exp(-e.ageDays / 30), 0), -15, 15);
  if (s.recentEvents.length) signals.push({ label: "Recent outcomes",
    impact: Math.round(recency), detail: `${s.recentEvents.length} events, recency-weighted` });
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

- [ ] **Step 4: Route** `POST /api/agents/risk-radar/score { sellerId }` [seller|admin] — assemble
  `SellerSignals` from repo (recentEvents from trust_events, `ageDays` computed), persist
  `updateSeller({ trustScore, trustBand })`, return `RiskResult`. `trust.ts.applyTrustDelta` now
  appends the event then recomputes via `scoreSeller`.
- [ ] **Step 5: Run — PASS. Commit** `feat: Risk Radar — beta-reputation trust engine`

### Task 5.2: decisionEngine (Unified Decision Engine)

**Files:**
- Create: `web/lib/engines/decisionEngine.ts`, `web/lib/engines/decisionEngine.test.ts`

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
// asliVerified = possession.passed && (sizing?.confidence ?? 0) >= 0.6   (Agent1 ∧ Agent2)
// verdict: BLOCK→"blocked" · ESCALATE_HUMAN→"escalated" · AUTO_APPROVE ∧ asliVerified→"verified" · else "pending"
// trustScore = clamp(risk.trustScore + (verified ? +3 : blocked ? -8 : 0), 0, 100)
// explanation: one human line per agent, e.g. "Possession proven at 96%", "Size measured (A4 reference)".
```

- [ ] **Step 1: Failing tests — 4 verdict paths + explanation non-empty + clamp bounds.**
- [ ] **Step 2: Implement (~30 pure lines).**
- [ ] **Step 3: Wire into ReviewStep DecisionPanel + `GET /api/listings/:id` bundle.**
- [ ] **Step 4: Run — PASS. Commit** `feat: Unified Decision Engine composes explainable final verdict`

### Task 5.3: promiseKeeper engine (unstubs Task 3.4)

**Files:**
- Create: `web/lib/engines/promiseKeeper.ts`, `web/lib/engines/promiseKeeper.test.ts`
- Modify: `web/app/api/agents/promise-keeper/check/route.ts` (remove 503 stub)

**Interfaces (locked):**

```ts
export interface FrozenPromise { title: string; price: number; category: string;
  sizeChart?: Record<string, number>; imageUrl?: string; }
export interface DeliveryObservation { titleSeen?: string;
  observedSize?: Record<string, number>; photoPresent: boolean; }
export interface PromiseVerdict { promiseKept: boolean; confidence: number;
  mismatches: string[]; reason: string; }
export function checkPromise(frozen: FrozenPromise, obs: DeliveryObservation): PromiseVerdict;
// Rules: !photoPresent ⇒ kept=false, confidence 0.3, reason "no delivery evidence".
// Size: any dimension |frozen−observed| > 2 cm ⇒ mismatch "chest off by 3.1 cm".
// Title: token overlap < 0.5 ⇒ mismatch "different product name".
// kept = mismatches.length === 0; confidence = photoPresent ? 0.9 − 0.15·mismatches.length : 0.3.
```

- [ ] **Step 1: Failing tests (kept-clean / size-drift / no-photo).** **Step 2: Implement pure.**
- [ ] **Step 3: Route builds `obs` from seeded delivery data (photo present; observedSize = frozen ±
  seeded drift so the demo shows one mismatch case), persists verdict + trust event.**
- [ ] **Step 4: Run — PASS. Commit** `feat: Promise Keeper engine + delivery verdict wiring`

### Task 5.4: Fast-lane wiring

**Files:**
- Modify: `web/lib/orchestrator.ts`, `web/app/api/asli/analyze/route.ts`, `web/app/sell/page.tsx`

**Interfaces:**
- `decide()` gains optional second arg `opts?: { fastLane?: boolean }` — when `fastLane` and the
  trigger fired, return `AUTO_APPROVE` with reason
  `"Trusted seller fast lane (score ≥ 85, KYC verified)."` BEFORE the possession gate (possession
  signals may be absent). Analyze route computes eligibility via `scoreSeller` before Agent 1. UI:
  challenge step skipped, violet "Fast lane" Badge + reason shown.

- [ ] **Step 1: decide() fast-lane tests (eligible skips; ineligible path unchanged — rerun 2.5
  matrix).** **Step 2: Implement + UI.** **Step 3: Run — PASS. Commit**
  `feat: Risk-Radar fast lane skips live challenge for trusted sellers`

### Task 5.5: VlmProvider seam — Gemini + Ollama + mock + prompts extraction

**Files:**
- Create: `prompts/vlm-prompts.json`, `web/lib/vlm/{provider,gemini,ollama,mock}.ts`,
  `web/lib/vlm/__tests__/provider.test.ts`
- Modify: `vlm-service/prompts.py` (thin `json.load`, keep `MATCH_PROMPT`/`MEASURE_PROMPT` names so
  `main.py` is untouched), `web/lib/vlmClient.ts` (re-export seam), challenge + sizing routes
  (import swap only)

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
export function getVlmProvider(): VlmProvider;         // env VLM_PROVIDER, wrapped:
export function withDegradation(p: VlmProvider): VlmProvider; // error → 1 retry → MockProvider,
                                                              // sets module degraded flag (read by 4.5)
```

`prompts/vlm-prompts.json`: keys `match_prompt` (placeholder `{{code}}`), `measure_prompt`
(placeholder `{{reference}}`), `match_schema`, `measure_schema` — text copied verbatim from current
`prompts.py`.

Gemini via **plain REST fetch — no SDK** (declared-stack):

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
// match(): parts = [{ text: renderedPrompt }, { inline_data: { mime_type, data: b64(catalog) } },
//                   { inline_data: { …live } }]; parse defensively (strip ``` fences) → MatchResult.
```

- [ ] **Step 1: Failing provider tests** — mocked `fetch`: happy JSON; fenced JSON; 500 → retry →
  mock fallback (`name === "mock"`, degraded flag set); prompt render substitutes `{{code}}`.
- [ ] **Step 2: Implement 4 files + prompts.json + prompts.py loader.** Ollama provider = existing
  vlmClient HTTP calls moved behind the interface (contract identical).
- [ ] **Step 3: Local: full flow `VLM_PROVIDER=ollama`; one real match `VLM_PROVIDER=gemini` with a
  key.**
- [ ] **Step 4: Run — PASS. Commit**
  `feat: VlmProvider seam — Gemini deployed, Ollama local, mock degradation`

### Task 5.6: EXIF freshness signal (advisory)

**Files:**
- Create: `web/lib/engines/exif.ts`, `web/lib/engines/exif.test.ts`,
  `web/lib/engines/__fixtures__/{with-exif.jpg,stripped.jpg}`
- Modify: challenge route (weight into check payload), ChallengeStep (AgentReasonRow "Capture
  freshness")

**Interfaces:**
- `exifFreshness(buf: ArrayBuffer, now?: Date): { hasExif: boolean;
  capturedWithinMinutes: number | null; weight: number }` — weight +0.05 if captured <10 min ago,
  0 if no EXIF (strippable — NEVER a lone gate; anti-spoof stays behavioural per invariant), −0.05
  if EXIF >24 h old. Minimal in-house JPEG APP1 parser (~60 lines, no new dep): scan `0xFFE1` +
  `"Exif\0\0"` → TIFF endianness → IFD0 tag `0x8769` (ExifIFD) → tag `0x9003` DateTimeOriginal
  (`"YYYY:MM:DD HH:MM:SS"`); any parse failure ⇒ `{ hasExif: false, capturedWithinMinutes: null,
  weight: 0 }`.

- [ ] **Step 1: Generate fixtures once** (Pillow in the vlm-service venv: one JPEG with
  DateTimeOriginal set, one stripped) — commit under `__fixtures__/`.
- [ ] **Step 2: Failing tests (fresh / stale / stripped / garbage buffer).** **Step 3: Implement
  parser.** **Step 4: Wire advisory: matchConfidence += weight before decide(); row in UI.**
- [ ] **Step 5: Run — PASS. Commit** `feat: EXIF freshness as advisory anti-spoof signal`

### Task 5.7: Qdrant local-mode embedding trigger

**Files:**
- Create: `vlm-service/embed.py`, `vlm-service/index_catalog.py`
- Modify: `vlm-service/main.py` (mount `/vlm/embed`, `/vlm/similar`), `vlm-service/requirements.txt`,
  `web/lib/trigger.ts` (unstub qdrant branch), `web/components/flow/TriggerStep.tsx` (source chip)

**Interfaces:**
- `POST /vlm/embed` (multipart image) → `{ vector: number[], method: "clip" | "phash" }`.
- `POST /vlm/similar` (multipart image, `top_k=5`) → `{ matches: { score: number;
  payload: { title: string; url: string } }[], method }`.
- Trigger: clip cosine ≥ 0.86 or phash Hamming ≤ 10 ⇒ match; `matchCount = matches.length`,
  `triggered = matchCount > 0`, `source: "qdrant"`.
- CLIP `openai/clip-vit-base-patch32` via transformers, L2-normalized 512-d;
  `QdrantClient(path="./qdrant_data")`, collection `catalog`, cosine. **Known risk:** torch cp314
  wheels on this box — if install fails, switch to `imagehash` + Pillow (same endpoints,
  `method: "phash"`); do NOT fight wheels longer than 30 min.
- `index_catalog.py` indexes `web/public/mock/*` with titles.

- [ ] **Step 1: Implement embed.py + self-check** (`python embed.py --selftest` asserts
  self-similarity > 0.99 clip / Hamming 0 phash).
- [ ] **Step 2: Mount endpoints; index catalog; wire trigger branch + source chip.**
- [ ] **Step 3: Local run: `TRIGGER_SOURCE=qdrant` full seller flow. Commit**
  `feat: Qdrant local-mode embedding trigger (CLIP, phash fallback)`

**PHASE GATE 5:** fast lane demo, Gemini verdict on Vercel preview, EXIF row visible, qdrant trigger
locally. Demo to user.

---

## Phase 6 — Tests + resilience

### Task 6.1: Integration test sweep (Vitest, MockProvider + InMemoryRepo)

**Files:**
- Create: `web/lib/__tests__/rbac.test.ts`, `web/app/api/__tests__/flows.test.ts`

- [ ] **Step 1: RBAC matrix** — table-driven: every gated route handler × role
  (anon/seller/buyer/admin) → expected 200/401/403 (mock `getSessionUser` per case).
- [ ] **Step 2: Flow tests** — honest (listing→trigger→claim→analyze AUTO_APPROVE→live + promise
  frozen); thief (wrong-item mock → BLOCK, listing blocked); escalate (close-miss ×MAX_ATTEMPTS →
  review created → 4.2 decision → trust event exists); commerce (create→advance×2→promise verdict
  persisted).
- [ ] **Step 3: Run — PASS. Commit** `test: integration sweep over agentic flows and RBAC`

### Task 6.2: Playwright E2E — the judge demo script

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/demo.spec.ts`
- Modify: `web/lib/auth.ts`, `web/middleware.ts` (test bypass)

**Auth bypass (strictly gated):** only when `AUTH_TEST_BYPASS=1` AND `NODE_ENV !== "production"` AND
header `x-test-role` present ⇒ `getSessionUser` returns a fixture user of that role. Production
builds never read the flag. Documented in README testing section.

- [ ] **Step 1:** `npm i -D @playwright/test && npx playwright install chromium`. Config: baseURL
  `http://localhost:3000`; `webServer: { command: "npm run dev", env: { AUTH_TEST_BYPASS: "1",
  VLM_PROVIDER: "mock", DATA_BACKEND: "memory", TRIGGER_SOURCE: "mock" } }`.
- [ ] **Step 2:** `demo.spec.ts` = CLAUDE.md §14 script: seller happy path (fixture uploads → LIVE),
  thief blocked, buyer shop→checkout→fast-forward→promise verdict, admin queue approve→trust moves.
  Assert visible verdict text + badges.
- [ ] **Step 3: Green locally → add CI job (main only). Commit**
  `test: Playwright E2E of the judge demo script`

### Task 6.3: Degradation drills + UX audits

- [ ] **Step 1: Drills (manual, results in PR description):** `VLM_PROVIDER=mock` full flow; Gemini
  invalid key → retry → mock + AgentMonitor `degraded`; qdrant with vlm-service down → mock
  fallthrough; camera permission denied → capture-input fallback; broken Supabase URL → friendly
  error + retry (no white screen).
- [ ] **Step 2: Audits:** every page at 390 px; keyboard-only; `prefers-reduced-motion`; Hindi toggle
  across seller flow (fallbacks fire, no raw keys); empty states (fresh DB, empty queue).
- [ ] **Step 3: Fix findings. Commit** `fix: resilience + a11y audit findings`

**PHASE GATE 6:** full test suite + E2E green in CI; drill checklist clean. Demo to user.

---

## Phase 7 — Deploy + submission

### Task 7.1: Vercel production + Auth0 prod config + smoke

- [ ] **Step 1:** Prod env: `DATA_BACKEND=supabase`, `VLM_PROVIDER=gemini`,
  `TRIGGER_SOURCE=serpapi` (mock fallthrough), `GEMINI_API_KEY`, `SUPABASE_*`, `AUTH0_*` with
  `APP_BASE_URL=https://<prod-domain>`; Auth0 console: prod callback
  `https://<prod-domain>/auth/callback` + logout URL. `AUTH_TEST_BYPASS` ABSENT in prod.
- [ ] **Step 2:** `npx vercel --prod`. Smoke (`scripts/smoke.mjs`, plain node): GET `/` 200; admin
  agents endpoint healthy (documented manual session check); one analyze on a seeded listing;
  Supabase `select count(*) from listings` ≥ 16.
- [ ] **Step 3: Phone test** — Google login + camera capture over HTTPS on a real phone.
- [ ] **Step 4: Commit + tag** `chore: production deployment` · `git tag round3-rc1`

### Task 7.2: README + ATTRIBUTION (submission deliverables)

- [ ] **Step 1:** `README.md`: what/why (prevention-not-detection framing, 3 paragraphs),
  architecture ASCII (CLAUDE.md §4), run-locally (Commands + Auth0/Supabase setup steps captured
  during Tasks 8/6), env table, demo script (§14), testing section, live URL.
- [ ] **Step 2:** `ATTRIBUTION.md`: CLAUDE.md §17 table with exact installed versions
  (`npm ls --depth=0`, `pip freeze`), license/role/source per dep; research papers (spec §5.3).
  Verify no dependency outside the table.
- [ ] **Step 3: Commit** `docs: README + open-source attribution for submission`

### Task 7.3: Demo rehearsal + submit

- [ ] **Step 1:** Run the §14 script ×3 on prod (desktop + phone). Record local full-stack backup
  video (Ollama + Qdrant path).
- [ ] **Step 2:** Fix rehearsal nits (copy, timing, seed polish). Final push, CI green.
- [ ] **Step 3:** Submit: live URL, repo access, README, ATTRIBUTION per checklist. **Done.**

## Model delegation protocol

| Work | Model |
|---|---|
| Phase-plan authoring, engine-logic review, prompt tuning, architecture calls | Opus (this session) |
| Task implementation subagents (features, routes, UI, tests) | Sonnet |
| README/ATTRIBUTION drafting, seed data, boilerplate cleanup | Haiku |

Execution: subagent per task, two-stage review (spec compliance → code quality), commit per green task.

## Cut-line protocol (from spec §3)

If a phase overruns: P10–P14 features (voice/i18n polish, EXIF, Qdrant, Playwright breadth, role-mgmt
extras) degrade to labelled-simulated or drop. P1–P7 (seller flow, auth, persistence, buyer core, admin
core, engines, Gemini) never slip. Decision to cut requires user sign-off.
