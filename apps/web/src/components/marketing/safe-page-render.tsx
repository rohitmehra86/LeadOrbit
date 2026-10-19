import type { ReactNode } from "react";
import type { LandingPage, PageBlock } from "@leadorbit/domain";

/** Renders only allowlisted block types — never executes arbitrary scripts. */
export function SafePageRender({
  page,
  mobilePreview = false,
  formSlot,
}: {
  page: LandingPage;
  mobilePreview?: boolean;
  formSlot?: ReactNode;
}) {
  return (
    <article
      className={`mx-auto space-y-8 ${mobilePreview ? "max-w-sm border border-[var(--lo-border)] p-4" : "max-w-3xl"}`}
    >
      {page.document.seo.title ? (
        <header className="sr-only">
          <h1>{page.document.seo.title}</h1>
          <p>{page.document.seo.description}</p>
        </header>
      ) : null}
      {page.document.blocks.map((block) => (
        <Block key={block.id} block={block} formSlot={formSlot} />
      ))}
      {page.document.consentNotice ? (
        <p className="text-xs text-[var(--lo-fg-muted)]">
          {page.document.consentNotice}
        </p>
      ) : null}
    </article>
  );
}

function Block({
  block,
  formSlot,
}: {
  block: PageBlock;
  formSlot?: ReactNode;
}) {
  const p = block.props;
  switch (block.type) {
    case "hero":
      return (
        <section className="lo-rise space-y-3 py-8">
          <h2 className="text-4xl font-semibold tracking-tight">
            {String(p.headline ?? "")}
          </h2>
          <p className="text-lg text-[var(--lo-fg-muted)]">
            {String(p.subheadline ?? "")}
          </p>
          {p.ctaLabel ? (
            <button
              type="button"
              className="rounded-md bg-[var(--lo-accent)] px-4 py-2 text-sm font-medium text-[var(--lo-accent-fg)]"
            >
              {String(p.ctaLabel)}
            </button>
          ) : null}
        </section>
      );
    case "rich_text":
      return (
        <p className="whitespace-pre-wrap text-[var(--lo-fg-muted)]">
          {String(p.body ?? "")}
        </p>
      );
    case "cta":
      return (
        <div className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] px-4 py-6 text-center">
          <p className="mb-3 font-medium">{String(p.label ?? "Continue")}</p>
          <button
            type="button"
            className="rounded-md bg-[var(--lo-accent)] px-4 py-2 text-sm text-[var(--lo-accent-fg)]"
          >
            {String(p.buttonLabel ?? "Learn more")}
          </button>
        </div>
      );
    case "image":
      return p.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={String(p.src)}
          alt={String(p.alt ?? "")}
          className="max-h-80 w-full object-cover"
        />
      ) : (
        <div className="flex h-40 items-center justify-center border border-dashed border-[var(--lo-border)] text-sm text-[var(--lo-fg-muted)]">
          Image placeholder
        </div>
      );
    case "features": {
      const items = Array.isArray(p.items) ? p.items.map(String) : [];
      return (
        <ul className="grid gap-2 sm:grid-cols-3">
          {items.map((item) => (
            <li
              key={item}
              className="rounded-md border border-[var(--lo-border)] px-3 py-4 text-sm"
            >
              {item}
            </li>
          ))}
        </ul>
      );
    }
    case "testimonial":
      return (
        <blockquote className="border-l-2 border-[var(--lo-accent)] pl-4 text-[var(--lo-fg-muted)]">
          <p>“{String(p.quote ?? "")}”</p>
          <footer className="mt-2 text-sm">— {String(p.author ?? "")}</footer>
        </blockquote>
      );
    case "faq": {
      const items = Array.isArray(p.items)
        ? (p.items as Array<{ q?: string; a?: string }>)
        : [];
      return (
        <div className="space-y-3">
          {items.map((item, i) => (
            <details key={i} className="rounded-md border border-[var(--lo-border)] px-3 py-2">
              <summary className="cursor-pointer font-medium">
                {String(item.q ?? "Question")}
              </summary>
              <p className="mt-2 text-sm text-[var(--lo-fg-muted)]">
                {String(item.a ?? "")}
              </p>
            </details>
          ))}
        </div>
      );
    }
    case "consent_notice":
      return (
        <p className="text-xs text-[var(--lo-fg-muted)]">{String(p.text ?? "")}</p>
      );
    case "spacer":
      return <div style={{ height: Number(p.height ?? 24) }} />;
    case "form":
      return (
        <section className="space-y-2">
          <h3 className="text-lg font-medium">{String(p.heading ?? "Form")}</h3>
          {formSlot ?? (
            <p className="text-sm text-[var(--lo-fg-muted)]">
              Form embed appears when linked.
            </p>
          )}
        </section>
      );
    default:
      return null;
  }
}
