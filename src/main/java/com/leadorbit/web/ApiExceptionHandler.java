package com.leadorbit.web;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** JSON problem responses for REST APIs only — HTML (@Controller) pages keep Thymeleaf errors. */
@RestControllerAdvice(annotations = RestController.class)
public class ApiExceptionHandler {

  @ExceptionHandler(IllegalStateException.class)
  public ResponseEntity<Map<String, Object>> illegalState(IllegalStateException ex) {
    return problem(HttpStatus.CONFLICT, "Conflict", ex.getMessage());
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Map<String, Object>> illegalArgument(IllegalArgumentException ex) {
    return problem(HttpStatus.BAD_REQUEST, "Validation Error", ex.getMessage());
  }

  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<Map<String, Object>> notFound(NoResourceFoundException ex) {
    return problem(HttpStatus.NOT_FOUND, "Not Found", ex.getResourcePath());
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> generic(Exception ex) {
    String detail = ex.getMessage();
    if (detail != null && detail.contains("JDBC")) {
      detail =
          "Database unreachable. On Render set DATABASE_URL to the Supabase pooler "
              + "(aws-0-…pooler.supabase.com:6543), DATABASE_USERNAME=postgres.<project-ref>, "
              + "and DATABASE_PASSWORD from Supabase → Database settings. Do not use db.<ref>.supabase.co on Render free (IPv6-only).";
    }
    return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Server Error", detail);
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
