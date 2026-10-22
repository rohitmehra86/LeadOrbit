import Link from "next/link";

/** Public footer — only real destinations (no dead #). */
export function SiteFooter() {
  return (
    <footer className="lo-site-footer">
      <div className="lo-site-footer-grid">
        <div>
          <p className="lo-mark text-lg text-[var(--lo-fg)]">LeadOrbit</p>
          <p className="mt-2 max-w-xs">
            AI lead & revenue workspace for agencies and growth teams. Capture,
            qualify, and follow through — without a consultant-shaped UI.
          </p>
        </div>
        <div>
          <h3>Product</h3>
          <ul>
            <li>
              <Link href="/signup">Start free</Link>
            </li>
            <li>
              <Link href="/login">Sign in</Link>
            </li>
            <li>
              <Link href="/#capabilities">Capabilities</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3>Resources</h3>
          <ul>
            <li>
              <a
                href="https://github.com/rohitmehra86/LeadOrbit"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </li>
            <li>
              <Link href="/privacy-policy">Privacy Policy</Link>
            </li>
            <li>
              <a href="mailto:mehr.rohit86@gmail.com">Contact</a>
            </li>
          </ul>
        </div>
        <div>
          <h3>Connect</h3>
          <ul>
            <li>
              <a
                href="https://github.com/rohitmehra86/LeadOrbit"
                target="_blank"
                rel="noopener noreferrer"
              >
                Source on GitHub
              </a>
            </li>
            <li>
              <a href="mailto:mehr.rohit86@gmail.com">mehr.rohit86@gmail.com</a>
            </li>
          </ul>
        </div>
      </div>
      <p className="mt-8 text-xs">
        © {new Date().getFullYear()} LeadOrbit. All rights reserved.
      </p>
    </footer>
  );
}
