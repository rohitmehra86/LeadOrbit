/**
 * Capture friend-demo walkthrough screenshots into /cursor/stores/self/media/
 * Requires running local server + .data/demo-seed.json (pnpm demo:seed).
 */
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.LEADORBIT_BASE_URL || "http://127.0.0.1:43127";
const OUT = "/cursor/stores/self/media";
const SEED_FILE = join(process.cwd(), ".data", "demo-seed.json");
mkdirSync(OUT, { recursive: true });

if (!existsSync(SEED_FILE)) {
  console.error("Missing .data/demo-seed.json — run pnpm demo:seed first");
  process.exit(1);
}
const seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));

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

async function login(email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /Log in|Sign in|Login/i }).click();
  await page.waitForURL(/\/app/, { timeout: 25000 });
}

async function setUxMode(mode) {
  // ModeSwitcher buttons typically labeled Simple / Advanced / Expert
  const btn = page.getByRole("button", { name: new RegExp(`^${mode}$`, "i") });
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(300);
  }
}

try {
  // --- Marketing persona ---
  await login(seed.marketing.email, seed.marketing.password);
  const mOrg = seed.marketing.orgId;

  await page.goto(`${BASE}/app/orgs/${mOrg}/marketing`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  await shot("demo-marketing-01-marketing.png");

  await page.goto(`${BASE}${seed.marketing.publicPath}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(400);
  await shot("demo-marketing-02-public-page.png");

  await page.goto(`${BASE}/app/orgs/${mOrg}/leads`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(400);
  await shot("demo-marketing-03-leads.png");

  await page.goto(`${BASE}/app/orgs/${mOrg}/results`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(400);
  await shot("demo-marketing-04-results.png");

  // --- Real estate persona ---
  await page.context().clearCookies();
  await login(seed.realEstate.email, seed.realEstate.password);
  const rOrg = seed.realEstate.orgId;

  await page.goto(`${BASE}/app/orgs/${rOrg}/assistant`, {
    waitUntil: "networkidle",
  });
  await setUxMode("Advanced");
  await page.waitForTimeout(400);
  await shot("demo-re-01-shell-advanced.png");

  await page.goto(`${BASE}/app/orgs/${rOrg}/real-estate`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(600);
  await shot("demo-re-02-inventory.png");

  await page.goto(`${BASE}/app/orgs/${rOrg}/leads`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(400);
  await shot("demo-re-03-leads.png");

  await page.goto(`${BASE}/app/orgs/${rOrg}/sales`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(400);
  await shot("demo-re-04-sales.png");
} catch (err) {
  console.error("demo screenshot error", err);
  await shot("demo-screenshot-error.png");
  process.exitCode = 1;
} finally {
  await browser.close();
}
