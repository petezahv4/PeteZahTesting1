export function canonicalGameUrlForId(raw: string): string {
  let url = String(raw || "").trim();
  if (!url) return "";
  try {
    url = decodeURIComponent(url);
  } catch {}
  url = url.replace(/\/index\.html(?=([?#]|$))/gi, "");
  url = url.replace(/\/+$/, "");
  return url;
}

export function generateGameId(game: { label?: string; url?: string }): string {
  const label = String(game.label || "");
  const url = canonicalGameUrlForId(game.url || "");
  return `${label}-${url}`.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
}
