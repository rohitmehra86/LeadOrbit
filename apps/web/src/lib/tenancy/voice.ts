import {
  VoiceStore,
  getLocalTenancyStore,
  getJobQueue,
  getCrmDatabase,
} from "@leadorbit/db";
import { getCalendarStore } from "./calendar";

const globalVoice = globalThis as typeof globalThis & {
  __leadorbitVoice?: VoiceStore;
};

export function getVoiceStore(): VoiceStore {
  if (!globalVoice.__leadorbitVoice) {
    const db = getCrmDatabase();
    const store = new VoiceStore(
      getLocalTenancyStore(),
      db,
      getJobQueue(),
      getCalendarStore(),
    );
    globalVoice.__leadorbitVoice = store;
  } else {
    globalVoice.__leadorbitVoice.setCalendarStore(getCalendarStore());
  }
  return globalVoice.__leadorbitVoice;
}
