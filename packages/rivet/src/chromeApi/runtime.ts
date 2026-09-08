import { EventHub } from "../eventHub";
import type { PortRecord } from "../registry";
import { buildExtensionUrl } from "../urlScheme";
import {
  buildTabObject,
  cloneForRealm,
  dispatchMessage,
  originOf,
} from "./common";
import type { ChromeApiContext } from "./context";

export function createRuntimeApis(context: ChromeApiContext) {
  const {
    realm,
    extId,
    tabId,
    registry,
    host,
    ext,
    events,
    senderUrl,
    senderFrameId,
    senderDocumentId,
  } = context;
  let portIdCounter = 0;

  const waitForBackground = async (targetExt: string) => {
    let target = registry.get(targetExt);
    while (
      target?.enabled &&
      !target.background &&
      target.resolveBackgroundReady
    ) {
      await target.backgroundReady;
      target = registry.get(targetExt);
    }
    return target;
  };

  const runtime = {
    id: extId,
    getManifest: () => cloneForRealm(realm, ext.manifest),
    getURL: (path?: string) =>
      buildExtensionUrl(extId, path == null ? "" : String(path)),
    reload: () => ext.reloadBackground?.(),
    sendMessage: (
      extIdOrMsg: unknown,
      msgOrOpts?: unknown,
      optsOrCb?: unknown,
      maybeCb?: unknown,
    ) => {
      let targetExt: string;
      let message: unknown;
      let callback: ((response: unknown) => void) | undefined;
      if (typeof extIdOrMsg === "object") {
        message = extIdOrMsg;
        callback = (
          typeof msgOrOpts === "function"
            ? msgOrOpts
            : typeof optsOrCb === "function"
              ? optsOrCb
              : undefined
        ) as typeof callback;
        targetExt = extId;
      } else if (
        typeof extIdOrMsg === "string" &&
        typeof msgOrOpts === "object"
      ) {
        targetExt = extIdOrMsg;
        message = msgOrOpts;
        callback = (
          typeof optsOrCb === "function" ? optsOrCb : maybeCb
        ) as typeof callback;
      } else {
        message = extIdOrMsg;
        callback = msgOrOpts as typeof callback;
        targetExt = extId;
      }
      const sender = {
        id: extId,
        url: senderUrl,
        origin: originOf(senderUrl),
        frameId: senderFrameId,
        documentId: senderDocumentId,
        tab: tabId !== null ? buildTabObject(host, tabId, realm) : undefined,
      };
      const send = async () => {
        let target = registry.get(targetExt);
        let hubs = [
          target?.background?.events.runtimeOnMessage,
          target?.popupEvents?.runtimeOnMessage,
        ].filter((hub): hub is EventHub => hub !== undefined);
        while (
          hubs.length === 0 &&
          target?.enabled &&
          target.resolveBackgroundReady
        ) {
          await target.backgroundReady;
          target = registry.get(targetExt);
          hubs = [
            target?.background?.events.runtimeOnMessage,
            target?.popupEvents?.runtimeOnMessage,
          ].filter((hub): hub is EventHub => hub !== undefined);
        }
        if (hubs.length === 0) return undefined;
        const response = await dispatchMessage(hubs, message, sender);
        return cloneForRealm(realm, response);
      };
      const responsePromise = send();
      if (callback) {
        void responsePromise.then(callback);
        return undefined;
      }
      return responsePromise;
    },
    onMessage: events.runtimeOnMessage.toApi(),
    onInstalled: events.runtimeOnInstalled.toApi(),
    onStartup: events.runtimeOnStartup.toApi(),
    onConnect: events.runtimeOnConnect.toApi(),
    connect: (extIdOrInfo?: unknown, maybeInfo?: unknown) => {
      const targetExt = typeof extIdOrInfo === "string" ? extIdOrInfo : extId;
      const connectInfo = (
        typeof extIdOrInfo === "string" ? maybeInfo : extIdOrInfo
      ) as { name?: string } | undefined;
      const name = connectInfo?.name ?? "";
      const portId = `port_${++portIdCounter}`;

      const callerSide = {
        onMessage: new EventHub(),
        onDisconnect: new EventHub(),
      };
      const remoteSide = {
        onMessage: new EventHub(),
        onDisconnect: new EventHub(),
      };

      const sender = {
        id: extId,
        url: senderUrl,
        origin: originOf(senderUrl),
        frameId: senderFrameId,
        documentId: senderDocumentId,
        tab: tabId !== null ? buildTabObject(host, tabId, realm) : undefined,
      };
      let callerPort: typeof remotePort;
      let remotePort: {
        name: string;
        sender: typeof sender;
        postMessage: (message: unknown) => void;
        disconnect: () => void;
        onMessage: ReturnType<EventHub["toApi"]>;
        onDisconnect: ReturnType<EventHub["toApi"]>;
      };
      let disconnected = false;

      const disconnectFrom = (side: "caller" | "remote") => {
        if (disconnected) return;
        disconnected = true;
        ext.ports.delete(portId);
        queueMicrotask(() => {
          if (side === "caller") remoteSide.onDisconnect.fire(remotePort);
          else callerSide.onDisconnect.fire(callerPort);
        });
      };

      callerPort = {
        name,
        sender,
        postMessage: (message: unknown) => {
          queueMicrotask(() => remoteSide.onMessage.fire(message, remotePort));
        },
        disconnect: () => disconnectFrom("caller"),
        onMessage: callerSide.onMessage.toApi(),
        onDisconnect: callerSide.onDisconnect.toApi(),
      };
      remotePort = {
        name,
        sender,
        postMessage: (message: unknown) => {
          queueMicrotask(() => callerSide.onMessage.fire(message, callerPort));
        },
        disconnect: () => disconnectFrom("remote"),
        onMessage: remoteSide.onMessage.toApi(),
        onDisconnect: remoteSide.onDisconnect.toApi(),
      };

      const record: PortRecord = {
        id: portId,
        name,
        extId: targetExt,
        remote: remoteSide,
      };
      ext.ports.set(portId, record);

      const target = registry.get(targetExt);
      if (target?.background) {
        target.background.events.runtimeOnConnect.fire(remotePort);
      } else {
        void waitForBackground(targetExt).then((readyTarget) => {
          if (!disconnected) {
            readyTarget?.background?.events.runtimeOnConnect.fire(remotePort);
          }
        });
      }

      return callerPort;
    },
    lastError: null as { message: string } | null,
    getPlatformInfo: (cb?: (info: unknown) => void) => {
      const result = { os: "linux", arch: "x86-64", nacl_arch: "x86_64" };
      cb?.(result);
      return Promise.resolve(result);
    },
    openOptionsPage: (cb?: () => void) => {
      const page = ext.manifest.options_page ?? ext.manifest.options_ui?.page;
      if (page) host.openExtensionTab?.(extId, page, tabId);
      cb?.();
    },
    setUninstallURL: (_url?: string, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
    requestUpdateCheck: (cb?: (status: string, details: unknown) => void) => {
      cb?.("no_update", {});
      return Promise.resolve({ status: "no_update", details: {} });
    },
  };

  const extension = {
    getURL: runtime.getURL,
    getBackgroundPage: () => ext.background?.frame?.contentWindow ?? null,
    inIncognitoContext: false,
    isAllowedIncognitoAccess: (cb?: (allowed: boolean) => void) => {
      cb?.(false);
      return Promise.resolve(false);
    },
    isAllowedFileSchemeAccess: (cb?: (allowed: boolean) => void) => {
      cb?.(false);
      return Promise.resolve(false);
    },
    onMessage: runtime.onMessage,
    onMessageExternal: new EventHub().toApi(),
    sendMessage: runtime.sendMessage,
  };

  return { runtime, extension };
}
