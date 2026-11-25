package com.leadorbit.meta;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class MetaLaunchServiceTest {

  @Test
  void guessCountryMapsIndianCitiesToIn() {
    assertEquals("IN", MetaLaunchService.guessCountry("Rajpura"));
    assertEquals("IN", MetaLaunchService.guessCountry("Mohali"));
    assertEquals("IN", MetaLaunchService.guessCountry("Punjab"));
    assertEquals("IN", MetaLaunchService.guessCountry("IN"));
  }

  @Test
  void guessCountryKeepsIsoCodes() {
    assertEquals("US", MetaLaunchService.guessCountry("US"));
    assertEquals("GB", MetaLaunchService.guessCountry("GB"));
  }

  @Test
  void formatMetaErrorIncludesUserMessageAndSubcode() throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    ObjectNode err = mapper.createObjectNode();
    err.put("message", "(#100) Invalid parameter");
    err.put("error_user_msg", "Must specify True or False in is_adset_budget_sharing_enabled");
    err.put("error_user_title", "Ad set budget sharing must be specified");
    err.put("code", 100);
    err.put("error_subcode", 4834011);
    String formatted = MetaGraphClient.formatMetaError("act_1/campaigns", err);
    assertTrue(formatted.contains("is_adset_budget_sharing_enabled"));
    assertTrue(formatted.contains("4834011"));
    assertTrue(formatted.contains("act_1/campaigns"));
  }
}
