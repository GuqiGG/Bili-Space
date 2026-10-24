const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {app}=require('./ui-harness.cjs');
test('requested message SVG and square maximize glyph appear in the centered-title header',()=>{
 const a=app(),s=a.w.document.querySelector('#bili-space-root').shadowRoot;
 assert(s.querySelector('.light.max rect'));assert(s.querySelector('.messages .lucide-message-square-more'));
 const parser=new a.w.DOMParser(),expected=parser.parseFromString(fs.readFileSync('assets/message-square-more.svg','utf8'),'image/svg+xml');
 assert.deepEqual([...s.querySelectorAll('.messages svg path')].map(x=>x.getAttribute('d')),[...expected.querySelectorAll('path')].map(x=>x.getAttribute('d')));
 assert.equal(s.querySelector('.brand').textContent,'bili space');assert(s.querySelector('.header-left nav [data-route=home]'));a.close();
});
test('header settings individually hide all eight optional items without hiding window controls',()=>{
 const a=app(),s=a.w.document.querySelector('#bili-space-root').shadowRoot;
 s.querySelector('[data-tab=header]').click();
 const keys=['headerHome','headerDynamic','headerHistory','headerBrand','headerSearch','headerMessages','headerAccount','headerBack'];
 for(const key of keys)assert(s.querySelector(`[data-pref=${key}]`));
 a.w.BiliSpace.update(Object.fromEntries(keys.map(key=>[key,false])));
 for(const selector of ['nav','.brand','.search','.messages','.account','.back'])assert.equal(s.querySelector(selector).hidden,true,selector);
 assert.equal(s.querySelectorAll('.lights button').length,3);assert.equal(s.querySelector('.lights').hidden,false);
 s.querySelector('#header-reset').click();for(const key of keys)assert.equal(a.w.BiliSpace.state.prefs[key],true,key);a.close();
});
test('video webpage has an independent homepage anchor, even with the top Home item disabled',()=>{
 const a=app({url:'https://www.bilibili.com/zh-Hans/video/BVfixture',html:'<div class="left-container"><h1>标题</h1><div id="bilibili-player"></div></div>'}),d=a.w.document;
 a.w.BiliSpace.update({headerHome:false});const link=d.querySelector('#bili-space-video-home');
 assert(link);assert.equal(link.href,'https://www.bilibili.com/');assert.equal(link.hidden,false);assert.equal(link.parentElement.className,'left-container');
 a.w.BiliSpace.syncRoute();assert.equal(d.querySelectorAll('#bili-space-video-home').length,1);a.close();
});
