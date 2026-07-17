// Guards Issue 2: a draft persisted in localStorage before the wizard grew its fields
// (mrp/stock/sku/description) rehydrated as {title, price, category} only, and ReviewStep's
// `draft.sku.trim()` crashed the whole wizard with "Cannot read properties of undefined". The persist
// `merge` heals that by layering the old shape over the full defaults; this locks it.
import { describe, it, expect } from "vitest";
import { withDraftDefaults } from "../store";

describe("withDraftDefaults — an old persisted draft never crashes new code", () => {
  it("fills every field a pre-schema draft was missing", () => {
    // The exact shape observed in a production localStorage that crashed the Review step.
    const old = { title: "Straight Cotton Kurti — Rose", price: 349, category: "kurtis" as const };
    const d = withDraftDefaults(old);

    expect(d.title).toBe("Straight Cotton Kurti — Rose");
    expect(d.price).toBe(349);
    expect(d.category).toBe("kurtis");
    // The fields that were undefined and blew up ReviewStep — now present strings/numbers.
    expect(typeof d.sku).toBe("string");
    expect(typeof d.description).toBe("string");
    expect(typeof d.mrp).toBe("number");
    expect(typeof d.stock).toBe("number");
    // And the exact call that crashed must not throw.
    expect(() => d.sku.trim()).not.toThrow();
    expect(() => d.description.trim()).not.toThrow();
  });

  it("returns a full default draft for undefined", () => {
    const d = withDraftDefaults(undefined);
    expect(Object.keys(d).sort()).toEqual(
      ["category", "description", "mrp", "price", "sku", "stock", "title"],
    );
  });

  it("keeps values the persisted draft did supply", () => {
    const d = withDraftDefaults({ sku: "KURTI-1", stock: 5 });
    expect(d.sku).toBe("KURTI-1");
    expect(d.stock).toBe(5);
    expect(d.title).toBe(""); // untouched fields fall back to the default
  });
});
