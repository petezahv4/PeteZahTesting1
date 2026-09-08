import { buildTabObject } from "./chromeApi";
import { checkDeclarativeNetRequest } from "./dnr";
import {
  getInstalledExtensions,
  installExtension as installExtensionImpl,
  loadStoredExtensions,
  setExtensionEnabled,
  uninstallExtension as uninstallExtensionImpl,
  type InstalledExtensionSummary,
} from "./extensions";
import {
  getNewTabOverride,
  mountNewTabPage,
  type NewTabOverride,
} from "./newtab";
import {
  cancelExtensionPopupMount,
  getExtensionPopupPage,
  mountExtensionPopup,
} from "./popup";
import { cancelExtensionPageMount, mountExtensionPage } from "./pageMount";
import { RivetRegistry } from "./registry";
import type {
  DNRDecision,
  RivetContextMenuEntry,
  RivetContextMenuInfo,
  RivetHostBindings,
} from "./types";

export interface RivetOptions {
  host: RivetHostBindings;
  backgroundRoot?: HTMLElement;
}

export class Rivet {
  readonly registry = new RivetRegistry();
  readonly host: RivetHostBindings;
  private readonly backgroundRoot: HTMLElement;
  private ready: Promise<number> | null = null;

  constructor(options: RivetOptions) {
    this.host = options.host;
    this.backgroundRoot = options.backgroundRoot ?? document.body;
  }

  init(): Promise<number> {
    if (!this.ready) {
      this.ready = loadStoredExtensions(
        this.registry,
        this.host,
        this.backgroundRoot,
      );
    }
    return this.ready;
  }

  async installExtension(
    buffer: ArrayBuffer,
    filename = "extension.crx",
  ): Promise<string> {
    return installExtensionImpl(
      buffer,
      filename,
      this.registry,
      this.host,
      this.backgroundRoot,
    );
  }

  async uninstallExtension(extId: string): Promise<void> {
    return uninstallExtensionImpl(extId, this.registry);
  }

  async setExtensionEnabled(extId: string, enabled: boolean): Promise<void> {
    return setExtensionEnabled(
      extId,
      enabled,
      this.registry,
      this.host,
      this.backgroundRoot,
    );
  }

  getInstalledExtensions(): InstalledExtensionSummary[] {
    return getInstalledExtensions(this.registry);
  }

  getExtensionPopupPage(extId: string): string | null {
    return getExtensionPopupPage(this.registry, extId);
  }

  async mountExtensionPopup(
    frame: HTMLIFrameElement,
    extId: string,
    tabId: number | null,
  ): Promise<boolean> {
    return mountExtensionPopup(frame, extId, tabId, this.registry, this.host);
  }

  unmountExtensionPopup(extId: string, frame?: HTMLIFrameElement): void {
    if (frame) cancelExtensionPopupMount(frame);
    const extension = this.registry.get(extId);
    if (extension) extension.popupEvents = null;
  }

  unmountExtensionPage(frame: HTMLIFrameElement): void {
    cancelExtensionPageMount(frame);
  }

  getNewTabOverride(): NewTabOverride | null {
    return getNewTabOverride(this.registry);
  }

  async mountNewTabPage(
    frame: HTMLIFrameElement,
    extId: string,
    page: string,
    tabId: number | null,
  ): Promise<boolean> {
    return mountNewTabPage(frame, extId, page, tabId, this.registry, this.host);
  }

  async mountExtensionPage(
    frame: HTMLIFrameElement,
    extId: string,
    page: string,
    tabId: number | null,
  ): Promise<boolean> {
    return mountExtensionPage(
      frame,
      extId,
      page,
      tabId,
      this.registry,
      this.host,
      false,
    );
  }

  checkDeclarativeNetRequest(
    requestUrl: string,
    initiatorUrl?: string,
    resourceType?: string,
  ): DNRDecision | null {
    return checkDeclarativeNetRequest(
      this.registry,
      requestUrl,
      initiatorUrl,
      resourceType,
    );
  }

  onChange(cb: () => void): () => void {
    return this.registry.onChange(cb);
  }

  triggerActionClicked(extId: string, tabId: number | null): void {
    const tab = buildTabObject(this.host, tabId);
    this.registry.broadcast(extId, (e) => e.actionOnClicked, [tab]);
    this.registry.broadcast(extId, (e) => e.browserActionOnClicked, [tab]);
  }

  openExtensionPopup(extId: string, tabId: number | null): boolean {
    const page = this.getExtensionPopupPage(extId);
    if (!page) return false;
    this.host.openExtensionTab?.(extId, page, tabId);
    return true;
  }

  getContextMenuItems(
    context: string,
    info: RivetContextMenuInfo,
  ): RivetContextMenuEntry[] {
    const selection = info.selectionText ?? "";
    const entries: RivetContextMenuEntry[] = [];
    for (const extension of this.registry.list()) {
      if (!extension.enabled) continue;
      for (const item of extension.contextMenuItems) {
        if (!item.visible || item.parentId !== undefined) continue;
        if (!item.contexts.includes("all") && !item.contexts.includes(context))
          continue;
        entries.push({
          extId: extension.id,
          id: item.id,
          title: item.title.replace(/%s/g, selection),
          type: item.type,
          enabled: item.enabled,
          checked: item.checked,
        });
      }
    }
    return entries;
  }

  triggerContextMenu(
    extId: string,
    menuItemId: string,
    tabId: number,
    info: RivetContextMenuInfo,
  ): void {
    const extension = this.registry.get(extId);
    const item = extension?.contextMenuItems.find(
      (candidate) => candidate.id === menuItemId,
    );
    if (!extension || !item || !item.enabled || !item.visible) return;
    const wasChecked = item.checked;
    if (item.type === "checkbox") item.checked = !item.checked;
    const clickInfo = {
      ...info,
      menuItemId,
      checked: item.checked,
      wasChecked,
    };
    const tab = buildTabObject(this.host, tabId);
    item.onclick?.(clickInfo, tab);
    this.registry.broadcast(extId, (events) => events.contextMenusOnClicked, [
      clickInfo,
      tab,
    ]);
  }

  notifyTabCreated(tabId: number): void {
    this.registry.broadcastTabLifecycle(
      (e) => e.tabsOnCreated,
      [buildTabObject(this.host, tabId)],
    );
  }

  notifyTabUpdated(
    tabId: number,
    changeInfo: {
      status?: string;
      url?: string;
      title?: string;
      favIconUrl?: string;
    },
  ): void {
    const tab = buildTabObject(this.host, tabId);
    this.registry.broadcastTabLifecycle(
      (e) => e.tabsOnUpdated,
      [tabId, changeInfo, tab],
    );
  }

  notifyTabRemoved(tabId: number, windowId = 1): void {
    this.registry.broadcastTabLifecycle(
      (e) => e.tabsOnRemoved,
      [tabId, { windowId, isWindowClosing: false }],
    );
    for (const extension of this.registry.list())
      extension.tabEvents.delete(tabId);
  }

  notifyTabActivated(tabId: number, windowId = 1): void {
    this.registry.broadcastTabLifecycle(
      (e) => e.tabsOnActivated,
      [{ tabId, windowId }],
    );
  }
}
