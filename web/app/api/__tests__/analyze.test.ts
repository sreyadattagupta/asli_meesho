import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/db/types";

const sessionUser: User = {
  id: "", auth0Sub: "", email: "s@x.com", name: "S", role: "seller", createdAt: "",
};

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getSessionUser: vi.fn(async () => sessionUser),
    requireRole: vi.fn(async (role: string) => {
      if (sessionUser.role !== role) throw new actual.HttpError(403, "forbidden", `Requires ${role} role.`);
      return sessionUser;
    }),
  };
});

import { POST } from "@/app/api/asli/analyze/route";
import { repoReady } from "@/lib/db";
import { MAX_ATTEMPTS } from "@/lib/orchestrator";

let listingId = "";

function analyze(id = listingId): Promise<Response> {
  return POST(new Request("http://x/api/asli/analyze", { method: "POST", body: JSON.stringify({ listingId: id }) }));
}

async function addPossession(payload: Record<string, unknown>, confidence: number): Promise<void> {
  const repo = await repoReady();
  await repo.addCheck({
    listingId, agent: "possession", payload, confidence,
    action: "recorded", requiredConfidence: 0, reason: "test",
  });
}

describe("POST /api/asli/analyze", () => {
  beforeEach(async () => {
    const repo = await repoReady();
    const seller = await repo.createSeller({
      name: "S", shopName: "S", trustScore: 40, trustBand: "low",
      kycStatus: "pending", isNew: false, passes: 0, fails: 0,
    });
    const u = await repo.createUser({
      auth0Sub: `test|${crypto.randomUUID()}`, email: "s@x.com", name: "S", role: "seller",
    });
    Object.assign(sessionUser, await repo.setUserRole(u.id, "seller", seller.id));
    const l = await repo.createListing({
      sellerId: seller.id, title: "Tee", description: "", price: 100, category: "kurtis",
      status: "draft", flowStep: "challenge", verified: false, rankBoost: 0,
    });
    listingId = l.id;
  });

  it("thief payload ⇒ BLOCK and listing goes blocked", async () => {
    await addPossession({ same_item: false, code_visible: false, matchCount: 4 }, 0.1);
    const res = await analyze();
    const body = await res.json();
    expect(body.action).toBe("BLOCK");
    expect(body.nextStep).toBe("review");
    const repo = await repoReady();
    expect((await repo.getListing(listingId))?.status).toBe("blocked");
  });

  it("close miss ⇒ RE_CHALLENGE with nextStep challenge", async () => {
    await addPossession({ same_item: true, code_visible: false, matchCount: 4 }, 0.6);
    const body = await (await analyze()).json();
    expect(body.action).toBe("RE_CHALLENGE");
    expect(body.nextStep).toBe("challenge");
  });

  it("repeat past MAX_ATTEMPTS ⇒ review row created", async () => {
    for (let i = 0; i <= MAX_ATTEMPTS; i++) {
      await addPossession({ same_item: true, code_visible: false, matchCount: 4 }, 0.6);
    }
    const body = await (await analyze()).json();
    expect(body.action).toBe("ESCALATE_HUMAN");
    const repo = await repoReady();
    const pending = await repo.listPendingReviews();
    expect(pending.some((r) => r.listingId === listingId)).toBe(true);
  });

  it("pass ⇒ AUTO_APPROVE with nextStep sizing", async () => {
    await addPossession({ same_item: true, code_visible: true, matchCount: 4 }, 0.9);
    const body = await (await analyze()).json();
    expect(body.action).toBe("AUTO_APPROVE");
    expect(body.nextStep).toBe("sizing");
    expect(typeof body.trustScore).toBe("number");
  });

  it("404s on someone else's listing", async () => {
    const repo = await repoReady();
    const other = await repo.createSeller({
      name: "O", shopName: "O", trustScore: 40, trustBand: "low",
      kycStatus: "pending", isNew: true, passes: 0, fails: 0,
    });
    const foreign = await repo.createListing({
      sellerId: other.id, title: "X", description: "", price: 100, category: "sarees",
      status: "draft", flowStep: "upload", verified: false, rankBoost: 0,
    });
    expect((await analyze(foreign.id)).status).toBe(404);
  });
});
