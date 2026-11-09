/* Local plugin host. Plugins are local JS the user imported: they may restyle and re-theme the client, change what the
   pages show and wrap the client's page-side logic. Everything they do runs behind error boundaries, so a broken plugin
   loses its own effects but never takes the client, another plugin or the native host down. They never receive the
   native bridge from this host. */
(function (global) {
  'use strict';
  if (global.BiliSpacePlugins) return;
  const source = (typeof PLUGINS !== 'undefined' && PLUGINS) || {};
  const defs = Array.isArray(source.plugins) ? source.plugins.slice() : [];
  const loadErrors = Array.isArray(source.errors) ? source.errors : [];
  const directory = typeof source.directory === 'string' ? source.directory : '';
  const disabled = new Set(Array.isArray(INITIAL && INITIAL.pluginsDisabled) ? INITIAL.pluginsDisabled : []);
  const data = new Map(defs.map((def) => [def.id, def && def.data && typeof def.data === 'object' ? { ...def.data } : {}]));
  const listeners = new Map();
  const instances = new Map();
  const wrapped = new Map();
  // Everything a plugin set up through the API that has to be undone when it stops (observers, timers, listeners, keys).
  const cleanups = new Map();
  const errors = [];
  const strikes = new Map();
  let options = { getVideo: () => document.querySelector('video'), getPrefs: () => ({}), toast: () => {}, update: null, getShadow: () => null, view: 'page', navigate: null };
  let started = false;
  let timer = null;
  let route = '';
  let video = null;

  const text = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : '');
  const post = (message) => { try { chrome.webview.postMessage(message); } catch (_) {} };
  function recordError(id, error) {
    const message = text(error && error.message ? error.message : String(error), 300);
    errors.push({ id, message });
    while (errors.length > 20) errors.shift();
    try { console.warn('[plugin ' + id + ']', error); } catch (_) {}
  }
  // A plugin whose handlers keep throwing is switched off in this page, so it cannot spam errors or stall every tick.
  function strike(id, error) {
    recordError(id, error);
    const count = (strikes.get(id) || 0) + 1;
    strikes.set(id, count);
    if (count >= 20 && instances.get(id) && instances.get(id).state === 'running') {
      unload(id, 'failed');
      recordError(id, new Error('出错次数过多，已在当前页面停用'));
    }
  }
  function guard(id, fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (error) { strike(id, error); return undefined; }
    };
  }
  function emit(event, payload, only) {
    for (const entry of (listeners.get(event) || []).slice()) {
      if (only && entry.id !== only) continue;
      try { entry.handler(payload); } catch (error) { strike(entry.id || 'event:' + event, error); }
    }
  }
  function storageFor(id) {
    const prefix = 'bs-plugin:' + id + ':';
    const keyOf = (key) => (typeof key === 'string' && key.length > 0 && key.length <= 80 ? prefix + key : '');
    return {
      get(key) {
        const full = keyOf(key);
        if (!full) return null;
        try { const raw = localStorage.getItem(full); return raw === null ? null : JSON.parse(raw); } catch (_) { return null; }
      },
      set(key, value) {
        const full = keyOf(key);
        if (!full) return false;
        let raw;
        try { raw = JSON.stringify(value); } catch (_) { return false; }
        if (typeof raw !== 'string' || raw.length > 64 * 1024) return false;
        try { localStorage.setItem(full, raw); return true; } catch (_) { return false; }
      },
      remove(key) {
        const full = keyOf(key);
        if (!full) return false;
        try { localStorage.removeItem(full); return true; } catch (_) { return false; }
      }
    };
  }
  function styleNode(root, id, scope) {
    if (!root) return null;
    let node = root.querySelector('style[data-bs-plugin="' + id + '"][data-bs-scope="' + scope + '"]');
    if (!node) {
      node = document.createElement('style');
      node.setAttribute('data-bs-plugin', id);
      node.setAttribute('data-bs-scope', scope);
      (root.head || root).append(node);
    }
    return node;
  }
  // Settings a plugin declares are kept by the native host, so every page and the header see the same values.
  function settingsFor(id) {
    const schema = [];
    return {
      define(fields) {
        if (!Array.isArray(fields)) return;
        schema.length = 0;
        for (const field of fields.slice(0, 24)) {
          if (!field || typeof field.key !== 'string' || !/^[A-Za-z0-9_.-]{1,40}$/.test(field.key)) continue;
          const type = ['toggle', 'text', 'select', 'color', 'number'].includes(field.type) ? field.type : 'toggle';
          schema.push({ key: field.key, type, label: text(field.label || field.key, 60), hint: text(field.hint || '', 120), options: Array.isArray(field.options) ? field.options.slice(0, 24).map((o) => (o && typeof o === 'object' ? { value: String(o.value), label: text(String(o.label ?? o.value), 40) } : { value: String(o), label: text(String(o), 40) })) : [], min: Number(field.min), max: Number(field.max), default: field.default });
        }
        const instance = instances.get(id);
        if (instance) instance.schema = schema.slice();
      },
      get(key) {
        const values = data.get(id) || {};
        if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
        const field = schema.find((f) => f.key === key);
        return field ? field.default : undefined;
      },
      set(key, value) { return writeSetting(id, key, value); },
      all() {
        const out = {};
        for (const field of schema) out[field.key] = this.get(field.key);
        return Object.assign(out, data.get(id) || {});
      }
    };
  }
  // The client's interface root, only in the view that draws it (the header view, or the page where there is no header view).
  function uiShell() {
    const separateHeader = typeof RUNTIME !== 'undefined' && RUNTIME && RUNTIME.chromeHost;
    if (separateHeader && options.view !== 'header') return null;
    return options.getShadow ? options.getShadow() : null;
  }
  function safeMatches(element, selector) { try { return element.matches(selector); } catch (_) { return false; } }
  // Runs plugin code inside its error boundary.
  function guard(id, fn, args) { try { return fn.apply(null, args); } catch (error) { strike(id, error); } }
  // Registers something to undo when the plugin stops; returns a function that undoes it now.
  function ownCleanup(id, undo) {
    const list = cleanups.get(id) || [];
    if (list.length >= 200) { try { undo(); } catch (_) {} return function () {}; }
    let done = false;
    const once = function () {
      if (done) return; done = true;
      try { undo(); } catch (_) {}
      cleanups.set(id, (cleanups.get(id) || []).filter(function (item) { return item !== once; }));
    };
    list.push(once); cleanups.set(id, list); return once;
  }
  function writeSetting(id, key, value) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_.-]{1,40}$/.test(key)) return false;
    let raw;
    try { raw = JSON.stringify(value); } catch (_) { return false; }
    if (typeof raw !== 'string' || raw.length > 16 * 1024) return false;
    const values = { ...(data.get(id) || {}) };
    values[key] = JSON.parse(raw);
    data.set(id, values);
    post({ type: 'plugins', action: 'data', id, key, value: values[key] });
    emit('settings', values, id);
    return true;
  }
  function apiFor(def) {
    const id = def.id;
    const own = [];
    const on = function (event, handler) {
      if (typeof event !== 'string' || typeof handler !== 'function') return function () {};
      const list = listeners.get(event) || [];
      if (list.filter((entry) => entry.id === id).length >= 20) return function () {};
      const entry = { id, handler };
      list.push(entry); listeners.set(event, list); own.push([event, entry]);
      return function () { const now = listeners.get(event) || []; listeners.set(event, now.filter((item) => item !== entry)); };
    };
    const api = {
      id,
      version: typeof APP_INFO !== 'undefined' && APP_INFO.version ? APP_INFO.version : '',
      manifest: Object.freeze({ id, name: def.name, version: def.version || '', description: def.description || '' }),
      // 'header' inside the persistent header layer, 'page' inside a Bilibili page.
      view: options.view === 'header' ? 'header' : 'page',
      log: function () { try { console.log.apply(console, ['[plugin ' + id + ']'].concat([].slice.call(arguments))); } catch (_) {} },
      storage: storageFor(id),
      settings: settingsFor(id),
      // Page styles (the Bilibili document).
      css: function (css) {
        const node = styleNode(document, id, 'page');
        if (node) node.textContent = text(css, 128 * 1024);
        return node;
      },
      // Client styles: the header, menus, settings and every other part of the client's own interface.
      shellCss: function (css) {
        const node = styleNode(options.getShadow ? options.getShadow() : null, id, 'shell');
        if (node) node.textContent = text(css, 128 * 1024);
        return node;
      },
      // Theme variables for both the client (--accent, --bg, --ink, --muted, --field, …) and the page (--bs-*).
      theme: function (vars) {
        if (!vars || typeof vars !== 'object') return;
        const rules = [];
        for (const [name, value] of Object.entries(vars).slice(0, 64)) {
          if (!/^--[A-Za-z0-9_-]{1,60}$/.test(name) || typeof value !== 'string' || value.length > 200 || /[;{}<>]/.test(value)) continue;
          rules.push(name + ':' + value + '!important');
        }
        const body = rules.join(';');
        api.shellCss(':host{' + body + '}');
        const node = styleNode(document, id, 'theme');
        if (node) node.textContent = 'html:root{' + body + '}';
      },
      on,
      shell: function () { return options.getShadow ? options.getShadow() : null; },
      getVideo: function () { return options.getVideo ? options.getVideo() : null; },
      route: function () { return location.href; },
      prefs: function () { try { return Object.freeze({ ...(options.getPrefs ? options.getPrefs() : {}) }); } catch (_) { return {}; } },
      // Client preferences go through the same validation as the settings page.
      setPrefs: function (patch) { if (patch && typeof patch === 'object' && options.update) { try { options.update({ ...patch }); return true; } catch (error) { strike(id, error); } } return false; },
      toast: function (message) { if (options.toast) options.toast(text(String(message), 120)); },
      navigate: function (url) {
        let target;
        try { target = new URL(String(url), location.href); } catch (_) { return false; }
        if (!/^https?:$/.test(target.protocol)) return false;
        if (options.navigate) options.navigate(target.href); else location.href = target.href;
        return true;
      },
      // Read-only view of the client's page-side functions (the ones the native host calls).
      client: function () { const c = global.BiliSpace; return c && typeof c === 'object' ? Object.freeze({ ...c }) : {}; },
      /* Replaces one of those functions: `wrap('acceptConfig', (original, ...args) => original(...args))`. If the
         wrapper throws, the original runs instead; `api.unwrap(name)` or switching the plugin off restores it. */
      wrap: function (name, wrapper) {
        const client = global.BiliSpace;
        if (!client || typeof name !== 'string' || typeof client[name] !== 'function' || typeof wrapper !== 'function') return false;
        const chain = wrapped.get(name) || { original: client[name], layers: [] };
        chain.layers = chain.layers.filter((layer) => layer.id !== id).concat({ id, wrapper });
        wrapped.set(name, chain);
        rebuild(name);
        return true;
      },
      unwrap: function (name) { return unwrapFor(id, name); },
      // ---- Additions: everything below is undone automatically when the plugin is switched off. ----
      // Calls fn(element) for every element matching the selector now and whenever one appears later (page, or 'shell').
      watch: function (selector, fn, where) {
        if (typeof selector !== 'string' || typeof fn !== 'function') return function () {};
        const root = where === 'shell' ? (options.getShadow ? options.getShadow() : null) : document;
        if (!root) return function () {};
        const seen = new WeakSet();
        const visit = function (scope) {
          let found;
          try { found = scope.querySelectorAll ? [].slice.call(scope.querySelectorAll(selector)) : []; } catch (_) { return; }
          if (scope.nodeType === 1 && safeMatches(scope, selector)) found.unshift(scope);
          for (const element of found) { if (seen.has(element)) continue; seen.add(element); guard(id, fn, [element]); }
        };
        visit(root);
        let pending = [];
        const observer = new MutationObserver(function (records) {
          // Batched per frame: a busy page (danmaku, live chat) cannot make a plugin run on every single mutation.
          const first = !pending.length;
          for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) pending.push(node);
          if (first && pending.length) requestAnimationFrame(function () { const nodes = pending; pending = []; for (const node of nodes) if (node.isConnected) visit(node); });
        });
        observer.observe(root === document ? document.documentElement : root, { childList: true, subtree: true });
        return ownCleanup(id, function () { observer.disconnect(); });
      },
      // Keyboard shortcut such as 'Ctrl+Shift+K' or 'Alt+ArrowLeft'; ignored while typing in a field.
      hotkey: function (combo, fn) {
        if (typeof combo !== 'string' || typeof fn !== 'function') return function () {};
        const parts = combo.split('+').map(function (part) { return part.trim().toLowerCase(); });
        const key = parts.pop();
        return api.listen(document, 'keydown', function (event) {
          const path = event.composedPath ? event.composedPath() : [];
          if (path.some(function (el) { return el && el.nodeType === 1 && safeMatches(el, 'input,textarea,select,[contenteditable=true]'); })) return;
          if (String(event.key).toLowerCase() !== key && String(event.code).toLowerCase() !== key) return;
          if (event.ctrlKey !== parts.includes('ctrl') || event.shiftKey !== parts.includes('shift') || event.altKey !== parts.includes('alt') || event.metaKey !== parts.includes('meta')) return;
          event.preventDefault(); fn(event);
        }, true);
      },
      // addEventListener that is removed when the plugin stops.
      listen: function (target, type, fn, capture) {
        if (!target || typeof target.addEventListener !== 'function' || typeof type !== 'string' || typeof fn !== 'function') return function () {};
        const handler = function (event) { guard(id, fn, [event]); };
        target.addEventListener(type, handler, capture);
        return ownCleanup(id, function () { target.removeEventListener(type, handler, capture); });
      },
      // Timers that stop with the plugin (repeats at least 50 ms apart).
      every: function (ms, fn) {
        if (typeof fn !== 'function') return function () {};
        const handle = setInterval(function () { guard(id, fn, []); }, Math.max(50, Number(ms) || 0));
        return ownCleanup(id, function () { clearInterval(handle); });
      },
      after: function (ms, fn) {
        if (typeof fn !== 'function') return function () {};
        let cancel = function () {};
        const handle = setTimeout(function () { cancel(); guard(id, fn, []); }, Math.max(0, Number(ms) || 0));
        cancel = ownCleanup(id, function () { clearTimeout(handle); });
        return cancel;
      },
      // The kind of page: 'home', 'video', 'bangumi', 'live', 'dynamic', 'history', 'search', 'space' or 'other'.
      page: function () {
        const host = location.hostname, path = location.pathname.replace(/^\/(?:zh-Hans|zh-Hant|en)(?=\/|$)/, '') || '/';
        if (host === 'live.bilibili.com') return 'live';
        if (host === 't.bilibili.com') return 'dynamic';
        if (host === 'search.bilibili.com') return 'search';
        if (host === 'space.bilibili.com') return 'space';
        if (/^\/video\//.test(path)) return 'video';
        if (/^\/bangumi\/play\//.test(path)) return 'bangumi';
        if (/^\/(?:account\/)?history/.test(path)) return 'history';
        if (path === '/' && host === 'www.bilibili.com') return 'home';
        return 'other';
      },
      // The playing video, with safe controls (each returns false when there is no video or the value is invalid).
      player: Object.freeze({
        video: function () { return options.getVideo ? options.getVideo() : null; },
        play: function () { const v = api.getVideo(); if (!v) return false; try { const p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (_) {} return true; },
        pause: function () { const v = api.getVideo(); if (!v) return false; v.pause(); return true; },
        seek: function (seconds) { const v = api.getVideo(); const t = Number(seconds); if (!v || !isFinite(t)) return false; v.currentTime = Math.max(0, Math.min(t, isFinite(v.duration) ? v.duration : t)); return true; },
        rate: function (x) { const v = api.getVideo(); const r = Number(x); if (!v || !(r >= 0.1 && r <= 16)) return false; v.playbackRate = r; return true; },
        volume: function (x) { const v = api.getVideo(); const n = Number(x); if (!v || !(n >= 0 && n <= 1)) return false; v.volume = n; return true; },
        state: function () { const v = api.getVideo(); return v ? { time: v.currentTime, duration: v.duration, paused: v.paused, rate: v.playbackRate, volume: v.volume, muted: v.muted, width: v.videoWidth, height: v.videoHeight } : null; }
      }),
      // GET a Bilibili web API (https://api.bilibili.com/...) as the signed-in account; resolves to the parsed JSON.
      biliApi: function (path, query) {
        let target;
        try { target = new URL(String(path), 'https://api.bilibili.com/'); } catch (_) { return Promise.reject(new Error('bad address')); }
        if (target.origin !== 'https://api.bilibili.com') return Promise.reject(new Error('only https://api.bilibili.com is allowed'));
        if (query && typeof query === 'object') for (const [k, v] of Object.entries(query)) target.searchParams.set(k, String(v));
        return fetch(target.href, { credentials: 'include' }).then(function (response) { return response.json(); });
      },
      // ---- Controlling the client and adding to it ----
      // Messages between this plugin's copies in the header and in pages: api.send('seek', 30) here, and
      // api.on('message', m => m.name === 'seek' && ...) there. Data must be JSON (at most 64 KB).
      send: function (name, data) {
        if (typeof name !== 'string' || !name || name.length > 40) return false;
        let raw; try { raw = JSON.stringify(data === undefined ? null : data); } catch (_) { return false; }
        if (raw.length > 64 * 1024) return false;
        post({ type: 'plugins', action: 'message', id, name, view: api.view, data: JSON.parse(raw) });
        return true;
      },
      // The window and navigation, like the client's own buttons.
      window: Object.freeze({
        minimize: function () { post({ type: 'window', action: 'minimize' }); },
        maximize: function () { post({ type: 'window', action: 'maximize' }); },
        fullscreen: function () { post({ type: 'window', action: 'fullscreen' }); },
        pip: function () { post({ type: 'window', action: 'pip' }); },
        back: function () { post({ type: 'window', action: 'back' }); },
        forward: function () { post({ type: 'window', action: 'forward' }); },
        close: function () { post({ type: 'window', action: 'close' }); }
      }),
      // Additions to the client's own interface. They appear where the client UI is drawn: the header view (or the
      // page itself on platforms without a separate header); elsewhere they quietly do nothing.
      ui: Object.freeze({
        // A button in the header, next to the search box. Returns a function that removes it.
        button: function (spec) {
          const shell = uiShell(); if (!shell || !spec || typeof spec.onClick !== 'function') return function () {};
          const bar = shell.querySelector('.header-right'); if (!bar) return function () {};
          const b = document.createElement('button'); b.type = 'button'; b.className = 'bs-plugin-button'; b.dataset.bsPlugin = id;
          b.textContent = text(String(spec.text || spec.label || '★'), 24); b.title = text(String(spec.title || def.name || id), 80); b.setAttribute('aria-label', b.title);
          b.style.cssText = 'height:34px;min-width:34px;padding:0 10px;margin-right:8px;border:0;border-radius:10px;background:var(--field);color:var(--ink);font:inherit;font-size:13px;cursor:pointer;flex:none';
          b.addEventListener('click', function (event) { guard(id, spec.onClick, [event]); });
          const search = bar.querySelector('.search'); if (search && search.nextSibling) bar.insertBefore(b, search.nextSibling); else bar.append(b);
          return ownCleanup(id, function () { b.remove(); });
        },
        // A dialog over the client: { title, text, buttons: [{ label, primary, onClick }] }. Returns a function that closes it.
        dialog: function (spec) {
          const shell = uiShell(); if (!shell || !spec) return function () {};
          const layer = document.createElement('div'); layer.className = 'update-notice-layer'; layer.id = 'plugin-dialog'; layer.dataset.bsPlugin = id;
          const box = document.createElement('section'); box.className = 'update-notice'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
          const h = document.createElement('h2'); h.textContent = text(String(spec.title || def.name || id), 80);
          const p = document.createElement('p'); p.textContent = text(String(spec.text || ''), 2000); p.style.cssText = 'white-space:pre-wrap;line-height:1.7;color:var(--muted)';
          const actions = document.createElement('div'); actions.className = 'actions';
          let undo = function () {};
          const close = function () { undo(); };
          const buttons = Array.isArray(spec.buttons) && spec.buttons.length ? spec.buttons.slice(0, 4) : [{ label: '好', primary: true }];
          for (const item of buttons) {
            const b = document.createElement('button'); b.type = 'button'; b.className = item.primary ? 'update-primary' : 'link'; b.textContent = text(String(item.label || '好'), 20);
            b.addEventListener('click', function () { close(); if (typeof item.onClick === 'function') guard(id, item.onClick, []); });
            actions.append(b);
          }
          box.append(h, p, actions); layer.append(box);
          layer.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
          shell.append(layer); const primary = actions.querySelector('.update-primary') || actions.querySelector('button'); if (primary) primary.focus();
          undo = ownCleanup(id, function () { layer.remove(); });
          return close;
        },
        // Raw access to the client's interface root (same as api.shell()).
        root: function () { return uiShell(); }
      })
    };
    return { api: Object.freeze(api), own };
  }
  function rebuild(name) {
    const chain = wrapped.get(name);
    const client = global.BiliSpace;
    if (!chain || !client) return;
    let current = chain.original;
    for (const layer of chain.layers) {
      const inner = current;
      current = function () {
        const args = [].slice.call(arguments);
        try { return layer.wrapper.apply(this, [inner.bind(this)].concat(args)); } catch (error) { strike(layer.id, error); return inner.apply(this, args); }
      };
    }
    client[name] = current;
    if (!chain.layers.length) wrapped.delete(name);
  }
  function unwrapFor(id, name) {
    let changed = false;
    for (const [key, chain] of wrapped) {
      if (name && key !== name) continue;
      const before = chain.layers.length;
      chain.layers = chain.layers.filter((layer) => layer.id !== id);
      if (chain.layers.length !== before) { changed = true; rebuild(key); }
    }
    return changed;
  }

  function run(def) {
    if (instances.has(def.id) && instances.get(def.id).state === 'running') return;
    const { api, own } = apiFor(def);
    const instance = { id: def.id, state: 'running', own, schema: [] };
    instances.set(def.id, instance);
    try {
      const factory = new Function('api', def.code + '\n//# sourceURL=bs-plugin://' + def.id);
      factory(api);
    } catch (error) {
      unload(def.id, 'failed');
      recordError(def.id, error);
    }
  }
  // Undoes what the host can see: listeners, wrapped functions and the plugin's styles. A plugin that changed the page
  // in other ways can clean up in its 'destroy' handler, which runs first.
  function unload(id, state) {
    const instance = instances.get(id);
    if (instance && instance.state === 'running') emit('destroy', undefined, id);
    for (const [event, list] of listeners) listeners.set(event, list.filter((entry) => entry.id !== id));
    for (const undo of (cleanups.get(id) || []).slice()) undo();
    cleanups.delete(id);
    unwrapFor(id);
    for (const root of [document, options.getShadow ? options.getShadow() : null]) {
      if (!root) continue;
      for (const node of root.querySelectorAll('style[data-bs-plugin="' + id + '"]')) node.remove();
    }
    instances.set(id, { id, state: state || 'disabled', own: [], schema: instance ? instance.schema : [] });
  }
  // The per-second tick only runs while at least one plugin is running.
  function syncTick() {
    const running = [...instances.values()].some((i) => i.state === 'running');
    if (running && !timer && started) timer = setInterval(tick, 1000);
    else if (!running && timer) { clearInterval(timer); timer = null; }
  }
  function tick() {
    if (location.href !== route) { route = location.href; emit('route', route); }
    const now = options.getVideo ? options.getVideo() : null;
    if (now !== video) { video = now; emit('video', now); }
    emit('tick', Date.now());
  }
  function start(next) {
    options = { ...options, ...(next || {}) };
    started = true;
    route = location.href;
    video = options.getVideo ? options.getVideo() : null;
    for (const def of defs) if (def && typeof def.id === 'string' && typeof def.code === 'string' && !disabled.has(def.id)) run(def);
    syncTick();
    return snapshot();
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    emit('destroy');
  }
  // Called by the native host in every open view when a plugin is imported, removed or switched.
  function setEnabled(id, enabled, def) {
    if (def && typeof def === 'object' && def.id === id) {
      const index = defs.findIndex((item) => item.id === id);
      if (index >= 0) defs[index] = def; else defs.push(def);
      if (def.data && typeof def.data === 'object') data.set(id, { ...def.data });
    }
    if (enabled) {
      disabled.delete(id);
      const current = defs.find((item) => item.id === id);
      if (started && current && typeof current.code === 'string') run(current);
    } else {
      disabled.add(id);
      unload(id, 'disabled');
    }
    syncTick();
  }
  function remove(id) {
    setEnabled(id, false);
    const index = defs.findIndex((item) => item.id === id);
    if (index >= 0) defs.splice(index, 1);
    instances.delete(id);
  }
  // Relayed by the native host to every view: { from, name, view, data }.
  function deliver(message) {
    if (!message || typeof message.from !== 'string' || typeof message.name !== 'string') return;
    emit('message', Object.freeze({ name: message.name, data: message.data, view: message.view === 'header' ? 'header' : 'page' }), message.from);
  }
  function acceptData(id, values) {
    if (!values || typeof values !== 'object') return;
    data.set(id, { ...values });
    emit('settings', { ...values }, id);
  }
  function snapshot() {
    return {
      directory,
      errors: errors.slice(),
      loadErrors: loadErrors.slice(),
      plugins: defs.map((def) => ({
        id: def.id,
        name: def.name,
        version: def.version || '',
        description: def.description || '',
        enabled: !disabled.has(def.id),
        state: instances.get(def.id) ? instances.get(def.id).state : (disabled.has(def.id) ? 'disabled' : 'pending'),
        schema: instances.get(def.id) ? (instances.get(def.id).schema || []) : [],
        error: (errors.filter((e) => e.id === def.id).pop() || {}).message || ''
      }))
    };
  }
  function settingControl(plugin, field, ctx) {
    const row = document.createElement('div');
    row.className = 'row plugin-setting';
    const label = document.createElement('label');
    label.textContent = field.label;
    if (field.hint) { const sub = document.createElement('span'); sub.className = 'hint'; sub.textContent = field.hint; label.append(sub); }
    const values = data.get(plugin.id) || {};
    const value = Object.prototype.hasOwnProperty.call(values, field.key) ? values[field.key] : field.default;
    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      for (const option of field.options) { const o = document.createElement('option'); o.value = option.value; o.textContent = option.label; input.append(o); }
      input.value = value == null ? '' : String(value);
    } else {
      input = document.createElement('input');
      input.type = field.type === 'toggle' ? 'checkbox' : field.type === 'color' ? 'color' : field.type === 'number' ? 'number' : 'text';
      if (field.type === 'toggle') input.checked = !!value;
      else input.value = value == null ? '' : String(value);
      if (field.type === 'number') { if (Number.isFinite(field.min)) input.min = field.min; if (Number.isFinite(field.max)) input.max = field.max; }
    }
    const read = () => (field.type === 'toggle' ? input.checked : field.type === 'number' ? Number(input.value) : input.value);
    input.addEventListener('change', () => { writeSetting(plugin.id, field.key, read()); if (ctx.toast) ctx.toast('已保存'); });
    row.append(label, input);
    return row;
  }
  function renderPanel(node, context) {
    if (!node) return;
    const ctx = context || {};
    node.replaceChildren();
    const info = snapshot();
    const actions = document.createElement('div');
    actions.className = 'actions';
    const button = (label, action, primary) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = primary ? 'primary' : 'link'; b.textContent = label;
      b.addEventListener('click', () => post({ type: 'plugins', action }));
      return b;
    };
    actions.append(button('导入插件…', 'import', true), button('打开插件目录', 'folder'), button('重新加载页面', 'reload'));
    node.append(actions);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = info.directory ? '插件目录：' + info.directory : '插件目录不可用';
    node.append(hint);
    if (!info.plugins.length && !info.loadErrors.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '暂无插件。点“导入插件…”选择插件的 plugin.json 或单个 .js 文件。';
      node.append(empty);
    }
    for (const plugin of info.plugins) {
      const card = document.createElement('div');
      card.className = 'plugin-card';
      card.setAttribute('data-plugin', plugin.id);
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('label');
      label.textContent = plugin.name + (plugin.version ? ' v' + plugin.version : '');
      if (plugin.description) {
        const sub = document.createElement('span');
        sub.className = 'hint';
        sub.textContent = plugin.description;
        label.append(sub);
      }
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = plugin.enabled;
      toggle.setAttribute('data-plugin-toggle', plugin.id);
      toggle.setAttribute('aria-label', '启用 ' + plugin.name);
      toggle.addEventListener('change', () => {
        const next = defs.filter((def) => {
          const box = node.querySelector('[data-plugin-toggle="' + def.id + '"]');
          return box ? !box.checked : disabled.has(def.id);
        }).map((def) => def.id);
        if (ctx.update) ctx.update({ pluginsDisabled: next });
        post({ type: 'plugins', action: 'toggle', id: plugin.id, enabled: toggle.checked });
        if (ctx.toast) ctx.toast(toggle.checked ? '插件已启用' : '插件已停用');
      });
      row.append(label, toggle);
      card.append(row);
      if (plugin.enabled) for (const field of plugin.schema) card.append(settingControl(plugin, field, ctx));
      if (plugin.state === 'failed' || plugin.error) {
        const failed = document.createElement('p');
        failed.className = 'hint plugin-error';
        failed.textContent = (plugin.state === 'failed' ? '加载失败：' : '最近的错误：') + (plugin.error || '详情见开发者工具控制台');
        card.append(failed);
      }
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'link danger'; remove.textContent = '删除插件';
      remove.addEventListener('click', () => {
        if (remove.dataset.confirm !== 'true') { remove.dataset.confirm = 'true'; remove.textContent = '再点一次确认删除'; setTimeout(() => { if (remove.isConnected) { delete remove.dataset.confirm; remove.textContent = '删除插件'; } }, 3000); return; }
        post({ type: 'plugins', action: 'remove', id: plugin.id });
      });
      const footer = document.createElement('div');
      footer.className = 'actions';
      footer.append(remove);
      card.append(footer);
      node.append(card);
    }
    for (const error of info.loadErrors) {
      const line = document.createElement('p');
      line.className = 'hint';
      line.textContent = '跳过 ' + error.folder + '：' + error.message;
      node.append(line);
    }
  }
  global.BiliSpacePlugins = { start, stop, snapshot, renderPanel, emit, setEnabled, remove, acceptData, deliver, get(id) { const i = instances.get(id); return i ? { id: i.id, state: i.state } : null; }, get errors() { return errors.slice(); } };
})(window);
