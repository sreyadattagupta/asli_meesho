// Agent 4 — Promise Keeper. Frozen go-live promise vs a REAL delivery observation. Pure.
//
// The delivery observation is produced by the shared VLM/CLIP pipeline (provider.verifyDelivery →
// /vlm/verify_delivery): image-embedding cosine of the delivery photo against the frozen catalog
// image (same-product identity) plus a VLM attribute read (category, item count). This engine
// composes those real signals into an explainable, calibrated verdict — no self-referential inputs,
// no engineered pass.

export interface FrozenPromise {
  title: string;
  price: number;
  category: string;
  sizeChart?: Record<string, number>;
  imageUrl?: string;
}

export interface DeliveryObservation {
  photoPresent: boolean;
  /** delivery-vs-catalog image similarity in [0,1] (cv.similarity) */
  cosine?: number;
  /** method-aware same-product decision from the provider (mirrors Agent 1's fusion) */
  sameProduct?: boolean;
  observedCategory?: string;
  observedCount?: number;
  observedSize?: Record<string, number>;
}

export interface PromiseVerdict {
  promiseKept: boolean;
  confidence: number;
  mismatches: string[];
  reason: string;
}

const dimName = (key: string) => key.replace(/_cm$/, "").replace(/_/g, " ");
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function checkPromise(frozen: FrozenPromise, obs: DeliveryObservation): PromiseVerdict {
  if (!obs.photoPresent) {
    return { promiseKept: false, confidence: 0.3, mismatches: [], reason: "No delivery evidence to check against the promise." };
  }

  const mismatches: string[] = [];
  // Attribute agreement fraction — starts at 1, each disagreement lowers it (for calibration).
  let attrsChecked = 0;
  let attrsAgree = 0;

  // Product identity — the delivered item must visually match the listing photo.
  if (obs.sameProduct !== undefined) {
    attrsChecked++;
    if (obs.sameProduct) attrsAgree++;
    else mismatches.push("delivered item does not match the listing photo");
  }

  // Category — VLM-read category of the delivered item vs the frozen listing category.
  if (obs.observedCategory) {
    attrsChecked++;
    if (norm(obs.observedCategory) === norm(frozen.category)
        || norm(obs.observedCategory).includes(norm(frozen.category))
        || norm(frozen.category).includes(norm(obs.observedCategory))) {
      attrsAgree++;
    } else {
      mismatches.push(`category differs (delivered ${obs.observedCategory}, promised ${frozen.category})`);
    }
  }

  // Item count — a promised single item that arrives as zero/partial is a broken promise.
  if (obs.observedCount !== undefined) {
    attrsChecked++;
    if (obs.observedCount >= 1) attrsAgree++;
    else mismatches.push("ordered item not visible in the delivery photo");
  }

  // Size drift (only when a measured delivery size is available): any dimension off by >2 cm.
  let sizeMismatches = 0;
  if (frozen.sizeChart && obs.observedSize) {
    for (const [key, promised] of Object.entries(frozen.sizeChart)) {
      const seen = obs.observedSize[key];
      if (typeof seen === "number" && Math.abs(promised - seen) > 2) {
        sizeMismatches++;
        mismatches.push(`${dimName(key)} off by ${Math.abs(promised - seen).toFixed(1)} cm`);
      }
    }
  }

  const promiseKept = mismatches.length === 0;
  const attrAgreement = attrsChecked ? attrsAgree / attrsChecked : (obs.cosine ?? 0.5);
  const itemStrength = clamp01(((obs.cosine ?? 0.5) - 0.4) / 0.4);
  const confidence = Math.round(
    clamp01(0.15 + 0.5 * itemStrength + 0.35 * attrAgreement - 0.1 * sizeMismatches) * 100) / 100;

  const reason = promiseKept
    ? `Delivery matches the frozen promise (image similarity ${Math.round((obs.cosine ?? 0) * 100)}%).`
    : `Delivery differs from the go-live promise: ${mismatches.join("; ")}.`;
  return { promiseKept, confidence, mismatches, reason };
}
