import type { DownloadRecord } from "../registry";
import type { ChromeApiContext } from "./context";

export function createStateApis(context: ChromeApiContext) {
  const { realm, extId, registry, ext, events } = context;

  const alarms = {
    create: (nameOrInfo: unknown, maybeInfo?: unknown) => {
      const name = typeof nameOrInfo === "string" ? nameOrInfo : "";
      const alarmInfo = (
        typeof nameOrInfo === "string" ? maybeInfo : nameOrInfo
      ) as
        | {
            when?: number;
            delayInMinutes?: number;
            periodInMinutes?: number;
          }
        | undefined;
      const existing = ext.alarms.get(name);
      if (existing) clearTimeout(existing.timer);
      const delayMs =
        alarmInfo?.when !== undefined
          ? Math.max(0, alarmInfo.when - Date.now())
          : (alarmInfo?.delayInMinutes ?? 0) * 60000;
      const periodMs = alarmInfo?.periodInMinutes
        ? alarmInfo.periodInMinutes * 60000
        : null;
      const scheduledTime = Date.now() + delayMs;
      const fire = () =>
        registry.broadcast(extId, (eventSet) => eventSet.alarmsOnAlarm, [
          {
            name,
            scheduledTime,
            periodInMinutes: alarmInfo?.periodInMinutes,
          },
        ]);
      const record = (timer: ReturnType<typeof setTimeout>) => ({
        name,
        scheduledTime,
        ...(alarmInfo?.periodInMinutes === undefined
          ? {}
          : { periodInMinutes: alarmInfo.periodInMinutes }),
        timer,
      });
      const timer = periodMs
        ? setTimeout(() => {
            fire();
            ext.alarms.set(name, record(setInterval(fire, periodMs)));
          }, delayMs)
        : setTimeout(fire, delayMs);
      ext.alarms.set(name, record(timer));
    },
    get: (name: string, cb?: (alarm: unknown) => void) => {
      const alarm = ext.alarms.get(name);
      const result = alarm
        ? {
            name,
            scheduledTime: alarm.scheduledTime,
            periodInMinutes: alarm.periodInMinutes,
          }
        : null;
      cb?.(result);
      return Promise.resolve(result);
    },
    getAll: (cb?: (alarms: unknown[]) => void) => {
      const result = [...ext.alarms.values()].map((alarm) => ({
        name: alarm.name,
        scheduledTime: alarm.scheduledTime,
        periodInMinutes: alarm.periodInMinutes,
      }));
      cb?.(result);
      return Promise.resolve(result);
    },
    clear: (name: string, cb?: (wasCleared: boolean) => void) => {
      const alarm = ext.alarms.get(name);
      if (alarm) clearTimeout(alarm.timer);
      const existed = ext.alarms.delete(name);
      cb?.(existed);
    },
    clearAll: (cb?: (wasCleared: boolean) => void) => {
      for (const alarm of ext.alarms.values()) clearTimeout(alarm.timer);
      ext.alarms.clear();
      cb?.(true);
    },
    onAlarm: events.alarmsOnAlarm.toApi(),
  };

  const hasGrantedPermission = (requested: string): boolean => {
    if (ext.grantedPermissions.has(requested)) return true;
    return (
      (requested === "<all_urls>" || requested.includes("://")) &&
      ext.grantedPermissions.has("<all_urls>")
    );
  };

  const permissions = {
    request: (
      permissions: { permissions?: string[]; origins?: string[] },
      cb?: (granted: boolean) => void,
    ) => {
      const added = [
        ...(permissions.permissions ?? []),
        ...(permissions.origins ?? []),
      ].filter((permission) => !ext.grantedPermissions.has(permission));
      for (const permission of added) ext.grantedPermissions.add(permission);
      if (added.length) {
        registry.broadcast(extId, (eventSet) => eventSet.permissionsOnAdded, [
          permissions,
        ]);
      }
      cb?.(true);
      return Promise.resolve(true);
    },
    contains: (
      permissions: { permissions?: string[]; origins?: string[] },
      cb?: (has: boolean) => void,
    ) => {
      const result = [
        ...(permissions.permissions ?? []),
        ...(permissions.origins ?? []),
      ].every(hasGrantedPermission);
      cb?.(result);
      return Promise.resolve(result);
    },
    getAll: (cb?: (permissions: unknown) => void) => {
      const result = {
        permissions: [...ext.grantedPermissions].filter(
          (permission) =>
            !permission.includes("://") && permission !== "<all_urls>",
        ),
        origins: [...ext.grantedPermissions].filter(
          (permission) =>
            permission.includes("://") || permission === "<all_urls>",
        ),
      };
      cb?.(result);
      return Promise.resolve(result);
    },
    remove: (
      permissions: { permissions?: string[]; origins?: string[] },
      cb?: (removed: boolean) => void,
    ) => {
      const requested = [
        ...(permissions.permissions ?? []),
        ...(permissions.origins ?? []),
      ];
      const result = requested.some((permission) =>
        ext.grantedPermissions.delete(permission),
      );
      if (result) {
        registry.broadcast(extId, (eventSet) => eventSet.permissionsOnRemoved, [
          permissions,
        ]);
      }
      cb?.(result);
      return Promise.resolve(result);
    },
    onAdded: events.permissionsOnAdded.toApi(),
    onRemoved: events.permissionsOnRemoved.toApi(),
  };

  const history = {
    search: (
      query: {
        text?: string;
        maxResults?: number;
        startTime?: number;
        endTime?: number;
      },
      cb?: (results: unknown[]) => void,
    ) => {
      const text = query.text?.toLowerCase() ?? "";
      const result = [...ext.history.values()]
        .filter(
          (entry) =>
            !text || `${entry.url} ${entry.title}`.toLowerCase().includes(text),
        )
        .filter(
          (entry) =>
            query.startTime === undefined ||
            entry.lastVisitTime >= query.startTime,
        )
        .filter(
          (entry) =>
            query.endTime === undefined || entry.lastVisitTime <= query.endTime,
        )
        .slice(0, query.maxResults ?? 100);
      cb?.(result);
      return Promise.resolve(result);
    },
    getVisits: (details: { url: string }, cb?: (visits: unknown[]) => void) => {
      const entry = ext.history.get(details.url);
      const result = entry
        ? [
            {
              id: entry.id,
              visitId: entry.id,
              visitTime: entry.lastVisitTime,
              transition: "link",
            },
          ]
        : [];
      cb?.(result);
      return Promise.resolve(result);
    },
    addUrl: (details: { url: string; title?: string }, cb?: () => void) => {
      const existing = ext.history.get(details.url);
      const entry = {
        id: existing?.id ?? String(ext.history.size + 1),
        url: details.url,
        title: details.title ?? existing?.title ?? details.url,
        lastVisitTime: Date.now(),
        visitCount: (existing?.visitCount ?? 0) + 1,
      };
      ext.history.set(details.url, entry);
      registry.broadcast(extId, (eventSet) => eventSet.historyOnVisited, [
        entry,
      ]);
      cb?.();
      return Promise.resolve(undefined);
    },
    deleteUrl: (details: { url: string }, cb?: () => void) => {
      const removed = ext.history.delete(details.url);
      if (removed) {
        registry.broadcast(
          extId,
          (eventSet) => eventSet.historyOnVisitRemoved,
          [{ allHistory: false, urls: [details.url] }],
        );
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    deleteAll: (cb?: () => void) => {
      const hadEntries = ext.history.size > 0;
      ext.history.clear();
      if (hadEntries) {
        registry.broadcast(
          extId,
          (eventSet) => eventSet.historyOnVisitRemoved,
          [{ allHistory: true, urls: [] }],
        );
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    onVisited: events.historyOnVisited.toApi(),
    onVisitRemoved: events.historyOnVisitRemoved.toApi(),
  };

  const bookmarks = {
    get: (idOrList: string | string[], cb?: (nodes: unknown[]) => void) => {
      const ids = Array.isArray(idOrList) ? idOrList : [idOrList];
      const result: unknown[] = [];
      for (const id of ids) {
        if (id === "0") {
          result.push({
            id: "0",
            title: "Bookmarks",
            children: [...ext.bookmarks.values()],
          });
          continue;
        }
        const node = ext.bookmarks.get(id);
        if (node) result.push(node);
      }
      cb?.(result);
      return Promise.resolve(result);
    },
    getTree: (cb?: (tree: unknown[]) => void) => {
      const result = [
        {
          id: "0",
          title: "Bookmarks",
          children: [...ext.bookmarks.values()],
        },
      ];
      cb?.(result);
      return Promise.resolve(result);
    },
    search: (
      query: string | { query?: string; title?: string; url?: string },
      cb?: (nodes: unknown[]) => void,
    ) => {
      const needle = (
        typeof query === "string"
          ? query
          : (query.query ?? query.title ?? query.url ?? "")
      ).toLowerCase();
      const result = [...ext.bookmarks.values()].filter(
        (node) =>
          !needle ||
          `${node.title} ${node.url ?? ""}`.toLowerCase().includes(needle),
      );
      cb?.(result);
      return Promise.resolve(result);
    },
    create: (
      bookmark: { url?: string; title?: string; parentId?: string },
      cb?: (node: unknown) => void,
    ) => {
      const result = {
        id: String(ext.nextBookmarkId++),
        title: bookmark.title ?? bookmark.url ?? "",
        ...(bookmark.url === undefined ? {} : { url: bookmark.url }),
        parentId: bookmark.parentId ?? "0",
        dateAdded: Date.now(),
      };
      ext.bookmarks.set(result.id, result);
      registry.broadcast(extId, (eventSet) => eventSet.bookmarksOnCreated, [
        result.id,
        result,
      ]);
      cb?.(result);
      return Promise.resolve(result);
    },
    remove: (id: string, cb?: () => void) => {
      const node = ext.bookmarks.get(id);
      if (node) {
        ext.bookmarks.delete(id);
        registry.broadcast(extId, (eventSet) => eventSet.bookmarksOnRemoved, [
          id,
          { parentId: node.parentId, index: 0, node },
        ]);
      }
      cb?.();
      return Promise.resolve(undefined);
    },
    onCreated: events.bookmarksOnCreated.toApi(),
    onRemoved: events.bookmarksOnRemoved.toApi(),
    onChanged: events.bookmarksOnChanged.toApi(),
  };

  const downloads = {
    download: (
      options: { url: string; filename?: string },
      cb?: (id: number) => void,
    ) => {
      const id = ext.nextDownloadId++;
      const item: DownloadRecord = {
        id,
        url: options.url,
        filename: options.filename ?? "download",
        state: "in_progress",
        paused: false,
        startTime: new Date().toISOString(),
      };
      ext.downloads.set(id, item);
      registry.broadcast(extId, (eventSet) => eventSet.downloadsOnCreated, [
        item,
      ]);
      try {
        const document = realm.document;
        const anchor = document.createElement("a");
        anchor.href = options.url;
        anchor.download = options.filename ?? "";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } catch {
      }
      item.state = "complete";
      registry.broadcast(extId, (eventSet) => eventSet.downloadsOnChanged, [
        {
          id,
          state: { current: "complete", previous: "in_progress" },
        },
      ]);
      cb?.(id);
      return Promise.resolve(id);
    },
    search: (
      query: { id?: number; state?: string } = {},
      cb?: (items: unknown[]) => void,
    ) => {
      const result = [...ext.downloads.values()].filter(
        (item) =>
          (query.id === undefined || item.id === query.id) &&
          (query.state === undefined || item.state === query.state),
      );
      cb?.(result);
      return Promise.resolve(result);
    },
    pause: (id: number, cb?: () => void) => {
      const item = ext.downloads.get(id);
      if (item) item.paused = true;
      cb?.();
      return Promise.resolve(undefined);
    },
    resume: (id: number, cb?: () => void) => {
      const item = ext.downloads.get(id);
      if (item) item.paused = false;
      cb?.();
      return Promise.resolve(undefined);
    },
    cancel: (id: number, cb?: () => void) => {
      const item = ext.downloads.get(id);
      if (item) item.state = "interrupted";
      cb?.();
      return Promise.resolve(undefined);
    },
    onCreated: events.downloadsOnCreated.toApi(),
    onChanged: events.downloadsOnChanged.toApi(),
  };

  return { alarms, permissions, history, bookmarks, downloads };
}
