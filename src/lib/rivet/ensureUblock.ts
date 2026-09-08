const UBLOCK_ORIGIN_EXTENSION_URL = "/b/rivet/ublock.crx";

interface InstalledExtension {
  id: string;
  name: string;
  enabled: boolean;
}

export interface RivetExtensionInstaller {
  getInstalledExtensions(): readonly InstalledExtension[];
  installExtension(buffer: ArrayBuffer, filename: string): Promise<string>;
  setExtensionEnabled(extId: string, enabled: boolean): Promise<void>;
}

export async function ensureUblockOrigin(
  rivet: RivetExtensionInstaller,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<string> {
  const existing = rivet
    .getInstalledExtensions()
    .find((extension) => extension.name.trim().toLowerCase() === "ublock origin");
  if (existing) {
    if (!existing.enabled) await rivet.setExtensionEnabled(existing.id, true);
    return existing.id;
  }

  const response = await fetchImpl(UBLOCK_ORIGIN_EXTENSION_URL);
  if (!response.ok) {
    throw new Error(`uBlock Origin asset unavailable (${response.status})`);
  }
  return rivet.installExtension(await response.arrayBuffer(), "ublock.crx");
}
