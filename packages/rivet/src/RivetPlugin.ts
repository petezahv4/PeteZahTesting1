import { injectContentScripts } from "./contentScripts";
import {
  CONTENT_SCRIPT_STYLE_ATTRIBUTE,
  type NativeDomOperations,
} from "./htmlInject";
import type { Rivet } from "./rivet";

export type FolioManagedPluginConstructor = new (
  name: string,
  dependencies: string[],
) => {
  install(frame: unknown): void;
  tap(
    hook: unknown,
    callback: (context: FolioFrameInitContext, props: unknown) => void | Promise<void>,
  ): void;
};

type FolioFrameInitContext = {
  window?: Window;
  client?: {
    url?: { href?: string };
    natives?: NativeDomOperations["natives"];
    descriptors?: NativeDomOperations["descriptors"];
    locationProxy?: Location;
  };
  isTopLevel?: boolean;
};

type FolioFrame = {
  hooks: { init: { pre: unknown; post: unknown } };
};

const contextMenuWindows = new WeakSet<Window>();
const CONTENT_SCRIPT_DOCUMENT = "__rivetContentScriptDocument";
const CONTENT_SCRIPT_MUTATION_OBSERVER =
  "__rivetContentScriptMutationObserver";

function installContentScriptDocumentProxy(
  win: Window,
  location: Location,
): void {
  const nativeStyleSheets = win.document.styleSheets;
  const contentStyleSheets = new Proxy(nativeStyleSheets, {
    get(target, property) {
      const visible = Array.from(target).filter((sheet) => {
        const owner = sheet.ownerNode;
        return !owner ||
          !("hasAttribute" in owner) ||
          !owner.hasAttribute(CONTENT_SCRIPT_STYLE_ATTRIBUTE);
      });
      if (property === "length") return visible.length;
      if (property === "item") {
        return (index: number) => visible[index] ?? null;
      }
      if (property === Symbol.iterator) return visible[Symbol.iterator].bind(visible);
      if (typeof property === "string" && /^\d+$/.test(property)) {
        return visible[Number(property)];
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  let documentProxy: Document;
  documentProxy = new Proxy(win.document, {
    get(target, property) {
      if (property === "location") return location;
      if (property === "styleSheets") return contentStyleSheets;
      if (property === "createTreeWalker") {
        return (
          root: Node,
          whatToShow?: number,
          filter?: NodeFilter | null,
        ) => {
          let bridgedFilter = filter;
          if (typeof filter === "function") {
            bridgedFilter = (node) => Reflect.apply(filter, undefined, [node]);
          } else if (filter && typeof filter.acceptNode === "function") {
            const acceptNode = filter.acceptNode;
            bridgedFilter = {
              acceptNode: (node) => Reflect.apply(acceptNode, filter, [node]),
            };
          }
          return target.createTreeWalker(
            root === documentProxy ? target : root,
            whatToShow,
            bridgedFilter,
          );
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
  });
  Object.defineProperty(win, CONTENT_SCRIPT_DOCUMENT, {
    configurable: true,
    enumerable: false,
    value: documentProxy,
  });
  const NativeMutationObserver = (
    win as unknown as { MutationObserver: typeof MutationObserver }
  ).MutationObserver;
  class ContentScriptMutationObserver extends NativeMutationObserver {
    override observe(target: Node, options?: MutationObserverInit): void {
      super.observe(target === documentProxy ? win.document : target, options);
    }
  }
  Object.defineProperty(win, CONTENT_SCRIPT_MUTATION_OBSERVER, {
    configurable: true,
    enumerable: false,
    value: ContentScriptMutationObserver,
  });
}

function installContextMenuBridge(win: Window, rivet: Rivet, tabId: number): void {
  if (contextMenuWindows.has(win) || !rivet.host.showContextMenu) return;
  contextMenuWindows.add(win);
  win.addEventListener("contextmenu", (rawEvent) => {
    const event = rawEvent as MouseEvent;
    const target = event.target && typeof (event.target as Element).closest === "function" ? event.target as Element : null;
    const link = target?.closest("a[href]") as HTMLAnchorElement | null;
    const media = target?.closest("img,video,audio") as HTMLImageElement | HTMLMediaElement | null;
    const editable = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || Boolean(target?.closest("[contenteditable='true']"));
    const selectionText = win.getSelection?.()?.toString().trim() || undefined;
    const context = selectionText ? "selection" : link ? "link" : media?.tagName.toLowerCase() ?? (editable ? "editable" : "page");
    const info = {
      pageUrl: win.location.href,
      frameUrl: win.location.href,
      ...(link?.href ? { linkUrl: link.href } : {}),
      ...(media && "src" in media && media.src ? { srcUrl: media.src } : {}),
      ...(selectionText ? { selectionText } : {}),
      ...(editable ? { editable: true } : {}),
    };
    const items = rivet.getContextMenuItems(context, info);
    if (!items.length) return;
    event.preventDefault();
    event.stopPropagation();
    rivet.host.showContextMenu?.({
      tabId,
      clientX: event.clientX,
      clientY: event.clientY,
      items,
      info,
    });
  });
}

export function createRivetContentScriptPlugin(
  ManagedPlugin: FolioManagedPluginConstructor,
  rivet: Rivet,
  tabId: number,
): InstanceType<FolioManagedPluginConstructor> {
  return new (class RivetContentScriptPlugin extends ManagedPlugin {
    override install(frame: FolioFrame): void {
      super.install(frame);
      this.tap(frame.hooks.init.post, async (context) => {
        const win = context?.window;
        if (!win) return;
        const url = context.client?.url?.href || win.location.href;
        installContextMenuBridge(win, rivet, tabId);
        const nativeDom = context.client?.natives && context.client.descriptors
          ? {
              natives: context.client.natives,
              descriptors: context.client.descriptors,
              ...(context.client.locationProxy
                ? {
                    prepareScript: (code: string) =>
                      `(function(document, MutationObserver) {\n${code}\n}).call(globalThis, globalThis.${CONTENT_SCRIPT_DOCUMENT}, globalThis.${CONTENT_SCRIPT_MUTATION_OBSERVER});`,
                  }
                : {}),
            }
          : undefined;
        if (context.client?.locationProxy && nativeDom) {
          installContentScriptDocumentProxy(
            win,
            context.client.locationProxy,
          );
        }
        await injectContentScripts(
          win,
          tabId,
          url,
          context.isTopLevel === true,
          rivet.registry,
          rivet.host,
          nativeDom,
        );
      });
    }
  })("rivet-content-scripts", []);
}
