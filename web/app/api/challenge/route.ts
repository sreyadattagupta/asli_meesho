import crypto from "crypto";
import { getSessionUser, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { vlmMatch } from "@/lib/vlmClient";
import { assertOwnedListing } from "@/lib/listingOwnership";
import { fail, ok } from "@/lib/api";
import { rateLimited } from "@/lib/rateLimit";
import { exifFreshness } from "@/lib/engines/exif";

// POST waits on the CV service, whose same-item gate runs 26–57s warm on CPU (longer on a cold
// start). The platform default cuts the function off well before that and returns an HTML 504 the
// client cannot parse — which surfaces to the seller as "Verification service is temporarily
// unavailable" on a request that was actually still working. Matches promise-keeper/check.
export const maxDuration = 120;

// 15 minutes, not 5. The clock starts when the code is issued, but everything that takes real time
// happens after: find a pen, write the code on a slip, position the garment and slip, shoot it,
// upload a multi-MB photo over 4G, then wait 26-57s for the CV service. Five minutes expired on
// honest sellers mid-task and made them redo the slip. Still dynamic, time-bound and single-use.
const TTL_SECONDS = Number(process.env.CHALLENGE_TTL_SECONDS ?? 900);
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

    // Prove ownership BEFORE claiming the code: a failed claim burns a single-use code, so letting a
    // stranger reach it would let them spend someone else's codes.
    if (listingId) await assertOwnedListing(listingId);

    const repo = await repoReady();
    // Signed-out local demo has no server-side draft; single-use still enforced via the claim.
    const claimed = await repo.claimChallenge(code.toUpperCase(), listingId ?? "");
    if (!claimed) {
      return fail(409, "code_used_or_expired", "This code was already used or has expired — get a fresh one.");
    }

    const result = await vlmMatch(catalog, live, code);

    // EXIF freshness — advisory only (strippable ⇒ never a lone gate, invariant #6). Nudges the
    // recorded confidence up for a fresh live capture, down for a stale one.
    const liveArrBuf = await live.arrayBuffer();
    const exif = exifFreshness(liveArrBuf);
    const adjustedConfidence = Math.min(1, Math.max(0, result.confidence + exif.weight));

    // Nothing compared the photos — the CV service was unreachable. Recording a possession check
    // here would count our outage as one of the seller's attempts, and `decide()` reads attempt
    // count to RAISE the bar (invariant #7), so an outage would make their next honest try harder.
    //
    // Give the code back for the same reason. It is written on a paper slip inside the seller's
    // photo, so burning it on our outage forces them to rewrite the slip and reshoot the product —
    // sellers hit exactly that during the CV outage. Single-use (invariant #3) still holds: the
    // release only reverses a claim that verified nothing, the original expiry is untouched, and a
    // real pass or fail keeps the code spent.
    if (result.unavailable) {
      await repo.releaseChallenge(claimed.code);
      if (listingId) {
        await repo.appendAudit({
          listingId, actor: "possession-proof", event: "challenge_unavailable",
          data: { code: claimed.code, reason: result.reason },
        });
      }
      return ok(result);
    }

    if (listingId) {
      const liveBuf = Buffer.from(liveArrBuf);
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
        payload: { ...result, matchCount, exif } as unknown as Record<string, unknown>,
        confidence: adjustedConfidence,
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
    // Ownership/auth refusals must keep their own status — a 502 would read as "the VLM is down,
    // try again", which is both wrong and an invitation to retry.
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(502, "vlm_unavailable", `Verification failed: ${String(e)}`);
  }
}
