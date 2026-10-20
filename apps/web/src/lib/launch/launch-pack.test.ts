import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { getLocalTenancyStore } from "@leadorbit/db";
import { createLaunchPack, publishLaunchPack } from "./launch-pack";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { getCrmStore } from "@/lib/tenancy/crm";

describe("launch pack E2E slice", () => {
  let userId = "";
  let orgId = "";

  before(async () => {
    const tenancy = getLocalTenancyStore();
    const user = await tenancy.signUp({
      email: `launch-${Date.now()}@example.com`,
      password: "TestPass123!",
      fullName: "Launch Tester",
    });
    userId = user.id;
    const org = await tenancy.createOrganization(user, { name: "Launch Co" });
    orgId = org.id;
  });

  it("creates, publishes, and accepts a public form submission into CRM", async () => {
    const actor = (await getLocalTenancyStore().getUser(userId))!;
    const pack = await createLaunchPack(actor, orgId, {
      goal: "Get condo leads in Bangalore this month",
      location: "Bangalore",
    });
    assert.ok(pack.campaignId);
    assert.ok(pack.formId);
    assert.equal(pack.published, false);

    const published = await publishLaunchPack(actor, orgId, pack);
    assert.equal(published.published, true);

    const campaigns = getCampaignStore();
    const form = campaigns.getPublishedForm(orgId, pack.formId);
    assert.ok(form);

    const email = `priya-${Date.now()}@example.com`;
    const submission = await campaigns.submitFormPublic({
      orgId,
      formId: pack.formId,
      payload: {
        fullName: "Priya Nair",
        email,
        phone: "+919876543210",
        budget: "$1M+",
        consent: true,
      },
      campaignId: pack.campaignId,
      utm: { utmSource: "test", utmMedium: "e2e", utmCampaign: "launch" },
    });
    assert.ok(submission.leadId);

    const lead = await getCrmStore().getLead(actor, orgId, submission.leadId!);
    assert.equal(lead.email, email);
    assert.ok(lead.id);
  });
});
