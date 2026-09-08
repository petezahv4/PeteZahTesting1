import { negativeMessage } from "./messages";

const DB_NAME = "rivet_extensions";
const DB_VERSION = 1;

export const EXT_STORE = "extensions";
export const EXT_FILES_STORE = "extension_files";
export const EXT_STORAGE_STORE = "extension_storage";

let dbPromise: Promise<IDBDatabase> | null = null;

function databaseError(): Error {
  return new Error(negativeMessage("extension database request failed"));
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EXT_STORE)) {
        db.createObjectStore(EXT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(EXT_FILES_STORE)) {
        db.createObjectStore(EXT_FILES_STORE);
      }
      if (!db.objectStoreNames.contains(EXT_STORAGE_STORE)) {
        db.createObjectStore(EXT_STORAGE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(databaseError());
  });
  return dbPromise;
}

export async function dbGet<T = unknown>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(databaseError());
  });
}

export async function dbPut(store: string, key: IDBValidKey | null, value: unknown): Promise<IDBValidKey> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objStore = tx.objectStore(store);
    const req = key === null ? objStore.put(value) : objStore.put(value, key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(databaseError());
  });
}

export async function dbPutEntries(
  store: string,
  entries: readonly (readonly [key: IDBValidKey, value: unknown])[],
): Promise<void> {
  if (entries.length === 0) return;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(store, "readwrite");
    } catch {
      reject(databaseError());
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(databaseError());
    tx.onerror = () => reject(databaseError());

    try {
      const objStore = tx.objectStore(store);
      for (const [key, value] of entries) objStore.put(value, key);
    } catch {
      try {
        tx.abort();
      } finally {
        reject(databaseError());
      }
    }
  });
}

export async function dbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(databaseError());
  });
}

export async function dbGetAll<T = unknown>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(databaseError());
  });
}

export async function dbGetAllKeys(store: string): Promise<IDBValidKey[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(databaseError());
  });
}
