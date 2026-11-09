package com.leadorbit.meta;

import com.leadorbit.config.AppProperties;
import com.leadorbit.store.LeadStore;
import com.leadorbit.store.MetaConnectionStore;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class MetaLaunchService {

  private final MetaConnectionStore connections;
  private final LeadStore leads;
  private final MetaGraphClient graph;
  private final MetaOAuthService oauth;
  private final AppProperties app;

  public MetaLaunchService(
      MetaConnectionStore connections,
      LeadStore leads,
      MetaGraphClient graph,
      MetaOAuthService oauth,
      AppProperties app) {
    this.connections = connections;
    this.leads = leads;
    this.graph = graph;
    this.oauth = oauth;
    this.app = app;
  }

  public Map<String, Object> prepare(String orgId, String name, String geo, double budgetAmount) {
    String slug =
        name.toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("^-|-$", "");
    if (slug.isBlank()) {
      slug = "offer";
    }
    String localCampaignId = UUID.randomUUID().toString();
    String headline = name;
    String primary =
        name + ". Serving " + geo + ". Share your details — we will follow up fast.";
    LeadStore.LandingPage page =
        leads.upsertLandingPage(
            orgId,
            localCampaignId,
            slug,
            name,
            headline,
            primary);
    String landingUrl = app.appUrl() + "/p/" + orgId + "/" + page.slug();
    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("id", UUID.randomUUID().toString());
    plan.put("network", "meta");
    plan.put("name", name);
    plan.put("objective", "OUTCOME_LEADS");
    plan.put("geo", geo);
    plan.put("budgetType", "daily");
    plan.put("budgetAmount", budgetAmount);
    plan.put("currency", "INR");
    plan.put("primaryText", primary);
    plan.put("headline", headline);
    plan.put("callToAction", "SIGN_UP");
    plan.put("landingPageUrl", landingUrl);
    plan.put("localCampaignId", localCampaignId);
    plan.put("slug", page.slug());
    plan.put("status", "prepared");
    return plan;
  }

  public Map<String, Object> approve(String orgId, Map<String, Object> plan) throws Exception {
    MetaConnectionStore.Connection conn =
        connections
            .findSecrets(orgId)
            .orElseThrow(() -> new IllegalStateException("Connect Meta for this organization first"));
    if (conn.adAccountId() == null || conn.pageId() == null) {
      throw new IllegalStateException("Select ad account and Page in Connect Meta");
    }
    if (conn.pixelId() == null || conn.pixelId().isBlank()) {
      throw new IllegalStateException("Save a Pixel in Connect Meta for website lead ads");
    }

    String act = MetaIds.normalizeActId(conn.adAccountId());
    String name = String.valueOf(plan.get("name"));
    String geo = String.valueOf(plan.getOrDefault("geo", "US"));
    double budget =
        plan.get("budgetAmount") instanceof Number n
            ? n.doubleValue()
            : Double.parseDouble(String.valueOf(plan.getOrDefault("budgetAmount", 100)));
    String landing = String.valueOf(plan.get("landingPageUrl"));
    String primary = String.valueOf(plan.get("primaryText"));
    String headline = String.valueOf(plan.get("headline"));

    // Country targeting: city names fall back to US for Marketing API geo_locations.countries
    String country = guessCountry(geo);

    String campaignId =
        graph.createObject(
            act + "/campaigns",
            conn.accessToken(),
            Map.of(
                "name",
                name,
                "objective",
                "OUTCOME_LEADS",
                "status",
                "PAUSED",
                "special_ad_categories",
                "[]"));

    Map<String, Object> adsetBody = new LinkedHashMap<>();
    adsetBody.put("name", name + " — " + geo);
    adsetBody.put("campaign_id", campaignId);
    adsetBody.put("billing_event", "IMPRESSIONS");
    adsetBody.put("optimization_goal", "OFFSITE_CONVERSIONS");
    adsetBody.put("bid_strategy", "LOWEST_COST_WITHOUT_CAP");
    adsetBody.put("daily_budget", String.valueOf(Math.round(budget * 100))); // minor units
    adsetBody.put("status", "PAUSED");
    adsetBody.put(
        "targeting",
        "{\"geo_locations\":{\"countries\":[\"" + country + "\"]},\"age_min\":25,\"age_max\":55}");
    adsetBody.put(
        "promoted_object",
        "{\"pixel_id\":\"" + conn.pixelId() + "\",\"custom_event_type\":\"LEAD\"}");
    String adsetId = graph.createObject(act + "/adsets", conn.accessToken(), adsetBody);

    String creativeId =
        graph.createObject(
            act + "/adcreatives",
            conn.accessToken(),
            Map.of(
                "name",
                name + " creative",
                "object_story_spec",
                "{\"page_id\":\""
                    + conn.pageId()
                    + "\",\"link_data\":{\"link\":\""
                    + escapeJson(landing)
                    + "\",\"message\":\""
                    + escapeJson(primary)
                    + "\",\"name\":\""
                    + escapeJson(headline)
                    + "\",\"call_to_action\":{\"type\":\"SIGN_UP\",\"value\":{\"link\":\""
                    + escapeJson(landing)
                    + "\"}}}}"));

    String adId =
        graph.createObject(
            act + "/ads",
            conn.accessToken(),
            Map.of(
                "name",
                name + " ad",
                "adset_id",
                adsetId,
                "creative",
                "{\"creative_id\":\"" + creativeId + "\"}",
                "status",
                "PAUSED"));

    Map<String, Object> saved = new LinkedHashMap<>(plan);
    saved.put("orgId", orgId);
    saved.put("metaCampaignId", campaignId);
    saved.put("metaAdsetId", adsetId);
    saved.put("metaAdId", adId);
    saved.put("status", "created_paused");
    leads.saveLaunchPlan(saved);

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("status", "created_paused");
    result.put("meta_created", true);
    result.put(
        "detail",
        "Meta created PAUSED campaign_id="
            + campaignId
            + " adset_id="
            + adsetId
            + " ad_id="
            + adId
            + ". Confirm in Ads Manager (filter PAUSED). Budget Daily INR "
            + Math.round(budget)
            + "; geo \""
            + geo
            + "\" → country "
            + country
            + "; lead destination=website.");
    result.put("campaign_id", campaignId);
    result.put("adset_id", adsetId);
    result.put("ad_id", adId);
    result.put(
        "meta",
        Map.of("campaign_id", campaignId, "adset_id", adsetId, "ad_id", adId));
    result.put(
        "local",
        Map.of("campaign_id", plan.get("localCampaignId"), "status", "paused"));
    result.put("setupHints", oauth.setupHints());
    result.put(
        "present",
        Map.of(
            "ORG_META_CONNECTION",
            true,
            "ORG_META_PIXEL",
            true,
            "ORG_META_LEAD_FORM",
            conn.leadGenFormId() != null));
    result.put("landingPageUrl", landing);
    return result;
  }

  private static String guessCountry(String geo) {
    if (geo == null) {
      return "US";
    }
    String g = geo.trim().toUpperCase(Locale.ROOT);
    if (g.equals("IN") || g.contains("INDIA") || g.contains("MOHALI") || g.contains("PUNJAB")) {
      // Meta country codes are ISO; city-level needs keys — keep US fallback for city strings
      // unless clearly a country code.
    }
    if (g.length() == 2) {
      return g;
    }
    return "US";
  }

  private static String escapeJson(String value) {
    return value == null
        ? ""
        : value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
  }
}
