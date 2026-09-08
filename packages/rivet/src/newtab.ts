import { mountExtensionPage } from "./pageMount";
import type { RivetRegistry } from "./registry";
import type { RivetHostBindings } from "./types";

export interface NewTabOverride {
  extId: string;
  page: string;
}

export function getNewTabOverride(
  registry: RivetRegistry,
): NewTabOverride | null {
  const candidates = registry
    .list()
    .filter(
      (ext) =>
        ext.enabled &&
        typeof ext.manifest.chrome_url_overrides?.newtab === "string" &&
        ext.manifest.chrome_url_overrides.newtab.trim().length > 0,
    )
    .sort((a, b) => b.installedAt - a.installedAt);
  const winner = candidates[0];
  if (!winner) return null;
  return {
    extId: winner.id,
    page: winner.manifest.chrome_url_overrides!.newtab!.trim(),
  };
}

export async function mountNewTabPage(
  frame: HTMLIFrameElement,
  extId: string,
  page: string,
  tabId: number | null,
  registry: RivetRegistry,
  host: RivetHostBindings,
): Promise<boolean> {
  return mountExtensionPage(frame, extId, page, tabId, registry, host, false);
}
