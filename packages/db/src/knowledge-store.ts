import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  chunkText,
  cosineSimilarity,
  hasPermission,
  localEmbed,
  parseKnowledgeContent,
  scoreRetrievalQuality,
  vectorBackendStatus,
  type InventoryItem,
  type KnowledgeCollection,
  type KnowledgeDocKind,
  type KnowledgeDocument,
  type KnowledgeChunk,
  type RetrievalHit,
  type RetrievalQualitySample,
  type VectorBackendStatus,
} from "@leadorbit/domain";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";
import { SqliteJobQueue, type DurableJobQueue } from "./job-queue";

function nowIso(): string {
  return new Date().toISOString();
}

function jparse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class KnowledgeStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private queue: DurableJobQueue = new SqliteJobQueue(db),
  ) {}

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "knowledge:read" | "knowledge:write",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  backendStatus(): VectorBackendStatus {
    return vectorBackendStatus();
  }

  private mapCollection(r: Record<string, unknown>): KnowledgeCollection {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      description: r.description ? String(r.description) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  private mapDocument(r: Record<string, unknown>): KnowledgeDocument {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      collectionId: String(r.collection_id),
      title: String(r.title),
      kind: r.kind as KnowledgeDocKind,
      status: r.status as KnowledgeDocument["status"],
      version: Number(r.version),
      sourcePath: r.source_path ? String(r.source_path) : null,
      mimeType: r.mime_type ? String(r.mime_type) : null,
      byteSize: Number(r.byte_size),
      metadata: jparse(String(r.metadata ?? "{}"), {}),
      error: r.error ? String(r.error) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  private mapInventory(r: Record<string, unknown>): InventoryItem {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      sku: String(r.sku),
      name: String(r.name),
      description: r.description ? String(r.description) : null,
      price: r.price == null ? null : Number(r.price),
      currency: String(r.currency),
      availability: r.availability as InventoryItem["availability"],
      category: r.category ? String(r.category) : null,
      metadata: jparse(String(r.metadata ?? "{}"), {}),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async ensureDefaultCollection(
    actor: SessionUser,
    orgId: string,
  ): Promise<KnowledgeCollection> {
    await this.gate(actor, orgId, "knowledge:write");
    const existing = this.db
      .prepare(
        `select * from knowledge_collections where org_id=? order by created_at limit 1`,
      )
      .get(orgId) as Record<string, unknown> | undefined;
    if (existing) return this.mapCollection(existing);
    return this.createCollection(actor, orgId, {
      name: "Default knowledge",
      description: "Tenant-isolated FAQ, catalog, and brochure content",
    });
  }

  async createCollection(
    actor: SessionUser,
    orgId: string,
    input: { name: string; description?: string | null },
  ): Promise<KnowledgeCollection> {
    await this.gate(actor, orgId, "knowledge:write");
    const now = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `insert into knowledge_collections(id, org_id, name, description, created_at, updated_at)
         values (?,?,?,?,?,?)`,
      )
      .run(id, orgId, input.name, input.description ?? null, now, now);
    return this.mapCollection(
      this.db.prepare(`select * from knowledge_collections where id=?`).get(id) as Record<
        string,
        unknown
      >,
    );
  }

  async listCollections(
    actor: SessionUser,
    orgId: string,
  ): Promise<KnowledgeCollection[]> {
    await this.gate(actor, orgId, "knowledge:read");
    const rows = this.db
      .prepare(
        `select * from knowledge_collections where org_id=? order by created_at desc`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapCollection(r));
  }

  async uploadDocument(
    actor: SessionUser,
    orgId: string,
    input: {
      collectionId?: string;
      title: string;
      kind: KnowledgeDocKind;
      rawText: string;
      mimeType?: string | null;
      sourcePath?: string | null;
      metadata?: Record<string, unknown>;
      indexNow?: boolean;
    },
  ): Promise<{ document: KnowledgeDocument; warnings: string[]; jobId: string | null }> {
    await this.gate(actor, orgId, "knowledge:write");
    let collectionId = input.collectionId;
    if (!collectionId) {
      const col = await this.ensureDefaultCollection(actor, orgId);
      collectionId = col.id;
    } else {
      const col = this.db
        .prepare(`select id from knowledge_collections where org_id=? and id=?`)
        .get(orgId, collectionId);
      if (!col) throw new AuthError("Collection not found", "not_found");
    }

    const parsed = parseKnowledgeContent({
      kind: input.kind,
      title: input.title,
      rawText: input.rawText,
      mimeType: input.mimeType,
    });
    const now = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `insert into knowledge_documents(
          id, org_id, collection_id, title, kind, status, version, source_path, mime_type,
          byte_size, raw_text, metadata, error, created_at, updated_at
        ) values (?,?,?,?,?,'uploaded',1,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        collectionId,
        input.title,
        input.kind,
        input.sourcePath ?? null,
        input.mimeType ?? null,
        Buffer.byteLength(parsed.text, "utf8"),
        parsed.text,
        JSON.stringify(input.metadata ?? {}),
        null,
        now,
        now,
      );

    let jobId: string | null = null;
    if (input.indexNow !== false) {
      const job = await this.queue.enqueue(
        "knowledge.reindex",
        { orgId, documentId: id },
        { idempotencyKey: `kb-reindex:${id}:1` },
      );
      jobId = job.jobId;
      // Also index synchronously for local UX; worker reindex is idempotent.
      this.indexDocument(orgId, id);
    }

    const document = this.mapDocument(
      this.db.prepare(`select * from knowledge_documents where id=?`).get(id) as Record<
        string,
        unknown
      >,
    );
    return { document, warnings: parsed.warnings, jobId };
  }

  /** Durable / sync indexer — tenant-scoped; local vector fallback. */
  indexDocument(orgId: string, documentId: string): void {
    const row = this.db
      .prepare(`select * from knowledge_documents where org_id=? and id=?`)
      .get(orgId, documentId) as Record<string, unknown> | undefined;
    if (!row || String(row.status) === "deleted") return;

    const now = nowIso();
    this.db
      .prepare(
        `update knowledge_documents set status='parsing', updated_at=? where id=?`,
      )
      .run(now, documentId);

    this.db
      .prepare(`delete from knowledge_chunks where org_id=? and document_id=?`)
      .run(orgId, documentId);

    const chunks = chunkText(String(row.raw_text ?? ""));
    let ordinal = 0;
    for (const content of chunks) {
      const embedding = localEmbed(content);
      this.db
        .prepare(
          `insert into knowledge_chunks(
            id, org_id, document_id, collection_id, ordinal, content, embedding, metadata, created_at
          ) values (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          orgId,
          documentId,
          String(row.collection_id),
          ordinal++,
          content,
          JSON.stringify(embedding),
          JSON.stringify({
            title: String(row.title),
            kind: String(row.kind),
            version: Number(row.version),
            backend: this.backendStatus(),
          }),
          now,
        );
    }

    this.db
      .prepare(
        `update knowledge_documents set status='indexed', error=null, updated_at=? where id=?`,
      )
      .run(nowIso(), documentId);

    void Promise.resolve(
      this.queue.enqueue(
        "embedding.upsert",
        { orgId, entityType: "knowledge_document", entityId: documentId },
        { idempotencyKey: `embed:${documentId}:${Number(row.version)}` },
      ),
    );
  }

  async reindexDocument(
    actor: SessionUser,
    orgId: string,
    documentId: string,
  ): Promise<KnowledgeDocument> {
    await this.gate(actor, orgId, "knowledge:write");
    const row = this.db
      .prepare(`select * from knowledge_documents where org_id=? and id=?`)
      .get(orgId, documentId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Document not found", "not_found");
    const nextVersion = Number(row.version) + 1;
    this.db
      .prepare(
        `update knowledge_documents set version=?, updated_at=? where id=?`,
      )
      .run(nextVersion, nowIso(), documentId);
    this.indexDocument(orgId, documentId);
    return this.mapDocument(
      this.db.prepare(`select * from knowledge_documents where id=?`).get(documentId) as Record<
        string,
        unknown
      >,
    );
  }

  async deleteDocument(
    actor: SessionUser,
    orgId: string,
    documentId: string,
  ): Promise<void> {
    await this.gate(actor, orgId, "knowledge:write");
    const row = this.db
      .prepare(`select id from knowledge_documents where org_id=? and id=?`)
      .get(orgId, documentId);
    if (!row) throw new AuthError("Document not found", "not_found");
    this.db
      .prepare(
        `update knowledge_documents set status='deleted', updated_at=? where id=?`,
      )
      .run(nowIso(), documentId);
    this.db
      .prepare(`delete from knowledge_chunks where org_id=? and document_id=?`)
      .run(orgId, documentId);
  }

  async listDocuments(
    actor: SessionUser,
    orgId: string,
  ): Promise<KnowledgeDocument[]> {
    await this.gate(actor, orgId, "knowledge:read");
    const rows = this.db
      .prepare(
        `select * from knowledge_documents where org_id=? and status!='deleted' order by updated_at desc`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapDocument(r));
  }

  /**
   * Tenant-isolated retrieval with optional metadata filters.
   * Never crosses org_id — filter applied in SQL before scoring.
   */
  async retrieve(
    actor: SessionUser | null,
    orgId: string,
    input: {
      query: string;
      collectionId?: string;
      kind?: KnowledgeDocKind;
      limit?: number;
    },
  ): Promise<{
    backend: VectorBackendStatus;
    hits: RetrievalHit[];
  }> {
    if (actor) await this.gate(actor, orgId, "knowledge:read");
    const qEmbed = localEmbed(input.query);
    let sql = `select c.*, d.title as doc_title, d.kind as doc_kind, d.metadata as doc_metadata
      from knowledge_chunks c
      join knowledge_documents d on d.id = c.document_id
      where c.org_id=? and d.org_id=? and d.status='indexed'`;
    const params: unknown[] = [orgId, orgId];
    if (input.collectionId) {
      sql += ` and c.collection_id=?`;
      params.push(input.collectionId);
    }
    if (input.kind) {
      sql += ` and d.kind=?`;
      params.push(input.kind);
    }
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];

    const scored: RetrievalHit[] = rows.map((r) => {
      const emb = jparse<number[]>(String(r.embedding ?? "[]"), []);
      const score = emb.length ? cosineSimilarity(qEmbed, emb) : 0;
      return {
        chunkId: String(r.id),
        documentId: String(r.document_id),
        orgId: String(r.org_id),
        title: String(r.doc_title),
        content: String(r.content),
        score,
        metadata: {
          ...jparse(String(r.metadata ?? "{}"), {}),
          kind: String(r.doc_kind),
        },
      };
    });
    scored.sort((a, b) => b.score - a.score);
    // Defense-in-depth: drop any accidental cross-tenant rows
    const hits = scored
      .filter((h) => h.orgId === orgId)
      .slice(0, input.limit ?? 5);
    return { backend: this.backendStatus(), hits };
  }

  async runRetrievalQuality(
    actor: SessionUser,
    orgId: string,
    samples: RetrievalQualitySample[],
  ): Promise<
    Array<{
      query: string;
      pass: boolean;
      score: number;
      detail: string;
      hitCount: number;
    }>
  > {
    await this.gate(actor, orgId, "knowledge:read");
    const out = [];
    for (const sample of samples) {
      const { hits } = await this.retrieve(actor, orgId, { query: sample.query });
      const result = scoreRetrievalQuality(hits, sample);
      out.push({
        query: sample.query,
        pass: result.pass,
        score: result.score,
        detail: result.detail,
        hitCount: hits.length,
      });
    }
    return out;
  }

  async upsertInventory(
    actor: SessionUser,
    orgId: string,
    input: {
      sku: string;
      name: string;
      description?: string | null;
      price?: number | null;
      currency?: string;
      availability?: InventoryItem["availability"];
      category?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<InventoryItem> {
    await this.gate(actor, orgId, "knowledge:write");
    const now = nowIso();
    const existing = this.db
      .prepare(`select id from inventory_items where org_id=? and sku=?`)
      .get(orgId, input.sku) as { id: string } | undefined;
    if (existing) {
      this.db
        .prepare(
          `update inventory_items set name=?, description=?, price=?, currency=?, availability=?, category=?, metadata=?, updated_at=?
           where id=?`,
        )
        .run(
          input.name,
          input.description ?? null,
          input.price ?? null,
          input.currency ?? "USD",
          input.availability ?? "unknown",
          input.category ?? null,
          JSON.stringify(input.metadata ?? {}),
          now,
          existing.id,
        );
      return this.mapInventory(
        this.db.prepare(`select * from inventory_items where id=?`).get(existing.id) as Record<
          string,
          unknown
        >,
      );
    }
    const id = randomUUID();
    this.db
      .prepare(
        `insert into inventory_items(
          id, org_id, sku, name, description, price, currency, availability, category, metadata, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.sku,
        input.name,
        input.description ?? null,
        input.price ?? null,
        input.currency ?? "USD",
        input.availability ?? "unknown",
        input.category ?? null,
        JSON.stringify(input.metadata ?? {}),
        now,
        now,
      );
    return this.mapInventory(
      this.db.prepare(`select * from inventory_items where id=?`).get(id) as Record<
        string,
        unknown
      >,
    );
  }

  async listInventory(actor: SessionUser, orgId: string): Promise<InventoryItem[]> {
    await this.gate(actor, orgId, "knowledge:read");
    const rows = this.db
      .prepare(`select * from inventory_items where org_id=? order by name`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapInventory(r));
  }

  /** Authoritative inventory lookup — AI must use this, never invent. */
  lookupInventory(
    orgId: string,
    query: string,
    limit = 5,
  ): InventoryItem[] {
    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
      .slice(0, 6);
    if (tokens.length === 0) return [];
    const all = this.db
      .prepare(`select * from inventory_items where org_id=?`)
      .all(orgId) as Record<string, unknown>[];
    const scored = all
      .map((r) => {
        const item = this.mapInventory(r);
        const hay =
          `${item.name} ${item.sku} ${item.category ?? ""} ${item.description ?? ""}`.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (hay.includes(t)) score += 1;
        }
        return { item, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((x) => x.item);
  }

  listChunksForDocument(orgId: string, documentId: string): KnowledgeChunk[] {
    const rows = this.db
      .prepare(
        `select * from knowledge_chunks where org_id=? and document_id=? order by ordinal`,
      )
      .all(orgId, documentId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      documentId: String(r.document_id),
      collectionId: String(r.collection_id),
      ordinal: Number(r.ordinal),
      content: String(r.content),
      embedding: jparse<number[] | null>(String(r.embedding ?? "null"), null),
      metadata: jparse(String(r.metadata ?? "{}"), {}),
      createdAt: String(r.created_at),
    }));
  }
}
