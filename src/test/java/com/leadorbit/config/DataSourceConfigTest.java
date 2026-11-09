package com.leadorbit.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class DataSourceConfigTest {

  @Test
  void normalizesPostgresUriAndAddsSsl() {
    var n =
        DataSourceConfig.normalize(
            "postgresql://postgres.kqmuxocbmtydkxdvmypy:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
            "ignored",
            "ignored");
    assertTrue(n.jdbcUrl().startsWith("jdbc:postgresql://"));
    assertTrue(n.jdbcUrl().contains("sslmode=require"));
    assertTrue(n.jdbcUrl().contains("prepareThreshold=0"));
    assertEquals("postgres.kqmuxocbmtydkxdvmypy", n.username());
    assertEquals("secret", n.password());
  }
}
