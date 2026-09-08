export type SiteTheme = {
  id: string;
  label: string;
  bg: string;
  text: string;
  accent: string;
  fog: { highlight: number; mid: number; low: number; base: number; net: number };
};

export const SITE_THEMES: SiteTheme[] = [
  {
    id: "default",
    label: "Default",
    bg: "#020810",
    text: "#e8f0fa",
    accent: "#6eb0d4",
    fog: { highlight: 0x2f5a8a, mid: 0x14304f, low: 0x071022, base: 0x020810, net: 0x3a6a9a },
  },
  {
    id: "aurora",
    label: "Aurora",
    bg: "#041018",
    text: "#e6f4ff",
    accent: "#7ec8e3",
    fog: { highlight: 0x3d7ea6, mid: 0x164866, low: 0x071820, base: 0x041018, net: 0x4a90b8 },
  },
  {
    id: "blood",
    label: "Blood",
    bg: "#120406",
    text: "#ffe8ea",
    accent: "#d96a72",
    fog: { highlight: 0x8a3038, mid: 0x4a1418, low: 0x180608, base: 0x120406, net: 0xa04048 },
  },
  {
    id: "deep-forest",
    label: "Deep Forest",
    bg: "#050c08",
    text: "#e4f2e8",
    accent: "#6fbf8a",
    fog: { highlight: 0x2f6a48, mid: 0x143828, low: 0x061410, base: 0x050c08, net: 0x3d8a5c },
  },
  {
    id: "obsidian",
    label: "Obsidian",
    bg: "#08090c",
    text: "#f0f2f5",
    accent: "#9aa4b2",
    fog: { highlight: 0x3a4250, mid: 0x1a1e28, low: 0x0a0c10, base: 0x08090c, net: 0x505868 },
  },
  {
    id: "violet-dusk",
    label: "Violet Dusk",
    bg: "#0a0612",
    text: "#f0e8ff",
    accent: "#b89ad9",
    fog: { highlight: 0x5a3a8a, mid: 0x2a1848, low: 0x100818, base: 0x0a0612, net: 0x6e4aa0 },
  },
  {
    id: "copper",
    label: "Copper",
    bg: "#100c06",
    text: "#fff0e0",
    accent: "#d4a06a",
    fog: { highlight: 0x8a6030, mid: 0x483018, low: 0x181008, base: 0x100c06, net: 0xa87840 },
  },
  {
    id: "arctic",
    label: "Arctic",
    bg: "#060c12",
    text: "#e8f4fc",
    accent: "#9ec8e6",
    fog: { highlight: 0x4a7a9a, mid: 0x203848, low: 0x081018, base: 0x060c12, net: 0x5a8ab0 },
  },
  {
    id: "ember",
    label: "Ember",
    bg: "#120a04",
    text: "#fff2e6",
    accent: "#e09a5a",
    fog: { highlight: 0x9a5020, mid: 0x4a2810, low: 0x180c04, base: 0x120a04, net: 0xb06030 },
  },
  {
    id: "tide",
    label: "Tide",
    bg: "#040e12",
    text: "#e2f6f8",
    accent: "#6ec4c8",
    fog: { highlight: 0x2a7a80, mid: 0x143840, low: 0x061214, base: 0x040e12, net: 0x3a9098 },
  },
  {
    id: "noir",
    label: "Noir",
    bg: "#050505",
    text: "#f5f5f5",
    accent: "#c8c8c8",
    fog: { highlight: 0x404040, mid: 0x1c1c1c, low: 0x0a0a0a, base: 0x050505, net: 0x585858 },
  },
  {
    id: "technonyte",
    label: "Technonyte",
    bg: "#0c0b02",
    text: "#fff8d6",
    accent: "#ffe014",
    fog: { highlight: 0xe8c820, mid: 0x7a6810, low: 0x1c1804, base: 0x0c0b02, net: 0xffe033 },
  },
  {
    id: "john",
    label: "John",
    bg: "#1a1c1e",
    text: "#eef0f2",
    accent: "#c4c9ce",
    fog: { highlight: 0x8a9098, mid: 0x3a4048, low: 0x1a1c20, base: 0x1a1c1e, net: 0xa8b0b8 },
  },
  {
    id: "sakura-pulse",
    label: "Sakura Pulse",
    bg: "#12080e",
    text: "#ffe8f2",
    accent: "#ff7ab8",
    fog: { highlight: 0xd05090, mid: 0x6a2848, low: 0x1a0810, base: 0x12080e, net: 0xf070a8 },
  },
];

export function themeById(id?: string | null): SiteTheme {
  return SITE_THEMES.find((t) => t.id === id) || SITE_THEMES[0];
}

export const SEARCH_ENGINES = [
  {
    id: "ddg",
    label: "DuckDuckGo",
    template: "https://duckduckgo.com/?q=%s",
  },
  {
    id: "bing",
    label: "Bing",
    template: "https://www.bing.com/search?q=%s",
  },
  {
    id: "google",
    label: "Google",
    template: "https://www.google.com/search?q=%s",
  },
  {
    id: "startpage",
    label: "Startpage",
    template: "https://www.startpage.com/sp/search?query=%s",
  },
  {
    id: "brave",
    label: "Brave Search",
    template: "https://search.brave.com/search?q=%s",
  },
];

export const UA_PRESETS: { id: string; label: string; group: string; ua: string }[] = [
  { id: "auto", label: "Match identity mode", group: "Default", ua: "" },
  {
    id: "chrome-win",
    label: "Chrome · Windows",
    group: "Desktop",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  {
    id: "chrome-mac",
    label: "Chrome · macOS",
    group: "Desktop",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  {
    id: "safari-mac",
    label: "Safari · macOS",
    group: "Desktop",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  },
  {
    id: "firefox-win",
    label: "Firefox · Windows",
    group: "Desktop",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  },
  {
    id: "edge-win",
    label: "Edge · Windows",
    group: "Desktop",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  },
  {
    id: "safari-iphone",
    label: "Safari · iPhone",
    group: "Mobile",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
  {
    id: "chrome-android",
    label: "Chrome · Android",
    group: "Mobile",
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  },
  {
    id: "chromecast",
    label: "Smart TV · Chromecast",
    group: "Living room",
    ua: "Mozilla/5.0 (CrKey armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6261.132 Safari/537.36",
  },
  {
    id: "ps5",
    label: "PlayStation 5",
    group: "Console",
    ua: "Mozilla/5.0 (PlayStation; PlayStation 5/9.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
  },
  {
    id: "xbox",
    label: "Xbox Series",
    group: "Console",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox Series X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edge/44.18363.8131",
  },
  {
    id: "switch",
    label: "Nintendo Switch",
    group: "Console",
    ua: "Mozilla/5.0 (Nintendo Switch; WifiWebAuthApplet) AppleWebKit/601.6 (KHTML, like Gecko) NF/16.0.0.20.9 NintendoBrowser/5.1.0.13343",
  },
  {
    id: "googlebot",
    label: "Crawler · Google",
    group: "Other",
    ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  },
];

const SYNTHETIC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function resolveUserAgent(): string {
  try {
    const presetId = localStorage.getItem("uaPreset") || "auto";
    const custom = localStorage.getItem("customUserAgent") || "";
    if (custom.trim()) return custom.trim().slice(0, 400);
    const preset = UA_PRESETS.find((p) => p.id === presetId);
    if (preset?.ua) return preset.ua;
    const identity = localStorage.getItem("browserIdentity") || "mirror";
    if (identity === "disguise") return SYNTHETIC_UA;
    return navigator.userAgent;
  } catch {
    return navigator.userAgent;
  }
}

export function applyBrowserIdentity() {
  try {
    const identity = localStorage.getItem("browserIdentity") || "mirror";
    const ua = resolveUserAgent();
    const shouldPatch =
      identity === "disguise" ||
      (localStorage.getItem("uaPreset") || "auto") !== "auto" ||
      !!localStorage.getItem("customUserAgent");
    if (!shouldPatch) return;
    try {
      Object.defineProperty(Navigator.prototype, "userAgent", {
        get: () => ua,
        configurable: true,
      });
    } catch {}
    try {
      Object.defineProperty(navigator, "userAgent", {
        get: () => ua,
        configurable: true,
      });
    } catch {}
    try {
      Object.defineProperty(Navigator.prototype, "appVersion", {
        get: () => ua.replace(/^Mozilla\//, ""),
        configurable: true,
      });
    } catch {}
    try {
      Object.defineProperty(Navigator.prototype, "vendor", {
        get: () => "Google Inc.",
        configurable: true,
      });
    } catch {}
  } catch {}
}

export function buildSearchUrl(query: string): string {
  const q = query.trim();
  if (!q) return "";
  if (q.startsWith("http") || q.includes(".")) {
    return q.startsWith("http") ? q : `https://${q}`;
  }
  const id = localStorage.getItem("searchEngine") || "ddg";
  const eng = SEARCH_ENGINES.find((e) => e.id === id) || SEARCH_ENGINES[0];
  return eng.template.replace("%s", encodeURIComponent(q));
}
