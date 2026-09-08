import { EventHub } from "../eventHub";
import { readExtFileURL } from "../fileStore";
import { actionImageDataUrl, chooseActionIconValue } from "./common";
import type { ChromeApiContext } from "./context";

export function createUiApis(context: ChromeApiContext) {
  const { extId, tabId, registry, host, ext, events } = context;

  const contextMenus = {
    create: (
      props: {
        id?: string | number;
        title?: string;
        contexts?: string[];
        type?: "normal" | "checkbox" | "radio" | "separator";
        enabled?: boolean;
        visible?: boolean;
        checked?: boolean;
        parentId?: string | number;
        onclick?: (info: unknown, tab: unknown) => void;
      },
      cb?: () => void,
    ) => {
      const id = props.id ?? Math.random().toString(36).slice(2);
      ext.contextMenuItems.push({
        id: String(id),
        title: props.title ?? "",
        contexts: props.contexts ?? ["all"],
        type: props.type ?? "normal",
        enabled: props.enabled ?? true,
        visible: props.visible ?? true,
        checked: props.checked ?? false,
        ...(props.parentId === undefined ? {} : { parentId: props.parentId }),
        ...(props.onclick === undefined ? {} : { onclick: props.onclick }),
      });
      cb?.();
      return String(id);
    },
    update: (
      id: string | number,
      props: Partial<{
        title: string;
        contexts: string[];
        enabled: boolean;
        visible: boolean;
        checked: boolean;
      }>,
      cb?: () => void,
    ) => {
      const item = ext.contextMenuItems.find(
        (candidate) => candidate.id === String(id),
      );
      if (item) Object.assign(item, props);
      cb?.();
    },
    remove: (id: string | number, cb?: () => void) => {
      const index = ext.contextMenuItems.findIndex(
        (candidate) => candidate.id === String(id),
      );
      if (index > -1) ext.contextMenuItems.splice(index, 1);
      cb?.();
    },
    removeAll: (cb?: () => void) => {
      ext.contextMenuItems.length = 0;
      cb?.();
    },
    onClicked: events.contextMenusOnClicked.toApi(),
  };

  const notifications = {
    create: (
      idOrOptions: unknown,
      optionsOrCb?: unknown,
      maybeCb?: unknown,
    ) => {
      const notificationId =
        typeof idOrOptions === "string" ? idOrOptions : `notif_${Date.now()}`;
      const options = (
        typeof idOrOptions === "string" ? optionsOrCb : idOrOptions
      ) as { title?: string; message?: string; type?: string } | undefined;
      const cb = (typeof optionsOrCb === "function" ? optionsOrCb : maybeCb) as
        | ((id: string) => void)
        | undefined;
      const notification = {
        id: notificationId,
        title: options?.title ?? ext.manifest.name,
        message: options?.message ?? "",
        type: options?.type ?? "basic",
        createdAt: Date.now(),
      };
      ext.notifications.set(notificationId, notification);
      host.showNotification?.(notification.title, notification.message);
      cb?.(notificationId);
      return Promise.resolve(notificationId);
    },
    update: (
      id: string,
      options: { title?: string; message?: string },
      cb?: (wasUpdated: boolean) => void,
    ) => {
      const notification = ext.notifications.get(id);
      const result = Boolean(notification);
      if (notification) {
        if (options.title !== undefined) notification.title = options.title;
        if (options.message !== undefined)
          notification.message = options.message;
        host.showNotification?.(notification.title, notification.message);
      }
      cb?.(result);
      return Promise.resolve(result);
    },
    clear: (id: string, cb?: (wasCleared: boolean) => void) => {
      const result = ext.notifications.delete(id);
      cb?.(result);
      if (result) {
        registry.broadcast(
          extId,
          (eventSet) => eventSet.notificationsOnClosed,
          [id, false],
        );
      }
      return Promise.resolve(result);
    },
    getAll: (cb?: (all: Record<string, unknown>) => void) => {
      const result = Object.fromEntries(
        [...ext.notifications.keys()].map((id) => [id, true]),
      );
      cb?.(result);
      return Promise.resolve(result);
    },
    onClicked: events.notificationsOnClicked.toApi(),
    onClosed: events.notificationsOnClosed.toApi(),
    onButtonClicked: events.notificationsOnButtonClicked.toApi(),
  };

  const makeAction = (clickHub: EventHub) => ({
    setIcon: (
      details: { imageData?: unknown; path?: unknown },
      cb?: () => void,
    ) => {
      if (details.imageData) {
        const iconUrl = actionImageDataUrl(details.imageData);
        if (iconUrl) ext.iconUrl = iconUrl;
        registry.notifyChange();
        cb?.();
      } else if (details.path) {
        const path = chooseActionIconValue(details.path);
        readExtFileURL(ext.id, typeof path === "string" ? path : "").then(
          (url) => {
            if (url) ext.iconUrl = url;
            registry.notifyChange();
            cb?.();
          },
        );
      } else {
        cb?.();
      }
    },
    setTitle: (details: { title: string }, cb?: () => void) => {
      ext.title = details.title;
      registry.notifyChange();
      cb?.();
    },
    setBadgeText: (details: { text: string }, cb?: () => void) => {
      ext.badgeText = details.text ?? "";
      registry.notifyChange();
      cb?.();
    },
    setBadgeBackgroundColor: (details: { color: string }, cb?: () => void) => {
      ext.badgeColor = details.color;
      registry.notifyChange();
      cb?.();
    },
    getBadgeBackgroundColor: (
      _details: unknown,
      cb?: (color: string | null) => void,
    ) => {
      const result = ext.badgeColor ?? null;
      cb?.(result);
      return Promise.resolve(result);
    },
    getBadgeText: (_details: unknown, cb?: (text: string) => void) => {
      const result = ext.badgeText;
      cb?.(result);
      return Promise.resolve(result);
    },
    enable: (_tabId?: number, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
    disable: (_tabId?: number, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
    onClicked: clickHub.toApi(),
    openPopup: (_options: unknown, cb?: () => void) => {
      const page =
        ext.popupPage ??
        ext.manifest.action?.default_popup ??
        ext.manifest.browser_action?.default_popup;
      if (page) host.openExtensionTab?.(extId, page, tabId);
      cb?.();
      return Promise.resolve(undefined);
    },
    setPopup: (details: { popup: string }, cb?: () => void) => {
      ext.popupPage = details.popup;
      registry.notifyChange();
      cb?.();
    },
    getPopup: (_details: unknown, cb?: (popup: string) => void) => {
      const result = ext.popupPage ?? "";
      cb?.(result);
      return Promise.resolve(result);
    },
  });

  return {
    contextMenus,
    notifications,
    action: makeAction(events.actionOnClicked),
    browserAction: makeAction(events.browserActionOnClicked),
    pageAction: makeAction(events.actionOnClicked),
  };
}
