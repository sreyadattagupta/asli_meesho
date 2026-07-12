import { z } from "zod";
import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { decide, stepForAction } from "@/lib/orchestrator";
import type { AgentSignals, OrchestratorAction } from "@/lib/orchestrator";
import type { FlowStep } from "@/lib/orchestrator";
import { fail, ok } from "@/lib/api";

export interface AnalyzeResponse {
  action: OrchestratorAction;
  requiredConfidence: number;
  reason: string;
  trustScore: number;
  nextStep: FlowStep;
  agentResults: Record<string, unknown>;
}

// The agentic front door: reads persisted agent signals, decides, records the
// decision + audit trail, and tells the UI what happens next (invariant #6/#8).
export async function POST(req: Request) {
  try {
    const user = await requireRole("seller");
    const { listingId } = z.object({ listingId: z.string() }).parse(await req.json());
    const repo = await repoReady();
    const listing = await repo.getListing(listingId);
    if (!listing || listing.sellerId !== user.sellerId) return fail(404, "not_found", "Listing not found.");
    const seller = (await repo.getSeller(listing.sellerId))!;
    const checks = await repo.listChecks(listingId);
    const possession = checks.filter((c) => c.agent === "possession");
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
    await repo.addCheck({
      listingId, agent: "orchestrator",
      payload: { signals } as unknown as Record<string, unknown>,
      confidence: signals.matchConfidence, action: decision.action,
      requiredConfidence: decision.requiredConfidence, reason: decision.reason,
    });
    await repo.appendAudit({
      listingId, actor: "orchestrator", event: decision.action,
      data: { bar: decision.requiredConfidence, reason: decision.reason },
    });
    if (decision.action === "ESCALATE_HUMAN") {
      await repo.createReview({ listingId, status: "pending" });
      await repo.updateListing(listingId, { status: "escalated", flowStep: "review" });
    }
    if (decision.action === "BLOCK") {
      await repo.updateListing(listingId, { status: "blocked", flowStep: "review" });
    }
    const measurement = await repo.getMeasurement(listingId);
    const nextStep: FlowStep =
      decision.action === "AUTO_APPROVE" && measurement ? "review" : stepForAction(decision.action);
    return ok<AnalyzeResponse>({
      ...decision, trustScore: seller.trustScore, nextStep,
      agentResults: { possession: last?.payload ?? null },
    });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    if (e instanceof z.ZodError) return fail(400, "invalid_body", e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
