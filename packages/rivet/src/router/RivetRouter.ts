
import { dbGet, dbGetAllKeys, EXT_FILES_STORE } from "../db";
import { guessMime } from "../crx";
import { decodeRivetPath, RIVET_PREFIX } from "../urlScheme";

const clientToExtId = new Map<string, string>();

function extensionIdFromUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.origin !== self.location.origin || !url.pathname.startsWith(RIVET_PREFIX)) return null;
    const rest = url.pathname.slice(RIVET_PREFIX.length);
    const slash = rest.indexOf("/");
    return slash === -1 ? null : rest.slice(0, slash) || null;
  } catch {
    return null;
  }
}

function extensionIdForEvent(event: FetchEvent): string | null {
  const known = event.clientId ? clientToExtId.get(event.clientId) : undefined;
  if (known) return known;
  const fromReferrer = extensionIdFromUrl(event.request.referrer);
  if (fromReferrer && event.clientId) clientToExtId.set(event.clientId, fromReferrer);
  return fromReferrer;
}

function responseHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  };
}

function isBootstrapUrl(pathname: string): string | null {
  const escapedPrefix = RIVET_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = pathname.match(new RegExp(`^${escapedPrefix}([^/]+)/__bootstrap__$`));
  return match ? match[1] : null;
}

export function shouldRoute(event: FetchEvent): boolean {
  try {
    const url = new URL(event.request.url);
    return url.origin === self.location.origin && url.pathname.startsWith(RIVET_PREFIX);
  } catch {
    return false;
  }
}

export function extensionNetworkUrl(event: FetchEvent): string | null {
  if (!extensionIdForEvent(event)) return null;
  try {
    const url = new URL(event.request.url);
    if (url.origin === self.location.origin || !/^https?:$/.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function serveExtensionFile(extId: string, path: string): Promise<Response | null> {
  const bytes = await dbGet<ArrayBuffer>(EXT_FILES_STORE, `${extId}/${path}`);
  if (!bytes) return null;
  return new Response(bytes, {
    status: 200,
    headers: responseHeaders(guessMime(path)),
  });
}

export async function route(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin || !url.pathname.startsWith(RIVET_PREFIX)) {
    return fetch(event.request);
  }

  const bootstrapExtId = isBootstrapUrl(url.pathname);
  if (bootstrapExtId) {
    const clientId = (event as unknown as { resultingClientId?: string }).resultingClientId;
    if (clientId) clientToExtId.set(clientId, bootstrapExtId);
    return new Response("<!DOCTYPE html><html><head></head><body></body></html>", {
      status: 200,
      headers: responseHeaders("text/html"),
    });
  }

  const decoded = decodeRivetPath(url.pathname);
  if (!decoded) return new Response("rivet: malformed extension resource URL", { status: 400 });
  if (event.clientId) clientToExtId.set(event.clientId, decoded.extId);

  const response = await serveExtensionFile(decoded.extId, decoded.path);
  if (response) return response;

  const allKeys = await dbGetAllKeys(EXT_FILES_STORE);
  const prefix = `${decoded.extId}/`;
  const storedForExt = allKeys
    .filter((k) => typeof k === "string" && k.startsWith(prefix))
    .map((k) => (k as string).slice(prefix.length));
  return new Response(
    `rivet: no such extension file: "${decoded.path}"\n\nFiles actually stored for this extension:\n${storedForExt.join("\n") || "(none)"}`,
    { status: 404, headers: responseHeaders("text/plain") },
  );
}
