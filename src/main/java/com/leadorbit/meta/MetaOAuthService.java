package com.leadorbit.meta;

import com.leadorbit.config.AppProperties;
import com.leadorbit.config.MetaProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class MetaOAuthService {

  public static final List<String> REQUIRED_PERMISSIONS =
      List.of(
          "ads_management",
          "ads_read",
          "pages_show_list",
          "pages_read_engagement",
          "pages_manage_ads",
          "business_management",
          "leads_retrieval");

  private final AppProperties appProperties;
  private final MetaProperties meta;
  private final MetaGraphClient graph;

  public MetaOAuthService(
      AppProperties appProperties, MetaProperties meta, MetaGraphClient graph) {
    this.appProperties = appProperties;
    this.meta = meta;
    this.graph = graph;
  }

  public String redirectUri() {
    if (meta.oauthRedirectUri() != null && !meta.oauthRedirectUri().isBlank()) {
      return meta.oauthRedirectUri().replaceAll("/$", "");
    }
    return appProperties.appUrl() + "/api/v1/meta/oauth/callback";
  }

  public List<String> setupHints() {
    List<String> hints = new ArrayList<>();
    hints.add("Create a Meta App (Business type) in developers.facebook.com");
    hints.add("Add Marketing API + Facebook Login for Business");
    hints.add("Set META_ADS_APP_ID, META_ADS_APP_SECRET, and META_ADS_LOGIN_CONFIG_ID");
    hints.add("Customers Connect Meta (OAuth) per org — ads run on their ad account");
    hints.add("Website lead ads: select Pixel in Connect Meta");
    hints.add("Instant Form lead ads: select form in Connect Meta");
    hints.add("Add Valid OAuth Redirect URI in Meta App → Facebook Login → Settings");
    hints.add("Redirect URI: " + redirectUri());
    return hints;
  }

  public Map<String, Object> buildStartUrl(String state) {
    if (!meta.platformAppReady()) {
      return Map.of(
          "status",
          "pending_configuration",
          "detail",
          "META_ADS_APP_ID and META_ADS_APP_SECRET required",
          "url",
          "",
          "setupHints",
          setupHints());
    }
    String configId = meta.loginConfigId();
    if (configId == null || configId.isBlank() || !configId.matches("\\d{5,32}")) {
      return Map.of(
          "status",
          "pending_configuration",
          "detail",
          "META_ADS_LOGIN_CONFIG_ID missing or invalid",
          "url",
          "",
          "setupHints",
          setupHints());
    }
    String url =
        "https://www.facebook.com/v21.0/dialog/oauth"
            + "?client_id="
            + enc(meta.appId())
            + "&redirect_uri="
            + enc(redirectUri())
            + "&state="
            + enc(state)
            + "&response_type=code"
            + "&config_id="
            + enc(configId);
    return Map.of(
        "status",
        "ready",
        "detail",
        "Facebook Login for Business OAuth start URL ready",
        "url",
        url,
        "setupHints",
        setupHints());
  }

  public MetaGraphClient.TokenExchange exchangeCode(String code) {
    return graph.exchangeCode(meta.appId(), meta.appSecret(), redirectUri(), code);
  }

  public MetaGraphClient.TokenExchange exchangeLongLived(String shortLived) {
    return graph.exchangeLongLived(meta.appId(), meta.appSecret(), shortLived);
  }

  private static String enc(String value) {
    return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
  }
}
