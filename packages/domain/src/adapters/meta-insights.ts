/**
 * Meta Marketing API Insights (read-only). Never invents metrics.
 */

const GRAPH_VERSION = "v21.0";

export const META_INSIGHT_FIELDS = [
  "impressions",
  "reach",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "spend",
  "actions",
  "action_values",
] as const;

export type MetaInsightMetrics = {
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  spend: number | null;
  leads: number | null;
  currency: string | null;
  dateStart: string | null;
  dateStop: string | null;
  rawActions: Array<{ action_type?: string; value?: string }> | null;
};

export type MetaInsightsResult =
  | {
      ok: true;
      empty: boolean;
      objectId: string;
      level: "campaign" | "adset" | "ad";
      metrics: MetaInsightMetrics;
      detail: string;
    }
  | {
      ok: false;
      empty: true;
      objectId: string;
      level: "campaign" | "adset" | "ad";
      metrics: null;
      detail: string;
      errorCode?: string | number;
    };

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractLeads(
  actions: Array<{ action_type?: string; value?: string }> | undefined,
): number | null {
  if (!actions?.length) return null;
  const leadish = actions.filter((a) => {
    const t = (a.action_type ?? "").toLowerCase();
    return (
      t === "lead" ||
      t === "onsite_conversion.lead_grouped" ||
      t.endsWith(".lead") ||
      t.includes("lead")
    );
  });
  if (!leadish.length) return null;
  let sum = 0;
  for (const a of leadish) {
    const n = parseNum(a.value);
    if (n != null) sum += n;
  }
  return sum;
}

export function parseMetaInsightsRow(
  row: Record<string, unknown> | undefined,
  currencyHint?: string | null,
): MetaInsightMetrics {
  if (!row) {
    return {
      impressions: null,
      reach: null,
      clicks: null,
      ctr: null,
      cpc: null,
      cpm: null,
      spend: null,
      leads: null,
      currency: currencyHint ?? null,
      dateStart: null,
      dateStop: null,
      rawActions: null,
    };
  }
  const actions = row.actions as
    | Array<{ action_type?: string; value?: string }>
    | undefined;
  return {
    impressions: parseNum(row.impressions),
    reach: parseNum(row.reach),
    clicks: parseNum(row.clicks),
    ctr: parseNum(row.ctr),
    cpc: parseNum(row.cpc),
    cpm: parseNum(row.cpm),
    spend: parseNum(row.spend),
    leads: extractLeads(actions),
    currency: currencyHint ?? null,
    dateStart: typeof row.date_start === "string" ? row.date_start : null,
    dateStop: typeof row.date_stop === "string" ? row.date_stop : null,
    rawActions: actions ?? null,
  };
}

export type MetaInsightsQuery = {
  accessToken: string;
  objectId: string;
  level?: "campaign" | "adset" | "ad";
  /** Meta date_preset e.g. last_7d, last_30d, lifetime */
  datePreset?: string;
  timeRange?: { since: string; until: string };
  currency?: string | null;
  fetchImpl?: typeof fetch;
};

/**
 * Fetch insights for a Meta campaign / ad set / ad.
 * Empty data (new or paused with no delivery) → ok:true, empty:true — not an error.
 */
export async function fetchMetaObjectInsights(
  query: MetaInsightsQuery,
): Promise<MetaInsightsResult> {
  const level = query.level ?? "campaign";
  const objectId = query.objectId.trim();
  const fetchImpl = query.fetchImpl ?? fetch;
  if (!objectId) {
    return {
      ok: false,
      empty: true,
      objectId,
      level,
      metrics: null,
      detail: "Meta object id required for insights",
    };
  }

  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/${objectId}/insights`,
  );
  url.searchParams.set("fields", META_INSIGHT_FIELDS.join(","));
  url.searchParams.set("level", level === "adset" ? "adset" : level);
  if (query.timeRange?.since && query.timeRange?.until) {
    url.searchParams.set(
      "time_range",
      JSON.stringify({
        since: query.timeRange.since,
        until: query.timeRange.until,
      }),
    );
  } else {
    url.searchParams.set("date_preset", query.datePreset?.trim() || "last_7d");
  }
  url.searchParams.set("access_token", query.accessToken);

  try {
    const res = await fetchImpl(url.toString());
    const raw = (await res.json().catch(() => ({}))) as {
      data?: Array<Record<string, unknown>>;
      error?: { message?: string; code?: number; error_user_msg?: string };
    };
    if (!res.ok || raw.error) {
      return {
        ok: false,
        empty: true,
        objectId,
        level,
        metrics: null,
        detail:
          raw.error?.error_user_msg ||
          raw.error?.message ||
          `Insights HTTP ${res.status}`,
        errorCode: raw.error?.code,
      };
    }
    const row = raw.data?.[0];
    if (!row) {
      return {
        ok: true,
        empty: true,
        objectId,
        level,
        metrics: parseMetaInsightsRow(undefined, query.currency),
        detail:
          "No insights rows yet — common for PAUSED or brand-new campaigns with zero delivery",
      };
    }
    const metrics = parseMetaInsightsRow(row, query.currency);
    const hasAny =
      metrics.impressions != null ||
      metrics.spend != null ||
      metrics.clicks != null ||
      metrics.reach != null;
    return {
      ok: true,
      empty: !hasAny,
      objectId,
      level,
      metrics,
      detail: hasAny
        ? "Insights loaded from Meta Marketing API"
        : "Insights row present but all primary metrics empty",
    };
  } catch (err) {
    return {
      ok: false,
      empty: true,
      objectId,
      level,
      metrics: null,
      detail: err instanceof Error ? err.message : "Insights request failed",
    };
  }
}
