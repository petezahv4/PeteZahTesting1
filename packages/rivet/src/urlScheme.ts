export const RIVET_PREFIX = "/f/__rivet__/ext/";

export function rivetBootstrapUrl(extId: string): string {
  return `${rivetExtensionBase(extId)}__bootstrap__`;
}

export function rivetExtensionBase(extId: string): string {
  return `${globalThis.location.origin}${RIVET_PREFIX}${extId}/`;
}

export function buildExtensionUrl(extId: string, path: string): string {
  return `${rivetExtensionBase(extId)}${path.replace(/^\//, "")}`;
}

export function extensionDocumentUrl(path: string): string {
  return `${globalThis.location.origin}/${path.replace(/^\/+/, "")}`;
}

export function chromeExtensionUrl(extId: string, path: string): string {
  return `chrome-extension://${extId}/${path.replace(/^\//, "")}`;
}

export function resolveExtensionResourcePath(pageDir: string, ref: string): string {
  if (ref.startsWith("/")) return ref.replace(/^\//, "");
  const fakeBase = `rivet://x/${pageDir ? `${pageDir}/` : ""}`;
  const resolved = new URL(ref, fakeBase);
  return decodeURIComponent(resolved.pathname.replace(/^\//, ""));
}

export function extensionPathDir(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function decodeRivetPath(pathname: string): { extId: string; path: string } | null {
  if (!pathname.startsWith(RIVET_PREFIX)) return null;
  const rest = pathname.slice(RIVET_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const extId = rest.slice(0, slash);
  const path = decodeURIComponent(rest.slice(slash + 1));
  if (!extId || !path) return null;
  return { extId, path };
}

export function decodeRivetUrl(input: string): { extId: string; path: string } | null {
  try {
    const url = new URL(input, globalThis.location.href);
    if (url.protocol === "chrome-extension:") {
      const extId = url.hostname;
      const path = `${decodeURIComponent(url.pathname.replace(/^\//, ""))}${url.search}${url.hash}`;
      if (!extId || !path) return null;
      return { extId, path };
    }
    if (url.origin !== globalThis.location.origin) return null;
    const decoded = decodeRivetPath(url.pathname);
    return decoded ? { ...decoded, path: `${decoded.path}${url.search}${url.hash}` } : null;
  } catch {
    return null;
  }
}
