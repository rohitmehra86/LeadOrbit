/**
 * Milestone 10 — analytics / reporting.
 * Metrics from real persisted events; distinguish unavailable vs zero.
 */

export type MetricAvailability = "ok" | "zero" | "unavailable";

export interface MetricValue {
  key: string;
  label: string;
  value: number | null;
  availability: MetricAvailability;
  unit?: string;
  detail?: string;
}

export interface AnalyticsDashboard {
  orgId: string;
  from: string;
  to: string;
  compareFrom: string | null;
  compareTo: string | null;
  generatedAt: string;
  metrics: MetricValue[];
  series: Record<
    string,
    Array<{ date: string; value: number; availability: MetricAvailability }>
  >;
  tables: Record<string, Array<Record<string, string | number | null>>>;
}

export interface ScheduledReport {
  id: string;
  orgId: string;
  name: string;
  cadence: "daily" | "weekly" | "monthly";
  recipients: string[];
  status: "scaffolded" | "pending_configuration" | "active";
  detail: string;
  createdAt: string;
}

export function metricFromCount(
  key: string,
  label: string,
  count: number,
  opts?: { sourceAvailable?: boolean; unit?: string; detail?: string },
): MetricValue {
  if (opts?.sourceAvailable === false) {
    return {
      key,
      label,
      value: null,
      availability: "unavailable",
      unit: opts.unit,
      detail: opts.detail ?? "Source data unavailable",
    };
  }
  return {
    key,
    label,
    value: count,
    availability: count === 0 ? "zero" : "ok",
    unit: opts?.unit,
    detail: opts?.detail,
  };
}

export function metricRatio(
  key: string,
  label: string,
  numerator: number | null,
  denominator: number | null,
  opts?: { sourceAvailable?: boolean },
): MetricValue {
  if (opts?.sourceAvailable === false) {
    return {
      key,
      label,
      value: null,
      availability: "unavailable",
      detail: "Source data unavailable",
    };
  }
  if (numerator == null || denominator == null) {
    return {
      key,
      label,
      value: null,
      availability: "unavailable",
      detail: "Insufficient data",
    };
  }
  if (denominator === 0) {
    return {
      key,
      label,
      value: 0,
      availability: "zero",
      detail: "Denominator zero",
    };
  }
  const value = Number((numerator / denominator).toFixed(4));
  return {
    key,
    label,
    value,
    availability: value === 0 ? "zero" : "ok",
  };
}

export function toCsv(
  rows: Array<Record<string, string | number | null>>,
): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h] ?? null)).join(",")),
  ].join("\n");
}

export function inDateRange(
  iso: string,
  from: string,
  to: string,
): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(from).getTime() && t <= new Date(to).getTime();
}
