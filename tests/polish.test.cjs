const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {app}=require('./ui-harness.cjs'),html=fs.readFileSync('tests/fixtures/client-polish.html','utf8');
test('promotion containing video markup stays hidden and is never converted to display contents',()=>{
 const a=app({html}),d=a.w.document,ad=d.querySelector('.recommended-swipe');
 assert.equal(a.w.getComputedStyle(ad).display,'none');assert.equal(ad.dataset.bsFeed,undefined);
 a.w.BiliSpace.syncRoute();assert.equal(ad.dataset.bsFeed,undefined);
 a.w.BiliSpace.update({hideAds:false});assert.notEqual(a.w.getComputedStyle(ad).display,'none');assert(ad.isConnected);a.close();
});
test('message dark theme covers the background, translucent sidebar RGB tokens and header reserve',()=>{
 const a=app({html,url:'https://message.bilibili.com/#/whisper'}),d=a.w.document;
 assert.equal(a.w.getComputedStyle(d.querySelector('.message-bgc')).backgroundColor,'rgb(22, 22, 24)');
 assert.equal(a.w.getComputedStyle(d.querySelector('.message-bg')).backgroundImage,'none');
 assert.equal(a.w.getComputedStyle(d.querySelector('.message-aside')).backgroundColor,'rgb(32, 32, 35)');
 assert.equal(a.w.getComputedStyle(d.documentElement).getPropertyValue('--bg1_rgb').trim(),'22,22,24');
 assert(d.documentElement.classList.contains('bili_dark'));
 a.w.BiliSpace.update({theme:'light'});assert(!d.documentElement.classList.contains('bili_dark'));assert.equal(a.w.getComputedStyle(d.querySelector('.message-bgc')).backgroundColor,'rgb(214, 235, 234)');a.close();
});
test('category disclosure is click-only, replaces primary navigation and restores its saved visibility',async()=>{
 const a=app({html}),s=a.w.document.querySelector('#bili-space-root').shadowRoot,t=s.querySelector('.back'),nav=s.querySelector('nav');
 const e=new a.w.Event('pointerenter');Object.defineProperty(e,'pointerType',{value:'mouse'});t.dispatchEvent(e);
 await new Promise(r=>setTimeout(r,380));assert.equal(t.getAttribute('aria-expanded'),'false');
 t.click();assert.equal(nav.hidden,true);assert.equal(nav.inert,true);
 assert.match(s.querySelector('style').textContent,/\.category-links a\{[^}]*font-size:15px/);
 t.dispatchEvent(new a.w.Event('pointerleave'));await new Promise(r=>setTimeout(r,500));assert.equal(t.getAttribute('aria-expanded'),'true');
 a.w.BiliSpace.update({headerDynamic:false});assert.equal(nav.hidden,true);
 t.click();assert.equal(nav.hidden,false);assert.equal(s.querySelector('[data-route=dynamic]').hidden,true);a.close();
});
test('native banner layers and handlers are preserved; center text does not intercept the pointer',()=>{
 const a=app({html}),d=a.w.document,b=d.querySelector('.bili-header__banner'),layer=b.querySelector('.animated-banner .layer');let moved=0;b.addEventListener('pointermove',()=>moved++);
 a.w.BiliSpace.syncRoute();assert.equal(layer,b.querySelector('.animated-banner .layer'));assert.equal(b.dataset.bsMotion,'native');
 b.dispatchEvent(new a.w.Event('pointermove'));assert.equal(moved,1);assert.equal(a.w.getComputedStyle(b.querySelector('.bs-banner-brand')).pointerEvents,'none');a.close();
});
test('homepage prefetch uses the existing loader and respects Save-Data instead of issuing duplicate API requests',()=>{
 const a=app({html}),d=a.w.document,grid=d.querySelector('[data-bs-feed=grid]');assert.equal(grid.dataset.bsPrefetch,'true');
 Object.defineProperty(a.w.navigator,'connection',{value:{saveData:true},configurable:true});a.w.BiliSpace.syncRoute();assert.equal(grid.dataset.bsPrefetch,'false');a.close();
});
test('layout-only changes wake a scroll-based site loader without scrolling the viewport; Save-Data disables the wake',async()=>{
 const a=app({html}),anchor=a.w.document.querySelector('.load-more-anchor');let events=0;
 anchor.getBoundingClientRect=()=>({height:1,bottom:200});a.w.addEventListener('scroll',()=>events++);
 Object.defineProperty(a.w.navigator,'connection',{value:{saveData:true},configurable:true});a.w.BiliSpace.syncRoute();
 await new Promise(r=>setTimeout(r,540));assert.equal(events,0);
 a.w.navigator.connection.saveData=false;a.w.BiliSpace.syncRoute();await new Promise(r=>setTimeout(r,540));
 assert.equal(events,1);assert.equal(a.w.scrollY,0);assert.equal(anchor.closest('[data-bs-feed=grid]').dataset.bsPrefetchWakes,'1');a.close();
});
