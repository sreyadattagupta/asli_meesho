import { NextRequest, NextResponse } from "next/server";
import { issueChallenge } from "@/lib/challenge";
import { vlmMatch } from "@/lib/vlmClient";

// GET (no body): issue a fresh dynamic challenge code (invariant #3).
export async function GET() {
  return NextResponse.json(issueChallenge());
}

// POST: verify possession. Proxies catalog + live photo + code to vlm-service.
// The `live` photo MUST come from the camera-only capture (invariant #2) — the
// client enforces that; this route just forwards.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const catalog = form.get("catalog");
  const live = form.get("live");
  const code = form.get("code");

  if (!(catalog instanceof Blob) || !(live instanceof Blob) || typeof code !== "string") {
    return NextResponse.json(
      { error: "catalog, live (camera), and code are required" },
      { status: 400 },
    );
  }

  try {
    const result = await vlmMatch(catalog, live, code);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
