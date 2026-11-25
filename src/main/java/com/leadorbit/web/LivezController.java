package com.leadorbit.web;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Process liveness — no DB. Used as Render health check so cold starts don't hang on Supabase. */
@RestController
public class LivezController {

  @GetMapping({"/livez", "/healthz"})
  public Map<String, String> livez() {
    return Map.of("status", "ok");
  }
}
