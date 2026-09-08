const LOCK_ATTR = "data-pz-lock-popups";

const AD_HREF_RE =
  /popads|propeller|exoclick|magsrv|juicyads|popcash|adsterra|doubleclick|googlesyndication|googleadservices|adnxs|adsrvr|outbrain|taboola|onclick|onclickgenius|ad-maven|clickadu|trafficjunky|bidvertiser|popunder|push-notification|notif|offertoro|adgate|adscend|ogury|zeropark|highperformanceformat|effectivecpmnetwork|profitableratecpmnetwork|profitablegatecpm|opera\.com|operagx|gx\.opera/i;

const OPERA_GX_RE =
  /opera\s*gx|operagx|opera\.com\/gx|gx\.opera|download\s*opera|install\s*opera|get\s*opera|gaming browser|faster browser/i;

const SRCDOC_AD_RE =
  /jsEditor|data-area\s*=\s*["']?area[34]|id=["']jsEditor["']|opera\s*gx|operagx|opera\.com\/gx|gx\.opera/i;

let topObserver: MutationObserver | null = null;
let topScanTimer: ReturnType<typeof setInterval> | null = null;

function dummyWin() {
  return {
    closed: true,
    close() {},
    focus() {},
    blur() {},
    postMessage() {},
    location: { href: "about:blank", assign() {}, replace() {}, reload() {} },
    document: { write() {}, writeln() {}, open() {}, close() {} },
  };
}

function hrefOf(el: Element | null): string {
  if (!el) return "";
  const a = el as HTMLAnchorElement;
  return String(a.getAttribute?.("href") || a.getAttribute?.("src") || (a as any).href || "").trim();
}

function isExternalPopupHref(href: string): boolean {
  if (!href || href === "#" || href.startsWith("javascript:") || href.startsWith("blob:")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (AD_HREF_RE.test(href) || OPERA_GX_RE.test(href)) return true;
  try {
    const u = new URL(href, location.href);
    if (u.protocol === "about:" && /srcdoc/i.test(u.href)) return true;
    if (u.protocol === "about:") return false;
    const host = u.hostname.toLowerCase();
    if (/(vidnest\.fun|vidlink\.pro|vidking\.net|vidsrc\.(xyz|cc|net)|embed\.su|2embed\.cc|autoembed\.cc|moviesapi\.club)$/i.test(host)) {
      return false;
    }
    if (/opera\.com|operagx/i.test(host)) return true;
    if (u.origin === location.origin) return false;
  } catch {}
  return /target|_blank|popup|popunder/i.test(href) || AD_HREF_RE.test(href);
}

function isOwnFrame(el: Element): boolean {
  return !!(
    el.closest?.("[data-ad-slot], [data-pz-ad-slot], #pz-loader-ad-behind, #pz-video-ad-root")
    || (el as HTMLElement).title === "Advertisement"
  );
}

function isAboutSrcdocFrame(iframe: HTMLIFrameElement): boolean {
  const src = String(iframe.getAttribute("src") || iframe.src || "");
  const srcdoc = String(iframe.getAttribute("srcdoc") || iframe.srcdoc || "");
  if (srcdoc) return true;
  if (/about:srcdoc/i.test(src)) return true;
  try {
    const href = iframe.contentWindow?.location?.href || "";
    if (/about:srcdoc/i.test(href)) return true;
  } catch {}
  return false;
}

function isSrcdocAdFrame(iframe: HTMLIFrameElement): boolean {
  if (isOwnFrame(iframe)) return false;
  const srcdoc = String(iframe.getAttribute("srcdoc") || iframe.srcdoc || "");
  if (srcdoc && (OPERA_GX_RE.test(srcdoc) || SRCDOC_AD_RE.test(srcdoc))) return true;
  if (!isAboutSrcdocFrame(iframe)) return false;
  try {
    const doc = iframe.contentDocument;
    if (!doc) return false;
    if (doc.querySelector("video, audio")) return false;
    if (doc.getElementById("jsEditor")) return true;
    if (doc.querySelector('[data-area="area3"], [data-area="area4"]')) return true;
    const bodyText = doc.body?.innerText || "";
    if (OPERA_GX_RE.test(bodyText)) return true;
  } catch {}
  return false;
}

function nukeFrame(iframe: HTMLIFrameElement) {
  try {
    iframe.style.pointerEvents = "none";
    iframe.srcdoc = "";
  } catch {}
  try {
    iframe.src = "about:blank";
  } catch {}
  try {
    iframe.remove();
  } catch {}
}

function killSrcdocAds(root: ParentNode | Document) {
  try {
    root.querySelectorAll("iframe").forEach((frame) => {
      if (isSrcdocAdFrame(frame as HTMLIFrameElement)) nukeFrame(frame as HTMLIFrameElement);
    });
  } catch {}
}

function isClickjackOverlay(el: HTMLElement, win: Window): boolean {
  if (el.querySelector?.("video, audio")) return false;
  if (el.tagName === "VIDEO" || el.tagName === "AUDIO") return false;
  if (isOwnFrame(el)) return false;
  try {
    const s = win.getComputedStyle(el);
    if (!s || s.display === "none" || s.visibility === "hidden" || s.pointerEvents === "none") return false;
    const r = el.getBoundingClientRect();
    const vw = Math.max(1, win.innerWidth || 1);
    const vh = Math.max(1, win.innerHeight || 1);
    const covers = r.width >= vw * 0.85 && r.height >= vh * 0.7 && r.top <= vh * 0.15;
    if (!covers) return false;
    const z = parseInt(s.zIndex || "0", 10);
    const overlay = (s.position === "fixed" || s.position === "absolute") && (Number.isFinite(z) ? z >= 50 : true);
    const opacity = parseFloat(s.opacity || "1");
    const invisible = opacity < 0.12 || s.backgroundColor === "transparent" || s.backgroundColor === "rgba(0, 0, 0, 0)";
    const tag = el.tagName;
    if (overlay && (tag === "IFRAME" || tag === "A" || tag === "INS" || tag === "DIV") && (invisible || tag === "IFRAME" || tag === "A")) {
      if (el.id?.toLowerCase().includes("player") || (el.className && /player|jw|video|vjs/i.test(String(el.className)))) {
        return false;
      }
      if (tag === "IFRAME") {
        return isSrcdocAdFrame(el as HTMLIFrameElement) || invisible;
      }
      return true;
    }
  } catch {}
  return false;
}

function neutralizeTargets(root: ParentNode) {
  try {
    root.querySelectorAll("a[target], area[target], form[target], base[target]").forEach((el) => {
      const t = (el.getAttribute("target") || "").toLowerCase();
      if (t === "_blank" || t === "_new" || t === "_parent" || t === "_top") {
        el.removeAttribute("target");
      }
      if (el.tagName === "A" || el.tagName === "AREA") {
        const href = hrefOf(el);
        if (isExternalPopupHref(href) || AD_HREF_RE.test(href) || OPERA_GX_RE.test(href)) {
          el.setAttribute("href", "javascript:void(0)");
          el.removeAttribute("target");
        }
      }
    });
  } catch {}
}

function stripOverlays(win: Window, doc: Document) {
  killSrcdocAds(doc);
  try {
    const nodes = doc.querySelectorAll("a, div, iframe, ins, section, aside");
    for (const n of Array.from(nodes)) {
      const el = n as HTMLElement;
      const blob = `${el.id || ""} ${el.className || ""} ${el.textContent?.slice(0, 400) || ""}`;
      if (OPERA_GX_RE.test(blob) && !el.querySelector?.("video, audio")) {
        try {
          el.style.pointerEvents = "none";
          el.remove();
          continue;
        } catch {}
      }
      if (isClickjackOverlay(el, win)) {
        try {
          el.style.pointerEvents = "none";
          el.remove();
        } catch {}
      }
    }
  } catch {}
}

function patchOpen(win: any) {
  const blocked = function () {
    return dummyWin();
  };
  try {
    Object.defineProperty(win, "open", { configurable: true, writable: true, value: blocked });
  } catch {
    try {
      win.open = blocked;
    } catch {}
  }
  for (const k of ["alert", "confirm", "prompt", "print"]) {
    try {
      win[k] = () => false;
    } catch {}
  }
  try {
    win.showModalDialog = blocked;
    win.createPopup = blocked;
  } catch {}
}

function blockEvent(e: Event) {
  const t = e.target as Element | null;
  const a = t?.closest?.("a, area") as HTMLAnchorElement | null;
  if (a) {
    const target = (a.getAttribute("target") || "").toLowerCase();
    const href = hrefOf(a);
    if (
      target === "_blank" ||
      target === "_new" ||
      target === "_parent" ||
      target === "_top" ||
      isExternalPopupHref(href) ||
      AD_HREF_RE.test(href) ||
      OPERA_GX_RE.test(href)
    ) {
      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();
      return;
    }
  }
  if (t && OPERA_GX_RE.test((t as HTMLElement).innerText || t.textContent || "")) {
    e.preventDefault();
    e.stopPropagation();
    (e as any).stopImmediatePropagation?.();
    return;
  }
  if ((e as MouseEvent).button === 1) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function patchSrcdoc(win: Window) {
  const proto = (win as any).HTMLIFrameElement?.prototype;
  if (!proto || proto.__pzSrcdocPatched) return;
  const desc = Object.getOwnPropertyDescriptor(proto, "srcdoc");
  if (!desc?.set) return;
  proto.__pzSrcdocPatched = true;
  proto.__pzSrcdocDesc = desc;
  Object.defineProperty(proto, "srcdoc", {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      return desc.get ? desc.get.call(this) : this.getAttribute("srcdoc");
    },
    set(v: string) {
      const s = String(v || "");
      if (isOwnFrame(this)) {
        return desc.set!.call(this, v);
      }
      if (OPERA_GX_RE.test(s) || SRCDOC_AD_RE.test(s)) {
        return desc.set!.call(this, "");
      }
      return desc.set!.call(this, v);
    },
  });
}

function installOnWindow(win: Window): void {
  const w = win as any;
  const doc = win.document;
  if (!w || !doc) return;
  if (w.__pzSealPop && w.__pzSealPop > Date.now() - 1200) {
    try {
      neutralizeTargets(doc);
      stripOverlays(win, doc);
    } catch {}
    return;
  }
  w.__pzSealPop = Date.now();
  patchOpen(w);
  patchSrcdoc(win);
  neutralizeTargets(doc);

  if (!doc.documentElement?.hasAttribute("data-pz-pop-sealed")) {
    try {
      doc.documentElement?.setAttribute("data-pz-pop-sealed", "1");
    } catch {}
    for (const type of ["click", "auxclick", "mousedown", "mouseup", "pointerdown", "pointerup", "dblclick"]) {
      doc.addEventListener(type, blockEvent, true);
    }
    try {
      const origSet = win.HTMLAnchorElement?.prototype?.setAttribute;
      if (origSet && !(win.HTMLAnchorElement.prototype as any).__pzSet) {
        (win.HTMLAnchorElement.prototype as any).__pzSet = origSet;
        win.HTMLAnchorElement.prototype.setAttribute = function (name: string, value: string) {
          if (String(name).toLowerCase() === "target" && /_blank|_new|_parent|_top/i.test(String(value))) {
            return origSet.call(this, name, "_self");
          }
          if (String(name).toLowerCase() === "href" && isExternalPopupHref(String(value))) {
            return origSet.call(this, name, "javascript:void(0)");
          }
          return origSet.call(this, name, value);
        };
      }
    } catch {}
    try {
      const origAttr = win.HTMLIFrameElement?.prototype?.setAttribute;
      if (origAttr && !(win.HTMLIFrameElement.prototype as any).__pzIframeSet) {
        (win.HTMLIFrameElement.prototype as any).__pzIframeSet = origAttr;
        win.HTMLIFrameElement.prototype.setAttribute = function (name: string, value: string) {
          const key = String(name).toLowerCase();
          const val = String(value);
          if (key === "srcdoc" && (OPERA_GX_RE.test(val) || SRCDOC_AD_RE.test(val))) {
            if (!isOwnFrame(this)) return origAttr.call(this, name, "");
          }
          return origAttr.call(this, name, value);
        };
      }
    } catch {}
  }

  stripOverlays(win, doc);

  try {
    doc.querySelectorAll("iframe").forEach((frame) => {
      if (isSrcdocAdFrame(frame as HTMLIFrameElement)) {
        nukeFrame(frame as HTMLIFrameElement);
        return;
      }
      try {
        const cw = (frame as HTMLIFrameElement).contentWindow;
        if (cw && cw !== win) installOnWindow(cw);
      } catch {}
    });
  } catch {}

  if (!(doc as any).__pzSealMo) {
    try {
      const mo = new MutationObserver(() => {
        neutralizeTargets(doc);
        stripOverlays(win, doc);
        doc.querySelectorAll("iframe").forEach((frame) => {
          if (isSrcdocAdFrame(frame as HTMLIFrameElement)) {
            nukeFrame(frame as HTMLIFrameElement);
            return;
          }
          try {
            const cw = (frame as HTMLIFrameElement).contentWindow;
            if (cw) installOnWindow(cw);
          } catch {}
        });
      });
      mo.observe(doc.documentElement || doc, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["target", "href", "src", "srcdoc"],
      });
      (doc as any).__pzSealMo = mo;
    } catch {}
  }
}

export function setPopupLock(on: boolean) {
  try {
    if (on) {
      document.documentElement.setAttribute(LOCK_ATTR, "1");
      patchSrcdoc(window);
      killSrcdocAds(document);
      if (!topObserver) {
        topObserver = new MutationObserver(() => killSrcdocAds(document));
        topObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["srcdoc", "src"],
        });
      }
      if (!topScanTimer) {
        topScanTimer = window.setInterval(() => killSrcdocAds(document), 400);
      }
    } else {
      document.documentElement.removeAttribute(LOCK_ATTR);
      if (topObserver) {
        topObserver.disconnect();
        topObserver = null;
      }
      if (topScanTimer) {
        window.clearInterval(topScanTimer);
        topScanTimer = null;
      }
    }
  } catch {}
}

export function isPopupLockOn() {
  try {
    return document.documentElement.getAttribute(LOCK_ATTR) === "1";
  } catch {
    return false;
  }
}

export function sealPlayerPopups(iframe: HTMLIFrameElement | null) {
  if (!iframe) return;
  try {
    const win = iframe.contentWindow;
    if (win) installOnWindow(win);
    if (iframe.contentDocument) killSrcdocAds(iframe.contentDocument);
  } catch {}
}
