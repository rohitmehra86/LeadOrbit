/**
 * Capture Wave 5/6 demo screenshots into /cursor/stores/self/media/
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.LEADORBIT_BASE_URL || "http://127.0.0.1:43127";
const OUT = "/cursor/stores/self/media";
mkdirSync(OUT, { recursive: true });

const email = `wave6-shot-${Date.now()}@example.com`;
const password = "TestPass123!";

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

async function shot(name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
}

try {
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="fullName"]').fill("Wave6 Demo");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /Create|Sign up|Create account/i }).click();
  await page.waitForURL(/\/app/, { timeout: 25000 });

  // Create org via API with session cookies (more reliable than form click races)
  const org = await page.evaluate(async () => {
    const res = await fetch("/api/v1/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `Wave6 Org ${Date.now()}`,
        orgType: "agency",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.title || "org create failed");
    return data.item;
  });
  const orgId = org.id;
  console.log("org", orgId);

  await page.goto(`${BASE}/app/orgs/${orgId}/billing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot("wave5-billing-pending.png");

  await page.goto(`${BASE}/platform`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const usageTab = page.getByRole("button", { name: "Usage" });
  if (await usageTab.count()) await usageTab.click();
  await shot("wave5-platform-admin.png");

  // Try platform growth activate for white-label
  await page.goto(`${BASE}/app/orgs/${orgId}/billing`, { waitUntil: "networkidle" });
  const platformBtn = page.getByRole("button", { name: /Growth|Platform/i });
  if (await platformBtn.count()) {
    await platformBtn.first().click();
    await page.waitForTimeout(800);
  }

  await page.goto(`${BASE}/app/orgs/${orgId}/white-label`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot("wave5-white-label.png");

  await page.goto(`${BASE}/app/orgs/${orgId}/developers`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot("wave6-developers-webhooks.png");

  await page.goto(`${BASE}/app/orgs/${orgId}/marketplace`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot("wave6-marketplace.png");
} catch (err) {
  console.error("screenshot script error", err);
  await shot("wave6-screenshot-error.png");
  process.exitCode = 1;
} finally {
  await browser.close();
}
