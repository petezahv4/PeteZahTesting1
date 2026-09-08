import {
  PX,
  ENGINE_GEN,
  loadCtrlFactory,
  ctrlClassName,
  openMuxConnection,
  setMuxTransport,
  muxSetName,
  cfgStreamUrl,
  defaultStreamUrl,
  defaultEdgeUrl,
  getMuxRoot,
} from "./px";
import { revealCodes } from "./mask";
import { urlCodecDecode, urlCodecEncode } from "./urlCodec";

declare global {
  interface Window {
    __pz: any;
    __browserInitialized: boolean;
  }
}

function dbName() {
  return String.fromCharCode(36, 118, 111, 108, 116, 101, 100, 103, 101);
}

const STORES = [
  "config",
  "cookies",
  "redirectTrackers",
  "referrerPolicies",
  "publicSuffixList",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let proxyArmed = false;
let proxyArmWaiters: Array<() => void> = [];

function markProxyArmed() {
  if (proxyArmed) return;
  proxyArmed = true;
  const waiters = proxyArmWaiters;
  proxyArmWaiters = [];
  for (const w of waiters) w();
}

function installProxyArmCapture() {
  if (typeof document === "undefined") return;
  const arm = () => markProxyArmed();
  for (const evt of ["pointerdown", "keydown", "click"] as const) {
    document.addEventListener(evt, arm, { capture: true, passive: true });
  }
}

installProxyArmCapture();

export function armProxySession() {
  markProxyArmed();
}

async function waitForProxyArm(timeoutMs = 120000): Promise<void> {
  if (proxyArmed) return;
  try {
    if (navigator.serviceWorker?.controller) {
      markProxyArmed();
      return;
    }
  } catch {}
  await new Promise<void>((resolve, reject) => {
    if (proxyArmed) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      proxyArmWaiters = proxyArmWaiters.filter((w) => w !== done);
      reject(new Error("arm timeout"));
    }, timeoutMs);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    proxyArmWaiters.push(done);
  });
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      req.onsuccess = finish;
      req.onerror = finish;
      req.onblocked = () => {};
      setTimeout(finish, 2500);
    } catch {
      resolve();
    }
  });
}

function openDbCheck(): Promise<{ broken: boolean; version: number }> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName());
      req.onerror = () => resolve({ broken: true, version: 0 });
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const broken = STORES.some((s) => !db.objectStoreNames.contains(s));
        const version = db.version;
        db.close();
        resolve({ broken, version });
      };
    } catch {
      resolve({ broken: true, version: 0 });
    }
  });
}

function createDbWithStores(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(dbName(), 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const ok = STORES.every((s) => db.objectStoreNames.contains(s));
        db.close();
        if (ok) resolve();
        else reject(new Error("stores still missing after create"));
      };
      req.onerror = () => reject(req.error || new Error("idb open failed"));
      req.onblocked = () => {};
    } catch (e) {
      reject(e);
    }
  });
}

function oldDbName() {
  return revealCodes([51, 101, 118, 102, 118, 123, 127, 113, 99]);
}

function engKey() {
  return String.fromCharCode(112, 122, 45, 101, 103);
}

async function migrateEngineOnce(): Promise<void> {
  try {
    const u = new URL(location.href);
    if (u.searchParams.has("_eg")) {
      u.searchParams.delete("_eg");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    }
    const stamp =
      (typeof window !== "undefined" && (window as any).__PZ_EG__) ||
      [ENGINE_GEN, (window as any).__PZ_CACHE__].filter(Boolean).join("-") ||
      ENGINE_GEN;
    if (localStorage.getItem(engKey()) === stamp) return;
    await clearServiceWorkers();
    await deleteDb(oldDbName());
    await deleteDb(String.fromCharCode(36, 100, 117, 115, 107, 108, 105, 110, 101));
    await deleteDb(String.fromCharCode(36, 118, 111, 108, 116, 101, 100, 103, 101));
    await deleteDb(dbName());
    try {
      localStorage.setItem(engKey(), stamp);
    } catch {}
  } catch {
    return;
  }
}

async function repairPxStore() {
  for (let i = 0; i < 6; i++) {
    const { broken, version } = await openDbCheck();
    if (!broken && version === 1) return;
    await deleteDb(dbName());
    await sleep(250 + i * 100);
    try {
      await createDbWithStores();
    } catch {}
    await sleep(100);
  }
}

async function clearServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {}
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {}
  await sleep(400);
}

async function registerSw() {
  await waitForProxyArm();
  const ver = [ENGINE_GEN, (window as any).__PZ_CACHE__].filter(Boolean).join("-");
  const swUrl = `${PX.sw}?v=${encodeURIComponent(ver)}`;
  const reg = await navigator.serviceWorker.register(swUrl, {
    updateViaCache: "none",
    scope: (window as any).__PZ_ORIGIN__ ? new URL(".", location.href).pathname : "/",
  });
  try {
    await reg.update();
  } catch {}
  if (reg.installing) {
    await new Promise<void>((resolve) => {
      const w = reg.installing;
      if (!w) return resolve();
      w.addEventListener("statechange", () => {
        if (w.state === "activated" || w.state === "redundant") resolve();
      });
      setTimeout(resolve, 4000);
    });
  }
  try {
    await navigator.serviceWorker.ready;
  } catch {}
  await new Promise<void>((resolve) => {
    if (navigator.serviceWorker.controller) {
      resolve();
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
      once: true,
    });
    setTimeout(resolve, 4000);
  });
  return reg;
}

async function setupMux() {
  await waitFor(() => !!getMuxRoot(), 5000);

  try {
    localStorage.setItem(muxPathKey(), PX.muxWorker);
  } catch {}

  const streamUrl = cfgStreamUrl((window as any)._CONFIG) || defaultStreamUrl();
  const edgeUrl = (window as any)._CONFIG?.bareurl || defaultEdgeUrl();
  const connection = openMuxConnection(PX.muxWorker);
  if (!connection) {
    throw new Error("mux connection unavailable");
  }

  const setT = muxSetName();
  let attempts = 0;
  while (attempts < 12) {
    try {
      await setMuxTransport(connection, PX.tunMod, streamUrl);
      return;
    } catch {
      try {
        await connection[setT](PX.muxMod, [edgeUrl]);
        return;
      } catch {
        try {
          await setMuxTransport(connection, PX.curlMod, streamUrl);
          return;
        } catch {
          attempts++;
          if (attempts >= 12) {
            throw new Error("Failed to set any transport");
          }
          await sleep(150);
        }
      }
    }
  }
}

function muxPathKey() {
  return revealCodes([116, 122, 124, 100, 58, 123, 96, 108, 58, 102, 116, 96, 127]);
}

function cfgMsgType() {
  return String.fromCharCode(
    118, 111, 108, 116, 101, 100, 103, 101, 36, 116, 121, 112, 101
  );
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-px-src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any).dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("script load failed")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.pxSrc = src;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });
}

let ensurePromise: Promise<void> | null = null;

export async function armPx(): Promise<void> {
  if ((window as any).__pzEgMig) {
    await new Promise<void>(() => {});
    return;
  }
  if ((window as any).__pz) return;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await waitForProxyArm();
    await migrateEngineOnce();
    await loadScriptOnce(PX.muxIndex);
    await loadScriptOnce(PX.coreAll);
    await initBrowser();
    if (!(window as any).__pz) {
      throw new Error("engine unavailable");
    }
  })().catch((err) => {
    ensurePromise = null;
    window.__browserInitialized = false;
    throw err;
  });

  return ensurePromise;
}

export async function initBrowser() {
  if ((window as any).__pz) return;
  if (window.__browserInitialized) return;
  window.__browserInitialized = true;

  await migrateEngineOnce();

  try {
    await waitFor(() => typeof loadCtrlFactory() === "function", 8000);
  } catch (err) {
    window.__browserInitialized = false;
    throw err;
  }

  try {
    localStorage.setItem(muxPathKey(), PX.muxWorker);
  } catch {}

  const { broken, version } = await openDbCheck();
  if (broken || version !== 1) {
    await clearServiceWorkers();
    await repairPxStore();
  }

  try {
    await registerSw();
  } catch {}

  try {
    await setupMux();
  } catch {
    window.__browserInitialized = false;
    return;
  }

  const factory = loadCtrlFactory();
  const loaded = factory();
  const Ctrl = loaded[ctrlClassName()];
  if (!Ctrl) {
    window.__browserInitialized = false;
    return;
  }

  let controller: any = null;
  let inited = false;

  for (let attempt = 0; attempt < 4 && !inited; attempt++) {
    try {
      if (attempt > 0) {
        await clearServiceWorkers();
        await repairPxStore();
        await registerSw();
        await setupMux();
      }
      controller = new Ctrl({
        prefix: PX.prefix,
        files: {
          wasm: PX.coreWasm,
          all: PX.coreAll,
          sync: PX.coreSync,
        },
        flags: {
          sourcemaps: false,
          rewriterLogs: false,
          captureErrors: true,
        },
        codec: {
          encode: urlCodecEncode,
          decode: urlCodecDecode,
        },
      });
      await controller.init();
      inited = true;
    } catch {
      await sleep(200);
    }
  }

  if (!inited || !controller) {
    window.__browserInitialized = false;
    return;
  }

  (window as any).__pz = controller;

  try {
    const msg: Record<string, string> = {};
    msg[cfgMsgType()] = "loadConfig";
    navigator.serviceWorker.controller?.postMessage(msg);
  } catch {}
}

function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (condition()) return resolve();
    const start = Date.now();
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for condition after ${timeoutMs}ms`));
      }
    }, 50);
  });
}
