import { test, expect, type Page } from "@playwright/test";

// Act as a persona via the gated test bypass (cookie read by middleware + getSessionUser).
async function asRole(page: Page, role: "seller" | "buyer" | "admin") {
  await page.context().addCookies([
    { name: "x-test-role", value: role, domain: "localhost", path: "/" },
  ]);
}

test.describe("Buyer marketplace", () => {
  test.beforeEach(async ({ page }) => asRole(page, "buyer"));

  test("verified-first shop → product detail → explainable trust panel", async ({ page }) => {
    await page.goto("/buyer/dashboard");
    await expect(page.getByRole("heading", { name: "Shop" })).toBeVisible();
    // A verified listing card is present.
    await expect(page.getByText("✓ Asli Verified").first()).toBeVisible();

    // Open the first product.
    await page.locator("a[href^='/buyer/listings/']").first().click();
    await page.waitForURL(/\/buyer\/listings\/[0-9a-f-]{36}/);
    await expect(page.getByRole("link", { name: /Buy now/i })).toBeVisible();

    // Expand "Why you can trust this" → Unified Decision Engine verdict.
    await page.getByRole("button", { name: /Why you can trust this/i }).click();
    await expect(page.getByText(/Unified Decision Engine/i)).toBeVisible();
    await expect(page.getByText(/Possession proven/i).first()).toBeVisible();
  });
});

test.describe("Admin — Trust & Safety", () => {
  test.beforeEach(async ({ page }) => asRole(page, "admin"));

  test("dashboard tiles render", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page.getByText("Listings verified")).toBeVisible();
    await expect(page.getByText("Thieves blocked")).toBeVisible();
    await expect(page.getByText(/Agent monitor/i)).toBeVisible();
  });

  test("review queue → approve removes the item", async ({ page }) => {
    await page.goto("/admin/review");
    const items = page.locator("ul > li");
    // Wait for the client-side queue fetch to render before counting (avoids the loading race).
    await expect(items.first()).toBeVisible();
    const before = await items.count();
    expect(before).toBeGreaterThan(0);

    await items.first().locator("button").click();
    await page.locator("textarea#note").fill("Verified manually in the E2E run.");
    await page.getByRole("button", { name: /Approve/i }).click();

    // The approved item disappears from the queue (optimistic update).
    await expect(items).toHaveCount(before - 1);
  });
});

test.describe("Seller flow", () => {
  test.beforeEach(async ({ page }) => asRole(page, "seller"));

  test("upload → image-check TRIGGER (never a verdict)", async ({ page }) => {
    await page.goto("/seller/create-listing");
    await expect(page.getByText(/Upload/i).first()).toBeVisible();

    // Use the demo catalog photo, then run the image check.
    await page.getByRole("button", { name: /demo catalog/i }).click();
    await page.getByRole("button", { name: /image check/i }).click();

    // TRIGGER, not a verdict (invariant #1) — and it must never auto-block.
    await expect(page.getByText(/Trigger — not a verdict/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /get today's code|prove possession/i })).toBeVisible();
  });
});
