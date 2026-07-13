import { describe, expect, it } from "vitest";
import { translate } from "../i18n";

describe("i18n", () => {
  it("returns hindi when present", () => {
    expect(translate("hi", "nav.signin")).toBe("साइन इन");
  });
  it("falls back to english for missing hindi keys", () => {
    expect(translate("hi", "app.tagline")).toBe(translate("en", "app.tagline"));
  });
  it("fills {name} placeholders from vars in both locales", () => {
    expect(translate("en", "flow.trigger.headlineSeen", { n: 4 })).toBe(
      "This photo appears on 4 places online",
    );
    expect(translate("hi", "flow.challenge.expiresIn", { s: 42 })).toContain("42");
  });
  it("leaves unknown placeholders intact", () => {
    expect(translate("en", "flow.trigger.headlineSeen", {})).toContain("{n}");
  });
});
