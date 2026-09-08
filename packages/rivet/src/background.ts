import { installChromeApi } from "./chromeApi";
import { readExtFileText } from "./fileStore";
import {
  bootstrapExtensionFrame,
  injectScriptFromUrl,
  installClassicWorkerGlobals,
  rewriteExtHtml,
  writeDocument,
} from "./htmlInject";
import { getBackgroundInfo } from "./manifest";
import { NEGATIVE, negativeMessage } from "./messages";
import type { ExtensionState, RivetRegistry } from "./registry";
import type { RivetHostBindings } from "./types";
import { buildExtensionUrl, chromeExtensionUrl, extensionDocumentUrl, extensionPathDir, resolveExtensionResourcePath } from "./urlScheme";

export interface BackgroundLifecycle {
  installedReason?: "install" | "update";
  startup?: boolean;
}

function createStartupHostGuard(host: RivetHostBindings): {
  host: RivetHostBindings;
  release: () => void;
} {
  let suppressNewTabs = true;
  return {
    host: {
      ...host,
      navigateTab: (tabId, url) => {
        if (suppressNewTabs && tabId === null) return;
        host.navigateTab?.(tabId, url);
      },
      openExtensionTab: (extId, page, tabId) => {
        if (suppressNewTabs && tabId === null) return;
        host.openExtensionTab?.(extId, page, tabId);
      },
    },
    release: () => {
      suppressNewTabs = false;
    },
  };
}

export function stopBackground(ext: ExtensionState): void {
  ext.backgroundGeneration += 1;
  if (ext.background?.kind === "frame") ext.background.frame?.remove();
  if (ext.background?.kind === "worker") ext.background.worker?.terminate();
  ext.background = null;
  ext.resolveBackgroundReady?.();
  ext.resolveBackgroundReady = null;
  ext.backgroundReady = Promise.resolve();
}

async function preloadClassicWorkerImports(extId: string, entryPath: string): Promise<Map<string, string>> {
  const scripts = new Map<string, string>();
  const visited = new Set<string>();
  const visit = async (path: string): Promise<void> => {
    if (visited.has(path)) return;
    visited.add(path);
    const source = await readExtFileText(extId, path);
    if (source === null) return;

    const importPattern = /\bimportScripts\s*\(\s*(["'])([^"'\\]*)\1\s*\)/g;
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[2];
      if (!specifier || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(specifier)) continue;
      const importedPath = resolveExtensionResourcePath(specifier.startsWith("/") ? "" : extensionPathDir(path), specifier);
      const importedSource = await readExtFileText(extId, importedPath);
      if (importedSource === null) continue;
      scripts.set(buildExtensionUrl(extId, importedPath), importedSource);
      await visit(importedPath);
    }
  };

  await visit(entryPath);
  return scripts;
}

export async function startBackground(
  ext: ExtensionState,
  registry: RivetRegistry,
  host: RivetHostBindings,
  rootEl: HTMLElement,
  lifecycle: BackgroundLifecycle = {},
): Promise<void> {
  const bgInfo = getBackgroundInfo(ext.manifest);
  if (!bgInfo) return;
  stopBackground(ext);
  let resolveBackgroundReady!: () => void;
  ext.backgroundReady = new Promise<void>((resolve) => {
    resolveBackgroundReady = resolve;
  });
  ext.resolveBackgroundReady = resolveBackgroundReady;
  try {
    const generation = ext.backgroundGeneration;

    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:0;height:0;border:none;opacity:0;pointer-events:none;z-index:-1;";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.setAttribute("aria-hidden", "true");
    rootEl.appendChild(frame);

    let win: Window;
    try {
      win = await bootstrapExtensionFrame(frame, ext.id);
    } catch (e) {
      console.error(
        "[rivet] background frame bootstrap failed for extension",
        ext.manifest.name,
        e,
        NEGATIVE,
      );
      frame.remove();
      return;
    }
    if (ext.backgroundGeneration !== generation) {
      frame.remove();
      return;
    }

    const backgroundPath = bgInfo.type === "page" ? bgInfo.page : bgInfo.type === "worker" ? bgInfo.script : bgInfo.scripts[0];
    const classicWorkerImports = bgInfo.type === "worker" && !bgInfo.isModule
      ? await preloadClassicWorkerImports(ext.id, bgInfo.script)
      : new Map<string, string>();
    const startupHostGuard = lifecycle.startup
      ? createStartupHostGuard(host)
      : null;

    try {
      if (backgroundPath) {
        win.history.replaceState(null, "", buildExtensionUrl(ext.id, backgroundPath));
      }

      const prepared: { events?: ReturnType<typeof installChromeApi> } = {};
      const prepare = (realm: Window) => {
        prepared.events = installChromeApi(realm, {
          extId: ext.id,
          tabId: null,
          isBackground: true,
          registry,
          host: startupHostGuard?.host ?? host,
          senderUrl: backgroundPath ? chromeExtensionUrl(ext.id, backgroundPath) : undefined,
        });
      };

      if (bgInfo.type === "page") {
        const raw = await readExtFileText(ext.id, bgInfo.page);
        const html = raw !== null ? await rewriteExtHtml(ext.id, raw, bgInfo.page) : "<!DOCTYPE html><html><head></head><body></body></html>";
        if (ext.backgroundGeneration !== generation) {
          frame.remove();
          return;
        }
        win = await writeDocument(win, html, prepare, extensionDocumentUrl(bgInfo.page));
      } else {
        win = await writeDocument(
          win,
          "<!DOCTYPE html><html><head></head><body></body></html>",
          prepare,
          backgroundPath ? extensionDocumentUrl(backgroundPath) : undefined,
        );
        const scriptPaths = bgInfo.type === "worker" ? [bgInfo.script] : bgInfo.scripts;
        const isModule = bgInfo.type === "worker" && bgInfo.isModule;
        if (bgInfo.type === "worker" && !isModule) {
          installClassicWorkerGlobals(win, ext.id, bgInfo.script, classicWorkerImports);
        }
        for (const path of scriptPaths) {
          await injectScriptFromUrl(win, buildExtensionUrl(ext.id, path), isModule);
        }
      }

      const events = prepared.events;
      if (!events) {
        throw new Error(negativeMessage("rivet background api installation failed"));
      }
      ext.background = { kind: "frame", frame, events };

      if (lifecycle.installedReason) {
        events.runtimeOnInstalled.fire({ reason: lifecycle.installedReason });
      }
      if (lifecycle.startup) events.runtimeOnStartup.fire();
    } finally {
      startupHostGuard?.release();
    }
  } finally {
    resolveBackgroundReady();
    if (ext.resolveBackgroundReady === resolveBackgroundReady) {
      ext.resolveBackgroundReady = null;
    }
  }
}
