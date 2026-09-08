import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/storage/data/collection.json",
);
const FILE_EXT = /\.[a-z0-9]{1,8}$/i;

function needsIndexPath(pathname) {
  const last = pathname.split("/").filter(Boolean).pop() || "";
  if (!last) return false;
  if (FILE_EXT.test(last)) return false;
  return true;
}

function addIndexPath(pathname) {
  let p = pathname.replace(/\/+$/, "");
  return `${p}/index.html`;
}

function fixInnerStorageUrl(inner) {
  if (typeof inner !== "string" || !inner) return inner;
  try {
    if (/^https?:\/\//i.test(inner)) {
      const u = new URL(inner);
      if (!/\/storage\/ag\//i.test(u.pathname)) return inner;
      if (!needsIndexPath(u.pathname)) return inner;
      u.pathname = addIndexPath(u.pathname);
      return u.toString();
    }
    if (inner.startsWith("/storage/ag/") || inner.startsWith("storage/ag/")) {
      const pathOnly = inner.startsWith("/") ? inner : `/${inner}`;
      const [pathname, rest = ""] = pathOnly.split(/(?=[?#])/);
      if (!needsIndexPath(pathname)) return inner;
      return addIndexPath(pathname) + rest;
    }
  } catch {}
  return inner;
}

function fixPlayUrl(url) {
  if (typeof url !== "string") return url;

  const iframeMatch = url.match(/^(https?:\/\/[^/]+)?(\/iframe\.html\?url=)([^#]*)(.*)$/i);
  if (iframeMatch) {
    const host = iframeMatch[1] || "";
    const prefix = iframeMatch[2];
    let inner = iframeMatch[3];
    const tail = iframeMatch[4] || "";
    try {
      inner = decodeURIComponent(inner);
    } catch {}
    const fixed = fixInnerStorageUrl(inner);
    if (fixed === inner) return url;
    return host + prefix + encodeURIComponent(fixed).replace(/%2F/gi, "/") + tail;
  }

  for (const prefix of ["/!!/", "/n/m/", "/f/g/"]) {
    const i = url.indexOf(prefix);
    if (i === -1) continue;
    const rest = url.slice(i + prefix.length);
    if (!/^https?:\/\//i.test(rest) && !rest.startsWith("/storage/ag/")) continue;
    const fixed = fixInnerStorageUrl(rest);
    if (fixed === rest) return url;
    return url.slice(0, i) + prefix + fixed;
  }

  return fixInnerStorageUrl(url);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
let n = 0;
for (const game of data.games || []) {
  const next = fixPlayUrl(game.url);
  if (next !== game.url) {
    game.url = next;
    n++;
  }
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("updated", n, "play urls");
