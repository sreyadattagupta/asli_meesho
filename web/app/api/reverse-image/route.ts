import { NextRequest, NextResponse } from "next/server";
import { reverseImageSearch } from "@/lib/reverseImage";

// POST: catalog image → reverse-image search. Returns a TRIGGER only (invariant #1).
// Never a block/verdict — a hit only triggers the possession challenge.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("catalog");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "catalog image required" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const result = await reverseImageSearch(buf);
  return NextResponse.json(result);
}
