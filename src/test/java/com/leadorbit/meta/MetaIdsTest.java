package com.leadorbit.meta;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class MetaIdsTest {

  @Test
  void normalizeActIdAddsPrefix() {
    assertEquals("act_123", MetaIds.normalizeActId("123"));
    assertEquals("act_123", MetaIds.normalizeActId("act_123"));
  }
}
