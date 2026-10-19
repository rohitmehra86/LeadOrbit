import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultLeadCreatedWorkflow,
  evaluateBranch,
  nextNodes,
  workflowStepRetryDelayMs,
} from "./workflows";

test("default workflow graph walks trigger → actions", () => {
  const g = defaultLeadCreatedWorkflow();
  const trigger = g.nodes.find((n) => n.kind === "trigger")!;
  const first = nextNodes(g, trigger.id);
  assert.equal(first[0]?.type, "assign");
  const second = nextNodes(g, first[0]!.id);
  assert.equal(second[0]?.type, "tag");
});

test("evaluateBranch ops", () => {
  assert.equal(
    evaluateBranch({ field: "score", op: "gt", value: 50 }, { score: 80 }),
    "true",
  );
  assert.equal(
    evaluateBranch({ field: "status", op: "eq", value: "new" }, { status: "old" }),
    "false",
  );
});

test("workflowStepRetryDelayMs dead-letters after 3", () => {
  assert.ok(workflowStepRetryDelayMs(0)! > 0);
  assert.ok(workflowStepRetryDelayMs(1)! > 0);
  assert.equal(workflowStepRetryDelayMs(3), null);
});
