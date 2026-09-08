const RIVET_THEME_PROPERTIES = [
  "--bg-body",
  "--bg-surface-1",
  "--bg-surface-3",
  "--bg-surface-5",
  "--bg-surface-7",
  "--bg-surface-active",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--color-sublabel",
  "--border-faint",
  "--border-medium",
  "--accent-color",
  "--btn-primary-bg",
  "--btn-primary-bg-hover",
  "--btn-primary-text",
  "--hover-bg",
  "--toast-danger-bg",
  "--toast-danger-text",
  "--notif-dot-feature",
  "--notif-dot-update",
] as const;

const FALLBACKS: Record<string, string> = {
  "--bg-body": "#0b1018",
  "--bg-surface-1": "#121821",
  "--bg-surface-3": "#171e29",
  "--bg-surface-5": "#1c2430",
  "--bg-surface-7": "#222b38",
  "--bg-surface-active": "#2a3545",
  "--text-primary": "#f2f5f8",
  "--text-secondary": "#c4ccd6",
  "--text-muted": "#8b95a3",
  "--color-sublabel": "#8b95a3",
  "--border-faint": "rgba(210, 220, 235, 0.1)",
  "--border-medium": "rgba(210, 220, 235, 0.16)",
  "--accent-color": "#5b8def",
  "--btn-primary-bg": "#3a5f9a",
  "--btn-primary-bg-hover": "#4470b4",
  "--btn-primary-text": "#ffffff",
  "--hover-bg": "rgba(255,255,255,0.06)",
  "--toast-danger-bg": "#5a2a30",
  "--toast-danger-text": "#ffd0d4",
  "--notif-dot-feature": "#5b8def",
  "--notif-dot-update": "#5b8def",
};

const RIVET_MOTION_STYLE_ID = "pz-rivet-motion";
const RIVET_MOTION_CSS = `
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion="full"]) *,
  html:not([data-motion="full"]) *::before,
  html:not([data-motion="full"]) *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}
`;

export function applyRivetAppearance(doc: Document): void {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  for (const property of RIVET_THEME_PROPERTIES) {
    const value = style.getPropertyValue(property).trim() || FALLBACKS[property] || "";
    if (value) {
      doc.documentElement.style.setProperty(`--lyra${property.slice(1)}`, value);
      doc.documentElement.style.setProperty(property, value);
    }
  }

  doc.documentElement.dataset.motion = root.dataset.motion || "system";
  if (doc.getElementById(RIVET_MOTION_STYLE_ID)) return;

  const el = doc.createElement("style");
  el.id = RIVET_MOTION_STYLE_ID;
  el.textContent = RIVET_MOTION_CSS;
  (doc.head || doc.documentElement).appendChild(el);
}
