// Listing detail bundle — shared by GET /api/listings/:id and the /shop/:id server page.
import { repoReady } from "@/lib/db";
import { unify, type FinalDecision } from "@/lib/engines/decisionEngine";
import type { OrchestratorAction } from "@/lib/orchestrator";
import type {
  AuthenticityCheck, Listing, ProductImage, SizeMeasurement, TrustBand,
} from "@/lib/db/types";

export interface ListingBundle {
  listing: Listing;
  images: ProductImage[];
  checks: AuthenticityCheck[];
  measurement: SizeMeasurement | null;
  trustScore: number;
  trustBand: TrustBand;
  promiseArmed: boolean;
  decision: FinalDecision; // Unified Decision Engine — explainable composed verdict
}

export async function getListingBundle(id: string): Promise<ListingBundle | null> {
  const repo = await repoReady();
  const listing = await repo.getListing(id);
  if (!listing) return null;
  const [images, checks, measurement, seller, promise] = await Promise.all([
    repo.listImages(id),
    repo.listChecks(id),
    repo.getMeasurement(id),
    repo.getSeller(listing.sellerId),
    repo.getPromiseByListing(id),
  ]);

  // Compose the final explainable verdict from the persisted agent trail (Unified Decision Engine).
  const lastPossession = checks.filter((c) => c.agent === "possession").at(-1);
  const lastOrch = checks.filter((c) => c.agent === "orchestrator").at(-1);
  const action: OrchestratorAction =
    (lastOrch?.action as OrchestratorAction | undefined) ??
    (listing.status === "blocked" ? "BLOCK"
      : listing.status === "escalated" ? "ESCALATE_HUMAN"
      : listing.verified ? "AUTO_APPROVE" : "ESCALATE_HUMAN");
  const possession = lastPossession
    ? {
        passed: Boolean(lastPossession.payload["same_item"]) && Boolean(lastPossession.payload["code_visible"]),
        confidence: lastPossession.confidence,
        sameItem: Boolean(lastPossession.payload["same_item"]),
        codeVisible: Boolean(lastPossession.payload["code_visible"]),
      }
    : undefined;
  const decision = unify({
    possession,
    // A live-verified listing passed Agent 2 by definition; otherwise use the measured confidence.
    sizing: measurement ? { confidence: measurement.confidence } : listing.verified ? { confidence: 0.9 } : undefined,
    risk: {
      trustScore: seller?.trustScore ?? 0, band: seller?.trustBand ?? "low",
      contributingSignals: [], fastLaneEligible: false,
    },
    orchestratorAction: action,
  });

  return {
    listing, images, checks, measurement,
    trustScore: seller?.trustScore ?? 0,
    trustBand: seller?.trustBand ?? "low",
    promiseArmed: promise !== null || listing.verified, // frozen at go-live for verified listings
    decision,
  };
}
