import type { Permission } from "./permissions";

/** Progressive disclosure modes — one product, three depths. */
export type UxMode = "simple" | "advanced" | "expert";

export const UX_MODES: readonly UxMode[] = ["simple", "advanced", "expert"] as const;

export type AssistantToolName =
  | "clarify_goal"
  | "list_leads"
  | "get_results_summary"
  | "qualify_lead"
  | "assign_lead"
  | "create_follow_up_task"
  | "book_appointment"
  | "create_launch_pack"
  | "publish_launch_pack";

export type AssistantRisk =
  | "read"
  | "write"
  | "publish"
  | "bulk"
  | "spend"
  | "appointment"
  | "billing"
  | "sensitive";

export type AssistantToolDef = {
  name: AssistantToolName;
  description: string;
  permission: Permission;
  risk: AssistantRisk;
  /** Consequential tools require explicit user approval before execute. */
  requiresApproval: boolean;
};

export const ASSISTANT_TOOLS: readonly AssistantToolDef[] = [
  {
    name: "clarify_goal",
    description: "Ask clarifying questions when the goal is ambiguous",
    permission: "org:read",
    risk: "read",
    requiresApproval: false,
  },
  {
    name: "list_leads",
    description: "List recent leads for the organization",
    permission: "crm:read",
    risk: "read",
    requiresApproval: false,
  },
  {
    name: "get_results_summary",
    description: "Summarize campaign and lead results",
    permission: "analytics:read",
    risk: "read",
    requiresApproval: false,
  },
  {
    name: "qualify_lead",
    description: "Run deterministic qualification and persist score on a lead",
    permission: "ai:run",
    risk: "write",
    requiresApproval: false,
  },
  {
    name: "assign_lead",
    description: "Assign a lead to a teammate (owner)",
    permission: "crm:assign",
    risk: "write",
    requiresApproval: true,
  },
  {
    name: "create_follow_up_task",
    description: "Create a follow-up CRM task for a lead",
    permission: "crm:write",
    risk: "write",
    requiresApproval: true,
  },
  {
    name: "book_appointment",
    description: "Book a meeting or site visit for a lead",
    permission: "appointments:write",
    risk: "appointment",
    requiresApproval: true,
  },
  {
    name: "create_launch_pack",
    description: "Draft campaign + form + landing page for a goal (unpublished)",
    permission: "campaigns:write",
    risk: "write",
    requiresApproval: true,
  },
  {
    name: "publish_launch_pack",
    description: "Publish form + landing page so public capture is live",
    permission: "pages:write",
    risk: "publish",
    requiresApproval: true,
  },
] as const;

export function getAssistantTool(name: string): AssistantToolDef | undefined {
  return ASSISTANT_TOOLS.find((t) => t.name === name);
}

export type AssistantPlanStep = {
  tool: AssistantToolName;
  args: Record<string, unknown>;
  reason: string;
};

export type AssistantPlan = {
  summary: string;
  steps: AssistantPlanStep[];
  needsClarification: string | null;
  requiresApproval: boolean;
};

export type AssistantToolResult = {
  tool: AssistantToolName;
  ok: boolean;
  detail: string;
  data?: Record<string, unknown>;
};

/**
 * Lightweight intent → plan (deterministic). LLM can replace this later when keyed.
 */
export function planAssistantIntent(input: {
  message: string;
  hasPendingPack?: boolean;
}): AssistantPlan {
  const text = input.message.trim();
  const lower = text.toLowerCase();

  if (!text || text.length < 3) {
    return {
      summary: "Need a clearer goal",
      steps: [],
      needsClarification:
        "What outcome do you want? Example: “Get condo leads in Bangalore this month.”",
      requiresApproval: false,
    };
  }

  if (/\b(result|analytics|how (are|is) (we|my)|dashboard|performance)\b/.test(lower)) {
    return {
      summary: "Show Results summary",
      steps: [{ tool: "get_results_summary", args: {}, reason: "User asked for performance" }],
      needsClarification: null,
      requiresApproval: false,
    };
  }

  if (/\b(list|show|recent)\b.*\bleads?\b|\bleads?\b.*\b(list|show|recent)\b/.test(lower)) {
    return {
      summary: "List recent leads",
      steps: [{ tool: "list_leads", args: { limit: 10 }, reason: "User asked to see leads" }],
      needsClarification: null,
      requiresApproval: false,
    };
  }

  if (/\bqualif/.test(lower)) {
    const leadId =
      text.match(/\blead\s+([0-9a-f-]{36})\b/i)?.[1] ??
      text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1] ??
      null;
    return {
      summary: "Qualify lead",
      steps: [
        {
          tool: "qualify_lead",
          args: { text, leadId },
          reason: "User asked to qualify a lead message",
        },
      ],
      needsClarification: null,
      requiresApproval: false,
    };
  }

  if (/\bassign\b/.test(lower) && /\blead\b/.test(lower)) {
    const leadId =
      text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1] ??
      null;
    if (!leadId) {
      return {
        summary: "Need lead id to assign",
        steps: [],
        needsClarification: "Which lead id should I assign, and to which user id?",
        requiresApproval: false,
      };
    }
    return {
      summary: "Assign lead",
      steps: [
        {
          tool: "assign_lead",
          args: { leadId, ownerUserId: null },
          reason: "User asked to assign a lead",
        },
      ],
      needsClarification: null,
      requiresApproval: true,
    };
  }

  if (/\b(follow[- ]?up|task)\b/.test(lower) && /\blead\b/.test(lower)) {
    const leadId =
      text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1] ??
      null;
    if (!leadId) {
      return {
        summary: "Need lead id for follow-up",
        steps: [],
        needsClarification: "Provide the lead id for the follow-up task.",
        requiresApproval: false,
      };
    }
    return {
      summary: "Create follow-up task",
      steps: [
        {
          tool: "create_follow_up_task",
          args: { leadId, title: "Follow up with lead", dueInHours: 24 },
          reason: "User asked for a follow-up task",
        },
      ],
      needsClarification: null,
      requiresApproval: true,
    };
  }

  if (/\b(book|schedule|appointment|site visit|meeting)\b/.test(lower)) {
    const leadId =
      text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1] ??
      null;
    if (!leadId) {
      return {
        summary: "Need lead id to book",
        steps: [],
        needsClarification:
          "Provide the lead id and preferred time (ISO). Example: book meeting for lead <uuid> tomorrow.",
        requiresApproval: false,
      };
    }
    const kind = /\bsite visit\b/.test(lower) ? "site_visit" : "meeting";
    return {
      summary: kind === "site_visit" ? "Book site visit" : "Book meeting",
      steps: [
        {
          tool: "book_appointment",
          args: {
            leadId,
            kind,
            startsAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            durationMinutes: 30,
          },
          reason: "User asked to book an appointment",
        },
      ],
      needsClarification: null,
      requiresApproval: true,
    };
  }

  if (
    input.hasPendingPack &&
    /\b(publish|go live|make (it )?live|launch (it|now))\b/.test(lower)
  ) {
    return {
      summary: "Publish pending Launch Pack",
      steps: [
        {
          tool: "publish_launch_pack",
          args: {},
          reason: "User asked to publish the draft pack",
        },
      ],
      needsClarification: null,
      requiresApproval: true,
    };
  }

  if (
    /\b(campaign|lead magnet|landing|form|launch|generate leads|get (more )?(leads|customers)|ads)\b/.test(
      lower,
    ) ||
    /\bleads?\b/.test(lower)
  ) {
    const location =
      text.match(/\bin\s+([A-Za-z][A-Za-z\s]{1,40})/i)?.[1]?.trim() ?? null;
    const autoPublish = /\b(launch|go live|publish|make (it )?live)\b/.test(lower);
    const steps: AssistantPlanStep[] = [
      {
        tool: "create_launch_pack",
        args: {
          goal: text,
          location,
          offer: null,
        },
        reason: "User wants a lead-generation campaign",
      },
    ];
    if (autoPublish) {
      steps.push({
        tool: "publish_launch_pack",
        args: {},
        reason: "User asked to launch/publish immediately",
      });
    }
    return {
      summary: autoPublish
        ? "Create and publish Launch Pack"
        : "Create a Launch Pack (campaign + form + page)",
      steps,
      needsClarification: null,
      requiresApproval: true,
    };
  }

  return {
    summary: "Clarify intent",
    steps: [],
    needsClarification:
      "I can launch a lead campaign, list leads, qualify a message, or show Results. What should we do?",
    requiresApproval: false,
  };
}
