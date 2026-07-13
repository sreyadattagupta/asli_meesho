// Agent 4 — Promise Keeper. Frozen go-live promise vs delivery observation. Pure.
export interface FrozenPromise {
  title: string;
  price: number;
  category: string;
  sizeChart?: Record<string, number>;
  imageUrl?: string;
}

export interface DeliveryObservation {
  titleSeen?: string;
  observedSize?: Record<string, number>;
  photoPresent: boolean;
}

export interface PromiseVerdict {
  promiseKept: boolean;
  confidence: number;
  mismatches: string[];
  reason: string;
}

const dimName = (key: string) => key.replace(/_cm$/, "").replace(/_/g, " ");

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
}

/** Jaccard overlap of two token sets (0..1). */
function overlap(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function checkPromise(frozen: FrozenPromise, obs: DeliveryObservation): PromiseVerdict {
  if (!obs.photoPresent) {
    return { promiseKept: false, confidence: 0.3, mismatches: [], reason: "No delivery evidence to check against the promise." };
  }

  const mismatches: string[] = [];

  // Size drift: any dimension off by more than 2 cm.
  if (frozen.sizeChart && obs.observedSize) {
    for (const [key, promised] of Object.entries(frozen.sizeChart)) {
      const seen = obs.observedSize[key];
      if (typeof seen === "number" && Math.abs(promised - seen) > 2) {
        mismatches.push(`${dimName(key)} off by ${Math.abs(promised - seen).toFixed(1)} cm`);
      }
    }
  }

  // Title drift: low token overlap ⇒ likely a different product.
  if (obs.titleSeen && overlap(frozen.title, obs.titleSeen) < 0.5) {
    mismatches.push("delivered a different product name");
  }

  const promiseKept = mismatches.length === 0;
  const confidence = Math.max(0, 0.9 - 0.15 * mismatches.length);
  const reason = promiseKept
    ? "Delivery matches the frozen promise."
    : `Delivery differs from the go-live promise: ${mismatches.join("; ")}.`;
  return { promiseKept, confidence, mismatches, reason };
}
