import type { ChromeManifest, ChromeManifestAction, ChromeManifestIcons } from "./types";

function getManifestVersion(manifest: ChromeManifest): number {
  return Number(manifest.manifest_version) || 2;
}

export type BackgroundInfo =
  | { type: "worker"; script: string; isModule: boolean }
  | { type: "page"; page: string }
  | { type: "scripts"; scripts: string[] }
  | null;

export function getBackgroundInfo(manifest: ChromeManifest): BackgroundInfo {
  if (getManifestVersion(manifest) === 3) {
    const sw = manifest.background?.service_worker;
    return sw ? { type: "worker", script: sw, isModule: manifest.background?.type === "module" } : null;
  }
  if (manifest.background?.page) {
    return { type: "page", page: manifest.background.page };
  }
  if (manifest.background?.scripts?.length) {
    return { type: "scripts", scripts: manifest.background.scripts };
  }
  return null;
}

export function matchPattern(pattern: string, url: string): boolean {
  if (pattern === "<all_urls>") return true;
  if (pattern === "*://*/*") return url.startsWith("http://") || url.startsWith("https://");
  try {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    const schemeMatch = escaped.match(/^([^:]+):\/\//);
    if (!schemeMatch) return false;
    const re = new RegExp("^" + escaped + "$");
    return re.test(url);
  } catch {
    return false;
  }
}

export function urlMatchesPatterns(url: string, matches: string[], excludeMatches: string[] = []): boolean {
  if (excludeMatches.some((p) => matchPattern(p, url))) return false;
  return matches.some((p) => matchPattern(p, url));
}

export function resolveManifestI18n(manifest: ChromeManifest, messages: Record<string, { message: string }>): ChromeManifest {
  const resolve = (s: string | undefined): string | undefined => {
    if (!s) return s;
    const key = s.match(/^__MSG_(.+)__$/)?.[1];
    if (!key) return s;
    return messages[key]?.message ?? s;
  };
  manifest.name = resolve(manifest.name) ?? manifest.name;
  const shortName = resolve(manifest.short_name);
  if (shortName === undefined) delete manifest.short_name;
  else manifest.short_name = shortName;
  const description = resolve(manifest.description);
  if (description === undefined) delete manifest.description;
  else manifest.description = description;
  for (const key of ["action", "browser_action", "page_action"] as const) {
    const action = manifest[key] as ChromeManifestAction | undefined;
    if (action?.default_title) {
      const title = resolve(action.default_title);
      if (title === undefined) delete action.default_title;
      else action.default_title = title;
    }
  }
  return manifest;
}

export function getDefaultIcon(manifest: ChromeManifest): string | null {
  const icons: string | ChromeManifestIcons | undefined =
    (manifest.action as ChromeManifestAction | undefined)?.default_icon ??
    (manifest.browser_action as ChromeManifestAction | undefined)?.default_icon ??
    (manifest.page_action as ChromeManifestAction | undefined)?.default_icon ??
    manifest.icons;
  if (!icons) return null;
  if (typeof icons === "string") return icons;
  const sizes = Object.keys(icons)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => b - a);
  const largest = sizes[0];
  if (largest !== undefined) return icons[String(largest)] ?? null;
  const firstKey = Object.keys(icons)[0];
  return firstKey ? (icons[firstKey] ?? null) : null;
}
