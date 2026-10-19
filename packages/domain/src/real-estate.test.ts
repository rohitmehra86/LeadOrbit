import assert from "node:assert/strict";
import { test } from "node:test";
import { rankUnitMatches, scoreUnitMatch } from "./real-estate";
import { listIndustryTemplates, getIndustryTemplate } from "./industry-templates";

test("scoreUnitMatch filters budget location BHK", () => {
  const unit = {
    price: 5_000_000,
    bhk: 3,
    status: "available" as const,
    amenities: ["pool", "gym"],
  };
  const project = { location: "Andheri West", city: "Mumbai" };
  const ok = scoreUnitMatch(unit, project, {
    budgetMax: 6_000_000,
    locations: ["mumbai"],
    bhk: 3,
    amenities: ["gym"],
  });
  assert.equal(ok.eligible, true);
  assert.ok(ok.score >= 70);

  const over = scoreUnitMatch(unit, project, { budgetMax: 1_000_000 });
  assert.equal(over.eligible, false);

  const wrongBhk = scoreUnitMatch(unit, project, { bhkMin: 4 });
  assert.equal(wrongBhk.eligible, false);
});

test("sold units are not eligible", () => {
  const r = scoreUnitMatch(
    { price: 100, bhk: 2, status: "sold", amenities: [] },
    { location: "Pune", city: "Pune" },
    { bhk: 2 },
  );
  assert.equal(r.eligible, false);
});

test("rankUnitMatches sorts by score", () => {
  const ranked = rankUnitMatches([
    {
      unit: {} as never,
      projectName: "A",
      location: "x",
      city: "y",
      score: 40,
      reasons: [],
    },
    {
      unit: {} as never,
      projectName: "B",
      location: "x",
      city: "y",
      score: 90,
      reasons: [],
    },
  ]);
  assert.equal(ranked[0]!.score, 90);
});

test("industry templates include real estate ready and others scaffold", () => {
  const all = listIndustryTemplates();
  assert.ok(all.length >= 4);
  assert.equal(getIndustryTemplate("real_estate")?.status, "ready");
  assert.equal(getIndustryTemplate("education")?.status, "scaffold");
  assert.equal(getIndustryTemplate("automotive")?.status, "scaffold");
  assert.equal(getIndustryTemplate("service_business")?.status, "scaffold");
});
