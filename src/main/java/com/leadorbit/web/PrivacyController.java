package com.leadorbit.web;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public privacy policy HTML for Meta App Dashboard.
 * Implemented as a RestController so it does not depend on Thymeleaf deploy state.
 */
@RestController
public class PrivacyController {

  private static final String HTML =
      """
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Privacy Policy — LeadOrbit</title>
        <style>
          body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#111}
          h1,h2{letter-spacing:-.02em} .muted{color:#666}
        </style>
      </head>
      <body>
        <h1>Privacy Policy</h1>
        <p class="muted">Last updated: 9 November 2026</p>
        <h2>Who we are</h2>
        <p>LeadOrbit provides an AI lead and marketing workspace for agencies and growth teams,
        including optional Meta (Facebook) ads features.</p>
        <h2>Data we collect</h2>
        <ul>
          <li>Account and organization details you provide</li>
          <li>Lead form submissions (name, email, phone, and related fields)</li>
          <li>Meta connection identifiers and OAuth tokens you authorize</li>
          <li>Technical logs needed to operate and secure the service</li>
        </ul>
        <h2>How we use data</h2>
        <p>We use data to provide Connect Meta, campaign launch, and lead capture features you request,
        to keep the service secure, and to comply with law. We do not sell personal data.</p>
        <h2>Meta / Facebook</h2>
        <p>When you connect Meta, LeadOrbit uses Facebook Login for Business and the Marketing API
        with permissions you approve. You can disconnect Meta in LeadOrbit settings.</p>
        <h2>Contact</h2>
        <p>Privacy questions: <a href="mailto:mehr.rohit86@gmail.com">mehr.rohit86@gmail.com</a></p>
      </body>
      </html>
      """;

  @GetMapping(value = {"/privacy", "/privacy-policy"}, produces = MediaType.TEXT_HTML_VALUE)
  public String privacy() {
    return HTML;
  }
}
