import type { ExtensionState, RealmEvents, RivetRegistry } from "../registry";
import type { RivetHostBindings } from "../types";

/** Shared state available to each chrome.* namespace factory. */
export interface ChromeApiContext {
  realm: Window;
  extId: string;
  tabId: number | null;
  registry: RivetRegistry;
  host: RivetHostBindings;
  ext: ExtensionState;
  events: RealmEvents;
  senderUrl: string | undefined;
  senderFrameId: number | undefined;
  senderDocumentId: string | undefined;
}

export type InstallApiInTab = (realm: Window, tabId: number) => void;
