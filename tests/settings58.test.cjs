const test=require('node:test'),assert=require('node:assert/strict'),{app}=require('./ui-harness.cjs');
const search=(a,s,text)=>{const q=s.querySelector('#settings-query');q.value=text;q.dispatchEvent(new a.w.Event('input',{bubbles:true}));return [...s.querySelectorAll('.settings-match span')].map(n=>n.textContent);};
test('settings search finds related words and typed-in-order fragments, exact hits first',()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot;a.w.BiliSpace.openSettings();
  assert(search(a,s,'毛玻璃').some(t=>t.includes('磨砂')));
  assert(search(a,s,'小窗').some(t=>t.includes('画中画')));
  assert(search(a,s,'进条').some(t=>t.includes('进度条')));
  assert(search(a,s,'q弹').some(t=>t.includes('弹性按钮')));
  const rows=search(a,s,'每行');assert(rows[0].includes('每行'));
  assert.match(s.querySelector('#settings-search-status').textContent,/找到/);
 }finally{a.close();}
});
test('the feed setting is a per-row count and the bouncy-button experiment exists',()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot;a.w.BiliSpace.openSettings();
  const all=[...s.querySelectorAll('[data-tab]')];for(const t of all){t.click();if(s.querySelector('[data-pref=feedColumns]'))break;}
  const select=s.querySelector('[data-pref=feedColumns]');assert(select);assert.match(select.closest('.row').textContent,/每行视频数/);assert.match(select.textContent,/4 个/);assert.doesNotMatch(select.textContent,/至少/);
  a.w.BiliSpace.update({experimentalBounce:true});assert.equal(s.host.dataset.bounce,'true');
 }finally{a.close();}
});
