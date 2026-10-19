import assert from "node:assert/strict";
import { test } from "node:test";
import { computeSlaState, pickAssignee } from "./crm";

const agents = [
  {
    userId: "u1",
    openLeads: 5,
    openTasks: 1,
    available: true,
    territories: ["west"],
  },
  {
    userId: "u2",
    openLeads: 1,
    openTasks: 0,
    available: true,
    territories: ["east"],
  },
  {
    userId: "u3",
    openLeads: 0,
    openTasks: 0,
    available: false,
    territories: ["east"],
  },
];

test("round_robin advances cursor", () => {
  const a = pickAssignee({
    strategy: "round_robin",
    agents,
    lead: {},
    ruleConfig: { userIds: ["u1", "u2"], roundRobinCursor: 0 },
  });
  assert.equal(a.userId, "u1");
  assert.equal(a.nextCursor, 1);
  const b = pickAssignee({
    strategy: "round_robin",
    agents,
    lead: {},
    ruleConfig: { userIds: ["u1", "u2"], roundRobinCursor: 1 },
  });
  assert.equal(b.userId, "u2");
});

test("workload_based picks lightest load among available", () => {
  const r = pickAssignee({
    strategy: "workload_based",
    agents,
    lead: {},
    ruleConfig: {},
  });
  assert.equal(r.userId, "u2");
});

test("territory_based maps territory", () => {
  const r = pickAssignee({
    strategy: "territory_based",
    agents,
    lead: { territory: "east" },
    ruleConfig: { territories: { east: "u2", west: "u1" } },
  });
  assert.equal(r.userId, "u2");
});

test("rules_based matches source", () => {
  const r = pickAssignee({
    strategy: "rules_based",
    agents,
    lead: { source: "meta-ads" },
    ruleConfig: {
      rules: [
        { field: "source", op: "contains", value: "meta", assignToUserId: "u1" },
      ],
    },
  });
  assert.equal(r.userId, "u1");
});

test("computeSlaState", () => {
  assert.equal(computeSlaState(null), "ok");
  assert.equal(
    computeSlaState(new Date(Date.now() - 1000).toISOString()),
    "breached",
  );
});
