const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function host(plugins, { disabled = [], errors = [], version = '0.1.45' } = {}) {
  const dom = new JSDOM('<main id="panel"></main>', { url: 'https://www.bilibili.com/video/BV1cjHK6GEJE', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const boot = `const APP_INFO=${JSON.stringify({ name: 'Bili-Space', version })};const INITIAL=${JSON.stringify({ pluginsDisabled: disabled })};const PLUGINS=${JSON.stringify({ plugins, errors, directory: 'C:/plugins' })};\n`;
  w.eval(boot + fs.readFileSync('assets/plugins.js', 'utf8'));
  return { w, api: w.BiliSpacePlugins, close() { w.close(); } };
}

test('an enabled plugin receives the bounded api, can style, store and listen', () => {
  const a = host([{ id: 'demo', name: 'Demo', version: '1.0.0', code: "api.css('.demo{color:red}');api.storage.set('k',{a:1});api.on('tick',()=>{window.__ticks=(window.__ticks||0)+1;});window.__api={id:api.id,hasChrome:'chrome' in api,hasNative:typeof api.native};" }]);
  try {
    a.api.start({});
    assert.equal(a.api.get('demo').state, 'running');
    assert.equal(a.w.__api.id, 'demo');
    assert.equal(a.w.__api.hasChrome, false);
    assert.equal(a.w.__api.hasNative, 'undefined');
    assert.equal(a.w.document.querySelector('style[data-bs-plugin="demo"]').textContent, '.demo{color:red}');
    assert.deepEqual(a.w.localStorage.getItem('bs-plugin:demo:k'), '{"a":1}');
    a.api.emit('tick', 1);
    a.api.emit('tick', 2);
    assert.equal(a.w.__ticks, 2);
  } finally { a.close(); }
});

test('disabled plugins never execute', () => {
  const a = host([{ id: 'off', name: 'Off', code: 'window.__ran=true;' }], { disabled: ['off'] });
  try {
    a.api.start({});
    assert.equal(a.w.__ran, undefined);
    assert.equal(a.api.snapshot().plugins[0].enabled, false);
    assert.equal(a.api.snapshot().plugins[0].state, 'disabled');
  } finally { a.close(); }
});

test('a throwing plugin is isolated and reported without stopping the next one', () => {
  const a = host([
    { id: 'bad', name: 'Bad', code: 'throw new Error("boom");' },
    { id: 'good', name: 'Good', code: 'window.__good=true;' }
  ]);
  try {
    a.api.start({});
    assert.equal(a.w.__good, true);
    assert.equal(a.api.get('bad').state, 'failed');
    assert.equal(a.api.get('good').state, 'running');
    assert.equal(a.api.errors[0].id, 'bad');
  } finally { a.close(); }
});

test('plugin storage is namespaced, bounded and rejects bad keys', () => {
  const a = host([{ id: 'store', name: 'Store', code: "api.storage.set('ok',1);window.__big=api.storage.set('big','x'.repeat(70000));window.__bad=api.storage.set('',1);window.__null=api.storage.get(null);" }]);
  try {
    a.api.start({});
    assert.equal(a.w.__big, false);
    assert.equal(a.w.__bad, false);
    assert.equal(a.w.__null, null);
    assert.equal(a.w.localStorage.getItem('bs-plugin:store:ok'), '1');
    assert.equal(a.w.localStorage.length, 1);
  } finally { a.close(); }
});

test('the settings panel lists plugins and toggling writes pluginsDisabled', () => {
  const a = host([
    { id: 'one', name: 'One', version: '1.0.0', description: 'first' },
    { id: 'two', name: 'Two', version: '2.0.0' }
  ]);
  try {
    a.api.start({});
    const node = a.w.document.querySelector('#panel');
    let saved = null;
    a.api.renderPanel(node, { update: (patch) => { saved = patch; }, toast: () => {} });
    assert.match(node.textContent, /One v1\.0\.0/);
    assert.match(node.textContent, /插件目录：C:\/plugins/);
    const boxes = [...node.querySelectorAll('[data-plugin-toggle]')];
    assert.equal(boxes.length, 2);
    boxes[0].checked = false;
    boxes[0].dispatchEvent(new a.w.Event('change'));
    assert.deepEqual([...saved.pluginsDisabled], ['one']);
  } finally { a.close(); }
});
