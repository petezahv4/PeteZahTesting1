import { readExtFileText } from "../fileStore";
import { injectScript } from "../htmlInject";
import { installExtensionNetwork } from "../network";
import type { ContentScriptRegistration } from "../types";
import { injectCss } from "./common";
import type { ChromeApiContext, InstallApiInTab } from "./context";

interface UserScriptRegistration {
  id: string;
  matches?: string[];
  excludeMatches?: string[];
  includeGlobs?: string[];
  excludeGlobs?: string[];
  js?: ({ file?: string; code?: string } | string)[];
  runAt?: string;
  allFrames?: boolean;
}

export function createScriptingApis(
  context: ChromeApiContext,
  installApiInTab: InstallApiInTab,
) {
  const { extId, tabId, registry, host } = context;

  const contentScripts = {
    register: (options: {
      matches?: string[];
      excludeMatches?: string[];
      js?: ({ file?: string; code?: string } | string)[];
      css?: ({ file?: string; code?: string } | string)[];
      runAt?: string;
      allFrames?: boolean;
    }) => {
      const entry = {
        extId,
        id: `browser-content-script-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
        matches: options.matches ?? [],
        excludeMatches: options.excludeMatches ?? [],
        js: options.js ?? [],
        css: options.css ?? [],
        runAt:
          (options.runAt as
            | "document_start"
            | "document_end"
            | "document_idle"
            | undefined) ?? "document_idle",
        allFrames: options.allFrames ?? false,
      };
      registry.contentScripts.push(entry);
      let registered = true;
      return Promise.resolve({
        unregister: () => {
          if (registered) {
            registered = false;
            const index = registry.contentScripts.indexOf(entry);
            if (index !== -1) registry.contentScripts.splice(index, 1);
          }
          return Promise.resolve(undefined);
        },
      });
    },
  };

  const injectedStyles = new WeakMap<Window, Map<string, HTMLStyleElement[]>>();

  const scripting = {
    executeScript: async (
      injection: {
        target?: { tabId?: number };
        func?: (...args: unknown[]) => unknown;
        args?: unknown[];
        files?: string[];
      },
      cb?: (results: unknown[]) => void,
    ) => {
      const targetTabId = injection.target?.tabId ?? tabId;
      const win =
        targetTabId !== null ? host.getTabWindow?.(targetTabId) : null;
      if (win && targetTabId !== null) {
        installExtensionNetwork(win, host.getTab(targetTabId)?.url);
      }
      if (
        win &&
        targetTabId !== null &&
        !(win as unknown as { chrome?: unknown }).chrome
      ) {
        installApiInTab(win, targetTabId);
      }
      let results: unknown[] = [];
      if (win && injection.func) {
        try {
          const args = JSON.stringify(injection.args ?? []);
          const value = (
            win as unknown as { eval: (source: string) => unknown }
          ).eval(`(${injection.func.toString()})(...${args})`);
          results = [{ result: await Promise.resolve(value) }];
        } catch {
          results = [];
        }
      } else if (win && injection.files?.length) {
        for (const file of injection.files) {
          const code = await readExtFileText(extId, file);
          if (code !== null) injectScript(win, code);
        }
        results = injection.files.map(() => ({ result: undefined }));
      }
      cb?.(results);
      return Promise.resolve(results);
    },
    insertCSS: (
      injection: { target?: { tabId?: number }; css?: string },
      cb?: () => void,
    ) => {
      const targetTabId = injection.target?.tabId ?? tabId;
      const win =
        targetTabId !== null ? host.getTabWindow?.(targetTabId) : null;
      if (win && injection.css) {
        const style = injectCss(win, injection.css);
        if (style) {
          const byCss =
            injectedStyles.get(win) ?? new Map<string, HTMLStyleElement[]>();
          const styles = byCss.get(injection.css) ?? [];
          styles.push(style);
          byCss.set(injection.css, styles);
          injectedStyles.set(win, byCss);
        }
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    removeCSS: (
      injection: { target?: { tabId?: number }; css?: string },
      cb?: () => void,
    ) => {
      const targetTabId = injection.target?.tabId ?? tabId;
      const win =
        targetTabId !== null ? host.getTabWindow?.(targetTabId) : null;
      if (win && injection.css) {
        for (const style of injectedStyles.get(win)?.get(injection.css) ?? []) {
          style.remove();
        }
        injectedStyles.get(win)?.delete(injection.css);
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    registerContentScripts: (
      scripts: {
        id: string;
        matches?: string[];
        excludeMatches?: string[];
        js?: string[];
        css?: string[];
        runAt?: string;
        allFrames?: boolean;
      }[],
      cb?: () => void,
    ) => {
      for (const script of scripts) {
        const index = registry.contentScripts.findIndex(
          (candidate) =>
            candidate.extId === extId && candidate.id === script.id,
        );
        const entry = {
          extId,
          id: script.id,
          matches: script.matches ?? [],
          excludeMatches: script.excludeMatches ?? [],
          js: script.js ?? [],
          css: script.css ?? [],
          runAt:
            (script.runAt as
              | "document_start"
              | "document_end"
              | "document_idle"
              | undefined) ?? "document_idle",
          allFrames: script.allFrames ?? false,
        };
        if (index === -1) registry.contentScripts.push(entry);
        else registry.contentScripts[index] = entry;
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    unregisterContentScripts: (
      filter: { ids?: string[] } | undefined,
      cb?: () => void,
    ) => {
      for (
        let index = registry.contentScripts.length - 1;
        index >= 0;
        index--
      ) {
        const script = registry.contentScripts[index];
        if (!script || script.extId !== extId || script.id === undefined) {
          continue;
        }
        if (filter?.ids && !filter.ids.includes(script.id)) continue;
        registry.contentScripts.splice(index, 1);
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    getRegisteredContentScripts: (
      filter: { ids?: string[] } | undefined,
      cb?: (scripts: unknown[]) => void,
    ) => {
      const result = registry.contentScripts
        .filter(
          (script) =>
            script.extId === extId &&
            script.id !== undefined &&
            (!filter?.ids || filter.ids.includes(script.id)),
        )
        .map((script) => ({
          id: script.id,
          matches: script.matches,
          excludeMatches: script.excludeMatches,
          includeGlobs: script.includeGlobs,
          excludeGlobs: script.excludeGlobs,
          js: script.js,
          css: script.css,
          runAt: script.runAt,
          allFrames: script.allFrames,
        }));
      cb?.(result);
      return Promise.resolve(result);
    },
  };

  const userScriptOrder = new Map<string, number>();
  let nextUserScriptOrder = 0;
  for (const entry of registry.contentScripts) {
    if (entry.extId === extId && entry.id !== undefined) {
      userScriptOrder.set(entry.id, nextUserScriptOrder++);
    }
  }

  const userScriptPhase = (id: string): number | null => {
    const match = /^(\d+)[|:_-]/.exec(id);
    return match ? Number(match[1]) : null;
  };

  const upsertUserScript = (entry: ContentScriptRegistration) => {
    const existingIndex = registry.contentScripts.findIndex(
      (candidate) => candidate.extId === extId && candidate.id === entry.id,
    );
    if (existingIndex !== -1) {
      registry.contentScripts[existingIndex] = entry;
      return;
    }

    const id = entry.id as string;
    let order = userScriptOrder.get(id);
    if (order === undefined) {
      order = nextUserScriptOrder++;
      userScriptOrder.set(id, order);
    }
    const phase = userScriptPhase(id);
    const insertionIndex = registry.contentScripts.findIndex((candidate) => {
      if (candidate.extId !== extId || candidate.id === undefined) return false;
      const candidateOrder = userScriptOrder.get(candidate.id);
      const candidatePhase = userScriptPhase(candidate.id);
      if (
        phase !== null &&
        candidatePhase !== null &&
        candidatePhase !== phase
      ) {
        return candidatePhase > phase;
      }
      return candidateOrder !== undefined && candidateOrder > order;
    });
    if (insertionIndex === -1) registry.contentScripts.push(entry);
    else registry.contentScripts.splice(insertionIndex, 0, entry);
  };

  const userScripts = {
    onBeforeScript: undefined,
    register: (scripts: UserScriptRegistration[], cb?: () => void) => {
      for (const script of scripts) {
        const entry: ContentScriptRegistration = {
          extId,
          id: script.id,
          matches: script.matches ?? [],
          excludeMatches: script.excludeMatches ?? [],
          ...(script.includeGlobs === undefined
            ? {}
            : { includeGlobs: script.includeGlobs }),
          ...(script.excludeGlobs === undefined
            ? {}
            : { excludeGlobs: script.excludeGlobs }),
          js: script.js ?? [],
          css: [],
          runAt:
            (script.runAt as
              | "document_start"
              | "document_end"
              | "document_idle"
              | undefined) ?? "document_idle",
          allFrames: script.allFrames ?? false,
        };
        upsertUserScript(entry);
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    unregister: (filter: { ids?: string[] } = {}, cb?: () => void) => {
      for (
        let index = registry.contentScripts.length - 1;
        index >= 0;
        index--
      ) {
        const script = registry.contentScripts[index];
        if (!script || script.extId !== extId || script.id === undefined) {
          continue;
        }
        if (filter.ids && !filter.ids.includes(script.id)) continue;
        registry.contentScripts.splice(index, 1);
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    update: (scripts: UserScriptRegistration[], cb?: () => void) => {
      for (const update of scripts) {
        const script = registry.contentScripts.find(
          (entry) => entry.extId === extId && entry.id === update.id,
        );
        if (!script) continue;
        if (update.matches !== undefined) script.matches = update.matches;
        if (update.excludeMatches !== undefined) {
          script.excludeMatches = update.excludeMatches;
        }
        if (update.includeGlobs !== undefined) {
          script.includeGlobs = update.includeGlobs;
        }
        if (update.excludeGlobs !== undefined) {
          script.excludeGlobs = update.excludeGlobs;
        }
        if (update.js !== undefined) script.js = update.js;
        if (update.runAt !== undefined) {
          script.runAt = update.runAt as
            | "document_start"
            | "document_end"
            | "document_idle";
        }
        if (update.allFrames !== undefined) script.allFrames = update.allFrames;
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    getScripts: (
      filter: { ids?: string[] } = {},
      cb?: (scripts: unknown[]) => void,
    ) => {
      const result = registry.contentScripts
        .filter(
          (script) =>
            script.extId === extId &&
            script.id !== undefined &&
            (!filter.ids || filter.ids.includes(script.id)),
        )
        .map((script) => ({
          id: script.id,
          matches: script.matches,
          excludeMatches: script.excludeMatches,
          includeGlobs: script.includeGlobs,
          excludeGlobs: script.excludeGlobs,
          js: script.js,
          runAt: script.runAt,
          allFrames: script.allFrames,
        }));
      cb?.(result);
      return Promise.resolve(result);
    },
    configureWorld: (_properties: unknown, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
  };

  return { contentScripts, scripting, userScripts };
}
