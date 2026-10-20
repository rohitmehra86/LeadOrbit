import { test, expect } from "@playwright/test";

/**
 * Local AUTH_MODE=local smoke for AI shell.
 * Supabase staging E2E is blocked without Vercel redeploy + session in this agent.
 */
test.describe("AI shell (local)", () => {
  test("signup → org → assistant shows ink shell + starters", async ({ page }) => {
    const email = `e2e-assist-${Date.now()}@example.com`;
    await page.goto("/signup");
    await page.locator('input[name="fullName"]').fill("Assist Tester");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("password123");
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL(/\/app/, { timeout: 20_000 });

    await page.locator('input[name="name"]').fill(`Assist Org ${Date.now()}`);
    await page.getByRole("button", { name: /create/i }).click();
    // create-org redirects straight to /assistant
    await page.waitForURL(/\/app\/orgs\/[^/]+\/assistant/, { timeout: 20_000 });

    await expect(page.getByRole("heading", { name: /ai assistant/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /launch a campaign for condo leads/i }),
    ).toBeVisible();
  });
});
