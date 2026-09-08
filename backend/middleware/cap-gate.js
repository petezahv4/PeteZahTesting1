import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { hasValidGate } from '../cap/store.js';
import { hasValidLegal } from '../legal/cookie.js';
import { applySeoToHtml } from '../utils/seo-meta.js';
import { isSocialPreviewBot } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_FILE = path.join(__dirname, '../../public/verify.html');

let verifyCache = { mtime: 0, html: '', checkedAt: 0 };

function readVerifyTemplate() {
  try {
    const now = Date.now();
    if (verifyCache.html && now - verifyCache.checkedAt < 60000) return verifyCache.html;
    const st = fs.statSync(VERIFY_FILE);
    verifyCache.checkedAt = now;
    if (st.mtimeMs !== verifyCache.mtime || !verifyCache.html) {
      verifyCache = { mtime: st.mtimeMs, html: fs.readFileSync(VERIFY_FILE, 'utf8'), checkedAt: now };
    }
    return verifyCache.html;
  } catch {
    return '';
  }
}

const OPEN_EXACT = new Set([
  '/verify',
  '/verify.html',
  '/logo.png',
  '/og-share.png',
  '/ad-probe.html',
  '/favicon.ico',
  '/robots.txt',
  '/ads.txt',
  '/firefox-wasm/thanks.html',
  '/pz-vanta.js',
  '/vendor/vanta.fog.min.js',
  '/font-obfuscation.js',
  '/plusjakartasans-obf-mappings.json',
  '/plusjakartasans-obf-reverse-mappings.json',
  '/terms',
  '/tos',
  '/terms-of-service',
  '/terms-of-use',
  '/privacy',
  '/privacy-policy',
  '/dmca',
  '/copyright',
  '/4f66ddd48bf4ee436b4ca095a86f40ff.html',
]);

const OPEN_PREFIX = ['/cap/', '/api/verify-email', '/api/legal', '/api/study/', '/api/flashcards/', '/api/quiz/', '/vendor/', '/fonts/', '/fx/', '/storage/ag/', '/b/', '/f/__rivet__/'];

function isOpenPath(p) {
  if (OPEN_EXACT.has(p)) return true;
  // Game asset folders (with or without trailing slash)
  if (p === '/storage/ag' || p.startsWith('/storage/ag/')) return true;
  for (const pre of OPEN_PREFIX) {
    if (p === pre.slice(0, -1) || p.startsWith(pre)) return true;
  }
  return false;
}

function wantsHtml(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) return true;
  const ext = path.extname(req.path || '');
  return !ext || ext === '.html';
}

function shouldBypassGateForCrawler(req) {
  const ua = req.headers['user-agent'] || '';
  if (isSocialPreviewBot(ua)) return true;
  if (req.pzVerifiedBot) return true;
  return false;
}

export function createCapGateMiddleware() {
  return (req, res, next) => {
    const p = req.path || '';
    if (isOpenPath(p)) return next();
    if (shouldBypassGateForCrawler(req)) return next();
    if (hasValidGate(req) && hasValidLegal(req)) return next();
    if (hasValidGate(req)) return next();

    if (p.startsWith('/api/') || p.startsWith('/n/m/') || p.startsWith('/f/g/') || p.startsWith('/!!/') || p.startsWith('/!cover!/') || p.startsWith('/f/c/')) {
      return res.status(403).json({ error: 'Verification required' });
    }

    if (p.startsWith('/assets/') || p.endsWith('.js') || p.endsWith('.css') || p.endsWith('.map') || p.endsWith('.woff2') || p.endsWith('.woff') || p.endsWith('.ttf')) {
      return next();
    }

    if (wantsHtml(req)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, '/verify');
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, '/verify');
  };
}

export function sendVerifyPage(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  const raw = readVerifyTemplate();
  if (!raw) {
    return res.sendFile(VERIFY_FILE);
  }
  const html = applySeoToHtml(raw, req.headers.host || req.hostname);
  res.type('html').send(html);
}

export function requireGateUpgrade(req) {
  return hasValidGate(req);
}
