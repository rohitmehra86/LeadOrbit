package com.leadorbit.web;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

  @ExceptionHandler(IllegalStateException.class)
  public ResponseEntity<Map<String, Object>> illegalState(IllegalStateException ex) {
    return problem(HttpStatus.CONFLICT, "Conflict", ex.getMessage());
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Map<String, Object>> illegalArgument(IllegalArgumentException ex) {
    return problem(HttpStatus.BAD_REQUEST, "Validation Error", ex.getMessage());
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> generic(Exception ex) {
    return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Server Error", ex.getMessage());
  }

  static ResponseEntity<Map<String, Object>> problem(HttpStatus status, String title, String detail) {
    return ResponseEntity.status(status)
        .header("Content-Type", "application/problem+json")
        .body(
            Map.of(
                "type",
                "https://leadorbit.dev/problems/" + status.value(),
                "title",
                title,
                "status",
                status.value(),
                "detail",
                detail == null ? title : detail));
  }
}
