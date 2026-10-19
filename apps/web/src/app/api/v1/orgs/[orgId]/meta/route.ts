import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";

type Ctx = { params: Promise<{ orgId: string }> };

/** Custom fields, saved views, segments scaffolding list/create helpers. */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const crm = getCrmStore();
    return jsonOk({
      customFields: await crm.listCustomFields(user, orgId),
      savedViews: await crm.listSavedViews(user, orgId),
      segments: await crm.listSegments(user, orgId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      kind?: "customField" | "savedView" | "segment" | "tag" | "attachment";
      payload?: Record<string, unknown>;
    };
    const crm = getCrmStore();
    if (body.kind === "customField") {
      const p = body.payload as {
        entityType: "lead";
        key: string;
        label: string;
        fieldType: "text";
        options?: string[];
        required?: boolean;
      };
      return jsonOk({
        item: await crm.createCustomField(user, orgId, {
          entityType: p.entityType ?? "lead",
          key: p.key,
          label: p.label,
          fieldType: p.fieldType ?? "text",
          options: p.options ?? [],
          required: Boolean(p.required),
        }),
      });
    }
    if (body.kind === "savedView") {
      const p = body.payload as {
        name: string;
        entityType: "lead";
        filters?: Record<string, unknown>;
        columns?: string[];
      };
      return jsonOk({
        item: await crm.saveView(user, orgId, {
          name: p.name,
          entityType: p.entityType ?? "lead",
          filters: p.filters ?? {},
          columns: p.columns ?? ["fullName", "email", "status", "ownerUserId"],
          sort: null,
        }),
      });
    }
    if (body.kind === "segment") {
      const p = body.payload as {
        name: string;
        entityType: "lead";
        definition?: Record<string, unknown>;
      };
      return jsonOk({
        item: await crm.createSegment(user, orgId, {
          name: p.name,
          entityType: p.entityType ?? "lead",
          definition: p.definition ?? {},
        }),
      });
    }
    if (body.kind === "tag") {
      const p = body.payload as { name: string; color?: string };
      return jsonOk({ item: await crm.upsertTag(user, orgId, p.name, p.color) });
    }
    if (body.kind === "attachment") {
      const p = body.payload as {
        fileName: string;
        contentType?: string;
        sizeBytes?: number;
        storagePath?: string;
        entityType?: string;
        entityId?: string;
      };
      return jsonOk({
        item: await crm.addAttachmentMeta(user, orgId, {
          fileName: p.fileName,
          contentType: p.contentType ?? "application/octet-stream",
          sizeBytes: p.sizeBytes ?? 0,
          storagePath: p.storagePath ?? `local://${orgId}/${p.fileName}`,
          entityType: p.entityType ?? "lead",
          entityId: p.entityId ?? "",
        }),
      });
    }
    return jsonOk({ ok: false, detail: "Unknown kind" }, { status: 400 });
  } catch (err) {
    return fromAuthError(err);
  }
}
