"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  WorkflowAuditEntry,
  WorkflowDefinition,
  WorkflowEnrollment,
  WorkflowGraph,
  WorkflowNode,
} from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type Props = {
  orgId: string;
  workflows: WorkflowDefinition[];
  enrollments: WorkflowEnrollment[];
  audit: WorkflowAuditEntry[];
};

export function WorkflowBuilder(props: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(props.workflows[0]?.id ?? "");
  const selected = useMemo(
    () => props.workflows.find((w) => w.id === selectedId) ?? props.workflows[0] ?? null,
    [props.workflows, selectedId],
  );
  const [graph, setGraph] = useState<WorkflowGraph | null>(
    selected?.graph ?? null,
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [steps, setSteps] = useState<
    Array<{ nodeId: string; status: string; attempt: number; error: string | null }>
  >([]);
  const [note, setNote] = useState<string | null>(null);

  function sync(wf: WorkflowDefinition | null) {
    setSelectedId(wf?.id ?? "");
    setGraph(wf?.graph ?? null);
    setSteps([]);
  }

  async function createWorkflow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        template: "lead_created",
        testMode: fd.get("testMode") === "on",
      }),
    });
    const data = (await res.json()) as { item: WorkflowDefinition };
    sync(data.item);
    e.currentTarget.reset();
    router.refresh();
  }

  async function saveGraph() {
    if (!selected || !graph) return;
    const res = await fetch(
      `/api/v1/orgs/${props.orgId}/workflows/${selected.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ graph }),
      },
    );
    if (!res.ok) {
      setNote(await res.text());
      return;
    }
    setNote("Draft saved (version bumped)");
    router.refresh();
  }

  async function publish() {
    if (!selected) return;
    await saveGraph();
    const res = await fetch(
      `/api/v1/orgs/${props.orgId}/workflows/${selected.id}/publish`,
      { method: "POST" },
    );
    setNote(res.ok ? "Published — worker will execute enrollments" : await res.text());
    router.refresh();
  }

  async function enrollTest() {
    if (!selected) return;
    const res = await fetch(
      `/api/v1/orgs/${props.orgId}/workflows/${selected.id}/enroll`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          testMode: true,
          context: { email: "test@example.com" },
          idempotencyKey: `ui-test:${Date.now()}`,
        }),
      },
    );
    const data = (await res.json()) as {
      enrollment: WorkflowEnrollment;
      jobId: string;
    };
    setNote(`Enqueued tick job ${data.jobId} for enrollment ${data.enrollment.id}`);
    router.refresh();
  }

  async function loadSteps(enrollmentId: string) {
    const res = await fetch(
      `/api/v1/orgs/${props.orgId}/workflows/enrollments/${enrollmentId}/steps`,
    );
    const data = (await res.json()) as { items: typeof steps };
    setSteps(data.items);
  }

  async function setEnrollmentStatus(
    enrollmentId: string,
    status: "paused" | "active" | "canceled",
  ) {
    await fetch(
      `/api/v1/orgs/${props.orgId}/workflows/enrollments/${enrollmentId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    router.refresh();
  }

  function onDrop(targetId: string) {
    if (!graph || !dragId || dragId === targetId) return;
    setGraph((g) => {
      if (!g) return g;
      const nodes = [...g.nodes];
      const from = nodes.findIndex((n) => n.id === dragId);
      const to = nodes.findIndex((n) => n.id === targetId);
      if (from < 0 || to < 0) return g;
      const [item] = nodes.splice(from, 1);
      nodes.splice(to, 0, item!);
      return {
        ...g,
        nodes: nodes.map((n, i) => ({
          ...n,
          position: { x: 80, y: 80 + i * 100 },
        })),
      };
    });
    setDragId(null);
  }

  function addAction(type: WorkflowNode["type"]) {
    if (!graph) return;
    const id = crypto.randomUUID();
    setGraph({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id,
          kind: "action",
          type,
          label: String(type),
          config: type === "wait" ? { delayMs: 5000 } : {},
          position: { x: 80, y: 80 + graph.nodes.length * 100 },
        },
      ],
      edges:
        graph.nodes.length > 0
          ? [
              ...graph.edges,
              {
                id: crypto.randomUUID(),
                from: graph.nodes[graph.nodes.length - 1]!.id,
                to: id,
              },
            ]
          : graph.edges,
    });
  }

  const enrollments = props.enrollments.filter(
    (e) => !selected || e.workflowId === selected.id,
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1.2fr_0.9fr]">
      <aside className="space-y-4">
        <form onSubmit={createWorkflow} className="grid gap-2">
          <input
            name="name"
            required
            placeholder="Workflow name"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          />
          <label className="text-xs text-[var(--lo-fg-muted)]">
            <input name="testMode" type="checkbox" defaultChecked /> Test mode
          </label>
          <Button type="submit">Create from lead template</Button>
        </form>
        <ul className="space-y-2 text-sm">
          {props.workflows.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => sync(w)}
                className={`w-full rounded-md border px-3 py-2 text-left ${
                  selected?.id === w.id
                    ? "border-[var(--lo-accent)]"
                    : "border-[var(--lo-border)]"
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span>{w.name}</span>
                  <Badge>{w.status}</Badge>
                </div>
                <span className="text-xs text-[var(--lo-fg-muted)]">
                  v{w.version}
                  {w.testMode ? " · test" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="space-y-3">
        {!selected || !graph ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">
            Create a workflow to open the visual builder.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "assign",
                  "tag",
                  "wait",
                  "branch",
                  "send_message",
                  "webhook",
                  "ai_qualify",
                  "escalate",
                ] as const
              ).map((t) => (
                <Button key={t} type="button" onClick={() => addAction(t)}>
                  + {t}
                </Button>
              ))}
            </div>
            <ul className="space-y-2">
              {graph.nodes.map((n) => (
                <li
                  key={n.id}
                  draggable
                  onDragStart={() => setDragId(n.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(n.id)}
                  className="cursor-grab rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-3 py-3"
                  style={{ marginLeft: Math.min(n.position.x / 4, 40) }}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      ⋮⋮ {n.label}{" "}
                      <span className="text-xs text-[var(--lo-fg-muted)]">
                        ({n.kind}/{n.type})
                      </span>
                    </span>
                    <Badge>{n.kind}</Badge>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={saveGraph}>
                Save draft
              </Button>
              <Button type="button" onClick={publish}>
                Publish
              </Button>
              <Button type="button" onClick={enrollTest}>
                Enroll (test / enqueue)
              </Button>
            </div>
            {note ? (
              <p className="text-xs text-[var(--lo-fg-muted)]">{note}</p>
            ) : null}
          </>
        )}
      </section>

      <aside className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Execution history</h2>
          {enrollments.length === 0 ? (
            <p className="text-sm text-[var(--lo-fg-muted)]">No enrollments yet.</p>
          ) : (
            enrollments.map((e) => (
              <div
                key={e.id}
                className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs">{e.id.slice(0, 8)}</span>
                  <Badge>{e.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => loadSteps(e.id)}>
                    Steps
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setEnrollmentStatus(e.id, "paused")}
                  >
                    Pause
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setEnrollmentStatus(e.id, "active")}
                  >
                    Resume
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setEnrollmentStatus(e.id, "canceled")}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ))
          )}
          {steps.length > 0 ? (
            <ul className="space-y-1 text-xs text-[var(--lo-fg-muted)]">
              {steps.map((s, i) => (
                <li key={i}>
                  {s.nodeId} · {s.status} · attempt {s.attempt}
                  {s.error ? ` · ${s.error}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Audit</h2>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-xs text-[var(--lo-fg-muted)]">
            {props.audit.map((a) => (
              <li key={a.id}>
                {a.createdAt} · {a.action}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
