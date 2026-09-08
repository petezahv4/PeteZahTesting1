import { recomputeStaticRules } from "../dnr";
import type { WebRequestDetails, WebRequestEventName } from "../registry";
import type { ChromeApiContext } from "./context";

export function createNetworkApis(context: ChromeApiContext) {
  const { realm, extId, tabId, registry, host, ext, events } = context;

  const cookies = {
    get: (
      details: { name: string; domain?: string; url?: string },
      cb?: (cookie: unknown) => void,
    ) => {
      const targetTabId = tabId ?? host.getActiveTabId?.() ?? null;
      const win =
        targetTabId !== null
          ? (host.getTabWindow?.(targetTabId) ?? realm)
          : realm;
      let value: unknown = null;
      try {
        const all = win?.document?.cookie?.split(";") ?? [];
        const found = all.find((cookie) =>
          cookie.trim().startsWith(`${details.name}=`),
        );
        if (found) {
          const cookieValue = found.split("=").slice(1).join("=").trim();
          value = {
            name: details.name,
            value: cookieValue,
            domain: details.domain ?? "",
            path: "/",
          };
        }
      } catch {
      }
      cb?.(value);
      return Promise.resolve(value);
    },
    set: (
      details: {
        name: string;
        value: string;
        path?: string;
        domain?: string;
        url?: string;
      },
      cb?: (cookie: unknown) => void,
    ) => {
      const targetTabId = tabId ?? host.getActiveTabId?.() ?? null;
      const win =
        targetTabId !== null
          ? (host.getTabWindow?.(targetTabId) ?? realm)
          : realm;
      const cookie = {
        name: details.name,
        value: details.value,
        domain: details.domain ?? win.location.hostname,
        path: details.path ?? "/",
        secure: win.location.protocol === "https:",
      };
      try {
        let serialized = `${details.name}=${details.value}`;
        if (details.path) serialized += `;path=${details.path}`;
        if (details.domain) serialized += `;domain=${details.domain}`;
        if (win) win.document.cookie = serialized;
      } catch {
      }
      cb?.(cookie);
      registry.broadcast(extId, (eventSet) => eventSet.cookiesOnChanged, [
        { removed: false, cause: "explicit", cookie },
      ]);
      return Promise.resolve(cookie);
    },
    getAll: (
      details: { name?: string } = {},
      cb?: (cookies: unknown[]) => void,
    ) => {
      const targetTabId = tabId ?? host.getActiveTabId?.() ?? null;
      const win =
        targetTabId !== null
          ? (host.getTabWindow?.(targetTabId) ?? realm)
          : realm;
      let result: unknown[] = [];
      try {
        result = (win.document.cookie || "")
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const [name, ...value] = part.split("=");
            return {
              name,
              value: value.join("="),
              domain: win.location.hostname,
              path: "/",
              secure: win.location.protocol === "https:",
            };
          })
          .filter((cookie) => !details.name || cookie.name === details.name);
      } catch {
      }
      cb?.(result);
      return Promise.resolve(result);
    },
    remove: (
      details: { name: string; url?: string },
      cb?: (details: unknown) => void,
    ) => {
      const targetTabId = tabId ?? host.getActiveTabId?.() ?? null;
      const win =
        targetTabId !== null
          ? (host.getTabWindow?.(targetTabId) ?? realm)
          : realm;
      let result: unknown = null;
      try {
        win.document.cookie = `${details.name}=; Max-Age=0; path=/`;
        result = {
          url: details.url ?? win.location.href,
          name: details.name,
          storeId: "0",
        };
        registry.broadcast(extId, (eventSet) => eventSet.cookiesOnChanged, [
          {
            removed: true,
            cause: "explicit",
            cookie: {
              name: details.name,
              value: "",
              domain: win.location.hostname,
              path: "/",
            },
          },
        ]);
      } catch {
      }
      cb?.(result);
      return Promise.resolve(result);
    },
    onChanged: events.cookiesOnChanged.toApi(),
  };

  const makeWebRequestEvent = (event: WebRequestEventName) => ({
    addListener: (
      listener: (details: WebRequestDetails) => unknown,
      filter: {
        urls?: string[];
        types?: string[];
        tabId?: number;
        windowId?: number;
      } = {},
      _extraInfoSpec?: string[],
    ) => registry.addWebRequestListener(extId, event, listener, filter),
    removeListener: (listener: (details: WebRequestDetails) => unknown) =>
      registry.removeWebRequestListener(extId, event, listener),
    hasListener: (listener: (details: WebRequestDetails) => unknown) =>
      registry.hasWebRequestListener(extId, event, listener),
    hasListeners: () => registry.hasWebRequestListener(extId, event),
  });

  const webRequest = {
    onBeforeRequest: makeWebRequestEvent("onBeforeRequest"),
    onBeforeSendHeaders: makeWebRequestEvent("onBeforeSendHeaders"),
    onSendHeaders: makeWebRequestEvent("onSendHeaders"),
    onHeadersReceived: makeWebRequestEvent("onHeadersReceived"),
    onCompleted: makeWebRequestEvent("onCompleted"),
    onErrorOccurred: makeWebRequestEvent("onErrorOccurred"),
    onBeforeRedirect: makeWebRequestEvent("onBeforeRedirect"),
    filterResponseData: undefined,
    handlerBehaviorChanged: (cb?: () => void) => {
      registry.notifyWebRequestBehaviorChanged(extId);
      cb?.();
      return Promise.resolve(undefined);
    },
    MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES: 20,
    ResourceType: Object.fromEntries(
      [
        "main_frame",
        "sub_frame",
        "stylesheet",
        "script",
        "image",
        "imageset",
        "object",
        "object_subrequest",
        "xmlhttprequest",
        "xslt",
        "ping",
        "beacon",
        "xml_dtd",
        "font",
        "media",
        "websocket",
        "csp_report",
        "web_manifest",
        "speculative",
        "other",
      ].map((type) => [type.toUpperCase(), type]),
    ),
  };

  const declarativeNetRequest = {
    updateDynamicRules: (
      options: { addRules?: unknown[]; removeRuleIds?: number[] },
      cb?: () => void,
    ) => {
      if (options.removeRuleIds) {
        ext.dynamicRules = ext.dynamicRules.filter(
          (rule) => !options.removeRuleIds!.includes(rule.id),
        );
      }
      if (options.addRules) {
        ext.dynamicRules.push(...(options.addRules as typeof ext.dynamicRules));
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    getDynamicRules: (
      filterOrCb?: unknown,
      maybeCb?: (rules: unknown[]) => void,
    ) => {
      const filter =
        typeof filterOrCb === "function"
          ? undefined
          : (filterOrCb as { ruleIds?: number[] } | undefined);
      const cb =
        typeof filterOrCb === "function"
          ? (filterOrCb as (rules: unknown[]) => void)
          : maybeCb;
      const rules = filter?.ruleIds
        ? ext.dynamicRules.filter((rule) => filter.ruleIds!.includes(rule.id))
        : ext.dynamicRules;
      cb?.(rules);
      return Promise.resolve(rules);
    },
    updateSessionRules: (_options: unknown, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
    getSessionRules: (
      filterOrCb?: unknown,
      maybeCb?: (rules: unknown[]) => void,
    ) => {
      const cb =
        typeof filterOrCb === "function"
          ? (filterOrCb as (rules: unknown[]) => void)
          : maybeCb;
      cb?.([]);
      return Promise.resolve([]);
    },
    isRegexSupported: (
      _options: unknown,
      cb?: (result: { isSupported: boolean }) => void,
    ) => {
      const result = { isSupported: true };
      cb?.(result);
      return Promise.resolve(result);
    },
    testMatchOutcome: (_request: unknown, cb?: (result: unknown) => void) => {
      const result = { matchedRules: [] };
      cb?.(result);
      return Promise.resolve(result);
    },
    getMatchedRules: (
      _filter?: unknown,
      cb?: (result: { rulesMatchedInfo: unknown[] }) => void,
    ) => {
      const result = { rulesMatchedInfo: [] };
      cb?.(result);
      return Promise.resolve(result);
    },
    getAvailableRulesets: (cb?: (ids: string[]) => void) => {
      const ids = [...ext.rulesetRules.keys()];
      cb?.(ids);
      return Promise.resolve(ids);
    },
    getEnabledRulesets: (cb?: (ids: string[]) => void) => {
      const ids = [...ext.enabledRulesetIds];
      cb?.(ids);
      return Promise.resolve(ids);
    },
    updateEnabledRulesets: (
      options: {
        enableRulesetIds?: string[];
        disableRulesetIds?: string[];
      },
      cb?: () => void,
    ) => {
      for (const id of options.disableRulesetIds ?? []) {
        ext.enabledRulesetIds.delete(id);
      }
      for (const id of options.enableRulesetIds ?? []) {
        if (ext.rulesetRules.has(id)) ext.enabledRulesetIds.add(id);
      }
      recomputeStaticRules(ext);
      cb?.();
      return Promise.resolve(undefined);
    },
    MAX_NUMBER_OF_RULES: 30000,
    MAX_NUMBER_OF_DYNAMIC_RULES: 5000,
    GUARANTEED_MINIMUM_STATIC_RULES: 30000,
  };

  return { cookies, webRequest, declarativeNetRequest };
}
