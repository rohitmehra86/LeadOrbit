package com.leadorbit.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "leadorbit")
public record AppProperties(String appUrl) {

  public String appUrl() {
    String url = appUrl == null || appUrl.isBlank() ? "http://127.0.0.1:43127" : appUrl;
    return url.replaceAll("/$", "");
  }
}
