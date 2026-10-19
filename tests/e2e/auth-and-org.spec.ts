import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("LeadOrbit M11 e2e", () => {
  test("signup → create org → open analytics/billing", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    await page.goto("/signup");
    await page.locator('input[name="fullName"]').fill("E2E Tester");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("password123");
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL(/\/app/, { timeout: 20_000 });

    await page.locator('input[name="name"]').fill(`E2E Org ${Date.now()}`);
    await page.getByRole("button", { name: /create/i }).click();
    await page.waitForURL(/\/app\/orgs\/[a-f0-9-]+/, { timeout: 20_000 });

    const orgUrl = page.url();
    await page.goto(`${orgUrl}/analytics`);
    await expect(page.getByRole("heading", { name: /analytics/i })).toBeVisible();
    await expect(page.getByText(/ok|zero|unavailable/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`${orgUrl}/billing`);
    await expect(page.getByRole("heading", { name: /billing/i })).toBeVisible();
    await expect(
      page.getByText(/pending_configuration|trialing|trial/i).first(),
    ).toBeVisible();
  });

  test("login page accessibility smoke (axe)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const blocking = results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    );
    if (blocking.length) {
      console.log(
        "a11y blocking:",
        blocking.map((v) => `${v.id}: ${v.help}`).join("; "),
      );
    }
    expect(blocking, blocking.map((v) => v.id).join(", ")).toEqual([]);
  });

  test("health API version is 0.12.x", async ({ request }) => {
    const res = await request.get("/api/v1/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.version).toMatch(/^0\.12\.0-/);
  });
});
