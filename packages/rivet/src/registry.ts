import { EventHub } from "./eventHub";
import { matchPattern } from "./manifest";
import { NEGATIVE } from "./messages";
import type { ChromeManifest, ContentScriptRegistration, DNRRule } from "./types";

export type WebRequestEventName =
  | "onBeforeRequest"
  | "onBeforeSendHeaders"
  | "onSendHeaders"
  | "onHeadersReceived"
  | "onCompleted"
  | "onErrorOccurred"
  | "onBeforeRedirect";

export interface WebRequestHeader {
  name: string;
  value?: string;
  binaryValue?: number[];
}

export interface WebRequestDetails {
  requestId: string;
  url: string;
  method: string;
  tabId: number;
  windowId: number;
  frameId: number;
  parentFrameId: number;
  type: string;
  timeStamp: number;
  initiator?: string;
  originUrl?: string;
  documentUrl?: string;
  requestHeaders?: WebRequestHeader[];
  responseHeaders?: WebRequestHeader[];
  statusCode?: number;
  statusLine?: string;
  error?: string;
  redirectUrl?: string;
}

export interface WebRequestResult {
  cancel?: boolean;
  redirectUrl?: string;
  requestHeaders?: WebRequestHeader[];
  responseHeaders?: WebRequestHeader[];
}

interface WebRequestListener {
  extId: string;
  event: WebRequestEventName;
  listener: (details: WebRequestDetails) => unknown;
  filter: { urls?: string[]; types?: string[]; tabId?: number; windowId?: number };
}

export interface PortRecord {
  id: string;
  name: string;
  extId: string;
  remote: { onMessage: EventHub; onDisconnect: EventHub };
}

interface ContextMenuItem {
  id: string;
  title: string;
  contexts: string[];
  type: "normal" | "checkbox" | "radio" | "separator";
  enabled: boolean;
  visible: boolean;
  checked: boolean;
  parentId?: string | number;
  onclick?: (info: unknown, tab: unknown) => void;
}

interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: number;
}

interface BookmarkRecord {
  id: string;
  title: string;
  url?: string;
  parentId: string;
  dateAdded: number;
}

interface HistoryRecord {
  id: string;
  url: string;
  title: string;
  lastVisitTime: number;
  visitCount: number;
}

export interface DownloadRecord {
  id: number;
  url: string;
  filename: string;
  state: "in_progress" | "complete" | "interrupted";
  paused: boolean;
  startTime: string;
}

interface AlarmRecord {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number | undefined;
  timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;
}

interface BackgroundContext {
  kind: "worker" | "frame";
  worker?: Worker;
  frame?: HTMLIFrameElement;
  events: RealmEvents;
}

interface TabDocumentContext {
  documentId: string;
  frameId: number;
  events: RealmEvents;
}

export interface RealmEvents {
  runtimeOnMessage: EventHub;
  runtimeOnInstalled: EventHub;
  runtimeOnStartup: EventHub;
  runtimeOnConnect: EventHub;
  storageOnChanged: EventHub;
  tabsOnCreated: EventHub;
  tabsOnUpdated: EventHub;
  tabsOnRemoved: EventHub;
  tabsOnActivated: EventHub;
  actionOnClicked: EventHub;
  browserActionOnClicked: EventHub;
  alarmsOnAlarm: EventHub;
  contextMenusOnClicked: EventHub;
  commandsOnCommand: EventHub;
  notificationsOnClicked: EventHub;
  notificationsOnClosed: EventHub;
  notificationsOnButtonClicked: EventHub;
  cookiesOnChanged: EventHub;
  bookmarksOnCreated: EventHub;
  bookmarksOnRemoved: EventHub;
  bookmarksOnChanged: EventHub;
  historyOnVisited: EventHub;
  historyOnVisitRemoved: EventHub;
  downloadsOnCreated: EventHub;
  downloadsOnChanged: EventHub;
  permissionsOnAdded: EventHub;
  permissionsOnRemoved: EventHub;
  webNavigationOnCompleted: EventHub;
}

export function createRealmEvents(): RealmEvents {
  return {
    runtimeOnMessage: new EventHub(),
    runtimeOnInstalled: new EventHub(),
    runtimeOnStartup: new EventHub(),
    runtimeOnConnect: new EventHub(),
    storageOnChanged: new EventHub(),
    tabsOnCreated: new EventHub(),
    tabsOnUpdated: new EventHub(),
    tabsOnRemoved: new EventHub(),
    tabsOnActivated: new EventHub(),
    actionOnClicked: new EventHub(),
    browserActionOnClicked: new EventHub(),
    alarmsOnAlarm: new EventHub(),
    contextMenusOnClicked: new EventHub(),
    commandsOnCommand: new EventHub(),
    notificationsOnClicked: new EventHub(),
    notificationsOnClosed: new EventHub(),
    notificationsOnButtonClicked: new EventHub(),
    cookiesOnChanged: new EventHub(),
    bookmarksOnCreated: new EventHub(),
    bookmarksOnRemoved: new EventHub(),
    bookmarksOnChanged: new EventHub(),
    historyOnVisited: new EventHub(),
    historyOnVisitRemoved: new EventHub(),
    downloadsOnCreated: new EventHub(),
    downloadsOnChanged: new EventHub(),
    permissionsOnAdded: new EventHub(),
    permissionsOnRemoved: new EventHub(),
    webNavigationOnCompleted: new EventHub(),
  };
}

export interface ExtensionState {
  id: string;
  manifest: ChromeManifest;
  enabled: boolean;
  installedAt: number;
  filename: string;
  messages: Record<string, { message: string }>;
  dynamicRules: DNRRule[];
  staticRules: DNRRule[];
  rulesetRules: Map<string, DNRRule[]>;
  enabledRulesetIds: Set<string>;
  badgeText: string;
  badgeColor: string | null;
  iconUrl: string | null;
  title: string | null;
  popupPage: string | null;
  background: BackgroundContext | null;
  backgroundReady: Promise<void>;
  resolveBackgroundReady: (() => void) | null;
  backgroundGeneration: number;
  reloadBackground: (() => void) | null;
  contextMenuItems: ContextMenuItem[];
  notifications: Map<string, NotificationRecord>;
  bookmarks: Map<string, BookmarkRecord>;
  history: Map<string, HistoryRecord>;
  downloads: Map<number, DownloadRecord>;
  grantedPermissions: Set<string>;
  nextBookmarkId: number;
  nextDownloadId: number;
  alarms: Map<string, AlarmRecord>;
  ports: Map<string, PortRecord>;
  tabEvents: Map<number, Map<string, TabDocumentContext>>;
  popupEvents: RealmEvents | null;
}

export class RivetRegistry {
  readonly extensions = new Map<string, ExtensionState>();
  readonly contentScripts: ContentScriptRegistration[] = [];
  readonly contentScriptAssets = new Map<string, string | null>();
  private readonly webRequestListeners: WebRequestListener[] = [];
  private readonly webRequestListenerWaiters = new Map<string, Set<() => void>>();
  private readonly webRequestBehaviorVersions = new Map<string, number>();
  private readonly webRequestBehaviorWaiters = new Map<string, Set<() => void>>();

  createExtensionState(id: string, manifest: ChromeManifest, enabled: boolean, installedAt: number, filename: string): ExtensionState {
    const hasBackground = Boolean(
      manifest.background?.service_worker ||
      manifest.background?.page ||
      manifest.background?.scripts?.length,
    );
    let resolveBackgroundReady: (() => void) | null = null;
    const backgroundReady = hasBackground
      ? new Promise<void>((resolve) => {
          resolveBackgroundReady = resolve;
        })
      : Promise.resolve();
    const state: ExtensionState = {
      id,
      manifest,
      enabled,
      installedAt,
      filename,
      messages: {},
      dynamicRules: [],
      staticRules: [],
      rulesetRules: new Map(),
      enabledRulesetIds: new Set(),
      badgeText: "",
      badgeColor: null,
      iconUrl: null,
      title: null,
      popupPage: null,
      background: null,
      backgroundReady,
      resolveBackgroundReady,
      backgroundGeneration: 0,
      reloadBackground: null,
      contextMenuItems: [],
      notifications: new Map(),
      bookmarks: new Map(),
      history: new Map(),
      downloads: new Map(),
      grantedPermissions: new Set([...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])]),
      nextBookmarkId: 1,
      nextDownloadId: 1,
      alarms: new Map(),
      ports: new Map(),
      tabEvents: new Map(),
      popupEvents: null,
    };
    this.extensions.set(id, state);
    return state;
  }

  get(id: string): ExtensionState | undefined {
    return this.extensions.get(id);
  }

  remove(id: string): void {
    const ext = this.extensions.get(id);
    if (!ext) return;
    ext.backgroundGeneration += 1;
    ext.resolveBackgroundReady?.();
    ext.resolveBackgroundReady = null;
    for (const alarm of ext.alarms.values()) clearTimeout(alarm.timer);
    if (ext.background?.kind === "worker") ext.background.worker?.terminate();
    if (ext.background?.kind === "frame") ext.background.frame?.remove();
    this.removeWebRequestListeners(id);
    for (const key of this.contentScriptAssets.keys()) {
      if (key.startsWith(`${id}/`)) this.contentScriptAssets.delete(key);
    }
    this.extensions.delete(id);
  }

  addWebRequestListener(
    extId: string,
    event: WebRequestEventName,
    listener: (details: WebRequestDetails) => unknown,
    filter: WebRequestListener["filter"] = {},
  ): void {
    if (this.webRequestListeners.some((entry) => entry.extId === extId && entry.event === event && entry.listener === listener)) return;
    this.webRequestListeners.push({ extId, event, listener, filter });
    const waiterKey = `${extId}:${event}`;
    const waiters = this.webRequestListenerWaiters.get(waiterKey);
    if (waiters) {
      this.webRequestListenerWaiters.delete(waiterKey);
      for (const resolve of waiters) resolve();
    }
  }

  removeWebRequestListener(extId: string, event: WebRequestEventName, listener: (details: WebRequestDetails) => unknown): void {
    const index = this.webRequestListeners.findIndex(
      (entry) => entry.extId === extId && entry.event === event && entry.listener === listener,
    );
    if (index !== -1) this.webRequestListeners.splice(index, 1);
  }

  hasWebRequestListener(extId: string, event: WebRequestEventName, listener?: (details: WebRequestDetails) => unknown): boolean {
    return this.webRequestListeners.some(
      (entry) => entry.extId === extId && entry.event === event && (!listener || entry.listener === listener),
    );
  }

  async waitForWebRequestListener(extId: string, event: WebRequestEventName, timeoutMs: number): Promise<boolean> {
    if (this.hasWebRequestListener(extId, event)) return true;
    const waiterKey = `${extId}:${event}`;
    return new Promise((resolve) => {
      const waiters = this.webRequestListenerWaiters.get(waiterKey) ?? new Set<() => void>();
      this.webRequestListenerWaiters.set(waiterKey, waiters);
      let settled = false;
      const finish = (registered: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        waiters.delete(onRegistered);
        if (waiters.size === 0) this.webRequestListenerWaiters.delete(waiterKey);
        resolve(registered);
      };
      const onRegistered = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      waiters.add(onRegistered);
      if (this.hasWebRequestListener(extId, event)) onRegistered();
    });
  }

  removeWebRequestListeners(extId: string): void {
    for (let i = this.webRequestListeners.length - 1; i >= 0; i--) {
      if (this.webRequestListeners[i]?.extId === extId) this.webRequestListeners.splice(i, 1);
    }
  }

  getWebRequestBehaviorVersion(extId: string): number {
    return this.webRequestBehaviorVersions.get(extId) ?? 0;
  }

  notifyWebRequestBehaviorChanged(extId: string): void {
    this.webRequestBehaviorVersions.set(extId, this.getWebRequestBehaviorVersion(extId) + 1);
    const waiters = this.webRequestBehaviorWaiters.get(extId);
    if (!waiters) return;
    this.webRequestBehaviorWaiters.delete(extId);
    for (const resolve of waiters) resolve();
  }

  async waitForWebRequestBehaviorChange(extId: string, sinceVersion: number, timeoutMs: number): Promise<boolean> {
    if (this.getWebRequestBehaviorVersion(extId) > sinceVersion) return true;
    return new Promise((resolve) => {
      const waiters = this.webRequestBehaviorWaiters.get(extId) ?? new Set<() => void>();
      this.webRequestBehaviorWaiters.set(extId, waiters);
      let settled = false;
      const finish = (changed: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        waiters.delete(onChanged);
        if (waiters.size === 0) this.webRequestBehaviorWaiters.delete(extId);
        resolve(changed);
      };
      const onChanged = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      waiters.add(onChanged);
      if (this.getWebRequestBehaviorVersion(extId) > sinceVersion) onChanged();
    });
  }

  async dispatchWebRequest(event: WebRequestEventName, details: WebRequestDetails): Promise<WebRequestResult | null> {
    let merged: WebRequestResult | null = null;
    for (const entry of [...this.webRequestListeners]) {
      if (entry.event !== event || !this.extensions.get(entry.extId)?.enabled) continue;
      const { filter } = entry;
      if (filter.tabId !== undefined && filter.tabId !== details.tabId) continue;
      if (filter.windowId !== undefined && filter.windowId !== details.windowId) continue;
      if (filter.types?.length && !filter.types.includes(details.type)) continue;
      if (filter.urls?.length && !filter.urls.some((pattern) => matchPattern(pattern, details.url))) continue;
      try {
        let timer: number | undefined;
        const result = await Promise.race([
          Promise.resolve().then(() => entry.listener(details)),
          new Promise<undefined>((resolve) => {
            timer = setTimeout(resolve, 250);
          }),
        ]).finally(() => {
          if (timer !== undefined) clearTimeout(timer);
        });
        if (!result || typeof result !== "object") continue;
        const value = result as WebRequestResult;
        merged ??= {};
        if (value.cancel) merged.cancel = true;
        if (typeof value.redirectUrl === "string") merged.redirectUrl = value.redirectUrl;
        if (Array.isArray(value.requestHeaders)) merged.requestHeaders = value.requestHeaders;
        if (Array.isArray(value.responseHeaders)) merged.responseHeaders = value.responseHeaders;
      } catch (error) {
        console.error("[rivet] web request listener threw", event, error, NEGATIVE);
      }
    }
    return merged;
  }

  list(): ExtensionState[] {
    return [...this.extensions.values()];
  }

  private changeListeners = new Set<() => void>();

  onChange(cb: () => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  notifyChange(): void {
    for (const cb of this.changeListeners) cb();
  }

  broadcast(extId: string, pick: (events: RealmEvents) => EventHub, args: unknown[]): void {
    const ext = this.extensions.get(extId);
    if (!ext) return;
    if (ext.background) pick(ext.background.events).fire(...args);
    for (const documents of ext.tabEvents.values()) {
      for (const { events } of documents.values()) pick(events).fire(...args);
    }
  }

  broadcastTabLifecycle(pick: (events: RealmEvents) => EventHub, args: unknown[]): void {
    for (const ext of this.extensions.values()) {
      if (!ext.enabled || !ext.background) continue;
      pick(ext.background.events).fire(...args);
    }
  }
}
