import type { Rivet } from "@rivet/index";

let instance: Rivet | null = null;

export const EXTENSION_POPUP_MOUNTED_EVENT = "rivet-extension-popup-mounted";

export function registerRivetBridge(rivet: Rivet): void {
  instance = rivet;
}

export function getRivet(): Rivet | null {
  return instance;
}
