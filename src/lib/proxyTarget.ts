import { PX, getMuxRoot, openMuxConnection, setMuxTransport, defaultStreamUrl } from "./px";
import { armPx } from "./browserInit";
import { originWsHost } from "./siteOrigin";
import { isMochiHref, publicMochiHref, fgHrefFromRemote, normalizeGameVia } from "./mochiPath";
import { activeRelayUrl } from "./vpn";

function asUrl(raw: string): URL | null {
  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw);
    if (raw.startsWith("/")) return new URL(raw, "https://unwrap.invalid");
  } catch {}
  return null;
}

export function unwrapPlayUrl(raw: string): string {
  let url = String(raw || "").trim();
  if (!url) return url;

  for (let n = 0; n < 5; n++) {
    const parsed = asUrl(url);
    if (parsed && /\/iframe\.html$/i.test(parsed.pathname)) {
      let inner = parsed.searchParams.get("url") || "";
      try {
        inner = decodeURIComponent(inner);
      } catch {}
      const hash = parsed.hash.replace(/^#/, "");
      if (hash && inner && !inner.includes("#")) inner = inner + "#" + hash;
      else if (hash && !inner) inner = hash;
      if (inner) {
        url = inner;
        continue;
      }
    }

    const iframe = url.match(/^(?:https?:\/\/[^/]+)?\/iframe\.html\?url=/i);
    if (iframe) {
      url = url.slice(url.indexOf("url=") + 4);
      try {
        url = decodeURIComponent(url);
      } catch {}
      continue;
    }
    const embed = url.match(/(?:^|\/)(?:static\/)?(?:youtube-)?embed\.html#/i);
    if (embed && embed.index != null) {
      url = url.slice(embed.index + embed[0].length);
      try {
        url = decodeURIComponent(url);
      } catch {}
      continue;
    }
    const google = url.match(/(?:^|\/)static\/google-embed\.html#/i);
    if (google && google.index != null) {
      url = url.slice(google.index + google[0].length);
      try {
        url = decodeURIComponent(url);
      } catch {}
      continue;
    }
    break;
  }

  url = url.trim();
  if (url.startsWith("//")) url = "https:" + url;
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) {
    url = "https://" + url.replace(/^\/+/, "");
  }
  if (isMochiHref(url)) return publicMochiHref(url);
  return url;
}

export function resolveGameViaHref(url: string, via?: unknown): string {
  const mode = normalizeGameVia(via);
  let target = unwrapPlayUrl(url);
  if (mode === "fg" && !isMochiHref(target) && !target.startsWith("/storage/")) {
    target = fgHrefFromRemote(target);
  }
  if (isMochiHref(target)) return publicMochiHref(target);
  return target;
}

export function isPremiumMuxHost(url: string): boolean {
  try {
    const abs = /^https?:\/\//i.test(url) ? url : "https://" + url.replace(/^\/+/, "");
    let h = new URL(abs).hostname.toLowerCase();
    if (h.startsWith("www.")) h = h.slice(4);
    if (h === "youtube.com" || h === "youtu.be" || h === "youtube-nocookie.com") return true;
    if (h.endsWith(".youtube.com") || h.endsWith(".youtu.be")) return true;
    if (h === "reddit.com" || h === "redd.it") return true;
    if (h.endsWith(".reddit.com") || h.endsWith(".redd.it")) return true;
    return false;
  } catch {
    return false;
  }
}

function activeDefaultStream(): string {
  try {
    return activeRelayUrl();
  } catch {}
  return defaultStreamUrl();
}

let boundStream = "";

export async function applyMuxForUrl(url: string): Promise<boolean> {
  const streamUrl = isPremiumMuxHost(url)
    ? originWsHost() + "/api/websocket-premium/"
    : activeDefaultStream();
  if (boundStream === streamUrl) return true;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      await armPx();
      const root = getMuxRoot();
      if (!root) {
        await new Promise((r) => setTimeout(r, 28));
        continue;
      }
      const conn = openMuxConnection(PX.muxWorker);
      if (!conn) {
        await new Promise((r) => setTimeout(r, 28));
        continue;
      }
      try {
        await setMuxTransport(conn, PX.tunMod, streamUrl);
      } catch {
        await setMuxTransport(conn, PX.curlMod, streamUrl);
      }
      boundStream = streamUrl;
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 28));
    }
  }
  return false;
}
