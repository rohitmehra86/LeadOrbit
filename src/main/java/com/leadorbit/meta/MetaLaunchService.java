package com.leadorbit.meta;

import com.leadorbit.config.AppProperties;
import com.leadorbit.store.LeadStore;
import com.leadorbit.store.MetaConnectionStore;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class MetaLaunchService {

  private static final Set<String> INDIA_GEO_HINTS =
      Set.of(
          "IN",
          "INDIA",
          "BHARAT",
          "PUNJAB",
          "HARYANA",
          "DELHI",
          "NCR",
          "MOHALI",
          "RAJPURA",
          "CHANDIGARH",
          "LUDHIANA",
          "AMRITSAR",
          "PATIALA",
          "JALANDHAR",
          "GURUGRAM",
          "GURGAON",
          "NOIDA",
          "MUMBAI",
          "PUNE",
          "BANGALORE",
          "BENGALURU",
          "HYDERABAD",
          "CHENNAI",
          "KOLKATA",
          "JAIPUR",
          "AHMEDABAD");

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

  public Map<String, Object> prepare(String orgId, Map<String, Object> input) {
    String name = str(input.get("name"), "Lead campaign");
    String geo = str(input.get("geo"), "IN");
    double budget =
        input.get("budgetAmount") instanceof Number n
            ? n.doubleValue()
            : Double.parseDouble(str(input.get("budgetAmount"), "100"));

    String templateId = str(input.get("templateId"), "local_proof");
    Map<String, String> fromTemplate = CreativeTemplates.apply(templateId, name, geo);

    String headline = firstNonBlank(str(input.get("headline"), null), fromTemplate.get("headline"));
    String primary =
        firstNonBlank(str(input.get("primaryText"), null), fromTemplate.get("primaryText"));
    String description =
        firstNonBlank(str(input.get("description"), null), fromTemplate.get("description"));
    String cta =
        CreativeTemplates.normalizeCta(
            firstNonBlank(str(input.get("callToAction"), null), fromTemplate.get("callToAction")));
    String imageUrl = str(input.get("imageUrl"), null);
    String imageBase64 = str(input.get("imageBase64"), null);
    String imageName = str(input.get("imageName"), "ad-creative.jpg");

    if ((imageUrl == null || imageUrl.isBlank())
        && (imageBase64 == null || imageBase64.isBlank())) {
      // Default site creative so Meta ads aren't text-only
      String base = app.appUrl() == null ? "" : app.appUrl().replaceAll("/$", "");
      imageUrl = base + "/images/lead-creative.jpg";
    }

    String slug =
        name.toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("^-|-$", "");
    if (slug.isBlank()) {
      slug = "offer";
    }
    String localCampaignId = UUID.randomUUID().toString();
    LeadStore.LandingPage page =
        leads.upsertLandingPage(orgId, localCampaignId, slug, name, headline, primary);
    String landingUrl = app.appUrl() + "/p/" + orgId + "/" + page.slug();

    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("id", UUID.randomUUID().toString());
    plan.put("network", "meta");
    plan.put("name", name);
    plan.put("objective", "OUTCOME_LEADS");
    plan.put("geo", geo);
    plan.put("budgetType", "daily");
    plan.put("budgetAmount", budget);
    plan.put("currency", "INR");
    plan.put("primaryText", primary);
    plan.put("headline", headline);
    plan.put("description", description);
    plan.put("callToAction", cta);
    plan.put("templateId", fromTemplate.get("templateId"));
    plan.put("templateName", fromTemplate.get("templateName"));
    plan.put("imageUrl", imageUrl);
    if (imageBase64 != null && !imageBase64.isBlank()) {
      // Keep for approve upload; strip data-URL prefix if present
      plan.put("imageBase64", stripDataUrl(imageBase64));
      plan.put("imageName", imageName);
    }
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
    String geo = String.valueOf(plan.getOrDefault("geo", "IN"));
    double budget =
        plan.get("budgetAmount") instanceof Number n
            ? n.doubleValue()
            : Double.parseDouble(String.valueOf(plan.getOrDefault("budgetAmount", 100)));
    String landing = String.valueOf(plan.get("landingPageUrl"));
    String primary = String.valueOf(plan.get("primaryText"));
    String headline = String.valueOf(plan.get("headline"));
    String description = str(plan.get("description"), "");
    String cta = CreativeTemplates.normalizeCta(str(plan.get("callToAction"), "SIGN_UP"));
    String imageUrl = str(plan.get("imageUrl"), null);
    String imageBase64 = str(plan.get("imageBase64"), null);
    String imageName = str(plan.get("imageName"), "ad-creative.jpg");

    String country = guessCountry(geo);
    long dailyBudgetMinor = Math.max(100L, Math.round(budget * 100));

    Map<String, Object> campaignBody = new LinkedHashMap<>();
    campaignBody.put("name", name);
    campaignBody.put("objective", "OUTCOME_LEADS");
    campaignBody.put("status", "PAUSED");
    campaignBody.put("special_ad_categories", "[]");
    campaignBody.put("is_adset_budget_sharing_enabled", "false");
    String campaignId = graph.createObject(act + "/campaigns", conn.accessToken(), campaignBody);

    Map<String, Object> adsetBody = new LinkedHashMap<>();
    adsetBody.put("name", name + " - " + geo);
    adsetBody.put("campaign_id", campaignId);
    adsetBody.put("billing_event", "IMPRESSIONS");
    adsetBody.put("optimization_goal", "OFFSITE_CONVERSIONS");
    adsetBody.put("bid_strategy", "LOWEST_COST_WITHOUT_CAP");
    adsetBody.put("daily_budget", String.valueOf(dailyBudgetMinor));
    adsetBody.put("status", "PAUSED");
    adsetBody.put("destination_type", "WEBSITE");
    adsetBody.put(
        "targeting",
        "{\"geo_locations\":{\"countries\":[\""
            + country
            + "\"]},\"age_min\":18,\"age_max\":65}");
    adsetBody.put(
        "promoted_object",
        "{\"pixel_id\":\""
            + escapeJson(conn.pixelId())
            + "\",\"custom_event_type\":\"LEAD\"}");
    String adsetId = graph.createObject(act + "/adsets", conn.accessToken(), adsetBody);

    String imageHash = null;
    if (imageBase64 != null && !imageBase64.isBlank()) {
      imageHash = graph.uploadAdImage(act, conn.accessToken(), imageBase64, imageName);
    }

    String linkData =
        buildLinkData(landing, primary, headline, description, cta, imageHash, imageUrl);

    String creativeId =
        graph.createObject(
            act + "/adcreatives",
            conn.accessToken(),
            Map.of(
                "name",
                name + " creative",
                "object_story_spec",
                "{\"page_id\":\"" + escapeJson(conn.pageId()) + "\",\"link_data\":" + linkData + "}"));

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
    saved.remove("imageBase64"); // don't persist large blobs
    saved.put("orgId", orgId);
    saved.put("metaCampaignId", campaignId);
    saved.put("metaAdsetId", adsetId);
    saved.put("metaAdId", adId);
    saved.put("metaImageHash", imageHash);
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
            + (imageHash != null ? " with uploaded photo" : imageUrl != null ? " with image URL" : "")
            + ". Confirm in Ads Manager (filter PAUSED).");
    result.put("campaign_id", campaignId);
    result.put("adset_id", adsetId);
    result.put("ad_id", adId);
    result.put(
        "meta",
        Map.of(
            "campaign_id",
            campaignId,
            "adset_id",
            adsetId,
            "ad_id",
            adId,
            "image_hash",
            imageHash == null ? "" : imageHash));
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

  static String buildLinkData(
      String landing,
      String primary,
      String headline,
      String description,
      String cta,
      String imageHash,
      String imageUrl) {
    StringBuilder ld = new StringBuilder("{");
    ld.append("\"link\":\"").append(escapeJson(landing)).append("\"");
    ld.append(",\"message\":\"").append(escapeJson(primary)).append("\"");
    ld.append(",\"name\":\"").append(escapeJson(headline)).append("\"");
    if (description != null && !description.isBlank()) {
      ld.append(",\"description\":\"").append(escapeJson(description)).append("\"");
    }
    if (imageHash != null && !imageHash.isBlank()) {
      ld.append(",\"image_hash\":\"").append(escapeJson(imageHash)).append("\"");
    } else if (imageUrl != null && !imageUrl.isBlank()) {
      ld.append(",\"picture\":\"").append(escapeJson(imageUrl)).append("\"");
    }
    ld.append(",\"call_to_action\":{\"type\":\"")
        .append(escapeJson(cta))
        .append("\",\"value\":{\"link\":\"")
        .append(escapeJson(landing))
        .append("\"}}");
    ld.append('}');
    return ld.toString();
  }

  static String guessCountry(String geo) {
    if (geo == null || geo.isBlank()) {
      return "IN";
    }
    String g = geo.trim().toUpperCase(Locale.ROOT);
    if (g.length() == 2 && Character.isLetter(g.charAt(0)) && Character.isLetter(g.charAt(1))) {
      return g;
    }
    for (String hint : INDIA_GEO_HINTS) {
      if (g.equals(hint) || g.contains(hint)) {
        return "IN";
      }
    }
    if (g.contains("USA") || g.contains("UNITED STATES") || g.equals("US")) {
      return "US";
    }
    return "IN";
  }

  private static String stripDataUrl(String value) {
    String v = value.trim();
    int idx = v.indexOf("base64,");
    if (idx >= 0) {
      return v.substring(idx + "base64,".length()).trim();
    }
    // validate it's roughly base64
    try {
      Base64.getDecoder().decode(v.substring(0, Math.min(64, v.length())));
    } catch (IllegalArgumentException ignored) {
      // still pass through; Meta will reject if invalid
    }
    return v;
  }

  private static String str(Object value, String fallback) {
    if (value == null) {
      return fallback;
    }
    String s = String.valueOf(value).trim();
    return s.isBlank() || "null".equals(s) ? fallback : s;
  }

  private static String firstNonBlank(String a, String b) {
    if (a != null && !a.isBlank()) {
      return a;
    }
    return b;
  }

  private static String escapeJson(String value) {
    return value == null
        ? ""
        : value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
  }
}
