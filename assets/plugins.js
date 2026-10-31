/* Local plugin host. Plugins are trusted local JS files: they get a bounded API,
   run in the page context and never receive a native bridge from this host. */
(function (global) {
  'use strict';
  if (global.BiliSpacePlugins) return;
  const source = (typeof PLUGINS !== 'undefined' && PLUGINS) || {};
  const defs = Array.isArray(source.plugins) ? source.plugins : [];
  const loadErrors = Array.isArray(source.errors) ? source.errors : [];
  const directory = typeof source.directory === 'string' ? source.directory : '';
  const disabled = new Set(Array.isArray(INITIAL && INITIAL.pluginsDisabled) ? INITIAL.pluginsDisabled : []);
  const listeners = new Map();
  const instances = new Map();
  const errors = [];
  let options = { getVideo: () => document.querySelector('video'), getPrefs: () => ({}), toast: () => {} };
  let timer = null;
  let route = '';
  let video = null;

  const text = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : '');
  function recordError(id, error) {
    const message = text(error && error.message ? error.message : String(error), 300);
    errors.push({ id, message });
    while (errors.length > 20) errors.shift();
    try { console.warn('[plugin ' + id + ']', error); } catch (_) {}
  }
  function emit(event, payload) {
    for (const handler of listeners.get(event) || []) {
      try { handler(payload); } catch (error) { recordError('event:' + event, error); }
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
  function apiFor(def) {
    const id = def.id;
    return Object.freeze({
      id,
      version: typeof APP_INFO !== 'undefined' && APP_INFO.version ? APP_INFO.version : '',
      manifest: Object.freeze({ id, name: def.name, version: def.version || '', description: def.description || '' }),
      log: function () { try { console.log.apply(console, ['[plugin ' + id + ']'].concat([].slice.call(arguments))); } catch (_) {} },
      storage: storageFor(id),
      css: function (css) {
        const value = text(css, 64 * 1024);
        let node = document.querySelector('style[data-bs-plugin="' + id + '"]');
        if (!node) { node = document.createElement('style'); node.setAttribute('data-bs-plugin', id); document.head.append(node); }
        node.textContent = value;
        return node;
      },
      on: function (event, handler) {
        if (typeof event !== 'string' || typeof handler !== 'function') return function () {};
        const list = listeners.get(event) || [];
        if (list.length >= 20) return function () {};
        list.push(handler); listeners.set(event, list);
        return function () { const now = listeners.get(event) || []; listeners.set(event, now.filter((item) => item !== handler)); };
      },
      getVideo: function () { return options.getVideo ? options.getVideo() : null; },
      route: function () { return location.href; },
      prefs: function () { try { return Object.freeze({ ...(options.getPrefs ? options.getPrefs() : {}) }); } catch (_) { return {}; } }
    });
  }

  function run(def) {
    if (instances.has(def.id)) return;
    const api = apiFor(def);
    try {
      const factory = new Function('api', def.code + '\n//# sourceURL=bs-plugin://' + def.id);
      factory(api);
      instances.set(def.id, { id: def.id, state: 'running' });
    } catch (error) {
      instances.set(def.id, { id: def.id, state: 'failed' });
      recordError(def.id, error);
    }
  }
  function tick() {
    if (location.href !== route) { route = location.href; emit('route', route); }
    const now = options.getVideo ? options.getVideo() : null;
    if (now !== video) { video = now; emit('video', now); }
    emit('tick', Date.now());
  }
  function start(next) {
    options = { ...options, ...(next || {}) };
    route = location.href;
    video = options.getVideo ? options.getVideo() : null;
    for (const def of defs) if (def && typeof def.id === 'string' && typeof def.code === 'string' && !disabled.has(def.id)) run(def);
    if (!timer) timer = setInterval(tick, 1000);
    return snapshot();
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    emit('destroy');
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
        state: instances.get(def.id) ? instances.get(def.id).state : (disabled.has(def.id) ? 'disabled' : 'pending')
      }))
    };
  }
  function renderPanel(node, context) {
    if (!node) return;
    const ctx = context || {};
    node.replaceChildren();
    const info = snapshot();
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = info.directory ? '插件目录：' + info.directory : '插件目录不可用';
    node.append(hint);
    if (!info.plugins.length && !info.loadErrors.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '暂无插件。把插件文件夹放进插件目录后点“重新加载页面”。';
      node.append(empty);
    }
    for (const plugin of info.plugins) {
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
      toggle.addEventListener('change', () => {
        const next = defs.filter((def) => {
          const box = node.querySelector('[data-plugin-toggle="' + def.id + '"]');
          return box && !box.checked;
        }).map((def) => def.id);
        if (ctx.update) ctx.update({ pluginsDisabled: next });
        if (ctx.toast) ctx.toast('插件开关已保存，刷新页面后生效');
      });
      row.append(label, toggle);
      node.append(row);
      if (plugin.state === 'failed') {
        const failed = document.createElement('p');
        failed.className = 'hint';
        failed.textContent = '加载失败，详情见开发者工具控制台';
        node.append(failed);
      }
    }
    for (const error of info.loadErrors) {
      const line = document.createElement('p');
      line.className = 'hint';
      line.textContent = '跳过 ' + error.folder + '：' + error.message;
      node.append(line);
    }
    const actions = document.createElement('div');
    actions.className = 'actions';
    const folder = document.createElement('button');
    folder.type = 'button'; folder.className = 'link'; folder.textContent = '打开插件目录';
    folder.addEventListener('click', () => { try { chrome.webview.postMessage({ type: 'plugins', action: 'folder' }); } catch (_) {} });
    const reload = document.createElement('button');
    reload.type = 'button'; reload.className = 'link'; reload.textContent = '重新加载页面';
    reload.addEventListener('click', () => { try { chrome.webview.postMessage({ type: 'plugins', action: 'reload' }); } catch (_) {} });
    actions.append(folder, reload);
    node.append(actions);
  }
  global.BiliSpacePlugins = { start, stop, snapshot, renderPanel, emit, get(id) { return instances.get(id) || null; }, get errors() { return errors.slice(); } };
})(window);
