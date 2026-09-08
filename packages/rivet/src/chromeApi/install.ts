import {
  withBrowserPromiseFallback,
  withMissingMemberFallback,
} from "../autoStub";
import { NEGATIVE, negativeMessage } from "../messages";
import { installExtensionNetwork } from "../network";
import {
  createRealmEvents,
  type RealmEvents,
  type RivetRegistry,
} from "../registry";
import type { RivetHostBindings } from "../types";
import {
  adoptApiObjectsForRealm,
  generateDocumentId,
  setRealmApi,
  traceCalls,
} from "./common";
import type { ChromeApiContext } from "./context";
import { createNetworkApis } from "./network";
import { createPlatformApis } from "./platform";
import { createRuntimeApis } from "./runtime";
import { createScriptingApis } from "./scripting";
import { createStateApis } from "./state";
import { createStorageApi } from "./storage";
import { createTabApis } from "./tabs";
import { createUiApis } from "./ui";

export interface InstallChromeApiOptions {
  extId: string;
  tabId: number | null;
  isBackground: boolean;
  registry: RivetRegistry;
  host: RivetHostBindings;
  skipTabRegistration?: boolean | undefined;
  senderUrl?: string | undefined;
  senderFrameId?: number | undefined;
  senderDocumentId?: string | undefined;
}

export function installChromeApi(
  realm: Window,
  options: InstallChromeApiOptions,
): RealmEvents {
  const {
    extId,
    tabId,
    isBackground,
    registry,
    host,
    skipTabRegistration,
    senderUrl,
    senderFrameId,
    senderDocumentId,
  } = options;
  const ext = registry.get(extId);
  if (!ext) {
    throw new Error(
      negativeMessage("rivet api installation requested an unknown extension"),
    );
  }

  installExtensionNetwork(realm, senderUrl);
  const events = createRealmEvents();
  const frameId = senderFrameId ?? (tabId === null ? undefined : 0);
  const documentId = senderDocumentId ?? (tabId === null ? undefined : generateDocumentId());
  if (isBackground) {
    registry.removeWebRequestListeners(extId);
  } else if (
    tabId !== null &&
    !skipTabRegistration &&
    frameId !== undefined &&
    documentId !== undefined
  ) {
    let documents = ext.tabEvents.get(tabId);
    if (!documents || frameId === 0) {
      documents = new Map();
      ext.tabEvents.set(tabId, documents);
    }
    documents.set(documentId, { documentId, frameId, events });
  }

  const context: ChromeApiContext = {
    realm,
    extId,
    tabId,
    registry,
    host,
    ext,
    events,
    senderUrl,
    senderFrameId: frameId,
    senderDocumentId: documentId,
  };

  const { runtime, extension } = createRuntimeApis(context);
  const storage = createStorageApi(context);
  const { tabs, windows } = createTabApis(context);
  const {
    i18n,
    identity,
    commands,
    omnibox,
    contentSettings,
    proxy,
    system,
    power,
    management,
    webNavigation,
    tts,
    clipboard,
    fontSettings,
    app,
    csi,
    loadTimes,
  } = createPlatformApis(context);
  const { contextMenus, notifications, action, browserAction, pageAction } =
    createUiApis(context);
  const { cookies, webRequest, declarativeNetRequest } =
    createNetworkApis(context);
  const { contentScripts, scripting, userScripts } = createScriptingApis(
    context,
    (targetRealm, targetTabId) => {
      installChromeApi(targetRealm, {
        extId,
        tabId: targetTabId,
        isBackground: false,
        registry,
        host,
        senderUrl: host.getTab(targetTabId)?.url,
        senderFrameId: 0,
        senderDocumentId: generateDocumentId(),
      });
    },
  );
  const { alarms, permissions, history, bookmarks, downloads } =
    createStateApis(context);

  const chromeApi = {
    runtime,
    storage,
    tabs,
    windows,
    extension,
    i18n,
    contextMenus,
    notifications,
    cookies,
    dns: undefined,
    webRequest,
    contentScripts,
    declarativeNetRequest,
    scripting,
    userScripts,
    action,
    browserAction,
    pageAction,
    alarms,
    permissions,
    history,
    bookmarks,
    downloads,
    identity,
    commands,
    omnibox,
    contentSettings,
    proxy,
    system,
    power,
    management,
    webNavigation,
    tts,
    clipboard,
    fontSettings,
    app,
    csi,
    loadTimes,
  };

  adoptApiObjectsForRealm(realm, chromeApi);

  const chromeApiWithFallback = (globalThis as { RIVET_TRACE?: boolean })
    .RIVET_TRACE
    ? traceCalls(withMissingMemberFallback(chromeApi))
    : withMissingMemberFallback(chromeApi);
  const browserApiWithFallback = withBrowserPromiseFallback(
    chromeApiWithFallback,
    (realm as unknown as { Promise: PromiseConstructor }).Promise,
  );

  setRealmApi(realm, "chrome", chromeApiWithFallback);
  if (!setRealmApi(realm, "browser", browserApiWithFallback)) {
    console.warn(
      "[rivet] browser api could not be installed in this frame",
      NEGATIVE,
    );
  }

  return events;
}
