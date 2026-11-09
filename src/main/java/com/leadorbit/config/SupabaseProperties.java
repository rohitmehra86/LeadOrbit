package com.leadorbit.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "leadorbit.supabase")
public record SupabaseProperties(String url, String anonKey, String projectRef) {}
