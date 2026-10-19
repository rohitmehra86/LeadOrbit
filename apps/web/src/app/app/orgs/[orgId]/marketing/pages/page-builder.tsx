"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Campaign,
  FormDefinition,
  LandingPage,
  PageBlock,
  PageBlockType,
} from "@leadorbit/domain";
import { Button, Badge } from "@leadorbit/ui";
import { SafePageRender } from "@/components/marketing/safe-page-render";

type Props = {
  orgId: string;
  pages: LandingPage[];
  forms: FormDefinition[];
  campaigns: Campaign[];
};

export function PageBuilder({ orgId, pages, forms, campaigns }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(pages[0]?.id ?? "");
  const selected = useMemo(
    () => pages.find((p) => p.id === selectedId) ?? pages[0] ?? null,
    [pages, selectedId],
  );
  const [blocks, setBlocks] = useState<PageBlock[]>(
    selected?.document.blocks ?? [],
  );
  const [seoTitle, setSeoTitle] = useState(selected?.document.seo.title ?? "");
  const [seoDesc, setSeoDesc] = useState(
    selected?.document.seo.description ?? "",
  );
  const [mobile, setMobile] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [versions, setVersions] = useState<
    Array<{ version: number; createdAt: string; note: string | null }>
  >([]);
  const [aiNote, setAiNote] = useState<string | null>(null);

  function sync(page: LandingPage | null) {
    setSelectedId(page?.id ?? "");
    setBlocks(page?.document.blocks ?? []);
    setSeoTitle(page?.document.seo.title ?? "");
    setSeoDesc(page?.document.seo.description ?? "");
    setVersions([]);
  }

  async function createPage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/orgs/${orgId}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        templateKey: fd.get("templateKey") || "real_estate",
        campaignId: fd.get("campaignId") || null,
        formId: fd.get("formId") || null,
      }),
    });
    const data = (await res.json()) as { item: LandingPage };
    sync(data.item);
    e.currentTarget.reset();
    router.refresh();
  }

  async function save() {
    if (!selected) return;
    await fetch(`/api/v1/orgs/${orgId}/pages/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        document: {
          version: 1,
          blocks,
          seo: { title: seoTitle, description: seoDesc, ogImage: null },
          consentNotice: selected.document.consentNotice,
        },
        formId: selected.formId,
        campaignId: selected.campaignId,
      }),
    });
    router.refresh();
  }

  async function publish() {
    if (!selected) return;
    await save();
    await fetch(`/api/v1/orgs/${orgId}/pages/${selected.id}/publish`, {
      method: "POST",
    });
    router.refresh();
  }

  async function duplicate() {
    if (!selected) return;
    const res = await fetch(
      `/api/v1/orgs/${orgId}/pages/${selected.id}/duplicate`,
      { method: "POST" },
    );
    const data = (await res.json()) as { item: LandingPage };
    sync(data.item);
    router.refresh();
  }

  async function loadVersions() {
    if (!selected) return;
    const res = await fetch(
      `/api/v1/orgs/${orgId}/pages/${selected.id}/versions`,
    );
    const data = (await res.json()) as { items: typeof versions };
    setVersions(data.items);
  }

  async function aiPageCopy() {
    const res = await fetch(`/api/v1/orgs/${orgId}/campaigns/ai-suggest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: `Landing page hero for ${seoTitle}` }),
    });
    const data = (await res.json()) as {
      item: { status: string; reason: string };
    };
    setAiNote(`${data.item.status}: ${data.item.reason}`);
  }

  function addBlock(type: PageBlockType) {
    const id = crypto.randomUUID();
    const props: Record<string, unknown> =
      type === "hero"
        ? { headline: "New headline", subheadline: "Supporting line", ctaLabel: "CTA" }
        : type === "rich_text"
          ? { body: "Write copy here" }
          : type === "features"
            ? { items: ["Benefit one", "Benefit two"] }
            : type === "consent_notice"
              ? { text: "Consent notice" }
              : type === "form"
                ? { heading: "Capture form" }
                : {};
    setBlocks((prev) => [...prev, { id, type, props }]);
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setBlocks((prev) => {
      const next = [...prev];
      const from = next.findIndex((b) => b.id === dragId);
      const to = next.findIndex((b) => b.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
    setDragId(null);
  }

  const previewPage: LandingPage | null = selected
    ? {
        ...selected,
        document: {
          version: 1,
          blocks,
          seo: { title: seoTitle, description: seoDesc, ogImage: null },
          consentNotice: selected.document.consentNotice,
        },
      }
    : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr_1fr]">
      <aside className="space-y-4">
        <form onSubmit={createPage} className="grid gap-2">
          <input
            name="name"
            required
            placeholder="Page name"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          />
          <select
            name="templateKey"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="real_estate">Real estate</option>
            <option value="lead_gen">Lead gen</option>
          </select>
          <select
            name="campaignId"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="">No campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            name="formId"
            className="rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="">No form</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <Button type="submit">Create page</Button>
        </form>
        <ul className="space-y-2 text-sm">
          {pages.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => sync(p)}
                className={`w-full rounded-md border px-3 py-2 text-left ${
                  selected?.id === p.id
                    ? "border-[var(--lo-accent)]"
                    : "border-[var(--lo-border)]"
                }`}
              >
                <div className="flex justify-between">
                  <span>{p.name}</span>
                  <Badge>{p.status}</Badge>
                </div>
                <span className="text-xs text-[var(--lo-fg-muted)]">
                  /{p.slug} · v{p.version}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="space-y-3">
        {!selected ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">Create a page.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "hero",
                  "rich_text",
                  "features",
                  "form",
                  "cta",
                  "consent_notice",
                ] as PageBlockType[]
              ).map((t) => (
                <Button key={t} type="button" onClick={() => addBlock(t)}>
                  + {t}
                </Button>
              ))}
            </div>
            <input
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="SEO title"
              className="w-full rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <textarea
              value={seoDesc}
              onChange={(e) => setSeoDesc(e.target.value)}
              placeholder="SEO description"
              rows={2}
              className="w-full rounded-md border border-[var(--lo-border)] bg-transparent px-3 py-2 text-sm"
            />
            <ul className="space-y-2">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  draggable
                  onDragStart={() => setDragId(b.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(b.id)}
                  className="cursor-grab rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm"
                >
                  <div className="flex justify-between">
                    <span>⋮⋮ {b.type}</span>
                    <button
                      type="button"
                      className="text-xs text-red-300"
                      onClick={() =>
                        setBlocks((prev) => prev.filter((x) => x.id !== b.id))
                      }
                    >
                      remove
                    </button>
                  </div>
                  {b.type === "hero" ? (
                    <input
                      className="mt-2 w-full bg-transparent text-xs outline-none"
                      value={String(b.props.headline ?? "")}
                      onChange={(e) =>
                        setBlocks((prev) =>
                          prev.map((x) =>
                            x.id === b.id
                              ? {
                                  ...x,
                                  props: { ...x.props, headline: e.target.value },
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={save}>
                Save draft
              </Button>
              <Button type="button" onClick={publish}>
                Publish
              </Button>
              <Button type="button" onClick={duplicate}>
                Duplicate
              </Button>
              <Button type="button" onClick={loadVersions}>
                Versions
              </Button>
              <Button type="button" onClick={aiPageCopy}>
                AI page hook
              </Button>
              <Button type="button" onClick={() => setMobile((m) => !m)}>
                {mobile ? "Desktop preview" : "Mobile preview"}
              </Button>
            </div>
            {aiNote ? (
              <p className="text-xs text-[var(--lo-fg-muted)]">{aiNote}</p>
            ) : null}
            {selected.status === "published" ? (
              <p className="text-xs text-[var(--lo-fg-muted)]">
                Public URL:{" "}
                <a className="underline" href={`/p/${orgId}/${selected.slug}`}>
                  /p/{orgId}/{selected.slug}
                </a>
              </p>
            ) : null}
            {versions.length > 0 ? (
              <ul className="text-xs text-[var(--lo-fg-muted)]">
                {versions.map((v) => (
                  <li key={v.version}>
                    v{v.version} · {v.createdAt} · {v.note}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-[var(--lo-fg-muted)]">
          Safe preview
        </p>
        {previewPage ? (
          <SafePageRender page={previewPage} mobilePreview={mobile} />
        ) : null}
      </section>
    </div>
  );
}
