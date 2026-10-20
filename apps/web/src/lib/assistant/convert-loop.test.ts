import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { getLocalTenancyStore } from "@leadorbit/db";
import { runAssistantChat } from "./execute";
import { getDomainCrm } from "@/lib/tenancy/crm";

describe("convert loop via assistant (local)", () => {
  let actorId = "";
  let orgId = "";
  let leadId = "";

  before(async () => {
    const tenancy = getLocalTenancyStore();
    const user = await tenancy.signUp({
      email: `convert-${Date.now()}@example.com`,
      password: "TestPass123!",
      fullName: "Convert Tester",
    });
    actorId = user.id;
    const org = await tenancy.createOrganization(user, { name: "Convert Co" });
    orgId = org.id;
    const lead = await getDomainCrm().createLead(user, orgId, {
      fullName: "Asha Patel",
      email: `asha-${Date.now()}@example.com`,
      source: "form",
      territory: "Bangalore",
    });
    leadId = lead.id;
  });

  it("qualifies, creates follow-up, and books appointment with approvals", async () => {
    const actor = (await getLocalTenancyStore().getUser(actorId))!;

    const q = await runAssistantChat(actor, orgId, {
      message: `Qualify lead ${leadId}: budget 1.2 Cr in Bangalore timeline 2 months for a 3BHK`,
    });
    assert.equal(q.status, "executed");
    assert.ok(q.results[0]?.ok);

    const lead = await getDomainCrm().getLead(actor, orgId, leadId);
    assert.ok((lead.score ?? 0) >= 45);

    const followPlan = await runAssistantChat(actor, orgId, {
      message: `Create follow-up task for lead ${leadId}`,
    });
    assert.equal(followPlan.status, "needs_approval");
    const follow = await runAssistantChat(actor, orgId, {
      message: `Create follow-up task for lead ${leadId}`,
      approve: true,
    });
    assert.equal(follow.status, "executed");
    assert.ok(follow.results.some((r) => r.tool === "create_follow_up_task" && r.ok));

    const bookPlan = await runAssistantChat(actor, orgId, {
      message: `Book meeting for lead ${leadId}`,
    });
    assert.equal(bookPlan.status, "needs_approval");
    const booked = await runAssistantChat(actor, orgId, {
      message: `Book meeting for lead ${leadId}`,
      approve: true,
    });
    assert.equal(booked.status, "executed");
    assert.ok(booked.results.some((r) => r.tool === "book_appointment" && r.ok));
  });
});
