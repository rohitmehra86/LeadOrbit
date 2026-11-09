package com.leadorbit.config;

import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Normalizes DATABASE_URL for Render + Supabase (jdbc: prefix, postgres:// URIs, pooler).
 */
@Configuration
@Profile("supabase")
public class DataSourceConfig {

  private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);

  @Bean
  DataSource dataSource(
      @Value("${DATABASE_URL:${spring.datasource.url:}}") String rawUrl,
      @Value("${DATABASE_USERNAME:${spring.datasource.username:postgres.kqmuxocbmtydkxdvmypy}}")
          String username,
      @Value("${DATABASE_PASSWORD:${spring.datasource.password:}}") String password) {
    Normalized n = normalize(rawUrl, username, password);
    log.info(
        "Supabase JDBC host={} user={} (ssl required). If boot fails here, fix DATABASE_URL / password on Render → Environment.",
        hostOf(n.jdbcUrl()),
        n.username());

    HikariDataSource ds = new HikariDataSource();
    ds.setJdbcUrl(n.jdbcUrl());
    ds.setUsername(n.username());
    ds.setPassword(n.password());
    ds.setDriverClassName("org.postgresql.Driver");
    ds.setMaximumPoolSize(3);
    ds.setMinimumIdle(0);
    ds.setConnectionTimeout(25_000);
    ds.setInitializationFailTimeout(30_000);
    return ds;
  }

  record Normalized(String jdbcUrl, String username, String password) {}

  static Normalized normalize(String rawUrl, String username, String password) {
    if (rawUrl == null || rawUrl.isBlank()) {
      throw new IllegalStateException(
          "DATABASE_URL is empty. On Render set DATABASE_URL to the Supabase pooler JDBC URL.");
    }
    String url = rawUrl.trim();
    String user = username;
    String pass = password == null ? "" : password;

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
      if (url.startsWith("postgresql://")) {
        url = "jdbc:" + url;
      } else {
        url = "jdbc:postgresql://" + url.replaceFirst("^/+", "");
      }
    }
    if (!url.contains("sslmode=")) {
      url = url + (url.contains("?") ? "&" : "?") + "sslmode=require";
    }
    // PgBouncer / Supabase transaction pooler + Spring
    if (url.contains("pooler.supabase.com") && !url.contains("prepareThreshold=")) {
      url = url + (url.contains("?") ? "&" : "?") + "prepareThreshold=0";
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
