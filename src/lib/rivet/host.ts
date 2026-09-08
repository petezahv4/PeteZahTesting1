import { Rivet, type RivetHostBindings, type TabInfo } from "@rivet/index";
import { injectContentScripts } from "@rivet/contentScripts";
import { ensureUblockOrigin } from "./ensureUblock";
import { installRivetNetworkGuard } from "./networkGuard";
import { registerRivetBridge } from "./bridge";

export type RivetFacade = Rivet;

type LiveTab = {
  id: string;
  numId: number;
  url: string;
  title: string;
  favicon?: string;
  iframe: HTMLIFrameElement | null;
  active: boolean;
  loading?: boolean;
};

const tabs = new Map<string, LiveTab>();
const numToId = new Map<number, string>();
let activeId: string | null = null;
let instance: RivetFacade | null = null;
let ready: Promise<RivetFacade> | null = null;
let bgRoot: HTMLElement | null = null;
let navigateHandler: ((url: string) => void) | null = null;
let popupCloseHandler: ((extId: string) => void) | null = null;

export function setRivetNavigateHandler(fn: (url: string) => void) {
  navigateHandler = fn;
}

export function setRivetPopupCloseHandler(fn: (extId: string) => void) {
  popupCloseHandler = fn;
}

function hashTabId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) || 1;
}

export function syncRivetTab(partial: {
  id: string;
  url: string;
  title?: string;
  favicon?: string;
  iframe?: HTMLIFrameElement | null;
  active?: boolean;
  loading?: boolean;
}) {
  const existing = tabs.get(partial.id);
  const numId = existing?.numId || hashTabId(partial.id);
  const next: LiveTab = {
    id: partial.id,
    numId,
    url: partial.url || existing?.url || "about:blank",
    title: partial.title ?? existing?.title ?? "Tab",
    favicon: partial.favicon ?? existing?.favicon,
    iframe: partial.iframe !== undefined ? partial.iframe : existing?.iframe || null,
    active: partial.active ?? existing?.active ?? false,
    loading: partial.loading ?? existing?.loading,
  };
  tabs.set(partial.id, next);
  numToId.set(numId, partial.id);
  if (next.active) activeId = partial.id;
}

export function removeRivetTab(id: string) {
  const t = tabs.get(id);
  if (!t) return;
  tabs.delete(id);
  numToId.delete(t.numId);
  if (activeId === id) activeId = null;
}

function toTabInfo(t: LiveTab): TabInfo {
  return {
    id: t.numId,
    windowId: 1,
    url: t.url,
    title: t.title || "Tab",
    active: t.active || t.id === activeId,
    favIconUrl: t.favicon || "",
    status: t.loading ? "loading" : "complete",
  };
}

function buildHost(): RivetHostBindings {
  return {
    getTabId: (win) => {
      for (const t of tabs.values()) {
        const top = t.iframe?.contentWindow;
        if (!top) continue;
        if (top === win) return t.numId;
        try {
          if (win.top === top) return t.numId;
        } catch {}
      }
      return null;
    },
    getTab: (tabId) => {
      const id = numToId.get(tabId);
      if (!id) return null;
      const t = tabs.get(id);
      return t ? toTabInfo(t) : null;
    },
    getAllTabs: () => [...tabs.values()].map(toTabInfo),
    getActiveTabId: () => {
      if (!activeId) return null;
      return tabs.get(activeId)?.numId ?? null;
    },
    getTabWindow: (tabId) => {
      const id = numToId.get(tabId);
      if (!id) return null;
      return tabs.get(id)?.iframe?.contentWindow ?? null;
    },
    navigateTab: (_tabId, url) => {
      navigateHandler?.(url);
    },
    activateTab: (tabId) => {
      const id = numToId.get(tabId);
      if (!id) return;
      for (const t of tabs.values()) t.active = t.id === id;
      activeId = id;
    },
    closeTab: () => {},
    openExtensionTab: (_extId, page) => {
      navigateHandler?.(`petezah://extensions?page=${encodeURIComponent(page)}`);
    },
    closeExtensionPopup: (extId) => {
      popupCloseHandler?.(extId);
      window.dispatchEvent(new CustomEvent("rivet-close-extension-popup", { detail: { extId } }));
    },
    showNotification: (title, message) => {
      try {
        console.info(`[extension] ${title}: ${message}`);
      } catch {}
    },
  };
}

function ensureBackgroundRoot(): HTMLElement {
  if (bgRoot && document.body.contains(bgRoot)) return bgRoot;
  const el = document.createElement("div");
  el.id = "pz-rivet-background";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
  document.body.appendChild(el);
  bgRoot = el;
  return el;
}

export function getRivet(): RivetFacade | null {
  return instance;
}

export async function ensureRivet(): Promise<RivetFacade> {
  if (instance) return instance;
  if (ready) return ready;
  ready = (async () => {
    const rivet = new Rivet({ host: buildHost(), backgroundRoot: ensureBackgroundRoot() });
    await rivet.init();
    try {
      await ensureUblockOrigin(rivet);
    } catch (e) {
      console.warn("[rivet] uBlock install skipped", e);
    }
    instance = rivet;
    registerRivetBridge(rivet);
    window.dispatchEvent(new CustomEvent("rivet-ready", { detail: rivet }));
    return rivet;
  })();
  try {
    return await ready;
  } catch (e) {
    ready = null;
    instance = null;
    throw e;
  }
}

function rivetVisibleUrl(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "about:blank";
  if (raw.startsWith("petezah://") || raw.startsWith("about:")) return "about:blank";
  if (!/^https?:\/\//i.test(raw)) return "about:blank";
  return raw;
}

export async function injectRivetIntoFrame(
  iframe: HTMLIFrameElement | null | undefined,
  tabId: string,
  pageUrl: string,
) {
  if (!iframe || !pageUrl || pageUrl.startsWith("petezah://")) {
    if (tabId) {
      syncRivetTab({
        id: tabId,
        url: "about:blank",
        iframe: iframe ?? null,
        active: true,
      });
    }
    return;
  }
  if (localStorage.getItem("extensionsEnabled") === "false") return;
  try {
    const rivet = await ensureRivet();
    const win = iframe.contentWindow;
    if (!win) return;
    const visibleUrl = rivetVisibleUrl(pageUrl);
    syncRivetTab({ id: tabId, url: visibleUrl, iframe, active: true });
    const numId = tabs.get(tabId)?.numId ?? hashTabId(tabId);
    installRivetNetworkGuard(win, rivet, visibleUrl, numId);
    await injectContentScripts(win, numId, visibleUrl, true, rivet.registry, rivet.host);
    try {
      rivet.notifyTabActivated(numId);
      rivet.notifyTabUpdated(numId, { status: "complete", url: visibleUrl });
      const navDetails = {
        tabId: numId,
        url: visibleUrl,
        frameId: 0,
        parentFrameId: -1,
        timeStamp: Date.now(),
        processId: 0,
        transitionType: "link",
        transitionQualifiers: [] as string[],
      };
      rivet.registry.broadcastTabLifecycle(
        (e) => e.webNavigationOnCompleted,
        [navDetails],
      );
    } catch {}
  } catch (e) {
    console.warn("[rivet] inject failed", e);
  }
}

export function rivetNumericTabId(tabId: string): number {
  return tabs.get(tabId)?.numId ?? hashTabId(tabId);
}

export function findUblockExtensionId(): string | null {
  const rivet = instance;
  if (!rivet) return null;
  const hit = rivet
    .getInstalledExtensions()
    .find((e) => e.name.trim().toLowerCase() === "ublock origin");
  return hit?.id || null;
}
