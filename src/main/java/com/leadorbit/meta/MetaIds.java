package com.leadorbit.meta;

public final class MetaIds {
  private MetaIds() {}

  public static String normalizeActId(String id) {
    if (id == null) {
      return null;
    }
    String trimmed = id.trim();
    return trimmed.startsWith("act_") ? trimmed : "act_" + trimmed;
  }
}
