import type { CreateInviteRequest } from "@leadorbit/api-contracts";
import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as CreateInviteRequest;
    const invite = await getTenancyStore().createInvite(
      user,
      orgId,
      body.email,
      body.role,
    );
    return jsonOk(
      {
        item: {
          id: invite.id,
          orgId: invite.orgId,
          email: invite.email,
          role: invite.role,
          status: invite.status,
          expiresAt: invite.expiresAt,
          token: invite.token,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return fromAuthError(err);
  }
}
