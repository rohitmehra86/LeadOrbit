package com.leadorbit.web;

import com.leadorbit.store.LeadStore;
import com.leadorbit.store.MetaConnectionStore;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class UiController {

  public static final String DEMO_ORG = "33333333-3333-4333-8333-333333333333";

  private final MetaConnectionStore connections;
  private final LeadStore leads;

  public UiController(MetaConnectionStore connections, LeadStore leads) {
    this.connections = connections;
    this.leads = leads;
  }

  @GetMapping("/")
  public String home(Model model) {
    model.addAttribute("orgId", DEMO_ORG);
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
    model.addAttribute("error", error);
    model.addAttribute("connected", connected);
    model.addAttribute("connection", connections.toPublic(orgId));
    return "meta-connect";
  }

  @GetMapping("/app/orgs/{orgId}/marketing")
  public String marketing(@PathVariable String orgId, Model model) {
    model.addAttribute("orgId", orgId);
    model.addAttribute("connection", connections.toPublic(orgId));
    return "marketing";
  }

  @GetMapping("/app/orgs/{orgId}/leads")
  public String leadsPage(@PathVariable String orgId, Model model) {
    model.addAttribute("orgId", orgId);
    model.addAttribute("leads", leads.listLeads(orgId));
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
}
