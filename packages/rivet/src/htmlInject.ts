import {
  buildExtensionUrl,
  decodeRivetUrl,
  extensionPathDir,
  RIVET_PREFIX,
  resolveExtensionResourcePath,
  rivetBootstrapUrl,
  rivetExtensionBase,
} from "./urlScheme";
import { NEGATIVE, negativeMessage } from "./messages";

const RESOURCE_ATTR_RE = /(<(?:script|link|img)\b[^>]*\s(?:src|href)=["'])([^"']+)(["'][^>]*>)/gi;
export const CONTENT_SCRIPT_STYLE_ATTRIBUTE = "data-rivet-content-style";

export type NativeDomOperations = {
  natives: {
    call: (target: string, that: unknown, ...args: unknown[]) => unknown;
  };
  descriptors: {
    set: (target: string, that: unknown, value: unknown) => void;
  };
  prepareScript?: (code: string) => string;
};

function defineNavigatorValue(win: Window, property: string, value: string): void {
  try {
    Object.defineProperty(win.navigator, property, {
      configurable: true,
      get: () => value,
    });
  } catch {
  }
}

function installChromiumUserAgent(win: Window): void {
  const nativeUserAgent = win.navigator.userAgent;
  if (/\bChrom(?:e|ium)\/\d+/.test(nativeUserAgent)) return;
  const platform = /^Mozilla\/5\.0 \(([^)]*)\)/.exec(nativeUserAgent)?.[1]
    ?.replace(/;\s*rv:[^;)]+/, "") ?? "X11; Linux x86_64";
  const userAgent = `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`;
  defineNavigatorValue(win, "userAgent", userAgent);
  defineNavigatorValue(win, "appVersion", userAgent.replace(/^Mozilla\//, ""));
  defineNavigatorValue(win, "vendor", "Google Inc.");
}

export async function rewriteExtHtml(extId: string, html: string, pagePath: string): Promise<string> {
  const resourcePath = pagePath.replace(/[?#].*$/, "").replace(/^\//, "");
  const pageDir = extensionPathDir(resourcePath);
  let result = html.replace(RESOURCE_ATTR_RE, (full, prefix: string, url: string, suffix: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:)/i.test(url)) return full; 
    return `${prefix}${buildExtensionUrl(extId, resolveExtensionResourcePath(pageDir, url))}${suffix}`;
  });
  const headBootstrap = `<base href="${rivetExtensionBase(extId)}${pageDir ? `${pageDir}/` : ""}">`;
  if (/<head[^>]*>/i.test(result)) {
    result = result.replace(/<head([^>]*)>/i, `<head$1>${headBootstrap}`);
  } else {
    result = result.replace(/<html([^>]*)>/i, `<html$1><head>${headBootstrap}</head>`);
  }
  return result;
}

export function bootstrapExtensionFrame(
  frame: HTMLIFrameElement,
  extId: string,
): Promise<Window>;
export function bootstrapExtensionFrame(
  frame: HTMLIFrameElement,
  extId: string,
  isCurrent: () => boolean,
): Promise<Window | null>;
export function bootstrapExtensionFrame(
  frame: HTMLIFrameElement,
  extId: string,
  isCurrent: () => boolean = () => true,
): Promise<Window | null> {
  return new Promise((resolve, reject) => {
    const expectedUrl = rivetBootstrapUrl(extId);
    const onLoad = () => {
      const win = frame.contentWindow;
      if (!win) {
        frame.removeEventListener("load", onLoad);
        reject(new Error(negativeMessage("rivet bootstrap frame has no window after load")));
        return;
      }
      if (!isCurrent()) {
        frame.removeEventListener("load", onLoad);
        resolve(null);
        return;
      }
      try {
        if (win.location.href !== expectedUrl) return;
      } catch {
        return;
      }
      frame.removeEventListener("load", onLoad);
      installChromiumUserAgent(win);
      resolve(win);
    };
    frame.addEventListener("load", onLoad);
    frame.removeAttribute("srcdoc");
    frame.src = expectedUrl;
  });
}

interface DeferredDocumentScript {
  attributes: string;
  code: string;
}

function deferDocumentScripts(html: string): { html: string; scripts: DeferredDocumentScript[] } {
  const scripts: DeferredDocumentScript[] = [];
  const deferredHtml = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_tag, attributes: string, code: string) => {
    const index = scripts.push({ attributes, code }) - 1;
    return `<script type="application/x-rivet-deferred" data-rivet-script-index="${index}"></script>`;
  });
  return { html: deferredHtml, scripts };
}

function waitForDocumentLoad(win: Window): Promise<Window> {
  const frame = win.frameElement as HTMLIFrameElement | null;
  if (!frame) return Promise.resolve(win);
  return new Promise((resolve) => frame.addEventListener("load", () => resolve(frame.contentWindow ?? win), { once: true }));
}

async function activateDocumentScript(win: Window, definition: DeferredDocumentScript, index: number): Promise<void> {
  const doc = win.document;
  const placeholder = doc.querySelector(`script[data-rivet-script-index="${index}"]`);
  if (!placeholder) return;

  const template = doc.createElement("template");
  template.innerHTML = `<script${definition.attributes}></script>`;
  const parsed = template.content.firstElementChild;
  const script = doc.createElement("script");
  if (parsed) {
    for (const attribute of parsed.attributes) script.setAttribute(attribute.name, attribute.value);
  }
  script.textContent = definition.code;

  const waitsForLoad = script.hasAttribute("src") || script.type === "module";
  if (!waitsForLoad) {
    placeholder.replaceWith(script);
    return;
  }

  if (script.type !== "module") script.async = false;
  await new Promise<void>((resolve) => {
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => {
      console.warn("[rivet] extension page script failed to load", script.src || `inline script ${index}`, NEGATIVE);
      resolve();
    }, { once: true });
    placeholder.replaceWith(script);
  });
}

export async function writeDocument(
  win: Window,
  html: string,
  prepare?: (realm: Window) => void,
  documentUrl = win.location.href,
  isCurrent: () => boolean = () => true,
): Promise<Window> {
  const deferred = deferDocumentScripts(html);
  const loaded = waitForDocumentLoad(win);
  win.document.open();
  win.document.write(deferred.html);
  win.document.close();
  const realm = await loaded;
  if (!isCurrent()) return realm;
  realm.history.replaceState(null, "", documentUrl);
  installChromiumUserAgent(realm);
  prepare?.(realm);
  for (const [index, definition] of deferred.scripts.entries()) {
    if (!isCurrent()) return realm;
    await activateDocumentScript(realm, definition, index);
  }

  if (!isCurrent()) return realm;
  const domContentLoaded = realm.document.createEvent("Event");
  domContentLoaded.initEvent("DOMContentLoaded", true, false);
  realm.document.dispatchEvent(domContentLoaded);
  const load = realm.document.createEvent("Event");
  load.initEvent("load", false, false);
  realm.dispatchEvent(load);
  return realm;
}

export function injectScript(win: Window, code: string, nativeDom?: NativeDomOperations): void {
  try {
    const doc = win.document;
    if (nativeDom) {
      const source = nativeDom.prepareScript?.(code) ?? code;
      const script = doc.createElement("script");
      script.appendChild(doc.createTextNode(source));
      (doc.head || doc.documentElement).appendChild(script);
    } else {
      const script = doc.createElement("script");
      script.textContent = code;
      (doc.head || doc.documentElement).appendChild(script);
    }
  } catch (e) {
    console.warn("[rivet] script injection failed", e, NEGATIVE);
  }
}

export function injectScriptFromUrl(win: Window, url: string, isModule: boolean): Promise<void> {
  return new Promise((resolve) => {
    try {
      const doc = win.document;
      const script = doc.createElement("script");
      if (isModule) script.type = "module";
      script.src = url;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", (e) => {
        console.warn("[rivet] script url failed to load", url, e, NEGATIVE);
        resolve();
      }, { once: true });
      (doc.head || doc.documentElement).appendChild(script);
    } catch (e) {
      console.warn("[rivet] script url injection failed", e, NEGATIVE);
      resolve();
    }
  });
}

export function installClassicWorkerGlobals(
  win: Window,
  extId: string,
  workerPath: string,
  preloadedScripts: ReadonlyMap<string, string> = new Map(),
): void {
  const workerDir = extensionPathDir(workerPath);
  const buildFrameExtensionUrl = (targetExtId: string, path: string) =>
    `${win.location.origin}${RIVET_PREFIX}${targetExtId}/${path.replace(/^\//, "")}`;
  const resolveImportUrl = (specifier: string): string => {
    const extensionUrl = decodeRivetUrl(specifier);
    if (extensionUrl) return buildFrameExtensionUrl(extensionUrl.extId, extensionUrl.path);
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(specifier)) {
      return new URL(specifier, win.location.href).href;
    }
    const importPath = resolveExtensionResourcePath(specifier.startsWith("/") ? "" : workerDir, specifier);
    return buildFrameExtensionUrl(extId, importPath);
  };

  const workerGlobal = win as unknown as Window & {
    clients?: {
      claim: () => Promise<void>;
      get: (_id: string) => Promise<undefined>;
      matchAll: () => Promise<unknown[]>;
      openWindow: (_url: string) => Promise<null>;
    };
    XMLHttpRequest: typeof XMLHttpRequest;
    eval: (source: string) => unknown;
    importScripts?: (...urls: string[]) => void;
    skipWaiting?: () => Promise<void>;
  };

  workerGlobal.importScripts = (...urls: string[]) => {
    for (const specifier of urls) {
      const url = resolveImportUrl(String(specifier));
      const preloaded = preloadedScripts.get(url);
      if (preloaded !== undefined) {
        workerGlobal.eval(`${preloaded}\n//# sourceURL=${url}`);
        continue;
      }
      const request = new workerGlobal.XMLHttpRequest();
      request.open("GET", url, false);
      request.send();
      if (request.status < 200 || request.status >= 300) {
        throw new Error(negativeMessage("rivet worker dependency could not be loaded"));
      }
      workerGlobal.eval(`${request.responseText}\n//# sourceURL=${url}`);
    }
  };
  workerGlobal.skipWaiting = () => Promise.resolve();
  workerGlobal.clients = {
    claim: () => Promise.resolve(),
    get: () => Promise.resolve(undefined),
    matchAll: () => Promise.resolve([]),
    openWindow: () => Promise.resolve(null),
  };
}

export function injectStyle(win: Window, css: string, nativeDom?: NativeDomOperations): void {
  try {
    const doc = win.document;
    if (nativeDom) {
      const style = doc.createElement("style");
      style.setAttribute(CONTENT_SCRIPT_STYLE_ATTRIBUTE, "");
      style.appendChild(doc.createTextNode(css));
      (doc.head || doc.documentElement).appendChild(style);
    } else {
      const style = doc.createElement("style");
      style.setAttribute(CONTENT_SCRIPT_STYLE_ATTRIBUTE, "");
      style.textContent = css;
      (doc.head || doc.documentElement).appendChild(style);
    }
  } catch (e) {
    console.warn("[rivet] style injection failed", e, NEGATIVE);
  }
}
