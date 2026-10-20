import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getMarketplacePack,
  listMarketplacePacks,
  marketplaceCoverageGaps,
} from "./marketplace";

test("marketplace lists published and scaffold packs", () => {
  const all = listMarketplacePacks({ includeScaffold: true });
  assert.ok(all.length >= 4);
  assert.ok(all.some((p) => p.slug === "general-lead-gen"));
  assert.ok(all.some((p) => p.industry === "real_estate"));
});

test("getMarketplacePack by slug", () => {
  const pack = getMarketplacePack("real-estate-site-visit");
  assert.ok(pack);
  assert.equal(pack?.status, "published");
  assert.match(pack!.defaultGoal, /site visit/i);
});

test("every industry template has marketplace coverage", () => {
  assert.deepEqual(marketplaceCoverageGaps(), []);
});
