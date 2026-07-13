import crypto from "crypto";
import { getSessionUser } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { vlmMatch } from "@/lib/vlmClient";
import { fail, ok } from "@/lib/api";
import { rateLimited } from "@/lib/rateLimit";

const TTL_SECONDS = Number(process.env.CHALLENGE_TTL_SECONDS ?? 300);
// No ambiguous chars (0/O, 1/I) — hand-writeable, VLM-readable.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// GET: issue a fresh dynamic code, persisted for the atomic single-use claim (invariant #3).
export async function GET() {
  try {
    const user = await getSessionUser();
    if (rateLimited(user?.id ?? "anon")) {
      return fail(429, "rate_limited", "Too many codes requested — wait a minute and retry.");
    }
    const bytes = crypto.randomBytes(4);
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    const repo = await repoReady();
    const c = await repo.issueChallenge(code, TTL_SECONDS);
    return ok({ code: c.code, issuedAt: Date.parse(c.issuedAt), expiresAt: Date.parse(c.expiresAt) });
  } catch {
    return fail(500, "internal", "Could not issue a challenge code.");
  }
}

// POST: verify possession. CLAIM FIRST — a used/expired code never reaches the VLM.
// `live` MUST come from the camera-only capture (invariant #2 — client enforces, we record).
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const catalog = form.get("catalog");
    const live = form.get("live");
    const code = form.get("code");
    const listingId = typeof form.get("listingId") === "string" ? (form.get("listingId") as string) : undefined;
    const matchCount = Number(form.get("matchCount") ?? 0);

    if (!(catalog instanceof Blob) || !(live instanceof Blob) || typeof code !== "string") {
      return fail(400, "invalid_body", "catalog, live (camera) and code are required.");
    }

    const repo = await repoReady();
    // Signed-out local demo has no server-side draft; single-use still enforced via the claim.
    const claimed = await repo.claimChallenge(code.toUpperCase(), listingId ?? "");
    if (!claimed) {
      return fail(409, "code_used_or_expired", "This code was already used or has expired — get a fresh one.");
    }

    const result = await vlmMatch(catalog, live, code);

    if (listingId) {
      const liveBuf = Buffer.from(await live.arrayBuffer());
      const imageHash = crypto.createHash("sha256").update(liveBuf).digest("hex");
      await repo.addImage({
        listingId,
        url: `data:${live.type || "image/jpeg"};base64,${liveBuf.toString("base64")}`,
        imageHash,
        kind: "live",
      });
      await repo.addCheck({
        listingId,
        agent: "possession",
        payload: { ...result, matchCount } as unknown as Record<string, unknown>,
        confidence: result.confidence,
        action: "recorded",
        requiredConfidence: 0, // the orchestrator sets the bar in /api/asli/analyze
        reason: result.reason,
      });
      await repo.appendAudit({
        listingId, actor: "possession-proof", event: "challenge_verified",
        data: { code: claimed.code, passed: result.passed, confidence: result.confidence },
      });
    }

    return ok(result);
  } catch (e) {
    return fail(502, "vlm_unavailable", `Verification failed: ${String(e)}`);
  }
}
