package com.leadorbit.store;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MetaConnectionStore {

  public record Connection(
      String orgId,
      String accessToken,
      String adAccountId,
      String pageId,
      String pixelId,
      String leadGenFormId,
      Instant tokenExpiresAt) {}

  public record PublicConnection(
      String orgId,
      String adAccountId,
      String pageId,
      String pixelId,
      String leadGenFormId,
      boolean connected) {}

  private final JdbcTemplate jdbc;

  public MetaConnectionStore(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void upsert(
      String orgId,
      String accessToken,
      String adAccountId,
      String pageId,
      String pixelId,
      String leadGenFormId,
      Instant expiresAt) {
    jdbc.update(
        """
        MERGE INTO meta_connections (org_id, access_token, ad_account_id, page_id, pixel_id,
          lead_gen_form_id, token_expires_at, updated_at)
        KEY (org_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        orgId,
        accessToken,
        adAccountId,
        pageId,
        pixelId,
        leadGenFormId,
        expiresAt == null ? null : Timestamp.from(expiresAt));
  }

  public Optional<Connection> findSecrets(String orgId) {
    return jdbc
        .query(
            """
            SELECT org_id, access_token, ad_account_id, page_id, pixel_id, lead_gen_form_id, token_expires_at
            FROM meta_connections WHERE org_id = ?
            """,
            (rs, i) ->
                new Connection(
                    rs.getString("org_id"),
                    rs.getString("access_token"),
                    rs.getString("ad_account_id"),
                    rs.getString("page_id"),
                    rs.getString("pixel_id"),
                    rs.getString("lead_gen_form_id"),
                    rs.getTimestamp("token_expires_at") == null
                        ? null
                        : rs.getTimestamp("token_expires_at").toInstant()),
            orgId)
        .stream()
        .findFirst();
  }

  public PublicConnection toPublic(String orgId) {
    return findSecrets(orgId)
        .map(
            c ->
                new PublicConnection(
                    c.orgId(),
                    c.adAccountId(),
                    c.pageId(),
                    c.pixelId(),
                    c.leadGenFormId(),
                    c.accessToken() != null && !c.accessToken().isBlank()))
        .orElse(new PublicConnection(orgId, null, null, null, null, false));
  }

  public void updateLeadAssets(String orgId, String pixelId, String leadGenFormId) {
    Connection existing =
        findSecrets(orgId)
            .orElseThrow(() -> new IllegalStateException("Connect Meta first for this org"));
    upsert(
        orgId,
        existing.accessToken(),
        existing.adAccountId(),
        existing.pageId(),
        pixelId != null ? pixelId : existing.pixelId(),
        leadGenFormId != null ? leadGenFormId : existing.leadGenFormId(),
        existing.tokenExpiresAt());
  }

  public void savePending(String nonce, String orgId, String userId, String accessToken) {
    jdbc.update(
        """
        MERGE INTO meta_oauth_pending (nonce, org_id, user_id, access_token, created_at)
        KEY (nonce)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        nonce,
        orgId,
        userId,
        accessToken);
  }

  public Optional<Map<String, String>> loadPending(String nonce) {
    return jdbc
        .query(
            "SELECT nonce, org_id, user_id, access_token FROM meta_oauth_pending WHERE nonce = ?",
            (rs, i) ->
                Map.of(
                    "nonce",
                    rs.getString("nonce"),
                    "orgId",
                    rs.getString("org_id"),
                    "userId",
                    rs.getString("user_id"),
                    "accessToken",
                    rs.getString("access_token")),
            nonce)
        .stream()
        .findFirst();
  }

  public void clearPending(String orgId) {
    jdbc.update("DELETE FROM meta_oauth_pending WHERE org_id = ?", orgId);
  }

  public void disconnect(String orgId) {
    jdbc.update("DELETE FROM meta_connections WHERE org_id = ?", orgId);
  }

  public static String newNonce() {
    return UUID.randomUUID().toString().replace("-", "");
  }
}
