const test=require('node:test'),assert=require('node:assert/strict'),{app}=require('./ui-harness.cjs');

test('the current nav item carries a refresh icon and label without changing its text',()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,home=s.querySelector('.primary-nav a[data-route=home]'),dynamic=s.querySelector('.primary-nav a[data-route=dynamic]');
  assert.equal(home.textContent,'首页');assert(home.querySelector('.route-text'));assert(home.querySelector('svg.route-refresh'));
  assert.equal(home.getAttribute('aria-current'),'page');assert.equal(home.getAttribute('aria-label'),'刷新首页');assert.equal(dynamic.getAttribute('aria-label'),null);
  const css=s.querySelector('style').textContent;assert.match(css,/@media\(hover:hover\)\{\.header-left:not\(\[data-settling\]\) \.primary-nav a\[aria-current=page\]:hover \.route-text\{opacity:0/);
 }finally{a.close();}
});

test('a restored brand state that already matches keeps the logo visible',()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,slot=s.querySelector('.brand-slot'),label=s.querySelector('.brand-label');
  slot.hidden=true;label.hidden=true;a.w.BiliSpace.update({headerBrand:true});assert.equal(slot.hidden,false);assert.equal(label.hidden,false);
 }finally{a.close();}
});

test('header motion decided before the page is revealed waits on its first frame, never longer than 1.2s',()=>{
 const fs=require('node:fs'),js=fs.readFileSync('assets/enhance.js','utf8');
 assert.match(js,/function holdForReveal\(m\)\{if\(typeof RUNTIME!=='undefined'&&!headerSurfaceReady&&m\?\.pause\)\{m\.pause\(\);revealMotion\.push\(m\);/);
 assert.match(js,/revealFallback=setTimeout\(releaseHeldMotion,1200\)/);assert.match(js,/function releaseHeldMotion\(\)\{if\(document\.visibilityState==='hidden'\)/);
 assert.match(js,/const held=revealMotion\.splice\(0\);held\.forEach\(m=>\{try\{m\.play\(\);\}catch\{\}\}\);/);
 assert(js.includes('headerFlipMotion.push(holdForReveal('));
});

test('the header moves to the destination as soon as navigation starts and records it for the next page',()=>{
 const a=app({reduceMotion:false});try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,motions=[];
  a.w.Element.prototype.animate=function(frames,options){const m={target:this,frames,options,onfinish:null,cancel(){}};motions.push(m);return m;};
  a.w.Element.prototype.getBoundingClientRect=function(){return {left:10,top:0,right:50,bottom:32,width:40,height:32};};
  assert.equal(s.querySelector('.brand-slot').hidden,false);
  a.w.BiliSpace.beginNavigation('https://www.bilibili.com/history');
  assert.equal(s.querySelector('.brand-slot').hidden,true);
  assert.equal(s.querySelector('[data-route=history]').getAttribute('aria-current'),'page');
  assert.equal(s.querySelector('[data-route=home]').getAttribute('aria-current'),null);
  assert(a.messages.some(m=>m.type==='navigation-state'&&m.action==='route'&&m.route==='history'));
  assert(a.messages.some(m=>m.type==='header-brand'&&m.action==='write'&&m.shown===false));
  assert.equal(a.w.document.documentElement.dataset.bsPage,'home');
 }finally{a.close();}
});

test('refresh stays hidden for 1.5s after the header moves or a page loads',async()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,left=s.querySelector('.header-left');
  assert.equal(left.dataset.settling,'true');
  a.w.BiliSpace.beginNavigation('https://www.bilibili.com/history');assert.equal(left.dataset.settling,'true');
  assert.match(require('node:fs').readFileSync('assets/enhance.js','utf8'),/function settleHeader\(ms=1500\)/);
 }finally{a.close();}
});
