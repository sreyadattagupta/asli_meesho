import { describe, expect, it } from "vitest";
import { translate } from "../i18n";

describe("i18n", () => {
  it("returns hindi when present", () => {
    expect(translate("hi", "nav.signin")).toBe("साइन इन");
  });
  it("falls back to english for missing hindi keys", () => {
    expect(translate("hi", "app.tagline")).toBe(translate("en", "app.tagline"));
  });
});
