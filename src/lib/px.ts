import { revealCodes } from "./mask";
import { originHttpHost, originWsHost, svgDirPath } from "./siteOrigin";

function dir() {
  try {
    if (typeof window === "undefined" || !(window as any).__PZ_ORIGIN__) return "/";
    return svgDirPath();
  } catch {
    return "/";
  }
}

export const ENGINE_GEN = "dl13";

export const PX = {
  get prefix() {
    return dir() + "afsd123k2/";
  },
  get core() {
    return dir() + "q9vx/";
  },
  get mux() {
    return dir() + "m4thx/";
  },
  stream: "/api/websocket/",
  edge: "/api/edge/",
  get sw() {
    return dir() + "1k123.js";
  },
  get coreAll() {
    return dir() + "q9vx/sj.all.js?v=" + ENGINE_GEN;
  },
  get coreSync() {
    return dir() + "q9vx/sj.sync.js?v=" + ENGINE_GEN;
  },
  get coreWasm() {
    return dir() + "q9vx/ld.bin";
  },
  get muxIndex() {
    return dir() + "m4thx/index.js?v=" + ENGINE_GEN;
  },
  get muxMod() {
    return dir() + "m4thx/index.mjs?v=" + ENGINE_GEN;
  },
  get muxWorker() {
    return dir() + "m4thx/worker.js?v=" + ENGINE_GEN;
  },
  get tunMod() {
    return dir() + "e7px/index.mjs?v=" + ENGINE_GEN;
  },
  get curlMod() {
    return dir() + "l9cx/index.mjs?v=" + ENGINE_GEN;
  },
};

function fromCodes(codes: number[]): string {
  return codes.map((c) => String.fromCharCode(c)).join("");
}

const N = {
  loadCtrl: fromCodes([36, 118, 111, 108, 116, 101, 100, 103, 101, 76, 111, 97, 100, 67, 111, 110, 116, 114, 111, 108, 108, 101, 114]),
  ctrl: fromCodes([86, 111, 108, 116, 101, 100, 103, 101, 67, 111, 110, 116, 114, 111, 108, 108, 101, 114]),
  encode: fromCodes([115, 101, 97, 108, 72, 114, 101, 102, 115]),
  frame: fromCodes([111, 112, 101, 110, 83, 117, 114, 102, 97, 99, 101]),
  mux: revealCodes([84, 122, 124, 100, 90, 99, 109]),
  muxConn: revealCodes([84, 122, 124, 100, 90, 99, 109, 87, 120, 120, 123, 113, 116, 98, 124, 123, 121]),
  hook: revealCodes([117, 127, 123, 112, 67, 100, 116, 122, 100, 112, 112, 102]),
  streamKey: revealCodes([123, 127, 123, 127]),
  streamCfg: revealCodes([96, 127, 102, 100, 98, 100, 121]),
};

export function getPx(): any {
  return (window as any).__pz;
}

export function pxEncode(url: string): string {
  const c = getPx();
  if (!c) return "about:blank";
  try {
    const out = c[N.encode](url);
    if (typeof out !== "string" || !out) return "about:blank";
    if (out.indexOf("afsd123k2") === -1) return "about:blank";
    return out;
  } catch {
    return "";
  }
}

const DECODE = fromCodes([111, 112, 101, 110, 72, 114, 101, 102, 115]);

export function pxDecode(url: string): string {
  const c = getPx();
  if (!c || typeof c[DECODE] !== "function") return url;
  try {
    return c[DECODE](url);
  } catch {
    return url;
  }
}

export function pxCreateFrame(): any {
  const c = getPx();
  if (!c) return null;
  return c[N.frame]();
}

export function pxReady(): boolean {
  return !!getPx();
}

export async function waitPx(timeoutMs = 8000): Promise<boolean> {
  if (getPx()) return true;
  const start = Date.now();
  return new Promise((resolve) => {
    const t = setInterval(() => {
      if (getPx()) {
        clearInterval(t);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        resolve(false);
      }
    }, 50);
  });
}

export function loadCtrlFactory(): any {
  return (window as any)[N.loadCtrl];
}

export function ctrlClassName(): string {
  return N.ctrl;
}

export function getMuxRoot(): any {
  return (window as any)[N.mux];
}

export function openMuxConnection(workerPath: string): any {
  const root = getMuxRoot();
  if (!root) return null;
  return new root[N.muxConn](workerPath);
}

export function muxSetName(): string {
  return N.hook;
}

export function cfgStreamUrl(cfg: any): string | undefined {
  if (!cfg) return undefined;
  return cfg.streamurl || cfg[N.streamCfg];
}

export async function setMuxTransport(conn: any, modPath: string, streamUrl: string): Promise<void> {
  if (!conn) return;
  const opts: Record<string, string> = {};
  opts[N.streamKey] = streamUrl;
  await conn[N.hook](modPath, [opts]);
}

export function defaultStreamUrl(): string {
  return originWsHost() + PX.stream;
}

export function defaultEdgeUrl(): string {
  return originHttpHost() + PX.edge;
}
