package com.leadorbit.meta;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Trending Meta lead-ad copy patterns (2025): benefit-first, urgency, UGC tone, local proof. */
public final class CreativeTemplates {

  private CreativeTemplates() {}

  public static List<Map<String, Object>> catalog() {
    List<Map<String, Object>> out = new ArrayList<>();
    out.add(
        template(
            "local_proof",
            "Local proof",
            "Trending for property & services",
            "People nearby are enquiring — limited inventory.",
            "Homes in {geo} worth a look",
            "Share your number. We reply the same day.",
            "SIGN_UP",
            "Authentic / neighborhood angle"));
    out.add(
        template(
            "benefit_first",
            "Benefit first",
            "High CTR pattern",
            "Ready to move? Get floor plans, pricing & a site visit slot.",
            "{name} — details in 1 tap",
            "No spam. Just clear options for {geo}.",
            "LEARN_MORE",
            "Clarity + low friction CTA"));
    out.add(
        template(
            "urgency",
            "Soft urgency",
            "Feed-native hook",
            "This week only: walkthrough slots for {name} in {geo}.",
            "Book a visit before weekend",
            "Tell us preferred time — we confirm quickly.",
            "GET_QUOTE",
            "Time-bound without fake scarcity"));
    out.add(
        template(
            "ugc_voice",
            "UGC voice",
            "Reels / mobile feed style",
            "Saw this in {geo} and had to share — looks solid for the price.",
            "Would you shortlist {name}?",
            "Drop your WhatsApp-ready number for a call-back.",
            "SIGN_UP",
            "Conversational, social-proof tone"));
    out.add(
        template(
            "checklist",
            "Checklist offer",
            "Lead magnet style",
            "Get the free checklist: price band, amenities, and paperwork for {geo}.",
            "Free {name} buyer checklist",
            "Enter details — PDF-style brief over call/SMS.",
            "DOWNLOAD",
            "Value exchange for higher intent"));
    out.add(
        template(
            "question",
            "Question hook",
            "Stop-the-scroll",
            "Looking for a flat in {geo}? Tell us your budget — we'll match options.",
            "What's your budget for {name}?",
            "Takes 20 seconds. Zero obligation.",
            "CONTACT_US",
            "Question → lead form"));
    return out;
  }

  public static Map<String, String> apply(String templateId, String name, String geo) {
    String n = blankTo(name, "Your offer");
    String g = blankTo(geo, "your city");
    Map<String, Object> match =
        catalog().stream()
            .filter(t -> templateId != null && templateId.equals(t.get("id")))
            .findFirst()
            .orElse(catalog().get(0));
    return Map.of(
        "primaryText", fill(String.valueOf(match.get("primaryText")), n, g),
        "headline", fill(String.valueOf(match.get("headline")), n, g),
        "description", fill(String.valueOf(match.get("description")), n, g),
        "callToAction", String.valueOf(match.get("callToAction")),
        "templateId", String.valueOf(match.get("id")),
        "templateName", String.valueOf(match.get("name")));
  }

  private static Map<String, Object> template(
      String id,
      String name,
      String trend,
      String primary,
      String headline,
      String description,
      String cta,
      String tip) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", id);
    m.put("name", name);
    m.put("trend", trend);
    m.put("primaryText", primary);
    m.put("headline", headline);
    m.put("description", description);
    m.put("callToAction", cta);
    m.put("tip", tip);
    return m;
  }

  private static String fill(String raw, String name, String geo) {
    return raw.replace("{name}", name).replace("{geo}", geo);
  }

  private static String blankTo(String v, String fallback) {
    if (v == null || v.isBlank()) {
      return fallback;
    }
    return v.trim();
  }

  public static String normalizeCta(String cta) {
    if (cta == null || cta.isBlank()) {
      return "SIGN_UP";
    }
    String c = cta.trim().toUpperCase(Locale.ROOT).replace(' ', '_');
    return switch (c) {
      case "SIGN_UP",
              "LEARN_MORE",
              "GET_QUOTE",
              "DOWNLOAD",
              "CONTACT_US",
              "APPLY_NOW",
              "BOOK_TRAVEL",
              "GET_OFFER",
              "SUBSCRIBE" ->
          c;
      default -> "SIGN_UP";
    };
  }
}
