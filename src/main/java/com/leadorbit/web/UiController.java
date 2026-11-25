package com.leadorbit.web;

import com.leadorbit.store.LeadStore;
import com.leadorbit.store.MetaConnectionStore;
import java.util.List;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class UiController {

  public static final String DEMO_ORG = "33333333-3333-4333-8333-333333333333";

  private static final String DB_HINT =
      "Database unreachable. On Render set DATABASE_URL to the Supabase pooler "
          + "(aws-0-ap-northeast-1.pooler.supabase.com:6543), "
          + "DATABASE_USERNAME=postgres.kqmuxocbmtydkxdvmypy, and DATABASE_PASSWORD "
          + "from Supabase → Database. Do not use db.*.supabase.co (IPv6-only on Render free).";

  private final MetaConnectionStore connections;
  private final LeadStore leads;

  public UiController(MetaConnectionStore connections, LeadStore leads) {
    this.connections = connections;
    this.leads = leads;
  }

  @GetMapping("/")
  public String home(Model model) {
    String orgId = DEMO_ORG;
    model.addAttribute("orgId", orgId);
    fillDashboard(orgId, model);
    return "home";
  }

  @GetMapping("/app/orgs/{orgId}")
  public String orgHome(@PathVariable String orgId, Model model) {
    model.addAttribute("orgId", orgId);
    fillDashboard(orgId, model);
    return "home";
  }

  /** Public privacy policy for Meta App Dashboard / OAuth review. */
  @GetMapping({"/privacy", "/privacy-policy"})
  public String privacy() {
    return "privacy";
  }

  @GetMapping("/app/orgs/{orgId}/settings/meta-connect")
  public String metaConnect(
      @PathVariable String orgId,
      @RequestParam(required = false) String step,
      @RequestParam(required = false) String nonce,
      @RequestParam(required = false) String error,
      @RequestParam(required = false) String connected,
      Model model) {
    model.addAttribute("orgId", orgId);
    model.addAttribute("step", step == null ? "status" : step);
    model.addAttribute("nonce", nonce);
    model.addAttribute("connected", connected);
    try {
      model.addAttribute("connection", connections.toPublic(orgId));
      model.addAttribute("error", error);
    } catch (DataAccessException ex) {
      model.addAttribute(
          "connection",
          new MetaConnectionStore.PublicConnection(orgId, null, null, null, null, false));
      model.addAttribute("error", error != null ? error : "db_unavailable");
      model.addAttribute("dbHint", DB_HINT);
    }
    return "meta-connect";
  }

  @GetMapping("/app/orgs/{orgId}/marketing")
  public String marketing(@PathVariable String orgId, Model model) {
    model.addAttribute("orgId", orgId);
    try {
      model.addAttribute("connection", connections.toPublic(orgId));
    } catch (DataAccessException ex) {
      model.addAttribute(
          "connection",
          new MetaConnectionStore.PublicConnection(orgId, null, null, null, null, false));
      model.addAttribute("dbHint", DB_HINT);
    }
    return "marketing";
  }

  @GetMapping("/app/orgs/{orgId}/campaigns")
  public String campaigns(@PathVariable String orgId, Model model) {
    model.addAttribute("orgId", orgId);
    try {
      model.addAttribute("campaigns", leads.listLaunchPlans(orgId));
    } catch (DataAccessException ex) {
      model.addAttribute("campaigns", List.of());
      model.addAttribute("dbHint", DB_HINT);
    }
    return "campaigns";
  }

  @GetMapping("/app/orgs/{orgId}/leads")
  public String leadsPage(@PathVariable String orgId, Model model) {
    model.addAttribute("orgId", orgId);
    try {
      model.addAttribute("leads", leads.listLeads(orgId));
    } catch (DataAccessException ex) {
      model.addAttribute("leads", List.of());
      model.addAttribute("dbHint", DB_HINT);
    }
    return "leads";
  }

  @GetMapping("/p/{orgId}/{slug}")
  public String landing(@PathVariable String orgId, @PathVariable String slug, Model model) {
    var page =
        leads
            .findLandingPage(orgId, slug)
            .orElseThrow(() -> new IllegalArgumentException("Landing page not found"));
    model.addAttribute("orgId", orgId);
    model.addAttribute("page", page);
    return "landing";
  }

  private void fillDashboard(String orgId, Model model) {
    try {
      var conn = connections.toPublic(orgId);
      model.addAttribute("connection", conn);
      model.addAttribute("leadCount", leads.countLeads(orgId));
      model.addAttribute("launchCount", leads.countLaunchPlans(orgId));
      model.addAttribute("recentCampaigns", leads.listLaunchPlans(orgId).stream().limit(5).toList());
    } catch (DataAccessException ex) {
      model.addAttribute(
          "connection",
          new MetaConnectionStore.PublicConnection(orgId, null, null, null, null, false));
      model.addAttribute("leadCount", 0);
      model.addAttribute("launchCount", 0);
      model.addAttribute("recentCampaigns", List.of());
      model.addAttribute("dbHint", DB_HINT);
    }
  }
}
