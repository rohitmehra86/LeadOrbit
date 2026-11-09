package com.leadorbit.web;

import com.leadorbit.meta.MetaGraphClient;
import com.leadorbit.meta.MetaLaunchService;
import com.leadorbit.meta.MetaOAuthService;
import com.leadorbit.store.MetaConnectionStore;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

@RestController
public class MetaApiController {

  private final MetaOAuthService oauth;
  private final MetaGraphClient graph;
  private final MetaConnectionStore connections;
  private final MetaLaunchService launch;

  public MetaApiController(
      MetaOAuthService oauth,
      MetaGraphClient graph,
      MetaConnectionStore connections,
      MetaLaunchService launch) {
    this.oauth = oauth;
    this.graph = graph;
    this.connections = connections;
    this.launch = launch;
  }

  @GetMapping("/api/v1/orgs/{orgId}/meta/status")
  public Map<String, Object> status(@PathVariable String orgId) {
    var pub = connections.toPublic(orgId);
    return Map.of(
        "item",
        Map.of(
            "connection",
            pub,
            "setupHints",
            oauth.setupHints(),
            "connected",
            pub.connected()));
  }

  @PostMapping("/api/v1/orgs/{orgId}/meta/oauth/start")
  public Map<String, Object> start(@PathVariable String orgId) {
    String nonce = MetaConnectionStore.newNonce();
    String state = orgId + "." + nonce;
    // store empty pending marker until callback fills token
    connections.savePending(nonce, orgId, "local-user", "");
    return oauth.buildStartUrl(state);
  }

  @GetMapping("/api/v1/meta/oauth/callback")
  public RedirectView callback(
      @RequestParam(required = false) String code,
      @RequestParam(required = false) String state,
      @RequestParam(required = false) String error,
      @RequestParam(name = "error_description", required = false) String errorDescription)
      throws Exception {
    if (state == null || !state.contains(".")) {
      return new RedirectView("/?error=invalid_state");
    }
    String[] parts = state.split("\\.", 2);
    String orgId = parts[0];
    String nonce = parts[1];
    if (error != null) {
      return new RedirectView(
          "/app/orgs/"
              + orgId
              + "/settings/meta-connect?error="
              + java.net.URLEncoder.encode(
                  errorDescription == null ? error : errorDescription,
                  java.nio.charset.StandardCharsets.UTF_8));
    }
    if (code == null || code.isBlank()) {
      return new RedirectView("/app/orgs/" + orgId + "/settings/meta-connect?error=missing_code");
    }
    var shortLived = oauth.exchangeCode(code);
    if (!shortLived.ok()) {
      return new RedirectView(
          "/app/orgs/"
              + orgId
              + "/settings/meta-connect?error="
              + java.net.URLEncoder.encode(shortLived.error(), java.nio.charset.StandardCharsets.UTF_8));
    }
    var longLived = oauth.exchangeLongLived(shortLived.accessToken());
    String token = longLived.ok() ? longLived.accessToken() : shortLived.accessToken();
    connections.savePending(nonce, orgId, "local-user", token);
    return new RedirectView(
        "/app/orgs/" + orgId + "/settings/meta-connect?step=pick&nonce=" + nonce);
  }

  @GetMapping({
    "/api/v1/orgs/{orgId}/meta/assets",
    "/api/v1/orgs/{orgId}/meta/oauth/assets"
  })
  public Map<String, Object> assets(
      @PathVariable String orgId,
      @RequestParam(required = false) String nonce,
      @RequestParam(required = false) String adAccountId,
      @RequestParam(required = false) String pageId)
      throws Exception {
    String token = resolveToken(orgId, nonce);
    if (adAccountId != null || pageId != null) {
      String formToken = token;
      String pageTokenError = null;
      if (pageId != null) {
        var pageTok = graph.resolvePageAccessToken(token, pageId);
        if (pageTok.isPresent()) {
          formToken = pageTok.get();
        } else {
          pageTokenError = "Page access token unavailable — reconnect Connect Meta";
        }
      }
      List<MetaGraphClient.NamedId> pixels =
          adAccountId == null ? List.of() : graph.listPixels(token, adAccountId);
      List<MetaGraphClient.NamedId> forms =
          pageId == null ? List.of() : graph.listLeadForms(formToken, pageId);
      Map<String, Object> body = new HashMap<>();
      body.put("pixels", pixels);
      body.put("leadForms", forms);
      body.put(
          "pixelError",
          pixels.isEmpty()
              ? "No Pixels on this ad account. Paste Pixel ID and Save."
              : null);
      body.put(
          "leadFormError",
          pageId == null
              ? null
              : pageTokenError != null
                  ? pageTokenError
                  : forms.isEmpty()
                      ? "No Instant Forms on this Page. Create one in Meta Ads Manager."
                      : null);
      return body;
    }
    return Map.of(
        "adAccounts",
        graph.listAdAccounts(token),
        "pages",
        graph.listPages(token).stream()
            .map(p -> Map.of("id", p.id(), "name", p.name()))
            .toList());
  }

  @PostMapping("/api/v1/orgs/{orgId}/meta/oauth/complete")
  public Map<String, Object> complete(
      @PathVariable String orgId, @RequestBody Map<String, String> body) {
    String nonce = body.get("nonce");
    String adAccountId = body.get("adAccountId");
    String pageId = body.get("pageId");
    String pixelId = body.get("pixelId");
    String leadGenFormId = body.get("leadGenFormId");
    var pending =
        connections
            .loadPending(nonce)
            .orElseThrow(() -> new IllegalArgumentException("OAuth session expired"));
    if (!orgId.equals(pending.get("orgId"))) {
      throw new IllegalArgumentException("OAuth session org mismatch");
    }
    String token = pending.get("accessToken");
    if (token == null || token.isBlank()) {
      throw new IllegalArgumentException("OAuth token not ready");
    }
    connections.upsert(
        orgId, token, adAccountId, pageId, pixelId, leadGenFormId, Instant.now().plusSeconds(60L * 60 * 24 * 55));
    connections.clearPending(orgId);
    return Map.of("item", connections.toPublic(orgId));
  }

  @PatchMapping("/api/v1/orgs/{orgId}/meta/connection")
  public Map<String, Object> patchConnection(
      @PathVariable String orgId, @RequestBody Map<String, String> body) {
    connections.updateLeadAssets(orgId, body.get("pixelId"), body.get("leadGenFormId"));
    return Map.of("item", connections.toPublic(orgId));
  }

  @PostMapping("/api/v1/orgs/{orgId}/meta/oauth/disconnect")
  public Map<String, Object> disconnect(@PathVariable String orgId) {
    connections.disconnect(orgId);
    return Map.of("ok", true);
  }

  @PostMapping("/api/v1/orgs/{orgId}/meta/launch")
  public ResponseEntity<Map<String, Object>> launch(
      @PathVariable String orgId, @RequestBody Map<String, Object> body) throws Exception {
    String action = String.valueOf(body.getOrDefault("action", "prepare"));
    if ("prepare".equals(action)) {
      String name = String.valueOf(body.getOrDefault("name", "Lead campaign"));
      String geo = String.valueOf(body.getOrDefault("geo", "US"));
      double budget =
          body.get("budgetAmount") instanceof Number n
              ? n.doubleValue()
              : 100d;
      Map<String, Object> plan = launch.prepare(orgId, name, geo, budget);
      return ResponseEntity.ok(Map.of("item", Map.of("status", "prepared", "plan", plan));
    }
    if ("approve".equals(action)) {
      @SuppressWarnings("unchecked")
      Map<String, Object> plan =
          body.get("plan") instanceof Map<?, ?> m
              ? (Map<String, Object>) m
              : Map.of();
      Map<String, Object> result = launch.approve(orgId, new HashMap<>(plan));
      result.put("item", result);
      return ResponseEntity.ok(result);
    }
    throw new IllegalArgumentException("action must be prepare or approve");
  }

  private String resolveToken(String orgId, String nonce) {
    if (nonce != null && !nonce.isBlank()) {
      return connections
          .loadPending(nonce)
          .filter(p -> orgId.equals(p.get("orgId")))
          .map(p -> p.get("accessToken"))
          .filter(t -> t != null && !t.isBlank())
          .orElseThrow(() -> new IllegalArgumentException("OAuth token not ready"));
    }
    return connections
        .findSecrets(orgId)
        .map(MetaConnectionStore.Connection::accessToken)
        .orElseThrow(() -> new IllegalArgumentException("OAuth token not ready — reconnect Connect Meta"));
  }
}
