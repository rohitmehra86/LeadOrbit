import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getAssistantTool,
  planAssistantIntent,
} from "./assistant";

describe("assistant planner", () => {
  it("plans launch pack for lead gen goals", () => {
    const plan = planAssistantIntent({
      message: "Get condo leads in Bangalore this month",
    });
    assert.equal(plan.steps[0]?.tool, "create_launch_pack");
    assert.equal(plan.requiresApproval, true);
    assert.equal(plan.needsClarification, null);
  });

  it("plans results summary", () => {
    const plan = planAssistantIntent({ message: "How are my results this week?" });
    assert.equal(plan.steps[0]?.tool, "get_results_summary");
    assert.equal(plan.requiresApproval, false);
  });

  it("asks for clarification on empty intent", () => {
    const plan = planAssistantIntent({ message: "hi" });
    assert.ok(plan.needsClarification);
    assert.equal(plan.steps.length, 0);
  });

  it("marks publish tools as approval-required", () => {
    const tool = getAssistantTool("publish_launch_pack");
    assert.ok(tool);
    assert.equal(tool.requiresApproval, true);
    assert.equal(tool.risk, "publish");
  });

  it("plans appointment booking with approval", () => {
    const plan = planAssistantIntent({
      message: "Book meeting for lead 11111111-1111-1111-1111-111111111111",
    });
    assert.equal(plan.steps[0]?.tool, "book_appointment");
    assert.equal(plan.requiresApproval, true);
  });

  it("plans Meta AI launch prepare without spend approval", () => {
    const plan = planAssistantIntent({
      message: "Launch Meta ads for solar kits in Mumbai, $40/day",
    });
    assert.equal(plan.steps[0]?.tool, "prepare_meta_ai_launch");
    assert.equal(plan.requiresApproval, false);
    assert.equal(plan.steps[0]?.args.geo, "Mumbai");
  });

  it("plans Meta approve gate when pending plan exists", () => {
    const plan = planAssistantIntent({
      message: "approve",
      hasPendingMetaPlan: true,
    });
    assert.equal(plan.steps[0]?.tool, "approve_meta_ai_launch");
    assert.equal(plan.requiresApproval, true);
    const tool = getAssistantTool("approve_meta_ai_launch");
    assert.ok(tool);
    assert.equal(tool.risk, "spend");
  });
});
