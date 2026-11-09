const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('proxy status (node names and messages from a subscription) is escaped before it becomes settings markup', () => {
  const source = fs.readFileSync('assets/enhance.js', 'utf8');
  assert.match(source, /id="proxy-status">\$\{escapeHtml\(proxyLine\(\)\)\}</);
  const escapeHtml = eval(source.match(/const escapeHtml=(value=>[^\n]+\);)/)[1].replace(/;$/, ''));
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml("节点 'A' & B"), '节点 &#39;A&#39; &amp; B');
});
