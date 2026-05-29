import type { AssistantRecord } from "@/lib/types";

const dbName = "omnipuls-browser-vault";
const dbVersion = 1;
const assistantStore = "assistant-records";

type VaultDatabase = IDBDatabase;

function openVault() {
  return new Promise<VaultDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(assistantStore)) {
        const store = database.createObjectStore(assistantStore, { keyPath: "id" });
        store.createIndex("by_mode", "mode", { unique: false });
        store.createIndex("by_createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listAssistantRecords(limit = 50) {
  const database = await openVault();

  try {
    return await new Promise<AssistantRecord[]>((resolve, reject) => {
      const transaction = database.transaction(assistantStore, "readonly");
      const store = transaction.objectStore(assistantStore);
      const index = store.index("by_createdAt");
      const records: AssistantRecord[] = [];
      const request = index.openCursor(null, "prev");

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || records.length >= limit) {
          resolve(records);
          return;
        }

        records.push(cursor.value as AssistantRecord);
        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function saveAssistantRecord(record: AssistantRecord) {
  const database = await openVault();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(assistantStore, "readwrite");
      transaction.objectStore(assistantStore).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function seedAssistantRecords(records: AssistantRecord[]) {
  for (const record of records) {
    await saveAssistantRecord(record);
  }
}
