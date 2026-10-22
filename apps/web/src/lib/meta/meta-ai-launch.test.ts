import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertMetaLaunchApproved,
  buildMetaLaunchPlan,
  metaAdsCredentialStatus,
  publishMetaLaunchPlan,
} from "@leadorbit/domain";

describe("meta AI launch gate (web)", () => {
  it("plan → approval required → pending without token (no fake live)", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "Test offer",
      geo: "Bangalore",
      budgetAmount: 20,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
    });
    assert.throws(() => assertMetaLaunchApproved(false), /approval/i);
    assertMetaLaunchApproved(true);
    const status = metaAdsCredentialStatus({});
    assert.equal(status.status, "pending_configuration");
    const result = await publishMetaLaunchPlan(plan, {});
    assert.equal(result.status, "pending_configuration");
    assert.equal(result.external, undefined);
    assert.match(result.detail, /draft|credentials|META_ADS/i);
    assert.ok(!/live|ACTIVE/i.test(result.detail) || /never|not/i.test(result.detail));
  });
});
