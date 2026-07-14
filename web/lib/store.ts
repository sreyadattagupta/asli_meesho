// Zustand stores — seller-flow, locale, and session slices (client-side).
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FlowStep, initialFlow, OrchestratorDecision, OrchestratorAction } from "./orchestrator";
import type { KycStatus, Role } from "./db/types";
import type { MatchResult, MeasureResult } from "./vlmClient";
import type { SizeChart } from "./sizing";
import type { Agent1Evidence } from "./agent1Client";

export interface PlatformHit {
  name: string;
  category: "marketplace" | "web";
  count: number;
  url: string;
}

export interface Trigger {
  triggered: boolean;
  matchCount: number;
  platforms: PlatformHit[];
  sources: string[];
  mocked: boolean;
  // Agent 1 engine additions (absent on the offline mock path).
  evidence?: Agent1Evidence[];
  signals?: Record<string, number>;
  trustScore?: number | null;
  band?: "high" | "medium" | "low" | null;
  explanation?: string;
  degraded?: boolean;
}

export interface Challenge {
  code: string;
  issuedAt: number;
  expiresAt: number;
}

interface SellerStore {
  step: FlowStep;

  // server-side listing draft (created on flow entry; absent in signed-out demo mode)
  listingId?: string;
  draft: { title: string; price: number; category: "sarees" | "kurtis" | "footwear" | "jewellery" };

  // upload
  catalogFile?: File;
  catalogPreview?: string;
  // Persisted copy of the catalog image (data URL) so the flow survives a browser reload — the File
  // object itself can't be serialised. Rehydrated back into catalogFile/catalogPreview on load.
  catalogDataUrl?: string;

  // trigger (reverse-image — TRIGGER only, invariant #1)
  trigger?: Trigger;

  // challenge (dynamic, time-bound — invariant #3)
  challenge?: Challenge;
  attempt: number;

  // result of /vlm/match + the orchestrator's decision on it
  matchResult?: MatchResult;
  decision?: OrchestratorDecision;

  // sizing (Agent 2)
  flatlayFile?: File;
  flatlayPreview?: string;
  measureResult?: MeasureResult;
  sizeChart?: SizeChart;

  // human-in-the-loop approval gate (step 5)
  approved?: boolean;

  setStep: (step: FlowStep) => void;
  setListingId: (id: string) => void;
  setDraft: (d: Partial<SellerStore["draft"]>) => void;
  setCatalog: (file: File) => void;
  setTrigger: (t: Trigger) => void;
  setChallenge: (c: Challenge) => void;
  setMatchResult: (r: MatchResult | undefined) => void;
  setDecision: (d: OrchestratorDecision | undefined) => void;
  /** Apply an orchestrator decision: record it, advance to its nextStep, bump attempts on retry. */
  applyDecision: (d: OrchestratorDecision & { action: OrchestratorAction; nextStep: FlowStep }) => void;
  bumpAttempt: () => void;
  setFlatlay: (file: File) => void;
  setMeasureResult: (r: MeasureResult) => void;
  setSizeChart: (c: SizeChart) => void;
  setApproved: (approved: boolean) => void;
  reset: () => void;
}

// ---- locale slice (persisted — survives reloads) -------------------------

interface LocaleStore {
  locale: "en" | "hi";
  toggleLocale: () => void;
}

export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set, get) => ({
      locale: (process.env.NEXT_PUBLIC_DEFAULT_LOCALE === "hi" ? "hi" : "en") as "en" | "hi",
      toggleLocale: () => set({ locale: get().locale === "en" ? "hi" : "en" }),
    }),
    { name: "asli-locale" },
  ),
);

// ---- ui slice (persisted) --------------------------------------------------

interface UiStore {
  voiceOn: boolean;
  toggleVoice: () => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set, get) => ({
      voiceOn: true,
      toggleVoice: () => set({ voiceOn: !get().voiceOn }),
    }),
    { name: "asli-ui" },
  ),
);

// ---- session slice (hydrated from /api/users/me on mount) ----------------

export interface SessionUser {
  role: Role;
  name: string;
  sellerId?: string;
  kycStatus?: KycStatus;
}

interface SessionStore {
  status: "loading" | "authed" | "anon";
  user?: SessionUser;
  fetchSession: () => Promise<void>;
  setUser: (user: SessionUser) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  status: "loading",
  user: undefined,
  fetchSession: async () => {
    try {
      const res = await fetch("/api/users/me");
      if (!res.ok) { set({ status: "anon", user: undefined }); return; }
      const user = (await res.json()) as SessionUser;
      set({ status: "authed", user });
    } catch {
      set({ status: "anon", user: undefined });
    }
  },
  setUser: (user) => set({ status: "authed", user }),
}));

// ---- seller flow slice ----------------------------------------------------

const initialDraft = { title: "", price: 349, category: "kurtis" as const };

/** dataURL → File, to rebuild the catalog upload after a persisted reload. */
function dataUrlToFile(dataUrl: string, name = "catalog.jpg"): File | undefined {
  try {
    const [meta, b64] = dataUrl.split(",");
    const mime = /:(.*?);/.exec(meta)?.[1] ?? "image/jpeg";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name, { type: mime });
  } catch {
    return undefined;
  }
}

export const useSellerStore = create<SellerStore>()(
  persist(
    (set, get) => ({
  ...initialFlow,
  attempt: 0,
  draft: initialDraft,
  setStep: (step) => set({ step }),
  setListingId: (listingId) => set({ listingId }),
  setDraft: (d) => set({ draft: { ...get().draft, ...d } }),
  setCatalog: (catalogFile) => {
    const prev = get().catalogPreview;
    if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
    set({ catalogFile, catalogPreview: URL.createObjectURL(catalogFile) });
    // Snapshot to a data URL for reload persistence (the File itself can't be serialised).
    const reader = new FileReader();
    reader.onload = () => set({ catalogDataUrl: String(reader.result) });
    reader.readAsDataURL(catalogFile);
  },
  setTrigger: (trigger) => set({ trigger }),
  setChallenge: (challenge) => set({ challenge }),
  setMatchResult: (matchResult) => set({ matchResult }),
  setDecision: (decision) => set({ decision }),
  applyDecision: (d) => set({
    decision: { action: d.action, requiredConfidence: d.requiredConfidence, reason: d.reason },
    step: d.nextStep,
    attempt: d.action === "RE_CHALLENGE" ? get().attempt + 1 : get().attempt,
  }),
  bumpAttempt: () => set({ attempt: get().attempt + 1 }),
  setFlatlay: (flatlayFile) => {
    const prev = get().flatlayPreview;
    if (prev) URL.revokeObjectURL(prev);
    set({ flatlayFile, flatlayPreview: URL.createObjectURL(flatlayFile) });
  },
  setMeasureResult: (measureResult) => set({ measureResult }),
  setSizeChart: (sizeChart) => set({ sizeChart }),
  setApproved: (approved) => set({ approved }),
  reset: () => {
    const c = get().catalogPreview;
    if (c && c.startsWith("blob:")) URL.revokeObjectURL(c);
    const f = get().flatlayPreview;
    if (f) URL.revokeObjectURL(f);
    set({
      ...initialFlow,
      attempt: 0,
      listingId: undefined,
      draft: initialDraft,
      catalogFile: undefined,
      catalogPreview: undefined,
      catalogDataUrl: undefined,
      trigger: undefined,
      challenge: undefined,
      matchResult: undefined,
      decision: undefined,
      flatlayFile: undefined,
      flatlayPreview: undefined,
      measureResult: undefined,
      sizeChart: undefined,
      approved: undefined,
    });
  },
    }),
    {
      name: "asli-seller-flow",
      // Persist only what makes a reload resumable. The File/blob previews and the live-proof
      // result can't (or shouldn't) survive a reload; the catalog rides along as a data URL and the
      // challenge code is re-issued fresh on the challenge step (invariant #3 — never reuse a code).
      partialize: (s) => ({
        step: s.step,
        draft: s.draft,
        listingId: s.listingId,
        attempt: s.attempt,
        trigger: s.trigger,
        catalogDataUrl: s.catalogDataUrl,
      }),
      // Rebuild the catalog File + preview from the persisted data URL so the flow can continue.
      onRehydrateStorage: () => (state) => {
        if (state?.catalogDataUrl && !state.catalogFile) {
          const file = dataUrlToFile(state.catalogDataUrl);
          if (file) {
            state.catalogFile = file;
            state.catalogPreview = state.catalogDataUrl;
          }
        }
      },
    },
  ),
);
