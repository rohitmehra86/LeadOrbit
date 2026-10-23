import { randomUUID } from "node:crypto";
import { getAuthMode, getCrmDatabase, type SessionUser } from "@leadorbit/db";
import { AuthError } from "@leadorbit/db";
import { createClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "./token-crypto";
import { getTenancyStore } from "@/lib/tenancy/service";

export type MetaConnectionPublic = {
  orgId: string;
  status: "connected" | "token_expired" | "pending_configuration";
  adAccountId: string | null;
  pageId: string | null;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
  lastError: string | null;
  hasToken: boolean;
};

export type MetaConnectionSecrets = {
  accessToken: string;
  adAccountId: string;
  pageId: string;
  tokenExpiresAt: string | null;
};

async function assertOrgMember(actor: SessionUser, orgId: string) {
  const m = await getTenancyStore().getMembership(actor.id, orgId);
  if (!m && !actor.isPlatformAdmin) {
    throw new AuthError("Not a member of this organization", "forbidden");
  }
}

function mapPublic(row: {
  org_id: string;
  status: string;
  ad_account_id: string | null;
  page_id: string | null;
  connected_at: string | null;
  token_expires_at: string | null;
  last_error: string | null;
  access_token_ciphertext?: string | null;
}): MetaConnectionPublic {
  const expires = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null;
  let status = row.status as MetaConnectionPublic["status"];
  if (expires && expires < Date.now() - 60_000) status = "token_expired";
  return {
    orgId: row.org_id,
    status,
    adAccountId: row.ad_account_id,
    pageId: row.page_id,
    connectedAt: row.connected_at,
    tokenExpiresAt: row.token_expires_at,
    lastError: row.last_error,
    hasToken: Boolean(row.access_token_ciphertext),
  };
}

async function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getMetaConnectionPublic(
  actor: SessionUser,
  orgId: string,
): Promise<MetaConnectionPublic | null> {
  await assertOrgMember(actor, orgId);
  if (getAuthMode() === "supabase") {
    // Service role so we never rely on client SELECT of ciphertext; strip secret below.
    const admin = await supabaseAdmin();
    if (!admin) return null;
    const { data } = await admin
      .from("meta_ad_connections")
      .select(
        "org_id,status,ad_account_id,page_id,connected_at,token_expires_at,last_error,access_token_ciphertext",
      )
      .eq("org_id", orgId)
      .maybeSingle();
    if (!data) return null;
    return mapPublic(data as Parameters<typeof mapPublic>[0]);
  }
  const db = getCrmDatabase();
  const row = db
    .prepare(`select * from meta_ad_connections where org_id = ?`)
    .get(orgId) as Record<string, string> | undefined;
  if (!row) return null;
  return mapPublic({
    org_id: row.org_id,
    status: row.status,
    ad_account_id: row.ad_account_id,
    page_id: row.page_id,
    connected_at: row.connected_at,
    token_expires_at: row.token_expires_at,
    last_error: row.last_error,
    access_token_ciphertext: row.access_token_ciphertext,
  });
}

/** Server-only: decrypt token for Marketing API calls. Never send to client. */
export async function getMetaConnectionSecrets(
  actor: SessionUser,
  orgId: string,
): Promise<MetaConnectionSecrets | null> {
  await assertOrgMember(actor, orgId);
  if (getAuthMode() === "supabase") {
    const admin = await supabaseAdmin();
    if (!admin) return null;
    const { data } = await admin
      .from("meta_ad_connections")
      .select("access_token_ciphertext,ad_account_id,page_id,token_expires_at,status")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!data?.access_token_ciphertext) return null;
    if (data.status === "token_expired") return null;
    try {
      return {
        accessToken: decryptSecret(String(data.access_token_ciphertext)),
        adAccountId: String(data.ad_account_id),
        pageId: String(data.page_id),
        tokenExpiresAt: (data.token_expires_at as string | null) ?? null,
      };
    } catch {
      return null;
    }
  }
  const db = getCrmDatabase();
  const row = db
    .prepare(`select * from meta_ad_connections where org_id = ?`)
    .get(orgId) as Record<string, string> | undefined;
  if (!row?.access_token_ciphertext) return null;
  try {
    return {
      accessToken: decryptSecret(row.access_token_ciphertext),
      adAccountId: row.ad_account_id,
      pageId: row.page_id,
      tokenExpiresAt: row.token_expires_at || null,
    };
  } catch {
    return null;
  }
}

export async function upsertMetaConnection(
  actor: SessionUser,
  orgId: string,
  input: {
    accessToken: string;
    adAccountId: string;
    pageId: string;
    tokenExpiresAt?: string | null;
  },
): Promise<MetaConnectionPublic> {
  await assertOrgMember(actor, orgId);
  const now = new Date().toISOString();
  const cipher = encryptSecret(input.accessToken);
  const act = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`;

  if (getAuthMode() === "supabase") {
    const admin = await supabaseAdmin();
    if (!admin) throw new AuthError("Supabase service role not configured", "validation");
    const { data, error } = await admin
      .from("meta_ad_connections")
      .upsert(
        {
          org_id: orgId,
          status: "connected",
          access_token_ciphertext: cipher,
          ad_account_id: act,
          page_id: input.pageId,
          token_expires_at: input.tokenExpiresAt ?? null,
          connected_at: now,
          connected_by_user_id: actor.id,
          last_error: null,
          updated_at: now,
        },
        { onConflict: "org_id" },
      )
      .select(
        "org_id,status,ad_account_id,page_id,connected_at,token_expires_at,last_error,access_token_ciphertext",
      )
      .single();
    if (error || !data) {
      throw new AuthError(error?.message ?? "Failed to save Meta connection", "validation");
    }
    return mapPublic(data as Parameters<typeof mapPublic>[0]);
  }

  const db = getCrmDatabase();
  const existing = db
    .prepare(`select id from meta_ad_connections where org_id = ?`)
    .get(orgId) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  if (existing) {
    db.prepare(
      `update meta_ad_connections set status=?, access_token_ciphertext=?, ad_account_id=?, page_id=?, token_expires_at=?, connected_at=?, connected_by_user_id=?, last_error=null, updated_at=? where org_id=?`,
    ).run(
      "connected",
      cipher,
      act,
      input.pageId,
      input.tokenExpiresAt ?? null,
      now,
      actor.id,
      now,
      orgId,
    );
  } else {
    db.prepare(
      `insert into meta_ad_connections(id, org_id, status, access_token_ciphertext, ad_account_id, page_id, token_expires_at, connected_at, connected_by_user_id, last_error, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      orgId,
      "connected",
      cipher,
      act,
      input.pageId,
      input.tokenExpiresAt ?? null,
      now,
      actor.id,
      null,
      now,
      now,
    );
  }
  return (await getMetaConnectionPublic(actor, orgId))!;
}

export async function deleteMetaConnection(actor: SessionUser, orgId: string): Promise<void> {
  await assertOrgMember(actor, orgId);
  if (getAuthMode() === "supabase") {
    const admin = await supabaseAdmin();
    if (!admin) throw new AuthError("Supabase service role not configured", "validation");
    await admin.from("meta_ad_connections").delete().eq("org_id", orgId);
    return;
  }
  getCrmDatabase().prepare(`delete from meta_ad_connections where org_id = ?`).run(orgId);
}

export async function saveMetaOAuthPending(input: {
  orgId: string;
  userId: string;
  stateNonce: string;
  accessToken?: string | null;
  tokenExpiresAt?: string | null;
  ttlMinutes?: number;
}): Promise<void> {
  const now = new Date();
  const expires = new Date(
    now.getTime() + (input.ttlMinutes ?? 30) * 60_000,
  ).toISOString();
  const cipher = input.accessToken ? encryptSecret(input.accessToken) : null;

  if (getAuthMode() === "supabase") {
    const admin = await supabaseAdmin();
    if (!admin) throw new AuthError("Supabase service role not configured", "validation");
    await admin.from("meta_oauth_pending").delete().eq("org_id", input.orgId);
    await admin.from("meta_oauth_pending").insert({
      org_id: input.orgId,
      user_id: input.userId,
      state_nonce: input.stateNonce,
      access_token_ciphertext: cipher,
      token_expires_at: input.tokenExpiresAt ?? null,
      expires_at: expires,
    });
    return;
  }
  const db = getCrmDatabase();
  db.prepare(`delete from meta_oauth_pending where org_id = ?`).run(input.orgId);
  db.prepare(
    `insert into meta_oauth_pending(id, org_id, user_id, state_nonce, access_token_ciphertext, token_expires_at, expires_at, created_at) values (?,?,?,?,?,?,?,?)`,
  ).run(
    randomUUID(),
    input.orgId,
    input.userId,
    input.stateNonce,
    cipher,
    input.tokenExpiresAt ?? null,
    expires,
    now.toISOString(),
  );
}

export async function loadMetaOAuthPending(stateNonce: string): Promise<{
  orgId: string;
  userId: string;
  accessToken: string | null;
  tokenExpiresAt: string | null;
} | null> {
  const now = new Date().toISOString();
  if (getAuthMode() === "supabase") {
    const admin = await supabaseAdmin();
    if (!admin) return null;
    const { data } = await admin
      .from("meta_oauth_pending")
      .select("*")
      .eq("state_nonce", stateNonce)
      .gt("expires_at", now)
      .maybeSingle();
    if (!data) return null;
    return {
      orgId: String(data.org_id),
      userId: String(data.user_id),
      accessToken: data.access_token_ciphertext
        ? decryptSecret(String(data.access_token_ciphertext))
        : null,
      tokenExpiresAt: (data.token_expires_at as string | null) ?? null,
    };
  }
  const row = getCrmDatabase()
    .prepare(
      `select * from meta_oauth_pending where state_nonce = ? and expires_at > ?`,
    )
    .get(stateNonce, now) as Record<string, string> | undefined;
  if (!row) return null;
  return {
    orgId: row.org_id,
    userId: row.user_id,
    accessToken: row.access_token_ciphertext
      ? decryptSecret(row.access_token_ciphertext)
      : null,
    tokenExpiresAt: row.token_expires_at || null,
  };
}

export async function updateMetaOAuthPendingToken(
  stateNonce: string,
  accessToken: string,
  tokenExpiresAt: string | null,
): Promise<void> {
  const cipher = encryptSecret(accessToken);
  if (getAuthMode() === "supabase") {
    const admin = await supabaseAdmin();
    if (!admin) return;
    await admin
      .from("meta_oauth_pending")
      .update({
        access_token_ciphertext: cipher,
        token_expires_at: tokenExpiresAt,
      })
      .eq("state_nonce", stateNonce);
    return;
  }
  getCrmDatabase()
    .prepare(
      `update meta_oauth_pending set access_token_ciphertext=?, token_expires_at=? where state_nonce=?`,
    )
    .run(cipher, tokenExpiresAt, stateNonce);
}

export async function clearMetaOAuthPending(orgId: string): Promise<void> {
  if (getAuthMode() === "supabase") {
    const admin = await supabaseAdmin();
    if (!admin) return;
    await admin.from("meta_oauth_pending").delete().eq("org_id", orgId);
    return;
  }
  getCrmDatabase().prepare(`delete from meta_oauth_pending where org_id = ?`).run(orgId);
}
