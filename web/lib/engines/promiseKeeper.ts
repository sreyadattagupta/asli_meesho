// Agent 4 — Promise Keeper. Frozen go-live promise vs a REAL delivery observation. Pure.
//
// Production contract (strict): verification runs as a HARD GATE, not a soft score.
//   1. Product identity is verified FIRST. A delivery photo can only ever be "promise kept" when the
//      pipeline affirmatively decides it is the SAME physical product at high confidence.
//   2. If identity can't be confirmed — no verification signal, a different product, a conflicting
//      garment category, or low confidence — we STOP and return a mismatch/review/retake state with
//      score 0. We never average features into a misleading percentage, and never touch seller trust.
//   3. Only AFTER identity passes do we score the rest of the promise (size/count).
//
// This exists because the old engine defaulted OPEN: when the catalog image was missing or the CV
// call failed, `obs` carried no identity signal and the engine returned promiseKept=true at ~45%.
// A completely different product (a T-shirt against a kurta) could be marked "Promise Kept".

export interface FrozenPromise {
  title: string;
  price: number;
  category: string;
  sizeChart?: Record<string, number>;
  imageUrl?: string;
}

export interface DeliveryObservation {
  photoPresent: boolean;
  /** delivery-vs-catalog image similarity in [0,1] (cv.similarity / provider confidence) */
  cosine?: number;
  /** method-aware same-product decision from the provider (mirrors Agent 1's fusion). `undefined`
   *  means verification did NOT run — which must be treated as "cannot confirm", never as a pass. */
  sameProduct?: boolean;
  observedCategory?: string;
  observedCount?: number;
  observedSize?: Record<string, number>;
}

export type PromiseStatus =
  | "PROMISE_KEPT"
  | "PROMISE_BROKEN"
  | "PRODUCT_MISMATCH"
  | "REQUIRES_REVIEW"
  | "RETAKE_PHOTO"
  | "NO_PHOTO";

export interface PromiseVerdict {
  status: PromiseStatus;
  promiseKept: boolean;
  /** Identity/verification confidence in [0,1]. */
  confidence: number;
  /** Similarity score 0–100 — 0 for any state that did not pass identity verification. */
  score: number;
  mismatches: string[];
  /** Machine-readable reasons for logging/analytics (e.g. category_mismatch, identity_mismatch). */
  mismatchCodes: string[];
  reason: string;
  requiresRetake: boolean;
  /** The route only writes to seller trust when this is true — i.e. identity verification passed. */
  updateTrustScore: boolean;
}

// A delivery photo must clear this identity confidence before it can be approved. Provider "same"
// cosines sit well above it (gemini ~0.85, phash/CLIP ~0.9+); genuine mismatches sit far below.
const CONFIDENT_SAME = 0.75;

const dimName = (key: string) => key.replace(/_cm$/, "").replace(/_/g, " ");
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Fuzzy category agreement — exact, or one contained in the other ("kurti" vs "kurtis"). */
function categoryAgrees(observed: string, promised: string): boolean {
  const a = norm(observed), b = norm(promised);
  return a === b || a.includes(b) || b.includes(a);
}

/** Build a non-approving verdict (score 0, no trust write) for every state that fails the gate. */
function halt(
  status: Exclude<PromiseStatus, "PROMISE_KEPT" | "PROMISE_BROKEN">,
  confidence: number,
  mismatches: string[],
  mismatchCodes: string[],
  reason: string,
): PromiseVerdict {
  return {
    status,
    promiseKept: false,
    confidence: Math.round(clamp01(confidence) * 100) / 100,
    score: 0,
    mismatches,
    mismatchCodes,
    reason,
    requiresRetake: true,
    updateTrustScore: false,
  };
}

export function checkPromise(frozen: FrozenPromise, obs: DeliveryObservation): PromiseVerdict {
  // 0. No delivery evidence at all.
  if (!obs.photoPresent) {
    return halt("NO_PHOTO", 0.3, [], ["no_photo"], "No delivery photo to check against the promise.");
  }

  const identityConf = clamp01(obs.cosine ?? 0);

  // 1. HARD GATE — identity must be affirmatively verifiable. If verification did not run (no
  //    catalog image, CV/VLM unavailable), we CANNOT confirm the product. Never default open.
  if (obs.sameProduct === undefined) {
    return halt(
      "RETAKE_PHOTO",
      Math.min(identityConf, 0.4),
      [],
      ["verification_unavailable"],
      "Couldn't verify the delivery photo against the promised product — please retake it clearly, in good light.",
    );
  }

  // 2. HARD GATE — garment category must not conflict (kurta ≠ T-shirt, saree ≠ footwear), even if
  //    the embedding was borderline-agreeable.
  const categoryConflict =
    obs.observedCategory !== undefined && !categoryAgrees(obs.observedCategory, frozen.category);

  // 3. HARD GATE — a different product. Stop immediately; no similarity percentage, no trust change.
  if (obs.sameProduct === false || categoryConflict) {
    const codes = ["identity_mismatch"];
    if (categoryConflict) codes.push("category_mismatch");
    const detail =
      obs.observedCategory && categoryConflict
        ? `Promised item is a ${frozen.category}, but the delivery photo shows a ${obs.observedCategory}.`
        : "The delivered item does not match the promised product.";
    return halt("PRODUCT_MISMATCH", Math.min(identityConf, 0.4), [detail], codes, `Different product detected. ${detail}`);
  }

  // 4. sameProduct === true and category agrees — but require enough confidence to approve. A weak
  //    match goes to a human rather than being rubber-stamped.
  if (identityConf < CONFIDENT_SAME) {
    return halt(
      "REQUIRES_REVIEW",
      identityConf,
      [],
      ["low_confidence"],
      `Not confident enough that the delivery matches the promise (${Math.round(identityConf * 100)}%) — sent for manual review.`,
    );
  }

  // 5. Identity CONFIRMED (same product, high confidence). Only now do we score the rest of the
  //    promise: the ordered item must be present and the delivered size must not have drifted.
  const mismatches: string[] = [];
  const codes: string[] = [];

  if (obs.observedCount !== undefined && obs.observedCount < 1) {
    mismatches.push("ordered item not visible in the delivery photo");
    codes.push("count_mismatch");
  }

  let sizeDrift = 0;
  if (frozen.sizeChart && obs.observedSize) {
    for (const [key, promised] of Object.entries(frozen.sizeChart)) {
      const seen = obs.observedSize[key];
      if (typeof seen === "number" && Math.abs(promised - seen) > 2) {
        sizeDrift++;
        mismatches.push(`${dimName(key)} off by ${Math.abs(promised - seen).toFixed(1)} cm`);
      }
    }
  }
  if (sizeDrift > 0) codes.push("size_mismatch");

  // A genuine, confirmed same-product delivery that breaks the size/count promise IS the seller's
  // fault — so trust updates (penalty), unlike the ambiguous mismatch/review states above.
  if (mismatches.length > 0) {
    const score = Math.round(clamp01(identityConf - 0.15 * sizeDrift) * 100);
    return {
      status: "PROMISE_BROKEN",
      promiseKept: false,
      confidence: Math.round(identityConf * 100) / 100,
      score,
      mismatches,
      mismatchCodes: codes,
      reason: `Right product, but the delivery breaks the promise: ${mismatches.join("; ")}.`,
      requiresRetake: false,
      updateTrustScore: true,
    };
  }

  const score = Math.round(identityConf * 100);
  return {
    status: "PROMISE_KEPT",
    promiseKept: true,
    confidence: Math.round(identityConf * 100) / 100,
    score,
    mismatches: [],
    mismatchCodes: [],
    reason: `Delivery matches the frozen promise (identity ${score}%).`,
    requiresRetake: false,
    updateTrustScore: true,
  };
}
