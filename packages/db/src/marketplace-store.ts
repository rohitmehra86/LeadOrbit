import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  getMarketplacePack,
  hasPermission,
  industryTemplateForPack,
  listMarketplacePacks,
  type MarketplaceInstallResult,
  type MarketplacePack,
} from "@leadorbit/domain";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";

function nowIso(): string {
  return new Date().toISOString();
}

export type MarketplaceInstallRow = {
  id: string;
  orgId: string;
  packId: string;
  packSlug: string;
  campaignId: string | null;
  formId: string | null;
  pageId: string | null;
  pageSlug: string | null;
  detail: string;
  createdAt: string;
};

/**
 * Launch Pack marketplace catalog + install history.
 * Install materializes via injected createLaunchPack (web layer) — store stays db-pure.
 */
export class MarketplaceStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
  ) {}

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "campaigns:write" | "campaigns:read" | "org:read",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  listCatalog(includeScaffold = true): MarketplacePack[] {
    return listMarketplacePacks({ includeScaffold });
  }

  getPack(idOrSlug: string): MarketplacePack | null {
    return getMarketplacePack(idOrSlug);
  }

  async listInstalls(
    actor: SessionUser,
    orgId: string,
  ): Promise<MarketplaceInstallRow[]> {
    await this.gate(actor, orgId, "org:read");
    const rows = this.db
      .prepare(
        `select * from marketplace_installs where org_id=? order by created_at desc limit 100`,
      )
      .all(orgId) as Array<{
      id: string;
      org_id: string;
      pack_id: string;
      pack_slug: string;
      campaign_id: string | null;
      form_id: string | null;
      page_id: string | null;
      page_slug: string | null;
      detail: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      packId: r.pack_id,
      packSlug: r.pack_slug,
      campaignId: r.campaign_id,
      formId: r.form_id,
      pageId: r.page_id,
      pageSlug: r.page_slug,
      detail: r.detail,
      createdAt: r.created_at,
    }));
  }

  /**
   * Record an install after Launch Pack materialization.
   * Caller must create the pack assets first (honesty: no fake publish).
   */
  async recordInstall(
    actor: SessionUser,
    orgId: string,
    input: {
      packId: string;
      packSlug: string;
      campaignId: string;
      formId: string;
      pageId: string;
      pageSlug: string;
      detail: string;
    },
  ): Promise<MarketplaceInstallRow> {
    await this.gate(actor, orgId, "campaigns:write");
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into marketplace_installs(
          id, org_id, pack_id, pack_slug, campaign_id, form_id, page_id, page_slug, detail, created_at
        ) values (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.packId,
        input.packSlug,
        input.campaignId,
        input.formId,
        input.pageId,
        input.pageSlug,
        input.detail,
        now,
      );
    return {
      id,
      orgId,
      packId: input.packId,
      packSlug: input.packSlug,
      campaignId: input.campaignId,
      formId: input.formId,
      pageId: input.pageId,
      pageSlug: input.pageSlug,
      detail: input.detail,
      createdAt: now,
    };
  }

  resolveInstallPlan(packIdOrSlug: string): {
    pack: MarketplacePack;
    industryTemplateId: ReturnType<typeof industryTemplateForPack>;
    goal: string;
    location: string | null;
    offer: string | null;
  } {
    const pack = getMarketplacePack(packIdOrSlug);
    if (!pack) throw new AuthError("Marketplace pack not found", "not_found");
    return {
      pack,
      industryTemplateId: industryTemplateForPack(pack),
      goal: pack.defaultGoal,
      location: pack.defaultLocation,
      offer: pack.defaultOffer,
    };
  }
}

export type { MarketplaceInstallResult };
