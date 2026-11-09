package com.leadorbit.web;

import com.leadorbit.config.SupabaseProperties;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

  private final JdbcTemplate jdbc;
  private final Environment env;
  private final SupabaseProperties supabase;

  public HealthController(JdbcTemplate jdbc, Environment env, SupabaseProperties supabase) {
    this.jdbc = jdbc;
    this.env = env;
    this.supabase = supabase;
  }

  @GetMapping("/api/v1/health")
  public Map<String, Object> health(
      @Value("${spring.application.name}") String name) {
    Integer one = jdbc.queryForObject("SELECT 1", Integer.class);
    return Map.of(
        "status",
        "ok",
        "app",
        name,
        "profiles",
        String.join(",", env.getActiveProfiles()),
        "db",
        one != null && one == 1 ? "up" : "down",
        "supabaseUrl",
        supabase.url() == null ? "" : supabase.url());
  }
}
