// Every t("…") / useVoiceGuide("…") key referenced in the seller flow must exist
// in the EN dictionary, and every seller-flow key must have a Hindi translation.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { hi } from "../i18n/hi";

const FLOW_DIR = path.resolve(__dirname, "../../components/flow");

function referencedKeys(): string[] {
  const keys = new Set<string>();
  for (const file of readdirSync(FLOW_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const src = readFileSync(path.join(FLOW_DIR, file), "utf8");
    // t("key") · t("key", { … }) · useVoiceGuide("key") · CHECK_LABEL-style "flow.…" literals
    for (const m of src.matchAll(/\b(?:t|useVoiceGuide)\("([^"]+)"/g)) keys.add(m[1]);
    for (const m of src.matchAll(/"(flow\.[\w.]+)"/g)) keys.add(m[1]);
  }
  return [...keys];
}

describe("seller-flow i18n coverage", () => {
  it("references at least one key per flow step file", () => {
    expect(referencedKeys().length).toBeGreaterThanOrEqual(20);
  });

  it("every referenced key exists in en", () => {
    const missing = referencedKeys().filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it("every seller-flow en key has a hi translation (no silent fallback in the demo path)", () => {
    const missing = Object.keys(en).filter((k) => k.startsWith("flow.") && !(k in hi));
    expect(missing).toEqual([]);
  });
});
