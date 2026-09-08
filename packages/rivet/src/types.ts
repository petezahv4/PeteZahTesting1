export interface ChromeManifestIcons {
  [size: string]: string;
}

export interface ChromeManifestAction {
  default_icon?: string | ChromeManifestIcons;
  default_title?: string;
  default_popup?: string;
}

interface ChromeManifestBackground {
  service_worker?: string;
  type?: "module" | "classic";
  page?: string;
  scripts?: string[];
}

export interface ChromeManifestContentScript {
  matches?: string[];
  exclude_matches?: string[];
  js?: string[];
  css?: string[];
  run_at?: "document_start" | "document_end" | "document_idle";
  all_frames?: boolean;
}

interface ChromeManifestRuleResource {
  id?: string;
  enabled?: boolean;
  path: string;
}

interface ChromeManifestCommand {
  description?: string;
  suggested_key?: {
    default?: string;
    windows?: string;
    mac?: string;
    linux?: string;
  };
}

export interface ChromeManifest {
  name: string;
  short_name?: string;
  description?: string;
  version?: string;
  manifest_version?: number;
  default_locale?: string;
  background?: ChromeManifestBackground;
  content_scripts?: ChromeManifestContentScript[];
  declarative_net_request?: {
    rule_resources?: ChromeManifestRuleResource[];
  };
  icons?: ChromeManifestIcons;
  action?: ChromeManifestAction;
  browser_action?: ChromeManifestAction;
  page_action?: ChromeManifestAction;
  options_page?: string;
  options_ui?: { page?: string };
  side_panel?: { default_path?: string };
  chrome_url_overrides?: { newtab?: string; bookmarks?: string; history?: string };
  commands?: Record<string, ChromeManifestCommand>;
  permissions?: string[];
  host_permissions?: string[];
  [key: string]: unknown;
}

export interface ExtensionMeta {
  id: string;
  manifest: ChromeManifest;
  enabled: boolean;
  installedAt: number;
  filename: string;
  fileList: string[];
}

interface DNRRuleCondition {
  urlFilter?: string;
  regexFilter?: string;
  resourceTypes?: string[];
  initiatorDomains?: string[];
  excludedInitiatorDomains?: string[];
}

interface DNRRuleAction {
  type: "block" | "redirect" | "upgradeScheme" | "modifyHeaders" | "allow";
  redirect?: { url?: string; regexSubstitution?: string };
  requestHeaders?: unknown[];
  responseHeaders?: unknown[];
}

export interface DNRRule {
  id: number;
  priority?: number;
  condition: DNRRuleCondition;
  action: DNRRuleAction;
}

export type DNRDecision =
  | { action: "block" }
  | { action: "redirect"; url: string }
  | { action: "modifyHeaders"; headers: unknown[]; responseHeaders: unknown[] };

export interface ContentScriptRegistration {
  extId: string;
  id?: string;
  matches: string[];
  excludeMatches: string[];
  includeGlobs?: string[];
  excludeGlobs?: string[];
  js: ContentScriptAsset[];
  css: ContentScriptAsset[];
  runAt: "document_start" | "document_end" | "document_idle";
  allFrames: boolean;
}

export type ContentScriptAsset = string | { file?: string; code?: string };

export interface TabInfo {
  id: number;
  windowId: number;
  url: string;
  title: string;
  active: boolean;
  favIconUrl?: string;
  status?: "loading" | "complete";
}

export interface RivetContextMenuEntry {
  extId: string;
  id: string;
  title: string;
  type: "normal" | "checkbox" | "radio" | "separator";
  enabled: boolean;
  checked: boolean;
}

export interface RivetContextMenuInfo {
  menuItemId?: string;
  pageUrl: string;
  frameUrl?: string;
  linkUrl?: string;
  srcUrl?: string;
  selectionText?: string;
  editable?: boolean;
  checked?: boolean;
  wasChecked?: boolean;
}

export interface RivetContextMenuRequest {
  tabId: number;
  clientX: number;
  clientY: number;
  items: RivetContextMenuEntry[];
  info: RivetContextMenuInfo;
}

export interface RivetHostBindings {
  getTabId: (win: Window) => number | null;
  getTab: (tabId: number) => TabInfo | null;
  getAllTabs: () => TabInfo[];
  getActiveTabId?: () => number | null;
  getTabWindow?: (tabId: number) => Window | null;
  navigateTab?: (tabId: number | null, url: string) => void;
  activateTab?: (tabId: number) => void;
  closeTab?: (tabId: number) => void;
  openExtensionTab?: (extId: string, page: string, tabId: number | null) => void;
  closeExtensionPopup?: (extId: string) => void;
  showNotification?: (title: string, message: string) => void;
  showContextMenu?: (request: RivetContextMenuRequest) => void;
}
