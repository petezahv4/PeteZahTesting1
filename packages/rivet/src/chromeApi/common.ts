import { EventHub } from "../eventHub";
import { CONTENT_SCRIPT_STYLE_ATTRIBUTE } from "../htmlInject";
import { NEGATIVE } from "../messages";
import type { RivetHostBindings, TabInfo } from "../types";
import { decodeRivetUrl, rivetExtensionBase } from "../urlScheme";

let rivetTraceCallCounter = 0;

function rivetTraceLog(...args: unknown[]): void {
  if ((globalThis as { RIVET_TRACE?: boolean }).RIVET_TRACE) {
    console.debug("[rivet-trace]", ...args);
  }
}

export function traceCalls<T extends object>(obj: T, path = ""): T {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string") return value;
      const fullPath = path ? `${path}.${prop}` : prop;
      if (typeof value === "function") {
        return new Proxy(value, {
          apply(fnTarget, thisArg, args) {
            const callId = ++rivetTraceCallCounter;
            rivetTraceLog(`#${callId} call ${fullPath}(`, args, `)`);
            const result = Reflect.apply(
              fnTarget as (...a: unknown[]) => unknown,
              thisArg,
              args,
            );
            if (
              result &&
              typeof (result as Promise<unknown>).then === "function"
            ) {
              (result as Promise<unknown>).then(
                (resolved) =>
                  rivetTraceLog(`#${callId} resolved ${fullPath} =>`, resolved),
                (error) =>
                  rivetTraceLog(`#${callId} rejected`, fullPath, "=>", error, NEGATIVE),
              );
            }
            return result;
          },
          get(fnTarget, fnProp, fnReceiver) {
            const fnValue = Reflect.get(fnTarget, fnProp, fnReceiver);
            if (typeof fnProp !== "string") return fnValue;
            if (typeof fnValue === "object" && fnValue !== null) {
              return traceCalls(fnValue, `${fullPath}.${fnProp}`);
            }
            return fnValue;
          },
        });
      }
      if (value && typeof value === "object") {
        return traceCalls(value as object, fullPath);
      }
      return value;
    },
  }) as T;
}

export function cloneForRealm<T>(realm: Window | undefined, value: T): T {
  if (!realm) return value;
  try {
    return (
      realm as unknown as { structuredClone: (v: T) => T }
    ).structuredClone(value);
  } catch {
    return value;
  }
}

export function setRealmApi(
  realm: Window,
  name: "chrome" | "browser",
  value: unknown,
): boolean {
  try {
    Object.defineProperty(realm, name, {
      configurable: true,
      writable: true,
      value,
    });
    return true;
  } catch {
    try {
      (realm as unknown as Record<string, unknown>)[name] = value;
      return (realm as unknown as Record<string, unknown>)[name] === value;
    } catch {
      return false;
    }
  }
}

export function adoptApiObjectsForRealm(
  realm: Window,
  value: unknown,
  seen = new WeakSet<object>(),
): void {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  const object = value as object;
  const prototype = Object.getPrototypeOf(object);
  const realmGlobal = realm as unknown as {
    Array: ArrayConstructor;
    Object: ObjectConstructor;
  };
  if (Array.isArray(object)) {
    Object.setPrototypeOf(object, realmGlobal.Array.prototype);
  } else if (
    prototype === Object.prototype ||
    prototype === realmGlobal.Object.prototype
  ) {
    Object.setPrototypeOf(object, realmGlobal.Object.prototype);
  } else {
    return;
  }
  for (const child of Object.values(object)) {
    adoptApiObjectsForRealm(realm, child, seen);
  }
}

export function buildTabObject(
  host: RivetHostBindings,
  tabId: number | null,
  realm?: Window,
): unknown {
  if (tabId === null) return null;
  const tab: TabInfo | null = host.getTab(tabId);
  if (!tab) return null;
  const activeId = host.getActiveTabId?.() ?? null;
  const object = {
    id: tab.id,
    index: Math.max(0, tab.id - 1),
    windowId: tab.windowId,
    highlighted: tab.active,
    active: tab.active || tab.id === activeId,
    pinned: false,
    audible: false,
    discarded: false,
    autoDiscardable: false,
    mutedInfo: { muted: false },
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl ?? "",
    status: tab.status ?? "complete",
    incognito: false,
    width: 800,
    height: 600,
  };
  return cloneForRealm(realm, object);
}

export function openUrlInTab(
  host: RivetHostBindings,
  tabId: number | null,
  url: string,
): void {
  const decoded = decodeRivetUrl(url);
  if (decoded) {
    host.openExtensionTab?.(decoded.extId, decoded.path, tabId);
  } else {
    host.navigateTab?.(tabId, url);
  }
}

export function chooseActionIconValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const image = value as {
    width?: unknown;
    height?: unknown;
    data?: unknown;
  };
  if (
    typeof image.width === "number" &&
    typeof image.height === "number" &&
    image.data != null
  ) {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;
  entries.sort(([left], [right]) => {
    const leftSize = Number.parseInt(left, 10);
    const rightSize = Number.parseInt(right, 10);
    if (!Number.isFinite(leftSize)) return -1;
    if (!Number.isFinite(rightSize)) return 1;
    return leftSize - rightSize;
  });
  return entries.at(-1)?.[1] ?? null;
}

export function actionImageDataUrl(value: unknown): string | null {
  const selected = chooseActionIconValue(value);
  if (typeof selected === "string") return selected;
  if (!selected || typeof selected !== "object") return null;

  const source = selected as {
    width?: unknown;
    height?: unknown;
    data?: unknown;
  };
  const width = typeof source.width === "number" ? Math.floor(source.width) : 0;
  const height =
    typeof source.height === "number" ? Math.floor(source.height) : 0;
  if (
    width < 1 ||
    height < 1 ||
    !source.data ||
    typeof (source.data as ArrayLike<number>).length !== "number"
  ) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const imageData = context.createImageData(width, height);
  imageData.data.set(new Uint8ClampedArray(source.data as ArrayLike<number>));
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function captureVisibleTabViaDisplayMedia(
  targetWin: Window | null,
): Promise<string | null> {
  if (!navigator.mediaDevices?.getDisplayMedia) return null;
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser" },
      preferCurrentTab: true,
    } as DisplayMediaStreamOptions);
    const track = stream.getVideoTracks()[0];
    if (!track) return null;
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else
        video.addEventListener("loadeddata", () => resolve(), { once: true });
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0);

    const frameElement = (targetWin as unknown as { frameElement?: Element })
      ?.frameElement;
    if (frameElement) {
      const rect = frameElement.getBoundingClientRect();
      const scaleX = video.videoWidth / window.innerWidth;
      const scaleY = video.videoHeight / window.innerHeight;
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = Math.max(1, Math.round(rect.width * scaleX));
      cropCanvas.height = Math.max(1, Math.round(rect.height * scaleY));
      const cropContext = cropCanvas.getContext("2d");
      if (cropContext) {
        cropContext.drawImage(
          canvas,
          rect.left * scaleX,
          rect.top * scaleY,
          rect.width * scaleX,
          rect.height * scaleY,
          0,
          0,
          cropCanvas.width,
          cropCanvas.height,
        );
        return cropCanvas.toDataURL("image/png");
      }
    }
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.warn(
      "[rivet] visible tab capture failed or was cancelled",
      error,
      NEGATIVE,
    );
    return null;
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

export function generateDocumentId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2).padEnd(32, "0");
}

export function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "chrome-extension:") {
      return globalThis.location.origin;
    }
    const extensionUrl = decodeRivetUrl(parsed.href);
    return extensionUrl
      ? rivetExtensionBase(extensionUrl.extId).slice(0, -1)
      : parsed.origin;
  } catch {
    return undefined;
  }
}

export function dispatchMessage(
  hubs: EventHub[],
  message: unknown,
  sender: unknown,
): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        dispatchMessageNow(hubs, message, sender, resolve);
      } catch (error) {
        console.error("[rivet] runtime message dispatch failed", error, NEGATIVE);
        resolve(undefined);
      }
    }, 0);
  });
}

function dispatchMessageNow(
  hubs: EventHub[],
  message: unknown,
  sender: unknown,
  resolve: (value: unknown) => void,
): void {
  let responded = false;
  const sendResponse = (response: unknown) => {
    rivetTraceLog(
      "send response called with",
      response,
      "already responded:",
      responded,
      "for",
      message,
    );
    if (responded) return;
    responded = true;
    resolve(response);
  };
  const listeners = hubs.flatMap((hub) => hub.snapshot());
  if (listeners.length === 0) {
    console.warn(
      "[rivet] runtime message has no registered listeners for this extension",
      message,
      NEGATIVE,
    );
  }
  let anyAsync = false;
  for (const [index, listener] of listeners.entries()) {
    rivetTraceLog(`dispatch message listener #${index} invoked for`, message);
    let result: unknown;
    try {
      result = listener(message, sender, sendResponse);
    } catch (error) {
      console.error("[rivet] runtime message listener threw", error, NEGATIVE);
      continue;
    }
    rivetTraceLog(
      `dispatch message listener #${index} returned`,
      result,
      "responded so far:",
      responded,
    );
    if (result === true) {
      anyAsync = true;
    } else if (
      result &&
      typeof (result as Promise<unknown>).then === "function"
    ) {
      anyAsync = true;
      (result as Promise<unknown>).then(
        (resolved) => {
          rivetTraceLog(
            `dispatch message listener #${index} thenable resolved`,
            resolved,
          );
          sendResponse(resolved);
        },
        (error) => {
          rivetTraceLog(
            `dispatch message listener #${index} thenable rejected`,
            error,
            NEGATIVE,
          );
          sendResponse(undefined);
        },
      );
    } else if (!responded) {
      rivetTraceLog(
        "runtime message listener returned without responding",
        result,
        message,
      );
    }
  }
  if (!anyAsync && !responded) sendResponse(undefined);
}

export function injectCss(win: Window, css: string): HTMLStyleElement | null {
  try {
    const document = win.document;
    const style = document.createElement("style");
    style.setAttribute(CONTENT_SCRIPT_STYLE_ATTRIBUTE, "");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  } catch {
    return null;
  }
}
