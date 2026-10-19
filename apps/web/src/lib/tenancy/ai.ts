import {
  AiStore,
  getLocalTenancyStore,
  SqliteJobQueue,
  getCrmDatabase,
} from "@leadorbit/db";
import { getKnowledgeStore } from "./knowledge";

const globalAi = globalThis as typeof globalThis & {
  __leadorbitAi?: AiStore;
};

export function getAiStore(): AiStore {
  if (!globalAi.__leadorbitAi) {
    const db = getCrmDatabase();
    globalAi.__leadorbitAi = new AiStore(
      getLocalTenancyStore(),
      db,
      getKnowledgeStore(),
      new SqliteJobQueue(db),
    );
  }
  return globalAi.__leadorbitAi;
}
