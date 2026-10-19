/**
 * Milestone 9 — configurable industry templates scaffolding.
 * Templates/config only — not full vertical implementations.
 */

export type IndustryTemplateId =
  | "real_estate"
  | "education"
  | "automotive"
  | "service_business";

export interface IndustryTemplateField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "currency" | "date";
  required?: boolean;
  options?: string[];
}

export interface IndustryTemplate {
  id: IndustryTemplateId;
  name: string;
  description: string;
  /** Optional module key that must be enabled (e.g. real_estate). */
  moduleKey: string | null;
  leadCustomFields: IndustryTemplateField[];
  pipelineStages: string[];
  suggestedWorkflows: string[];
  suggestedAiPersona: string;
  status: "ready" | "scaffold";
}

export const INDUSTRY_TEMPLATES: readonly IndustryTemplate[] = [
  {
    id: "real_estate",
    name: "Real estate",
    description:
      "Developers, projects, units, brokers, site visits — full optional vertical module.",
    moduleKey: "real_estate",
    leadCustomFields: [
      { key: "bhk", label: "BHK preference", type: "number" },
      { key: "budget_max", label: "Budget max", type: "currency" },
      { key: "preferred_location", label: "Preferred location", type: "text" },
    ],
    pipelineStages: [
      "Enquiry",
      "Site visit",
      "Negotiation",
      "Booking",
      "Closed",
    ],
    suggestedWorkflows: ["lead_created → assign → tag → site_visit nudge"],
    suggestedAiPersona: "Sales qualifier (inventory-aware)",
    status: "ready",
  },
  {
    id: "education",
    name: "Education",
    description:
      "Scaffold for schools/edtech: courses, intakes, counselors — config only.",
    moduleKey: null,
    leadCustomFields: [
      { key: "program", label: "Program interest", type: "text" },
      {
        key: "intake",
        label: "Intake",
        type: "select",
        options: ["Spring", "Fall", "Rolling"],
      },
      { key: "gpa", label: "GPA / score", type: "number" },
    ],
    pipelineStages: ["Inquiry", "Counseling", "Application", "Enrolled"],
    suggestedWorkflows: ["form_submitted → assign counselor → nurture"],
    suggestedAiPersona: "Admissions assistant (scaffold)",
    status: "scaffold",
  },
  {
    id: "automotive",
    name: "Automotive",
    description:
      "Scaffold for dealers: models, test drives, trade-ins — config only.",
    moduleKey: null,
    leadCustomFields: [
      { key: "model", label: "Model interest", type: "text" },
      { key: "finance", label: "Finance needed", type: "select", options: ["yes", "no"] },
      { key: "trade_in", label: "Trade-in", type: "text" },
    ],
    pipelineStages: ["Lead", "Test drive", "Quote", "Sold"],
    suggestedWorkflows: ["lead_created → assign sales → test_drive booking"],
    suggestedAiPersona: "Dealer sales assistant (scaffold)",
    status: "scaffold",
  },
  {
    id: "service_business",
    name: "Service business",
    description:
      "Scaffold for local services: jobs, quotes, technicians — config only.",
    moduleKey: null,
    leadCustomFields: [
      { key: "service_type", label: "Service type", type: "text" },
      { key: "urgency", label: "Urgency", type: "select", options: ["low", "medium", "high"] },
      { key: "service_area", label: "Service area", type: "text" },
    ],
    pipelineStages: ["Request", "Quote", "Scheduled", "Completed"],
    suggestedWorkflows: ["form_submitted → create_task → notify tech"],
    suggestedAiPersona: "Service desk assistant (scaffold)",
    status: "scaffold",
  },
] as const;

export function getIndustryTemplate(
  id: IndustryTemplateId,
): IndustryTemplate | undefined {
  return INDUSTRY_TEMPLATES.find((t) => t.id === id);
}

export function listIndustryTemplates(): IndustryTemplate[] {
  return [...INDUSTRY_TEMPLATES];
}
