import crypto from "crypto";
import { vlmMeasure } from "@/lib/vlmClient";
import { toSizeChart } from "@/lib/sizing";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

// POST: flat-lay + reference object → VLM measures → persists the measurement (Agent 2).
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const flatlay = form.get("flatlay");
    const ref = form.get("reference_object");
    const listingId = typeof form.get("listingId") === "string" ? (form.get("listingId") as string) : undefined;

    if (!(flatlay instanceof Blob)) return fail(400, "flatlay_required", "Flat-lay image required.");
    const referenceObject = ref === "tape" ? "tape" : "a4";

    const result = await vlmMeasure(flatlay, referenceObject);

    if (listingId) {
      const repo = await repoReady();
      const listing = await repo.getListing(listingId);
      if (listing) {
        const buf = Buffer.from(await flatlay.arrayBuffer());
        await repo.addImage({
          listingId,
          url: `data:${flatlay.type || "image/jpeg"};base64,${buf.toString("base64")}`,
          imageHash: crypto.createHash("sha256").update(buf).digest("hex"),
          kind: "flatlay",
        });
        const chart = toSizeChart(result);
        await repo.addMeasurement({
          listingId,
          chestCm: result.chest_cm,
          lengthCm: result.length_cm,
          waistCm: result.waist_cm,
          referenceUsed: result.reference_used ?? referenceObject,
          confidence: result.confidence,
          mappedSize: chart.size,
        });
        await repo.appendAudit({
          listingId, actor: "smart-sizing", event: "size_measured",
          data: { chest_cm: result.chest_cm, length_cm: result.length_cm, waist_cm: result.waist_cm, mappedSize: chart.size },
        });
      }
    }

    return ok(result);
  } catch (e) {
    return fail(502, "vlm_unavailable", `Measurement failed: ${String(e)}`);
  }
}
