package com.leadorbit.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "leadorbit.meta")
public record MetaProperties(
    String appId,
    String appSecret,
    String loginConfigId,
    String oauthRedirectUri,
    boolean allowEnvFallback,
    String accessToken,
    String adAccountId,
    String pageId,
    String pixelId,
    String leadGenFormId) {

  public boolean platformAppReady() {
    return notBlank(appId) && notBlank(appSecret);
  }

  public boolean allowEnvFallback() {
    return allowEnvFallback;
  }

  private static boolean notBlank(String value) {
    return value != null && !value.isBlank();
  }
}
