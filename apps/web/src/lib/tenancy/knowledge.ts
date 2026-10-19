import {
  KnowledgeStore,
  getLocalTenancyStore,
  SqliteJobQueue,
  getCrmDatabase,
} from "@leadorbit/db";

const globalKb = globalThis as typeof globalThis & {
  __leadorbitKnowledge?: KnowledgeStore;
};

export function getKnowledgeStore(): KnowledgeStore {
  if (!globalKb.__leadorbitKnowledge) {
    const db = getCrmDatabase();
    globalKb.__leadorbitKnowledge = new KnowledgeStore(
      getLocalTenancyStore(),
      db,
      new SqliteJobQueue(db),
    );
  }
  return globalKb.__leadorbitKnowledge;
}
