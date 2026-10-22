import { test, expect } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync } from "fs";

const media = "/cursor/stores/self/media";
const artifacts = "/opt/cursor/artifacts";

test("meta ai launch screenshots", async ({ page }) => {
  mkdirSync(media, { recursive: true });
  if (existsSync("/opt/cursor")) mkdirSync(artifacts, { recursive: true });

  const email = `meta-ai-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.locator('input[name="fullName"]').fill("Meta Tester");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("password123");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/app/, { timeout: 30000 });

  await page.locator('input[name="name"]').fill(`Meta Launch Demo ${Date.now()}`);
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/app\/orgs\/[^/]+/, { timeout: 30000 });
  const orgId = page.url().match(/\/orgs\/([^/]+)/)?.[1];

  await page.goto(`/app/orgs/${orgId}/marketing`);
  await expect(page.getByRole("heading", { name: /Launch Pack/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Launch with Meta \(AI\)/i })).toBeVisible();
  await expect(page.getByText("Connect Meta")).toHaveCount(0);

  const p1 = `${media}/meta-ai-launch-01-simple-cta.png`;
  await page.screenshot({ path: p1, fullPage: false });

  await page.getByRole("button", { name: /Launch with Meta \(AI\)/i }).click();
  await page.locator('input[name="businessOrOffer"]').fill("Condo leads Whitefield");
  await page.locator('input[name="geo"]').fill("Bangalore");
  await page.locator('input[name="budgetAmount"]').fill("25");
  await page.locator('input[name="audienceBasics"]').fill("Home buyers 28-45");
  await page.getByRole("button", { name: /Propose Meta plan/i }).click();
  await expect(page.getByText(/needs approval/i)).toBeVisible({ timeout: 30000 });
  const p2 = `${media}/meta-ai-launch-02-plan-review.png`;
  await page.screenshot({ path: p2, fullPage: false });

  await page.getByRole("button", { name: /Approve Meta launch/i }).click();
  await expect(page.getByText(/pending_configuration/i).first()).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByText(/Draft saved|credentials missing|META_ADS/i).first(),
  ).toBeVisible();
  const p3 = `${media}/meta-ai-launch-03-pending-result.png`;
  await page.locator(".lo-meta-wizard").screenshot({ path: p3 });

  await page.getByRole("button", { name: /^Done$/i }).click();
  await page.getByRole("button", { name: /Show advanced tools/i }).click();
  await expect(page.getByText("Connect Meta")).toBeVisible();
  const p4 = `${media}/meta-ai-launch-04-connect-advanced.png`;
  await page.screenshot({ path: p4, fullPage: true });

  for (const f of [p1, p2, p3, p4]) {
    if (existsSync("/opt/cursor")) copyFileSync(f, `${artifacts}/${f.split("/").pop()}`);
  }
});
