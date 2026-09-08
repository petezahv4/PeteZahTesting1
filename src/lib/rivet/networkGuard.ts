import type { Rivet } from "@rivet/rivet";
import type { WebRequestDetails } from "@rivet/registry";
import { unwrapProxyUrl } from "@/lib/openTabBridge";

const GUARD = "__pzRivetNetGuard";

type GuardState = {
  pageUrl: string;
  tabId: number;
  seq: number;
};

function resourceTypeFromDestination(dest: string, init?: RequestInit): string {
  const d = String(dest || "").toLowerCase();
  if (d === "document") return "main_frame";
  if (d === "iframe" || d === "frame") return "sub_frame";
  if (d === "style") return "stylesheet";
  if (d === "script") return "script";
  if (d === "image") return "image";
  if (d === "font") return "font";
  if (d === "audio" || d === "video" || d === "track") return "media";
  if (d === "report") return "ping";
  if (init || d === "empty" || d === "") return "xmlhttprequest";
  return "other";
}

function resourceTypeFromPerf(initiatorType: string): string {
  const t = String(initiatorType || "").toLowerCase();
  if (t === "xmlhttprequest" || t === "fetch") return "xmlhttprequest";
  if (t === "script") return "script";
  if (t === "css" || t === "link") return "stylesheet";
  if (t === "img" || t === "image" || t === "css") return "image";
  if (t === "iframe" || t === "frame" || t === "subdocument") return "sub_frame";
  if (t === "video" || t === "audio") return "media";
  if (t === "beacon" || t === "ping") return "ping";
  if (t === "font") return "font";
  return "other";
}

function absoluteUrl(raw: string, base: string): string {
  try {
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

export function installRivetNetworkGuard(
  win: Window,
  rivet: Rivet,
  pageUrl: string,
  tabId: number,
): void {
  let state: GuardState;
  try {
    const existing = (win as any)[GUARD] as GuardState | undefined;
    if (existing) {
      const changed =
        existing.pageUrl !== pageUrl || existing.tabId !== tabId;
      existing.pageUrl = pageUrl;
      existing.tabId = tabId;
      if (changed) {
        try {
          const docUrl = unwrapProxyUrl(pageUrl, pageUrl);
          if (/^https?:/i.test(docUrl)) {
            const main: WebRequestDetails = {
              requestId: `pz-${tabId}-nav-${Date.now()}`,
              url: docUrl,
              method: "GET",
              tabId,
              windowId: 1,
              frameId: 0,
              parentFrameId: -1,
              type: "main_frame",
              timeStamp: Date.now(),
              documentUrl: docUrl,
            };
            void rivet.registry
              .dispatchWebRequest("onBeforeRequest", main)
              .then(() =>
                rivet.registry.dispatchWebRequest("onCompleted", {
                  ...main,
                  statusCode: 200,
                  statusLine: "200",
                }),
              )
              .catch(() => {});
          }
        } catch {}
      }
      return;
    }
    state = { pageUrl, tabId, seq: 0 };
    (win as any)[GUARD] = state;
  } catch {
    return;
  }

  const nextId = () => `pz-${state.tabId}-${++state.seq}`;

  const detailsFor = (
    url: string,
    type: string,
    method = "GET",
  ): WebRequestDetails => {
    const initiator = state.pageUrl;
    let origin = "";
    try {
      origin = new URL(initiator).origin;
    } catch {}
    return {
      requestId: nextId(),
      url,
      method,
      tabId: state.tabId,
      windowId: 1,
      frameId: 0,
      parentFrameId: -1,
      type,
      timeStamp: Date.now(),
      initiator: origin || undefined,
      originUrl: origin || undefined,
      documentUrl: initiator,
    };
  };

  const resolveRealUrl = (raw: string) => {
    const abs = absoluteUrl(raw, state.pageUrl);
    return unwrapProxyUrl(abs, state.pageUrl);
  };

  const decide = async (requestUrl: string, type: string, method = "GET") => {
    const details = detailsFor(requestUrl, type, method);
    try {
      const before = await rivet.registry.dispatchWebRequest(
        "onBeforeRequest",
        details,
      );
      if (before?.cancel) return { action: "block" as const, details };
      if (before?.redirectUrl) {
        return {
          action: "redirect" as const,
          url: before.redirectUrl,
          details: { ...details, url: before.redirectUrl },
        };
      }
    } catch {}

    try {
      const dnr = rivet.checkDeclarativeNetRequest(
        requestUrl,
        state.pageUrl,
        type,
      );
      if (dnr?.action === "block") return { action: "block" as const, details };
      if (dnr?.action === "redirect") {
        return {
          action: "redirect" as const,
          url: dnr.url,
          details: { ...details, url: dnr.url },
        };
      }
    } catch {}

    return { action: "allow" as const, details };
  };

  const finish = (
    details: WebRequestDetails,
    statusCode = 200,
    blocked = false,
  ) => {
    const done = {
      ...details,
      statusCode: blocked ? 451 : statusCode,
      statusLine: blocked ? "451 Blocked" : `${statusCode}`,
    };
    void rivet.registry
      .dispatchWebRequest(blocked ? "onErrorOccurred" : "onCompleted", {
        ...done,
        ...(blocked ? { error: "net::ERR_BLOCKED_BY_CLIENT" } : {}),
      })
      .catch(() => {});
  };

  const blockedResponse = () =>
    new Response("", { status: 451, statusText: "Blocked" });

  try {
    const nativeFetch = win.fetch.bind(win);
    win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let url = "";
      try {
        if (typeof input === "string") url = input;
        else if (input instanceof URL) url = input.href;
        else if (input && typeof (input as Request).url === "string")
          url = (input as Request).url;
      } catch {}
      if (!url) return nativeFetch(input as any, init);

      const real = resolveRealUrl(url);
      const method =
        init?.method ||
        (typeof input === "object" &&
        input &&
        "method" in input &&
        typeof (input as Request).method === "string"
          ? (input as Request).method
          : "GET");
      const type = resourceTypeFromDestination("", init);
      const decision = await decide(real, type, method);
      if (decision.action === "block") {
        finish(decision.details, 451, true);
        return blockedResponse();
      }
      try {
        const res = await nativeFetch(
          decision.action === "redirect" ? decision.url : input,
          init,
        );
        finish(decision.details, res.status || 200, false);
        return res;
      } catch (err) {
        finish(
          {
            ...decision.details,
            error: String((err as Error)?.message || err),
          },
          0,
          true,
        );
        throw err;
      }
    };
  } catch {}

  try {
    const XHR = (win as any).XMLHttpRequest as typeof XMLHttpRequest | undefined;
    if (XHR) {
      const open = XHR.prototype.open;
      const send = XHR.prototype.send;
      XHR.prototype.open = function (
        method: string,
        url: string | URL,
        ...rest: any[]
      ) {
        try {
          (this as any).__pzUrl = String(url);
          (this as any).__pzMethod = String(method || "GET");
        } catch {}
        return open.apply(this, [method, url, ...rest] as any);
      };
      XHR.prototype.send = function (...args: any[]) {
        const run = async () => {
          try {
            let url = (this as any).__pzUrl || "";
            if (!url) {
              send.apply(this, args as any);
              return;
            }
            const real = resolveRealUrl(url);
            const method = (this as any).__pzMethod || "GET";
            const decision = await decide(real, "xmlhttprequest", method);
            if (decision.action === "block") {
              finish(decision.details, 451, true);
              Object.defineProperty(this, "status", { get: () => 451 });
              Object.defineProperty(this, "readyState", { get: () => 4 });
              this.dispatchEvent(new Event("error"));
              this.dispatchEvent(new Event("loadend"));
              return;
            }
            if (decision.action === "redirect") {
              open.call(this, method, decision.url, true);
            }
            this.addEventListener(
              "loadend",
              () => {
                finish(
                  decision.details,
                  (this as any).status || 200,
                  (this as any).status === 451,
                );
              },
              { once: true },
            );
            send.apply(this, args as any);
          } catch {
            send.apply(this, args as any);
          }
        };
        void run();
      };
    }
  } catch {}

  try {
    if (typeof PerformanceObserver !== "undefined") {
      const seen = new Set<string>();
      const reportPerf = (entry: PerformanceResourceTiming) => {
        try {
          const name = String(entry.name || "");
          if (!name || seen.has(name)) return;
          seen.add(name);
          const real = resolveRealUrl(name);
          if (!/^https?:/i.test(real)) return;
          if (seen.has(`real:${real}`)) return;
          seen.add(`real:${real}`);
          const type = resourceTypeFromPerf(entry.initiatorType);
          const details = detailsFor(real, type);
          void rivet.registry
            .dispatchWebRequest("onBeforeRequest", details)
            .then(() => {
              finish(
                details,
                entry.responseStatus && entry.responseStatus > 0
                  ? entry.responseStatus
                  : 200,
                false,
              );
            })
            .catch(() => {});
        } catch {}
      };
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          reportPerf(entry as PerformanceResourceTiming);
        }
      });
      po.observe({ type: "resource", buffered: true } as PerformanceObserverInit);
      try {
        for (const entry of win.performance.getEntriesByType("resource")) {
          reportPerf(entry as PerformanceResourceTiming);
        }
      } catch {}
    }
  } catch {}

  try {
    const docUrl = resolveRealUrl(state.pageUrl);
    if (/^https?:/i.test(docUrl)) {
      const main = detailsFor(docUrl, "main_frame");
      void rivet.registry
        .dispatchWebRequest("onBeforeRequest", main)
        .then(() => finish(main, 200, false))
        .catch(() => {});
    }
  } catch {}
}
