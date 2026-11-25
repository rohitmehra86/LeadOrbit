package com.leadorbit.web;

import com.leadorbit.config.SupabaseProperties;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataAccessException;
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
  public Map<String, Object> health(@Value("${spring.application.name}") String name) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("app", name);
    body.put("profiles", String.join(",", env.getActiveProfiles()));
    body.put("supabaseUrl", supabase.url() == null ? "" : supabase.url());
    body.put("databaseUrlHost", hostHint(env.getProperty("DATABASE_URL", "")));
    body.put("databaseUserSet", notBlank(env.getProperty("DATABASE_USERNAME")));
    body.put("databasePasswordSet", notBlank(env.getProperty("DATABASE_PASSWORD")));
    try {
      Integer one = jdbc.queryForObject("SELECT 1", Integer.class);
      body.put("status", "ok");
      body.put("db", one != null && one == 1 ? "up" : "down");
    } catch (DataAccessException ex) {
      body.put("status", "degraded");
      body.put("db", "down");
      body.put(
          "dbHint",
          "Use pooler jdbc:postgresql://aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
              + "?sslmode=require&prepareThreshold=0 and user postgres.kqmuxocbmtydkxdvmypy."
              + " Direct db.*.supabase.co is IPv6-only and fails on Render free.");
    }
    return body;
  }

  private static boolean notBlank(String s) {
    return s != null && !s.isBlank();
  }

  private static String hostHint(String url) {
    if (url == null || url.isBlank()) {
      return "(empty)";
    }
    try {
      String u = url.replaceFirst("^jdbc:", "").replaceFirst("^postgresql://", "");
      u = u.replaceFirst("^postgres://", "");
      if (u.contains("@")) {
        u = u.substring(u.indexOf('@') + 1);
      }
      return u.split("[/?]", 2)[0];
    } catch (Exception e) {
      return "(parse-error)";
    }
  }
}
