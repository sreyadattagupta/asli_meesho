// safeReturnTo is what stands between `?returnTo=` and router.push(). Two things it has to stop:
// an off-site redirect, and a redirect into a portal the account cannot open (which the guard would
// bounce straight back, looping the user through login).
import { describe, it, expect } from "vitest";
import { safeReturnTo, ownsPath, ROLE_HOME } from "./roles";

describe("safeReturnTo", () => {
  it("keeps a path the role owns", () => {
    expect(safeReturnTo("/seller/listings", "seller")).toBe("/seller/listings");
  });

  it("keeps the query string on an owned path", () => {
    expect(safeReturnTo("/seller/create-listing?listing=abc", "seller")).toBe(
      "/seller/create-listing?listing=abc",
    );
  });

  it("sends a seller aimed at a buyer page to their own home", () => {
    expect(safeReturnTo("/buyer/orders", "seller")).toBe(ROLE_HOME.seller);
  });

  it("sends a buyer aimed at the admin console to their own home", () => {
    expect(safeReturnTo("/admin/review", "buyer")).toBe(ROLE_HOME.buyer);
  });

  it("falls back to home when there is no returnTo", () => {
    expect(safeReturnTo(null, "seller")).toBe(ROLE_HOME.seller);
    expect(safeReturnTo(undefined, "admin")).toBe(ROLE_HOME.admin);
    expect(safeReturnTo("", "buyer")).toBe(ROLE_HOME.buyer);
  });

  it("refuses a protocol-relative URL", () => {
    // "//evil.com" is a valid absolute URL to the browser — the classic open-redirect payload.
    expect(safeReturnTo("//evil.com", "seller")).toBe(ROLE_HOME.seller);
  });

  it("refuses an absolute off-site URL", () => {
    expect(safeReturnTo("https://evil.com/steal", "seller")).toBe(ROLE_HOME.seller);
  });

  it("allows a shared page nobody owns", () => {
    expect(safeReturnTo("/onboarding", "seller")).toBe("/onboarding");
  });
});

describe("ownsPath", () => {
  it("matches on segment boundaries, not raw prefixes", () => {
    // "/sellers-guide" starts with "/seller" but is not the seller portal.
    expect(ownsPath("buyer", "/sellers-guide")).toBe(true); // unowned ⇒ shared
    expect(ownsPath("buyer", "/seller/dashboard")).toBe(false);
  });

  it("treats the bare portal root as owned", () => {
    expect(ownsPath("seller", "/seller")).toBe(true);
    expect(ownsPath("buyer", "/seller")).toBe(false);
  });
});
