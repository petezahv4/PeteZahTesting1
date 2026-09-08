import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";
import {
  ensureRivet,
  findUblockExtensionId,
  getRivet,
  rivetNumericTabId,
} from "@/lib/rivet/host";
import { EXTENSION_POPUP_MOUNTED_EVENT } from "@/lib/rivet/bridge";
import "@/styles/rivet.css";

type Props = {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onManage: () => void;
  tabId?: string | null;
  tabUrl?: string | null;
};

const DEFAULT_SIZE = { width: 340, height: 430 };
const IDLE_SIZE = { width: 320, height: 168 };
const EDGE = 12;
const GAP = 10;

function isHttpTab(url?: string | null) {
  return !!url && /^https?:\/\//i.test(url);
}

function domainKey(url?: string | null) {
  if (!isHttpTab(url)) return "internal";
  try {
    return new URL(String(url)).hostname || "internal";
  } catch {
    return "internal";
  }
}

function placeUnderAnchor(
  anchor: HTMLElement,
  size: { width: number; height: number },
) {
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(size.width, Math.max(260, vw - EDGE * 2));
  const top = Math.min(rect.bottom + GAP, vh - 140);
  const height = Math.min(size.height, Math.max(160, vh - top - EDGE));

  let left = rect.right - width;
  if (left < EDGE) left = EDGE;
  if (left + width > vw - EDGE) left = Math.max(EDGE, vw - width - EDGE);

  const anchorX = Math.min(
    Math.max(18, rect.left + rect.width / 2 - left),
    width - 18,
  );
  return { left, top, width, height, anchorX };
}

function fitUblockDocument(doc: Document) {
  try {
    let style = doc.getElementById("pz-ublock-fit") as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement("style");
      style.id = "pz-ublock-fit";
      (doc.head || doc.documentElement).appendChild(style);
    }
    doc.documentElement.style.colorScheme = "light";
    const meta = doc.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute("content", "light");
    else {
      const m = doc.createElement("meta");
      m.name = "color-scheme";
      m.content = "light";
      (doc.head || doc.documentElement).appendChild(m);
    }
    style.textContent = `
      :root, html { color-scheme: light !important; }
      html, body {
        margin: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        background: #ffffff !important;
        color: #1a1a1a !important;
        overflow-x: hidden !important;
      }
      #uBO-popup-panel, #panes, #main {
        max-width: 100% !important;
        width: 100% !important;
      }
    `;
  } catch {}
}

function popupHasUi(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument;
    if (!doc?.body) return false;
    if (doc.getElementById("main") || doc.getElementById("panes")) return true;
    if (doc.getElementById("uBO-popup-panel")) return true;
    return (
      doc.body.childElementCount > 0 && doc.body.innerText.trim().length > 0
    );
  } catch {
    return false;
  }
}

function measurePopup(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument;
    if (!doc?.body) return null;
    const main =
      (doc.getElementById("main") as HTMLElement | null) ||
      (doc.getElementById("panes") as HTMLElement | null) ||
      (doc.getElementById("uBO-popup-panel") as HTMLElement | null) ||
      doc.body;
    const rect = main.getBoundingClientRect();
    const width = Math.min(
      360,
      Math.max(
        280,
        Math.ceil(rect.width || main.scrollWidth || DEFAULT_SIZE.width),
      ),
    );
    const height = Math.min(
      560,
      Math.max(
        220,
        Math.ceil(rect.height || main.scrollHeight || DEFAULT_SIZE.height),
      ),
    );
    if (width < 40 || height < 40) return null;
    return { width, height };
  } catch {
    return null;
  }
}

function IdlePanel({
  onManage,
  onClose,
}: {
  onManage: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        color: "#222",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 650 }}>uBlock Origin</div>
      <p
        style={{
          margin: 0,
          fontSize: 11,
          lineHeight: 1.45,
          color: "rgba(0,0,0,0.55)",
        }}
      >
        Open a website to filter ads and trackers on that page.
      </p>
      <button
        type="button"
        onClick={() => {
          onManage();
          onClose();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          marginTop: "auto",
          padding: "9px 12px",
          borderRadius: 9,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(0,0,0,0.04)",
          color: "rgba(0,0,0,0.8)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <ExternalLink size={12} /> Manage extensions
      </button>
    </div>
  );
}

export default function ExtensionPopup({
  open,
  anchorEl,
  onClose,
  onManage,
  tabId,
  tabUrl,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const mountGenRef = useRef(0);
  const lastScopeRef = useRef(`${tabId || "none"}:${domainKey(tabUrl)}`);
  const proxied = isHttpTab(tabUrl);
  const scopeKey = `${tabId || "none"}:${domainKey(tabUrl)}`;

  const [place, setPlace] = useState(() => ({
    left: 8,
    top: 52,
    ...(proxied ? DEFAULT_SIZE : IDLE_SIZE),
    anchorX: 24,
  }));
  const [ready, setReady] = useState(false);
  const [extId, setExtId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [instanceId, setInstanceId] = useState(0);

  useEffect(() => {
    if (lastScopeRef.current === scopeKey) return;
    lastScopeRef.current = scopeKey;
    mountGenRef.current += 1;
    setReady(false);
    setFailed(false);
    setInstanceId((n) => n + 1);
    const rivet = getRivet();
    const id = extId || findUblockExtensionId();
    if (rivet && id) {
      try {
        rivet.unmountExtensionPopup(id, frameRef.current || undefined);
      } catch {}
    }
    if (open) onClose();
  }, [scopeKey, open, onClose, extId]);

  useEffect(() => {
    if (!open) {
      setReady(false);
      setFailed(false);
      const rivet = getRivet();
      const id = extId || findUblockExtensionId();
      if (rivet && id) {
        try {
          rivet.unmountExtensionPopup(id, frameRef.current || undefined);
        } catch {}
      }
      return;
    }

    mountGenRef.current += 1;
    setInstanceId((n) => n + 1);
    setReady(false);
    setFailed(false);
    if (anchorEl) {
      setPlace(placeUnderAnchor(anchorEl, proxied ? DEFAULT_SIZE : IDLE_SIZE));
    }

    let gone = false;
    (async () => {
      try {
        await ensureRivet();
        if (gone) return;
        const id = findUblockExtensionId();
        setExtId(id);
        if (!id && proxied) setFailed(true);
      } catch {
        if (!gone && proxied) setFailed(true);
      }
    })();

    return () => {
      gone = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !anchorEl) return;
    const apply = () => {
      const next = placeUnderAnchor(anchorEl, {
        width: place.width,
        height: place.height,
      });
      setPlace((cur) =>
        cur.left === next.left &&
        cur.top === next.top &&
        cur.width === next.width &&
        cur.height === next.height &&
        cur.anchorX === next.anchorX
          ? cur
          : next,
      );
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("scroll", apply, true);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("scroll", apply, true);
    };
  }, [open, anchorEl, place.width, place.height]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorEl?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onRivetClose = () => onClose();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("rivet-close-extension-popup", onRivetClose);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("rivet-close-extension-popup", onRivetClose);
    };
  }, [open, anchorEl, onClose]);

  useEffect(() => {
    if (!open || !proxied || !extId || failed || !tabId) return;

    const gen = mountGenRef.current;
    let stopped = false;
    let revealTimer = 0;
    let retryTimer = 0;
    let watchdog = 0;
    let startTimer = 0;
    let retried = false;

    const stillHere = () =>
      !stopped && gen === mountGenRef.current;

    const begin = () => {
      const frame = frameRef.current;
      const rivet = getRivet();
      if (!stillHere() || !frame || !rivet) return;

      setReady(false);
      frame.style.visibility = "";
      const numTab = rivetNumericTabId(tabId);

      const commitSize = () => {
        const size = measurePopup(frame) || DEFAULT_SIZE;
        if (anchorEl) setPlace(placeUnderAnchor(anchorEl, size));
        else setPlace((p) => ({ ...p, ...size }));
      };

      const reveal = () => {
        if (!stillHere()) return;
        try {
          frame.style.visibility = "";
          if (frame.contentDocument) fitUblockDocument(frame.contentDocument);
        } catch {}
        commitSize();
        setReady(true);
      };

      const onMounted = () => {
        if (!stillHere()) return;
        try {
          frame.style.visibility = "";
          if (frame.contentDocument) fitUblockDocument(frame.contentDocument);
        } catch {}
        if (revealTimer) window.clearTimeout(revealTimer);
        revealTimer = window.setTimeout(() => {
          if (popupHasUi(frame)) reveal();
          else finishOrRetry();
        }, 180);
      };

      const finishOrRetry = () => {
        if (!stillHere()) return;
        if (popupHasUi(frame)) {
          reveal();
          return;
        }
        if (!retried) {
          retried = true;
          try {
            rivet.unmountExtensionPopup(extId, frame);
          } catch {}
          frame.style.visibility = "";
          retryTimer = window.setTimeout(() => {
            if (!stillHere()) return;
            void rivet.mountExtensionPopup(frame, extId, numTab).then((ok) => {
              if (!stillHere()) return;
              if (!ok) setFailed(true);
              else onMounted();
            });
          }, 80);
          return;
        }
        setFailed(true);
      };

      frame.addEventListener(EXTENSION_POPUP_MOUNTED_EVENT, onMounted);
      void rivet
        .mountExtensionPopup(frame, extId, numTab)
        .then((ok) => {
          if (!stillHere()) return;
          if (!ok) setFailed(true);
          else onMounted();
        })
        .catch(() => {
          if (stillHere()) setFailed(true);
        });

      watchdog = window.setTimeout(() => {
        if (stillHere() && !popupHasUi(frame)) finishOrRetry();
      }, 1400);

      return () => {
        frame.removeEventListener(EXTENSION_POPUP_MOUNTED_EVENT, onMounted);
        try {
          frame.style.visibility = "";
          rivet.unmountExtensionPopup(extId, frame);
        } catch {}
      };
    };

    let disposeMount: (() => void) | undefined;
    startTimer = window.setTimeout(() => {
      disposeMount = begin();
    }, 0);

    return () => {
      stopped = true;
      if (startTimer) window.clearTimeout(startTimer);
      if (revealTimer) window.clearTimeout(revealTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
      if (watchdog) window.clearTimeout(watchdog);
      disposeMount?.();
      const frame = frameRef.current;
      const rivet = getRivet();
      if (frame && rivet) {
        try {
          frame.style.visibility = "";
          rivet.unmountExtensionPopup(extId, frame);
        } catch {}
      }
    };
  }, [open, proxied, extId, tabId, scopeKey, instanceId, failed, anchorEl]);

  if (!open || typeof document === "undefined") return null;

  const showIdle = !proxied;
  const showFail = proxied && failed;

  return createPortal(
    <>
      <div
        aria-hidden
        className="rivet-popup-backdrop"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          pointerEvents: "auto",
          background: "transparent",
        }}
        onPointerDown={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="uBlock Origin"
        className={`rivet-toolbar-panel${ready || showIdle || showFail ? "" : " measuring"}`}
        style={{
          position: "fixed",
          left: place.left,
          top: place.top,
          width: place.width,
          height: showIdle
            ? IDLE_SIZE.height
            : showFail
              ? Math.min(place.height, 220)
              : place.height,
          zIndex: 10001,
          ["--rivet-popup-anchor-x" as string]: `${place.anchorX}px`,
        }}
      >
        {showIdle ? (
          <IdlePanel onManage={onManage} onClose={onClose} />
        ) : showFail ? (
          <div
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              color: "#222",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 650 }}>uBlock Origin</div>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                lineHeight: 1.45,
                color: "rgba(0,0,0,0.55)",
              }}
            >
              Popup failed to load for this site. Retry to remount it.
            </p>
            <button
              type="button"
              onClick={() => {
                mountGenRef.current += 1;
                setFailed(false);
                setReady(false);
                setInstanceId((n) => n + 1);
              }}
              style={{
                padding: "9px 12px",
                borderRadius: 9,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "rgba(0,0,0,0.04)",
                color: "rgba(0,0,0,0.8)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <iframe
            key={`ublock-${scopeKey}-${instanceId}`}
            ref={frameRef}
            title="uBlock Origin"
            className="no-obfuscate"
            data-no-obfuscate="true"
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              border: "none",
              background: "#ffffff",
              opacity: ready ? 1 : 0,
              transition: "opacity 0.1s ease",
            }}
          />
        )}
      </div>
    </>,
    document.body,
  );
}
