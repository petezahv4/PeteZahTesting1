import { encodeMochiTarget } from "./mochiEncoding";

const nativeFetch = globalThis.fetch.bind(globalThis);
const installedFetch = new WeakMap<Window, Window["fetch"]>();

function extensionRequestUrl(input: string, base: string, origin: string): string {
  const url = new URL(input, base);
  if (!/^https?:$/.test(url.protocol) || url.origin === origin) return url.href;
  return `${origin}/!!/${encodeMochiTarget(url.href)}/`;
}

function extensionSocketUrl(input: string, base: string, origin: string): string {
  const url = new URL(input, base);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (!/^wss?:$/.test(url.protocol)) return url.href;
  const gateway = new URL(origin);
  gateway.protocol = gateway.protocol === "https:" ? "wss:" : "ws:";
  if (url.origin === gateway.origin && url.pathname.startsWith("/!!/")) return url.href;
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return `${gateway.origin}/!!/${encodeMochiTarget(url.href)}/`;
}

export function installExtensionNetwork(win: Window, documentUrl?: string): void {
  if (installedFetch.get(win) === win.fetch) return;
  const realm = win as Window & Pick<typeof globalThis, "XMLHttpRequest" | "WebSocket" | "EventSource">;
  const origin = globalThis.location.origin;
  const isContentScript = documentUrl && /^https?:/.test(documentUrl)
    && new URL(documentUrl).origin !== origin;
  if (isContentScript) return;
  const base = () => win.document.baseURI;
  const requestUrl = (input: string) => extensionRequestUrl(input, base(), origin);
  const originalFetch = win.fetch.bind(win);

  realm.fetch = async (input, init) => {
    const inputRequest = typeof input === "object" && "url" in input ? input : undefined;
    const source = inputRequest?.url ?? String(input);
    const absolute = new URL(source, base()).href;
    const target = requestUrl(source);
    if (target === absolute) {
      return originalFetch(input, init);
    }
    const request = new Request(inputRequest ?? absolute, {
      ...(inputRequest ? { referrerPolicy: inputRequest.referrerPolicy } : {}),
      ...init,
    });
    const forwarded: RequestInit & { duplex: "half" } = {
      method: request.method,
      headers: request.headers,
      body: request.keepalive && request.body ? await request.arrayBuffer() : request.body,
      signal: request.signal,
      mode: request.mode,
      credentials: request.credentials,
      cache: request.cache,
      redirect: request.redirect,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      integrity: request.integrity,
      keepalive: request.keepalive,
      duplex: "half",
    };
    return nativeFetch(new Request(target, forwarded));
  };
  installedFetch.set(win, realm.fetch);

  realm.XMLHttpRequest = new Proxy(realm.XMLHttpRequest, {
    construct(Target, args) {
      const xhr = Reflect.construct(Target, args) as XMLHttpRequest;
      const open = xhr.open;
      xhr.open = function (method: string, url: string | URL, ...args: unknown[]) {
        return Reflect.apply(open, this, [method, requestUrl(String(url)), ...args]);
      };
      return xhr;
    },
  });

  if (globalThis.EventSource) {
    realm.EventSource = new Proxy(globalThis.EventSource, {
      construct(Target, args) {
        args[0] = requestUrl(String(args[0]));
        return Reflect.construct(Target, args);
      },
    });
  }
  if (globalThis.WebSocket) {
    realm.WebSocket = new Proxy(globalThis.WebSocket, {
      construct(Target, args) {
        args[0] = extensionSocketUrl(String(args[0]), base(), origin);
        return Reflect.construct(Target, args);
      },
    });
  }
  if (globalThis.navigator?.sendBeacon) {
    const sendBeacon = globalThis.navigator.sendBeacon.bind(globalThis.navigator);
    Object.defineProperty(win.navigator, "sendBeacon", {
      configurable: true,
      value: (url: string | URL, body?: BodyInit | null) => sendBeacon(requestUrl(String(url)), body),
    });
  }
}
