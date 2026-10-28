/**
 * Meta object status read / pause / resume helpers.
 * Maps effective_status honestly — unknown values stay unknown.
 */

const GRAPH_VERSION = "v21.0";

export type MetaEffectiveStatus =
  | "ACTIVE"
  | "PAUSED"
  | "DELETED"
  | "ARCHIVED"
  | "PENDING_REVIEW"
  | "DISAPPROVED"
  | "PREAPPROVED"
  | "PENDING_BILLING_INFO"
  | "CAMPAIGN_PAUSED"
  | "ADSET_PAUSED"
  | "IN_PROCESS"
  | "WITH_ISSUES"
  | "COMPLETED"
  | "UNKNOWN";

export type MetaUiStatus =
  | "active"
  | "paused"
  | "pending_review"
  | "rejected"
  | "completed"
  | "deleted"
  | "failed"
  | "created"
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set([
  "ACTIVE",
  "PAUSED",
  "DELETED",
  "ARCHIVED",
  "PENDING_REVIEW",
  "DISAPPROVED",
  "PREAPPROVED",
  "PENDING_BILLING_INFO",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
  "IN_PROCESS",
  "WITH_ISSUES",
]);

export function normalizeMetaEffectiveStatus(
  raw: string | null | undefined,
): MetaEffectiveStatus {
  if (!raw?.trim()) return "UNKNOWN";
  const u = raw.trim().toUpperCase();
  if (KNOWN.has(u)) return u as MetaEffectiveStatus;
  if (u === "COMPLETED") return "COMPLETED";
  return "UNKNOWN";
}

/** Map Meta effective_status to a LeadOrbit UI bucket without inventing states. */
export function mapMetaStatusToUi(
  effective: string | null | undefined,
  configuredStatus?: string | null,
): MetaUiStatus {
  const e = normalizeMetaEffectiveStatus(effective);
  if (e === "UNKNOWN" && configuredStatus) {
    const c = configuredStatus.trim().toUpperCase();
    if (c === "PAUSED") return "paused";
    if (c === "ACTIVE") return "active";
  }
  switch (e) {
    case "ACTIVE":
    case "PREAPPROVED":
      return "active";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":
      return "paused";
    case "PENDING_REVIEW":
    case "IN_PROCESS":
    case "PENDING_BILLING_INFO":
      return "pending_review";
    case "DISAPPROVED":
    case "WITH_ISSUES":
      return "rejected";
    case "COMPLETED":
      return "completed";
    case "DELETED":
    case "ARCHIVED":
      return "deleted";
    case "UNKNOWN":
    default:
      return "unknown";
  }
}

export type MetaObjectSnapshot = {
  id: string;
  name: string | null;
  status: string | null;
  effectiveStatus: MetaEffectiveStatus;
  uiStatus: MetaUiStatus;
  rawEffectiveStatus: string | null;
};

export type MetaObjectFetchResult =
  | { ok: true; object: MetaObjectSnapshot }
  | { ok: false; detail: string; errorCode?: string | number };

export async function fetchMetaObjectStatus(
  accessToken: string,
  objectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MetaObjectFetchResult> {
  const id = objectId.trim();
  if (!id) return { ok: false, detail: "object id required" };
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${id}`);
  url.searchParams.set("fields", "id,name,status,effective_status");
  url.searchParams.set("access_token", accessToken);
  try {
    const res = await fetchImpl(url.toString());
    const raw = (await res.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      status?: string;
      effective_status?: string;
      error?: { message?: string; code?: number; error_user_msg?: string };
    };
    if (!res.ok || raw.error || !raw.id) {
      return {
        ok: false,
        detail:
          raw.error?.error_user_msg ||
          raw.error?.message ||
          `Object status HTTP ${res.status}`,
        errorCode: raw.error?.code,
      };
    }
    const effective = normalizeMetaEffectiveStatus(raw.effective_status);
    return {
      ok: true,
      object: {
        id: raw.id,
        name: raw.name ?? null,
        status: raw.status ?? null,
        effectiveStatus: effective,
        uiStatus: mapMetaStatusToUi(raw.effective_status, raw.status),
        rawEffectiveStatus: raw.effective_status ?? null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Object status failed",
    };
  }
}

export type MetaStatusUpdateResult =
  | { ok: true; id: string; status: "PAUSED" | "ACTIVE"; detail: string }
  | { ok: false; detail: string; errorCode?: string | number };

/**
 * Pause or activate a Meta campaign / ad set / ad.
 * Requires explicit caller confirmation — never call from silent paths.
 */
export async function updateMetaObjectConfiguredStatus(
  accessToken: string,
  objectId: string,
  status: "PAUSED" | "ACTIVE",
  fetchImpl: typeof fetch = fetch,
): Promise<MetaStatusUpdateResult> {
  const id = objectId.trim();
  if (!id) return { ok: false, detail: "object id required" };
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${id}`);
  url.searchParams.set("access_token", accessToken);
  try {
    const res = await fetchImpl(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const raw = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      id?: string;
      error?: { message?: string; code?: number; error_user_msg?: string };
    };
    if (!res.ok || raw.error) {
      return {
        ok: false,
        detail:
          raw.error?.error_user_msg ||
          raw.error?.message ||
          `Status update HTTP ${res.status}`,
        errorCode: raw.error?.code,
      };
    }
    return {
      ok: true,
      id,
      status,
      detail:
        status === "PAUSED"
          ? `Meta object ${id} set to PAUSED`
          : `Meta object ${id} set to ACTIVE — spend may resume`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Status update failed",
    };
  }
}

/** Ads Manager deep link when account + object ids are known. */
export function metaAdsManagerObjectUrl(input: {
  adAccountId: string;
  objectType: "campaign" | "adset" | "ad";
  objectId: string;
}): string | null {
  const act = input.adAccountId.replace(/^act_/, "").trim();
  const oid = input.objectId.trim();
  if (!act || !oid) return null;
  const selected =
    input.objectType === "campaign"
      ? `selected_campaign_ids=${oid}`
      : input.objectType === "adset"
        ? `selected_adset_ids=${oid}`
        : `selected_ad_ids=${oid}`;
  return `https://www.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(act)}&${selected}`;
}
