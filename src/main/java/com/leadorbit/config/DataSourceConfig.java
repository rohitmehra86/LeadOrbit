package com.leadorbit.config;

import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Normalizes DATABASE_URL for Render + Supabase.
 *
 * <p>Render free (and many IPv4-only hosts) cannot reach {@code db.&lt;ref&gt;.supabase.co}
 * (IPv6-only). Always prefer the transaction pooler on port 6543.
 */
@Configuration
@Profile("supabase")
public class DataSourceConfig {

  private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);
  private static final Pattern DIRECT_DB =
      Pattern.compile("(?:jdbc:)?postgresql://db\\.([a-z0-9]+)\\.supabase\\.co(?::\\d+)?(/[^?]*)?", Pattern.CASE_INSENSITIVE);
  private static final String DEFAULT_POOLER =
      "jdbc:postgresql://aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require&prepareThreshold=0";
  private static final String DEFAULT_USER = "postgres.kqmuxocbmtydkxdvmypy";

  @Bean
  DataSource dataSource(
      @Value("${DATABASE_URL:${spring.datasource.url:}}") String rawUrl,
      @Value("${DATABASE_USERNAME:${spring.datasource.username:postgres.kqmuxocbmtydkxdvmypy}}")
          String username,
      @Value("${DATABASE_PASSWORD:${spring.datasource.password:}}") String password) {
    Normalized n = normalize(rawUrl, username, password);
    log.info(
        "Supabase JDBC host={} user={} passwordSet={}. Fix Render → Environment if JDBC fails.",
        hostOf(n.jdbcUrl()),
        n.username(),
        n.password() != null && !n.password().isBlank());

    HikariDataSource ds = new HikariDataSource();
    ds.setJdbcUrl(n.jdbcUrl());
    ds.setUsername(n.username());
    ds.setPassword(n.password());
    ds.setDriverClassName("org.postgresql.Driver");
    ds.setMaximumPoolSize(2);
    ds.setMinimumIdle(0);
    ds.setConnectionTimeout(20_000);
    // Don't block Spring boot if Supabase is slow/unreachable (Render free cold start).
    ds.setInitializationFailTimeout(-1);
    ds.setValidationTimeout(5_000);
    ds.setIdleTimeout(60_000);
    ds.setMaxLifetime(300_000);
    return ds;
  }

  record Normalized(String jdbcUrl, String username, String password) {}

  static Normalized normalize(String rawUrl, String username, String password) {
    if (rawUrl == null || rawUrl.isBlank()) {
      throw new IllegalStateException(
          "DATABASE_URL is empty. On Render set DATABASE_URL to the Supabase pooler JDBC URL.");
    }
    String url = rawUrl.trim();
    String user = username == null || username.isBlank() ? DEFAULT_USER : username.trim();
    String pass = password == null ? "" : password;

    // Rewrite IPv6-only direct host → IPv4 pooler (Render free cannot use db.*.supabase.co).
    Matcher direct = DIRECT_DB.matcher(url);
    if (direct.find()) {
      String ref = direct.group(1);
      log.warn(
          "DATABASE_URL uses IPv6-only host db.{}.supabase.co — rewriting to session/transaction pooler for Render.",
          ref);
      url = DEFAULT_POOLER.replace("kqmuxocbmtydkxdvmypy", ref);
      if (!user.contains(".")) {
        user = "postgres." + ref;
      }
    }

    if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
      try {
        URI uri = URI.create(url);
        String userInfo = uri.getUserInfo();
        if (userInfo != null && !userInfo.isBlank()) {
          String[] parts = userInfo.split(":", 2);
          user = parts[0];
          if (parts.length > 1) {
            pass = parts[1];
          }
        }
        String host = uri.getHost();
        int port = uri.getPort() > 0 ? uri.getPort() : 5432;
        String path = uri.getPath() == null || uri.getPath().isBlank() ? "/postgres" : uri.getPath();
        String query = uri.getQuery();
        StringBuilder jdbc = new StringBuilder("jdbc:postgresql://");
        jdbc.append(host).append(':').append(port).append(path);
        if (query == null || query.isBlank()) {
          jdbc.append("?sslmode=require");
        } else {
          jdbc.append('?').append(query);
          if (!query.contains("sslmode=")) {
            jdbc.append("&sslmode=require");
          }
        }
        url = jdbc.toString();
      } catch (Exception e) {
        throw new IllegalStateException("Invalid DATABASE_URL: " + e.getMessage(), e);
      }
    }

    if (!url.startsWith("jdbc:")) {
      url = "jdbc:postgresql://" + url.replaceFirst("^/+", "");
    }
    if (!url.contains("sslmode=")) {
      url = url + (url.contains("?") ? "&" : "?") + "sslmode=require";
    }
    // PgBouncer transaction pooler + Spring / JDBC prepared statements
    if (url.contains("pooler.supabase.com") && !url.contains("prepareThreshold=")) {
      url = url + (url.contains("?") ? "&" : "?") + "prepareThreshold=0";
    }
    // Pooler requires username postgres.<project-ref>, not bare "postgres"
    if (url.contains("pooler.supabase.com") && "postgres".equalsIgnoreCase(user)) {
      user = DEFAULT_USER;
      log.warn("Pooler username was 'postgres' — using {}", user);
    }
    if (pass.isBlank()) {
      throw new IllegalStateException(
          "DATABASE_PASSWORD is empty. Set it on Render → Environment from Supabase Database settings.");
    }
    return new Normalized(url, user, pass);
  }

  private static String hostOf(String jdbcUrl) {
    try {
      String without = jdbcUrl.replaceFirst("^jdbc:postgresql://", "");
      return without.split("[/?]", 2)[0];
    } catch (Exception e) {
      return "(unknown)";
    }
  }
}
