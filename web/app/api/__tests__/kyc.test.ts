// KYC onboarding sim — happy path + upload hygiene (422s).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/db/types";

const sessionUser: User = {
  id: "", auth0Sub: "", email: "s@x.com", name: "S", role: "seller", sellerId: "", createdAt: "",
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

import { POST } from "@/app/api/kyc/submit/route";
import { repoReady } from "@/lib/db";

function submit(shopName: string, doc?: File): Promise<Response> {
  const form = new FormData();
  form.set("shopName", shopName);
  if (doc) form.set("doc", doc);
  return POST(new Request("http://x/api/kyc/submit", { method: "POST", body: form }));
}
const img = (bytes: number, type: string) => new File([new Uint8Array(bytes)], "doc", { type });

describe("POST /api/kyc/submit", () => {
  beforeEach(async () => {
    const repo = await repoReady();
    const seller = await repo.createSeller({
      name: "S", shopName: "Old Name", trustScore: 40, trustBand: "low",
      kycStatus: "pending", isNew: true, passes: 0, fails: 0,
    });
    sessionUser.sellerId = seller.id;
    sessionUser.role = "seller";
  });

  it("verifies a valid submission and bumps trust", async () => {
    const res = await submit("Priya Ethnic Studio", img(1024, "image/jpeg"));
    expect(res.status).toBe(200);
    expect((await res.json()).kycStatus).toBe("verified");
    const repo = await repoReady();
    const seller = await repo.getSeller(sessionUser.sellerId!);
    expect(seller!.kycStatus).toBe("verified");
    expect(seller!.trustScore).toBe(43);
  });

  it("422s an oversized document", async () => {
    const res = await submit("Valid Shop", img(9 * 1024 * 1024, "image/png"));
    expect(res.status).toBe(422);
  });

  it("422s a wrong file type", async () => {
    const res = await submit("Valid Shop", img(1024, "application/pdf"));
    expect(res.status).toBe(422);
  });
});
