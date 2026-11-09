package com.leadorbit.store;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LeadStore {

  public record Lead(
      String id,
      String orgId,
      String campaignId,
      String pageId,
      String fullName,
      String email,
      String phone,
      String source,
      String createdAt) {}

  public record LandingPage(
      String id,
      String orgId,
      String campaignId,
      String slug,
      String title,
      String headline,
      String bodyText,
      String status) {}

  private final JdbcTemplate jdbc;

  public LeadStore(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public LandingPage upsertLandingPage(
      String orgId,
      String campaignId,
      String slug,
      String title,
      String headline,
      String bodyText) {
    Optional<LandingPage> existing = findLandingPageAny(orgId, slug);
    if (existing.isPresent()) {
      jdbc.update(
          """
          UPDATE lo_landing_pages
          SET campaign_id = ?, title = ?, headline = ?, body_text = ?, status = 'published'
          WHERE org_id = ? AND slug = ?
          """,
          campaignId,
          title,
          headline,
          bodyText,
          orgId,
          slug);
      return findLandingPage(orgId, slug).orElseThrow();
    }
    String id = UUID.randomUUID().toString();
    jdbc.update(
        """
        INSERT INTO lo_landing_pages
          (id, org_id, campaign_id, slug, title, headline, body_text, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'published')
        """,
        id,
        orgId,
        campaignId,
        slug,
        title,
        headline,
        bodyText);
    return findLandingPage(orgId, slug).orElseThrow();
  }

  private Optional<LandingPage> findLandingPageAny(String orgId, String slug) {
    return jdbc
        .query(
            """
            SELECT id, org_id, campaign_id, slug, title, headline, body_text, status
            FROM lo_landing_pages WHERE org_id = ? AND slug = ?
            """,
            (rs, i) -> mapPage(rs),
            orgId,
            slug)
        .stream()
        .findFirst();
  }

  public Optional<LandingPage> findLandingPage(String orgId, String slug) {
    return jdbc
        .query(
            """
            SELECT id, org_id, campaign_id, slug, title, headline, body_text, status
            FROM lo_landing_pages WHERE org_id = ? AND slug = ? AND status = 'published'
            """,
            (rs, i) -> mapPage(rs),
            orgId,
            slug)
        .stream()
        .findFirst();
  }

  private static LandingPage mapPage(java.sql.ResultSet rs) throws java.sql.SQLException {
    return new LandingPage(
        rs.getString("id"),
        rs.getString("org_id"),
        rs.getString("campaign_id"),
        rs.getString("slug"),
        rs.getString("title"),
        rs.getString("headline"),
        rs.getString("body_text"),
        rs.getString("status"));
  }

  public Lead createLead(
      String orgId,
      String campaignId,
      String pageId,
      String fullName,
      String email,
      String phone,
      String payloadJson) {
    String id = UUID.randomUUID().toString();
    jdbc.update(
        """
        INSERT INTO lo_leads
          (id, org_id, campaign_id, page_id, full_name, email, phone, source, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'landing_page', ?)
        """,
        id,
        orgId,
        campaignId,
        pageId,
        fullName,
        email,
        phone,
        payloadJson == null ? "{}" : payloadJson);
    return listLeads(orgId).stream().filter(l -> l.id().equals(id)).findFirst().orElseThrow();
  }

  public List<Lead> listLeads(String orgId) {
    return jdbc.query(
        """
        SELECT id, org_id, campaign_id, page_id, full_name, email, phone, source,
               CAST(created_at AS VARCHAR) AS created_at
        FROM lo_leads WHERE org_id = ? ORDER BY created_at DESC
        """,
        (rs, i) ->
            new Lead(
                rs.getString("id"),
                rs.getString("org_id"),
                rs.getString("campaign_id"),
                rs.getString("page_id"),
                rs.getString("full_name"),
                rs.getString("email"),
                rs.getString("phone"),
                rs.getString("source"),
                rs.getString("created_at")),
        orgId);
  }

  public String saveLaunchPlan(Map<String, Object> plan) {
    String id = UUID.randomUUID().toString();
    jdbc.update(
        """
        INSERT INTO lo_meta_launch_plans
          (id, org_id, local_campaign_id, name, geo, budget_amount, currency, primary_text, headline,
           landing_page_url, meta_campaign_id, meta_adset_id, meta_ad_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        id,
        plan.get("orgId"),
        plan.get("localCampaignId"),
        plan.get("name"),
        plan.get("geo"),
        plan.get("budgetAmount"),
        plan.get("currency"),
        plan.get("primaryText"),
        plan.get("headline"),
        plan.get("landingPageUrl"),
        plan.get("metaCampaignId"),
        plan.get("metaAdsetId"),
        plan.get("metaAdId"),
        plan.getOrDefault("status", "created_paused"));
    return id;
  }
}
