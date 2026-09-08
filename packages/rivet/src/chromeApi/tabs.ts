import { EventHub } from "../eventHub";
import { installExtensionNetwork } from "../network";
import {
  buildTabObject,
  captureVisibleTabViaDisplayMedia,
  cloneForRealm,
  dispatchMessage,
  injectCss,
  openUrlInTab,
} from "./common";
import type { ChromeApiContext } from "./context";

export function createTabApis(context: ChromeApiContext) {
  const {
    realm,
    extId,
    tabId,
    host,
    ext,
    events,
    senderUrl,
    senderFrameId,
    senderDocumentId,
  } = context;

  const tabs = {
    query: (
      queryInfo: { active?: boolean; url?: string } = {},
      cb?: (tabs: unknown[]) => void,
    ) => {
      const active = host.getActiveTabId?.();
      const result = host
        .getAllTabs()
        .filter((tab) => {
          if (
            queryInfo.active !== undefined &&
            queryInfo.active !== (tab.id === active)
          ) {
            return false;
          }
          if (queryInfo.url && !tab.url.includes(queryInfo.url)) return false;
          return true;
        })
        .map((tab) => buildTabObject(host, tab.id, realm));
      cb?.(result);
      return Promise.resolve(result);
    },
    get: (id: number, cb?: (tab: unknown) => void) => {
      const tab = buildTabObject(host, id, realm);
      cb?.(tab);
      return Promise.resolve(tab);
    },
    getCurrent: (cb?: (tab: unknown) => void) => {
      const tab = buildTabObject(host, tabId, realm);
      cb?.(tab);
      return Promise.resolve(tab);
    },
    create: (
      createProps: { url?: string } = {},
      cb?: (tab: unknown) => void,
    ) => {
      if (createProps.url) openUrlInTab(host, null, createProps.url);
      const createdTabId = host.getActiveTabId?.() ?? tabId;
      const tab = buildTabObject(host, createdTabId, realm);
      cb?.(tab);
      return Promise.resolve(tab);
    },
    update: (
      tabIdOrProps: unknown,
      updatePropsOrCb?: unknown,
      maybeCb?: unknown,
    ) => {
      const targetTabId =
        typeof tabIdOrProps === "number" ? tabIdOrProps : tabId;
      const updateProps = (
        typeof tabIdOrProps === "number" ? updatePropsOrCb : tabIdOrProps
      ) as { active?: boolean; url?: string } | undefined;
      const cb = (
        typeof updatePropsOrCb === "function" ? updatePropsOrCb : maybeCb
      ) as ((tab: unknown) => void) | undefined;
      if (updateProps?.url) openUrlInTab(host, targetTabId, updateProps.url);
      if (updateProps?.active && targetTabId !== null) {
        host.activateTab?.(targetTabId);
      }
      const tab = buildTabObject(host, targetTabId, realm);
      cb?.(tab);
      return Promise.resolve(tab);
    },
    remove: (tabIds: number | number[], cb?: () => void) => {
      for (const targetId of Array.isArray(tabIds) ? tabIds : [tabIds]) {
        host.closeTab?.(targetId);
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    sendMessage: (
      targetTabId: number,
      message: unknown,
      optsOrCb?: unknown,
      maybeCb?: unknown,
    ) => {
      const options = (
        typeof optsOrCb === "object" && optsOrCb !== null ? optsOrCb : {}
      ) as { documentId?: string; frameId?: number };
      const callback = (
        typeof optsOrCb === "function"
          ? optsOrCb
          : typeof maybeCb === "function"
            ? maybeCb
            : undefined
      ) as ((response: unknown) => void) | undefined;
      const documents = ext.tabEvents.get(targetTabId);
      const targets = documents
        ? [...documents.values()].filter((document) => {
            if (options.documentId !== undefined) {
              return document.documentId === options.documentId;
            }
            if (options.frameId !== undefined) {
              return document.frameId === options.frameId;
            }
            return true;
          })
        : [];
      if (targets.length === 0) {
        if (callback) {
          callback(undefined);
          return undefined;
        }
        return Promise.resolve(undefined);
      }
      const sender = {
        id: extId,
        url: senderUrl,
        frameId: senderFrameId,
        documentId: senderDocumentId,
        tab: buildTabObject(host, tabId, realm),
      };
      const responsePromise = dispatchMessage(
        targets.map(({ events: targetEvents }) => targetEvents.runtimeOnMessage),
        message,
        sender,
      ).then((response) => cloneForRealm(realm, response));
      if (callback) {
        void responsePromise.then(callback);
        return undefined;
      }
      return responsePromise;
    },
    onCreated: events.tabsOnCreated.toApi(),
    onUpdated: events.tabsOnUpdated.toApi(),
    onRemoved: events.tabsOnRemoved.toApi(),
    onActivated: events.tabsOnActivated.toApi(),
    executeScript: (
      tabIdOrDetails: unknown,
      detailsOrCb?: unknown,
      maybeCb?: unknown,
    ) => {
      const actualTabId =
        typeof tabIdOrDetails === "number" ? tabIdOrDetails : tabId;
      const details = (
        typeof tabIdOrDetails === "object" ? tabIdOrDetails : detailsOrCb
      ) as { code?: string; file?: string } | undefined;
      const cb = (typeof detailsOrCb === "function" ? detailsOrCb : maybeCb) as
        | ((results: unknown[]) => void)
        | undefined;
      const win =
        actualTabId !== null ? host.getTabWindow?.(actualTabId) : null;
      let result: unknown[] = [];
      if (win && details?.code) {
        installExtensionNetwork(win, actualTabId === null ? undefined : host.getTab(actualTabId)?.url);
        try {
          result = [
            (win as unknown as { eval: (source: string) => unknown }).eval(
              details.code,
            ),
          ];
        } catch {
          result = [];
        }
      }
      cb?.(result);
      return Promise.resolve(result);
    },
    insertCSS: (
      tabIdOrDetails: unknown,
      detailsOrCb?: unknown,
      maybeCb?: unknown,
    ) => {
      const actualTabId =
        typeof tabIdOrDetails === "number" ? tabIdOrDetails : tabId;
      const details = (
        typeof tabIdOrDetails === "object" ? tabIdOrDetails : detailsOrCb
      ) as { code?: string } | undefined;
      const cb = (typeof detailsOrCb === "function" ? detailsOrCb : maybeCb) as
        | (() => void)
        | undefined;
      const win =
        actualTabId !== null ? host.getTabWindow?.(actualTabId) : null;
      if (win && details?.code) injectCss(win, details.code);
      cb?.();
      return Promise.resolve(undefined);
    },
    captureVisibleTab: (
      windowIdOrOpts?: unknown,
      optsOrCb?: unknown,
      maybeCb?: unknown,
    ) => {
      const cb = (
        typeof windowIdOrOpts === "function"
          ? windowIdOrOpts
          : typeof optsOrCb === "function"
            ? optsOrCb
            : maybeCb
      ) as ((dataUrl: string | null) => void) | undefined;
      const targetWin =
        tabId !== null ? (host.getTabWindow?.(tabId) ?? null) : null;
      const promise = captureVisibleTabViaDisplayMedia(targetWin);
      promise.then(cb);
      return promise;
    },
    TAB_ID_NONE: -1,
  };

  const windows = {
    getCurrent: (getInfoOrCb?: unknown, maybeCb?: unknown) => {
      const getInfo = (
        typeof getInfoOrCb === "object" && getInfoOrCb !== null
          ? getInfoOrCb
          : {}
      ) as { populate?: boolean };
      const cb = (typeof getInfoOrCb === "function" ? getInfoOrCb : maybeCb) as
        | ((window: unknown) => void)
        | undefined;
      const window = {
        id: 1,
        focused: true,
        type: "normal",
        state: "normal",
        ...(getInfo.populate
          ? {
              tabs: host
                .getAllTabs()
                .map((tab) => buildTabObject(host, tab.id, realm)),
            }
          : {}),
      };
      cb?.(window);
      return Promise.resolve(window);
    },
    getAll: (getInfoOrCb?: unknown, maybeCb?: unknown) => {
      const getInfo = (
        typeof getInfoOrCb === "object" && getInfoOrCb !== null
          ? getInfoOrCb
          : {}
      ) as { populate?: boolean; windowTypes?: string[] };
      const cb = (typeof getInfoOrCb === "function" ? getInfoOrCb : maybeCb) as
        | ((windows: unknown[]) => void)
        | undefined;
      const all =
        getInfo.windowTypes && !getInfo.windowTypes.includes("normal")
          ? []
          : [
              {
                id: 1,
                focused: true,
                type: "normal",
                state: "normal",
                ...(getInfo.populate
                  ? {
                      tabs: host
                        .getAllTabs()
                        .map((tab) => buildTabObject(host, tab.id, realm)),
                    }
                  : {}),
              },
            ];
      cb?.(all);
      return Promise.resolve(all);
    },
    create: (createDataOrCb: unknown = {}, maybeCb?: unknown) => {
      const createData = (
        typeof createDataOrCb === "object" && createDataOrCb !== null
          ? createDataOrCb
          : {}
      ) as { url?: string };
      const cb = (
        typeof createDataOrCb === "function" ? createDataOrCb : maybeCb
      ) as ((window: unknown) => void) | undefined;
      if (createData.url) host.navigateTab?.(null, createData.url);
      const window = {
        id: 1,
        focused: true,
        type: "normal",
        state: "normal",
      };
      cb?.(window);
      return Promise.resolve(window);
    },
    onFocusChanged: new EventHub().toApi(),
    WINDOW_ID_NONE: -1,
    WINDOW_ID_CURRENT: -2,
  };

  return { tabs, windows };
}
