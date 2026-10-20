/**
 * Ad spend reporting for Results.
 * Distinguishes unavailable (no events / no creds) vs zero (events exist, spend=0).
 */

export type AdSpendNetwork = "meta" | "google_ads";

export type AdSpendAvailability = "unavailable" | "zero" | "reported";

export type AdSpendSnapshot = {
  network: AdSpendNetwork;
  availability: AdSpendAvailability;
  /** Spend in minor units (cents) when reported or zero */
  spendCents: number | null;
  currency: string | null;
  detail: string;
  eventCount: number;
};

export function adSpendCredentialsPresent(network: AdSpendNetwork): boolean {
  if (network === "meta") {
    return Boolean(process.env.META_ADS_ACCESS_TOKEN);
  }
  return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
}

/**
 * Derive Results spend signal from marketing events + optional spend fields.
 * - No credentials and no spend-bearing events → unavailable
 * - Events exist with explicit spendCents totaling 0 → zero
 * - Events exist with spend > 0 → reported
 * - Credentials but no Insights pull verified → unavailable (honest)
 */
export function deriveAdSpendSnapshot(input: {
  network: AdSpendNetwork;
  events: Array<{
    eventType: string;
    meta?: Record<string, unknown> | null;
  }>;
}): AdSpendSnapshot {
  const spendEvents = input.events.filter((e) => {
    const m = e.meta ?? {};
    return (
      typeof m.spendCents === "number" ||
      typeof m.spend_cents === "number" ||
      e.eventType === "ad_spend"
    );
  });

  let total = 0;
  let currency: string | null = null;
  for (const e of spendEvents) {
    const m = e.meta ?? {};
    const cents =
      typeof m.spendCents === "number"
        ? m.spendCents
        : typeof m.spend_cents === "number"
          ? m.spend_cents
          : 0;
    total += cents;
    if (typeof m.currency === "string") currency = m.currency;
  }

  if (spendEvents.length > 0) {
    if (total === 0) {
      return {
        network: input.network,
        availability: "zero",
        spendCents: 0,
        currency: currency ?? "USD",
        detail: `${spendEvents.length} spend event(s) recorded — spend is zero`,
        eventCount: spendEvents.length,
      };
    }
    return {
      network: input.network,
      availability: "reported",
      spendCents: total,
      currency: currency ?? "USD",
      detail: `${spendEvents.length} spend event(s) totaled`,
      eventCount: spendEvents.length,
    };
  }

  if (!adSpendCredentialsPresent(input.network)) {
    return {
      network: input.network,
      availability: "unavailable",
      spendCents: null,
      currency: null,
      detail: `${input.network} spend unavailable — credentials not configured (not zero)`,
      eventCount: input.events.length,
    };
  }

  return {
    network: input.network,
    availability: "unavailable",
    spendCents: null,
    currency: null,
    detail: `${input.network} credentials present but Insights/spend pull not verified (not claiming zero)`,
    eventCount: input.events.length,
  };
}

export function formatAdSpendForResults(snap: AdSpendSnapshot): {
  label: string;
  value: string;
  tone: "muted" | "ok" | "warn";
} {
  if (snap.availability === "unavailable") {
    return { label: `${snap.network} spend`, value: "Unavailable", tone: "muted" };
  }
  if (snap.availability === "zero") {
    return { label: `${snap.network} spend`, value: "0", tone: "ok" };
  }
  const major = ((snap.spendCents ?? 0) / 100).toFixed(2);
  return {
    label: `${snap.network} spend`,
    value: `${snap.currency ?? "USD"} ${major}`,
    tone: "ok",
  };
}
