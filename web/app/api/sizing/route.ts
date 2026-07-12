import { NextRequest, NextResponse } from "next/server";
import { vlmMeasure } from "@/lib/vlmClient";

// POST: flat-lay + reference object → proxies measurement to vlm-service.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const flatlay = form.get("flatlay");
  const ref = form.get("reference_object");

  if (!(flatlay instanceof Blob)) {
    return NextResponse.json({ error: "flatlay image required" }, { status: 400 });
  }
  const referenceObject = ref === "tape" ? "tape" : "a4";

  try {
    const result = await vlmMeasure(flatlay, referenceObject);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
