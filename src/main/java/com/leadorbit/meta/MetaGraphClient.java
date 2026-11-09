package com.leadorbit.meta;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class MetaGraphClient {

  private static final String GRAPH = "https://graph.facebook.com/v21.0";

  private final HttpClient http =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();
  private final ObjectMapper mapper;

  public MetaGraphClient(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public record NamedId(String id, String name) {}

  public record PageOption(String id, String name, String accessToken) {}

  public record TokenExchange(boolean ok, String accessToken, Long expiresIn, String error) {}

  public TokenExchange exchangeCode(
      String appId, String appSecret, String redirectUri, String code) {
    Map<String, String> q = new LinkedHashMap<>();
    q.put("client_id", appId);
    q.put("client_secret", appSecret);
    q.put("redirect_uri", redirectUri);
    q.put("code", code);
    return tokenGet(GRAPH + "/oauth/access_token?" + encode(q));
  }

  public TokenExchange exchangeLongLived(String appId, String appSecret, String shortLived) {
    Map<String, String> q = new LinkedHashMap<>();
    q.put("grant_type", "fb_exchange_token");
    q.put("client_id", appId);
    q.put("client_secret", appSecret);
    q.put("fb_exchange_token", shortLived);
    return tokenGet(GRAPH + "/oauth/access_token?" + encode(q));
  }

  public List<NamedId> listAdAccounts(String accessToken) throws Exception {
    JsonNode data =
        get(GRAPH + "/me/adaccounts?fields=id,name,account_id&limit=50&access_token="
                + enc(accessToken))
            .path("data");
    List<NamedId> out = new ArrayList<>();
    if (data.isArray()) {
      for (JsonNode n : data) {
        out.add(new NamedId(n.path("id").asText(), n.path("name").asText("")));
      }
    }
    return out;
  }

  public List<PageOption> listPages(String accessToken) throws Exception {
    JsonNode data =
        get(GRAPH + "/me/accounts?fields=id,name,access_token&limit=50&access_token="
                + enc(accessToken))
            .path("data");
    List<PageOption> out = new ArrayList<>();
    if (data.isArray()) {
      for (JsonNode n : data) {
        out.add(
            new PageOption(
                n.path("id").asText(),
                n.path("name").asText(""),
                textOrNull(n.path("access_token"))));
      }
    }
    return out;
  }

  public Optional<String> resolvePageAccessToken(String userToken, String pageId) throws Exception {
    return listPages(userToken).stream()
        .filter(p -> pageId.equals(p.id()) && p.accessToken() != null && !p.accessToken().isBlank())
        .map(PageOption::accessToken)
        .findFirst();
  }

  public List<NamedId> listPixels(String accessToken, String adAccountId) throws Exception {
    String act = MetaIds.normalizeActId(adAccountId);
    JsonNode root =
        get(GRAPH + "/" + act + "/adspixels?fields=id,name&limit=50&access_token=" + enc(accessToken));
    List<NamedId> fromAct = namedList(root.path("data"));
    if (!fromAct.isEmpty()) {
      return fromAct;
    }
    JsonNode biz =
        get(GRAPH + "/" + act + "?fields=business{id,name}&access_token=" + enc(accessToken));
    String businessId = textOrNull(biz.path("business").path("id"));
    if (businessId == null) {
      return List.of();
    }
    List<NamedId> merged = new ArrayList<>();
    for (String edge : List.of("owned_pixels", "client_pixels")) {
      JsonNode pixels =
          get(GRAPH + "/" + businessId + "/" + edge + "?fields=id,name&limit=50&access_token="
                  + enc(accessToken))
              .path("data");
      merged.addAll(namedList(pixels));
    }
    Map<String, NamedId> byId = new LinkedHashMap<>();
    for (NamedId p : merged) {
      byId.putIfAbsent(p.id(), p);
    }
    return new ArrayList<>(byId.values());
  }

  public List<NamedId> listLeadForms(String pageAccessToken, String pageId) throws Exception {
    JsonNode data =
        get(GRAPH
                + "/"
                + pageId.trim()
                + "/leadgen_forms?fields=id,name,status&limit=50&access_token="
                + enc(pageAccessToken))
            .path("data");
    return namedList(data);
  }

  public String createObject(String path, String accessToken, Map<String, Object> body)
      throws Exception {
    JsonNode root = postForm(GRAPH + "/" + path, accessToken, body);
    if (root.has("error")) {
      throw new IllegalStateException(root.path("error").path("message").asText("Meta API error"));
    }
    String id = textOrNull(root.path("id"));
    if (id == null) {
      throw new IllegalStateException("Meta create returned no id: " + root);
    }
    return id;
  }

  private TokenExchange tokenGet(String url) {
    try {
      JsonNode root = get(url);
      if (root.has("error") || !root.has("access_token")) {
        return new TokenExchange(
            false,
            null,
            null,
            root.path("error").path("message").asText("Token exchange failed"));
      }
      Long expires =
          root.has("expires_in") && root.get("expires_in").canConvertToLong()
              ? root.get("expires_in").asLong()
              : null;
      return new TokenExchange(true, root.path("access_token").asText(), expires, null);
    } catch (Exception e) {
      return new TokenExchange(false, null, null, e.getMessage());
    }
  }

  private JsonNode get(String url) throws Exception {
    HttpRequest req =
        HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(45))
            .GET()
            .header("Accept", "application/json")
            .build();
    HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
    return mapper.readTree(res.body());
  }

  private JsonNode postForm(String url, String accessToken, Map<String, Object> body)
      throws Exception {
    StringBuilder form = new StringBuilder("access_token=").append(enc(accessToken));
    for (Map.Entry<String, Object> e : body.entrySet()) {
      if (e.getValue() == null) {
        continue;
      }
      form.append('&')
          .append(enc(e.getKey()))
          .append('=')
          .append(enc(String.valueOf(e.getValue())));
    }
    HttpRequest req =
        HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(60))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(form.toString()))
            .build();
    HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
    return mapper.readTree(res.body());
  }

  private static List<NamedId> namedList(JsonNode data) {
    List<NamedId> out = new ArrayList<>();
    if (data != null && data.isArray()) {
      for (JsonNode n : data) {
        out.add(new NamedId(n.path("id").asText(), n.path("name").asText("")));
      }
    }
    return out;
  }

  private static String textOrNull(JsonNode n) {
    if (n == null || n.isMissingNode() || n.isNull()) {
      return null;
    }
    String t = n.asText();
    return t == null || t.isBlank() ? null : t;
  }

  private static String enc(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  private static String encode(Map<String, String> q) {
    StringBuilder sb = new StringBuilder();
    for (Map.Entry<String, String> e : q.entrySet()) {
      if (sb.length() > 0) {
        sb.append('&');
      }
      sb.append(enc(e.getKey())).append('=').append(enc(e.getValue()));
    }
    return sb.toString();
  }
}
