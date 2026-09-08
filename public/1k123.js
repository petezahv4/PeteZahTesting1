if (navigator.userAgent.includes('Firefox')) {
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value: true,
    writable: false
  });
}

var _base = self.location.pathname.replace(/[^/]*$/, '');
var _p = _base + ['q', '9vx/'].join('');
var _f = ['sj', '.all', '.js'].join('');
var _v = ['dl', '13'].join('');
try {
  importScripts(_p + _f + '?v=' + _v);
} catch (e) {}

try {
  importScripts(_base + 'b/rivet/router.js?v=' + _v);
} catch (e) {}

function handleRivet(event) {
  var router = self.$rivetRouter;
  if (!router || typeof router.shouldRoute !== 'function') return false;
  try {
    if (!router.shouldRoute(event)) return false;
    event.respondWith(router.route(event));
    return true;
  } catch (e) {
    return false;
  }
}

var _lw = ['$', 'volt', 'edge', 'Load', 'Worker'].join('');
var _sw = ['Volt', 'edge', 'Service', 'Worker'].join('');
var _boot = self[_lw];
if (typeof _boot !== 'function') {
  self.addEventListener('install', function (event) {
    event.waitUntil(self.skipWaiting());
  });
  self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
  });
  self.addEventListener('fetch', function (event) {
    if (handleRivet(event)) return;
    event.respondWith(fetch(event.request));
  });
} else {
var _exports = _boot();
var _engine = new _exports[_sw]();

var _pref = _base + ['afs', 'd123', 'k2/'].join('');
var _hydrated = false;
var _configPromise = null;

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

function isAppShellRequest(request, url) {
  if (url.origin !== self.location.origin) return false;
  var path = url.pathname;
  if (path.indexOf(_pref) === 0) return false;
  if (path === _base || path === _base + 'index.html' || path === _base + 'index.svg' || path === _base + 'new.svg' || path === _base + '1k123.js') return true;
  if (path.indexOf(_base + 'assets/') === 0) return true;
  if (path.indexOf(_base + 'q9vx/') === 0) {
    if (path.indexOf('.wasm') !== -1) return false;
    return true;
  }
  if (path.indexOf(_base + 'm4thx/') === 0) return true;
  if (path.indexOf(_base + 'e7px/') === 0) return true;
  if (path.indexOf(_base + 'l9cx/') === 0) return true;
  return false;
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function configReady(c) {
  return !!(
    c &&
    c.prefix &&
    c.files &&
    c.files.wasm &&
    c.files.all &&
    c.files.sync
  );
}

async function hydrateFromIdb() {
  if (configReady(_engine.config)) {
    try {
      await _engine.setConfig(_engine.config);
      _hydrated = true;
      return true;
    } catch (e) {}
  }

  var previous = configReady(_engine.config) ? _engine.config : null;
  for (var i = 0; i < 40; i++) {
    try {
      if (!configReady(_engine.config)) {
        _engine.config = undefined;
      }
      await _engine.loadConfig();
      if (configReady(_engine.config)) {
        _hydrated = true;
        return true;
      }
    } catch (e) {}
    await delay(50);
  }
  if (previous) {
    try {
      await _engine.setConfig(previous);
      _hydrated = true;
      return true;
    } catch (e) {}
  }
  return false;
}

async function ensureConfig() {
  if (_hydrated && configReady(_engine.config)) return true;
  if (_configPromise) return _configPromise;

  _configPromise = hydrateFromIdb().finally(function () {
    _configPromise = null;
  });
  return _configPromise;
}

async function applyConfigMessage(data) {
  if (data.config && configReady(data.config)) {
    try {
      await _engine.setConfig(data.config);
      _hydrated = true;
      return;
    } catch (e) {}
  }
  if (configReady(_engine.config)) {
    try {
      await _engine.setConfig(_engine.config);
      _hydrated = true;
      return;
    } catch (e) {}
  }
  await ensureConfig();
}

async function handleRequest(event) {
  var url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return fetch(event.request);
  }

  var ready = await ensureConfig();
  if (!ready || !configReady(_engine.config)) {
    if (url.pathname.indexOf(_pref) === 0) {
      return new Response('Proxy engine not ready', { status: 503, statusText: 'Service Unavailable' });
    }
    try {
      return await fetch(event.request);
    } catch (e) {
      return new Response('Network error', { status: 502 });
    }
  }

  try {
    if (_engine.route(event)) {
      return await _engine.fetch(event);
    }
  } catch (e) {
    if (url.pathname.indexOf(_pref) === 0) {
      return new Response('Proxy fetch failed', { status: 502 });
    }
  }

  try {
    return await fetch(event.request);
  } catch (e) {
    return new Response('Network error', { status: 502 });
  }
}

self.addEventListener('fetch', function (event) {
  if (handleRivet(event)) return;
  try {
    var url = new URL(event.request.url);
    if (url.origin !== self.location.origin || url.pathname.indexOf(_pref) !== 0) {
      return;
    }
  } catch (e) {
    return;
  }
  event.respondWith(handleRequest(event));
});

var playgroundData;
self.addEventListener('message', function (msg) {
  var data = msg.data;
  if (!data) return;
  if (data.type === 'playgroundData') {
    playgroundData = data;
  }
  if (data[['volt', 'edge', '$type'].join('')] === 'loadConfig') {
    var p = applyConfigMessage(data);
    if (typeof msg.waitUntil === 'function') {
      try {
        msg.waitUntil(p);
      } catch (e) {}
    }
  }
});

_engine.addEventListener('request', function (e) {
  if (playgroundData && e.url.href.indexOf(playgroundData.origin) === 0) {
    var headers = {};
    var origin = playgroundData.origin;
    if (e.url.href === origin + '/') {
      headers['content-type'] = 'text/html';
      e.response = new Response(playgroundData.html, { headers: headers });
    } else if (e.url.href === origin + '/style.css') {
      headers['content-type'] = 'text/css';
      e.response = new Response(playgroundData.css, { headers: headers });
    } else if (e.url.href === origin + '/script.js') {
      headers['content-type'] = 'application/javascript';
      e.response = new Response(playgroundData.js, { headers: headers });
    } else {
      e.response = new Response('empty response', { headers: headers });
    }
    e.response.rawHeaders = headers;
    e.response.rawResponse = {
      body: e.response.body,
      headers: headers,
      status: e.response.status,
      statusText: e.response.statusText
    };
    e.response.finalURL = e.url.toString();
  }
});
}
