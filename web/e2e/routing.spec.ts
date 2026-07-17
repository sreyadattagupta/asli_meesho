import { test, expect, type Page } from "@playwright/test";

// Act as a persona via the gated test bypass (cookie read by middleware + getSessionUser).
async function asRole(page: Page, role: "seller" | "buyer" | "admin") {
  await page.context().addCookies([
    { name: "x-test-role", value: role, domain: "localhost", path: "/" },
  ]);
}

test.describe("legacy URLs still work", () => {
  // Every one of these shipped: the CLAUDE.md demo script, the deployed links, and any bookmark a
  // judge made. They must land, not 404.
  const REDIRECTS: [string, string, "seller" | "buyer" | "admin"][] = [
    ["/sell", "/seller/create-listing", "seller"],
    ["/seller", "/seller/dashboard", "seller"],
    ["/seller/products", "/seller/listings", "seller"],
    ["/shop", "/buyer/dashboard", "buyer"],
    ["/admin", "/admin/dashboard", "admin"],
    ["/admin/queue", "/admin/review", "admin"],
  ];

  for (const [from, to, role] of REDIRECTS) {
    test(`${from} → ${to}`, async ({ page }) => {
      await asRole(page, role);
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to.replace(/\//g, "\\/")}$`));
    });
  }
});

test.describe("role-based routing", () => {
  test("a seller signing in lands on the seller dashboard, not a demo page", async ({ page }) => {
    await asRole(page, "seller");
    await page.goto("/seller/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    // The agents must be idle: arriving as a seller starts nothing.
    await expect(page.getByText(/Trigger — not a verdict/i)).toHaveCount(0);
  });

  test("refreshing keeps the seller on the dashboard", async ({ page }) => {
    await asRole(page, "seller");
    await page.goto("/seller/dashboard");
    await page.reload();
    await expect(page).toHaveURL(/\/seller\/dashboard$/);
  });

  test("an authenticated seller is bounced off /login", async ({ page }) => {
    await asRole(page, "seller");
    await page.goto("/login");
    await expect(page).toHaveURL(/\/seller\/dashboard$/);
  });

  test("a buyer cannot open the seller portal", async ({ page }) => {
    await asRole(page, "buyer");
    await page.goto("/seller/listings");
    await expect(page).toHaveURL(/\/buyer\/dashboard$/);
  });

  test("a seller cannot open the admin console", async ({ page }) => {
    await asRole(page, "seller");
    await page.goto("/admin/review");
    await expect(page).toHaveURL(/\/seller\/dashboard$/);
  });

  test("the storefront stays public for a signed-out visitor", async ({ page }) => {
    await page.goto("/buyer/dashboard");
    await expect(page.getByRole("heading", { name: "Shop" })).toBeVisible();
  });
});

test.describe("seller navigation", () => {
  test.beforeEach(async ({ page }) => asRole(page, "seller"));

  // Spec §2: every nav item routes somewhere real. A 404 or a blank shell fails this.
  const ITEMS = [
    ["Dashboard", "/seller/dashboard"],
    ["My Listings", "/seller/listings"],
    ["Create Listing", "/seller/create-listing"],
    ["Orders", "/seller/orders"],
    ["Analytics", "/seller/analytics"],
    ["Messages", "/seller/messages"],
    ["Profile", "/seller/profile"],
    ["Settings", "/seller/settings"],
  ] as const;

  for (const [label, href] of ITEMS) {
    test(`${label} routes to a real page`, async ({ page }) => {
      await page.goto("/seller/dashboard");
      await page.locator(`nav[aria-label="seller navigation"] a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${href.replace(/\//g, "\\/")}$`));
      // The nav highlights where you actually are.
      await expect(
        page.locator(`nav[aria-label="seller navigation"] a[href="${href}"]`),
      ).toHaveAttribute("aria-current", "page");
    });
  }

  test("the wizard opens on Upload and starts no agent until asked", async ({ page }) => {
    await page.goto("/seller/create-listing");
    await expect(page.getByRole("heading", { name: /Upload your catalog photo/i })).toBeVisible();
    // Agent 1 has a button; it does not fire on arrival.
    await expect(page.getByRole("button", { name: /image check/i })).toBeDisabled();
  });
});
