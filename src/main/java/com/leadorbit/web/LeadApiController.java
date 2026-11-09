package com.leadorbit.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.leadorbit.store.LeadStore;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LeadApiController {

  private final LeadStore leads;
  private final ObjectMapper mapper;

  public LeadApiController(LeadStore leads, ObjectMapper mapper) {
    this.leads = leads;
    this.mapper = mapper;
  }

  @GetMapping("/api/v1/orgs/{orgId}/leads")
  public Map<String, Object> list(@PathVariable String orgId) {
    return Map.of("items", leads.listLeads(orgId));
  }

  @PostMapping("/api/v1/public/forms/{orgId}/submit")
  public ResponseEntity<Map<String, Object>> submit(
      @PathVariable String orgId, @RequestBody Map<String, Object> body) throws Exception {
    String fullName = str(body.get("fullName"));
    String email = str(body.get("email"));
    String phone = str(body.get("phone"));
    if (fullName == null || email == null) {
      throw new IllegalArgumentException("fullName and email are required");
    }
    String campaignId = str(body.get("campaignId"));
    String pageId = str(body.get("pageId"));
    var lead =
        leads.createLead(
            orgId, campaignId, pageId, fullName, email, phone, mapper.writeValueAsString(body));
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("item", lead));
  }

  private static String str(Object value) {
    if (value == null) {
      return null;
    }
    String s = String.valueOf(value).trim();
    return s.isBlank() ? null : s;
  }
}
