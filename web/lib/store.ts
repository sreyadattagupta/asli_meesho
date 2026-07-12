// Zustand store — seller-flow step state (client-side).
"use client";

import { create } from "zustand";
import { FlowStep, initialFlow, OrchestratorDecision } from "./orchestrator";
import type { MatchResult, MeasureResult } from "./vlmClient";
import type { SizeChart } from "./sizing";

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
}

export interface Challenge {
  code: string;
  issuedAt: number;
  expiresAt: number;
}

interface SellerStore {
  step: FlowStep;

  // upload
  catalogFile?: File;
  catalogPreview?: string;

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
  setCatalog: (file: File) => void;
  setTrigger: (t: Trigger) => void;
  setChallenge: (c: Challenge) => void;
  setMatchResult: (r: MatchResult | undefined) => void;
  setDecision: (d: OrchestratorDecision | undefined) => void;
  bumpAttempt: () => void;
  setFlatlay: (file: File) => void;
  setMeasureResult: (r: MeasureResult) => void;
  setSizeChart: (c: SizeChart) => void;
  setApproved: (approved: boolean) => void;
  reset: () => void;
}

export const useSellerStore = create<SellerStore>((set, get) => ({
  ...initialFlow,
  attempt: 0,
  setStep: (step) => set({ step }),
  setCatalog: (catalogFile) => {
    const prev = get().catalogPreview;
    if (prev) URL.revokeObjectURL(prev);
    set({ catalogFile, catalogPreview: URL.createObjectURL(catalogFile) });
  },
  setTrigger: (trigger) => set({ trigger }),
  setChallenge: (challenge) => set({ challenge }),
  setMatchResult: (matchResult) => set({ matchResult }),
  setDecision: (decision) => set({ decision }),
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
    if (c) URL.revokeObjectURL(c);
    const f = get().flatlayPreview;
    if (f) URL.revokeObjectURL(f);
    set({
      ...initialFlow,
      attempt: 0,
      catalogFile: undefined,
      catalogPreview: undefined,
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
}));
