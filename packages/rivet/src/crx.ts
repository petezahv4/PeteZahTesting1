import { negativeMessage } from "./messages";

export function crxToZip(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "Cr24") {
    return buffer; 
  }
  const version = view.getUint32(4, true);
  let zipStart: number;
  if (version === 2) {
    const pubKeyLen = view.getUint32(8, true);
    const sigLen = view.getUint32(12, true);
    zipStart = 16 + pubKeyLen + sigLen;
  } else if (version === 3) {
    const headerSize = view.getUint32(8, true);
    zipStart = 12 + headerSize;
  } else {
    throw new Error(negativeMessage("extension package version is unsupported"));
  }
  return buffer.slice(zipStart);
}

export function generateExtensionId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let id = "";
  let n = Math.abs(hash);
  for (let i = 0; i < 32; i++) {
    id += chars[n % 26];
    n = Math.floor(n / 26) + i * 7;
  }
  return id.substring(0, 32);
}

const MIME_TYPES: Record<string, string> = {
  js: "application/javascript",
  mjs: "application/javascript",
  css: "text/css",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
};

export function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}
