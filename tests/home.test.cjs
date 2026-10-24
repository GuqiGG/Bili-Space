const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {app}=require('./ui-harness.cjs');
const html=fs.readFileSync('tests/fixtures/home-nested.html','utf8');
test('homepage keeps the original seasonal banner and adds a second, independent centered brand',()=>{
 const a=app({html,config:{showChannels:false}}),d=a.w.document,s=d.querySelector('#bili-space-root').shadowRoot;
 assert.equal(a.w.getComputedStyle(d.querySelector('.bili-header__banner')).display,'block');
 assert.equal(a.w.getComputedStyle(d.querySelector('.bili-header__bar')).display,'none');
 assert.equal(d.querySelector('.bs-banner-brand').textContent,'bili space');
 a.w.BiliSpace.update({headerBrand:false});assert.equal(s.querySelector('.brand').hidden,true);assert(d.querySelector('.bs-banner-brand'));
 a.w.BiliSpace.syncRoute();assert.equal(d.querySelectorAll('.bs-banner-brand').length,1);a.close();
});
test('nested recommendation, live rail and following feed are layout-flattened without moving site nodes',async()=>{
 const a=app({html}),d=a.w.document,container=d.querySelector('.container'),rail=d.querySelector('.floor-aside');
 container.insertAdjacentHTML('beforeend','<div class="feed-card" id="ordinary"><div class="bili-video-card"><a href="/video/fixture">正常推荐</a></div></div><div class="feed-card" id="nested-ad"><div class="bili-video-card"><span data-ad-label>广告</span></div></div>');
 rail.innerHTML='<div class="floor-single-card" id="live">正常直播</div>';
 const card=d.querySelector('#ordinary'),parent=card.parentNode;let clicked=false;card.addEventListener('click',()=>clicked=true);
 await new Promise(r=>setTimeout(r,260));
 assert.equal(d.querySelector('.feed2').dataset.bsFeed,'grid');
 for(const el of [container,rail,d.querySelector('.recommended-container_floor-aside')])assert.equal(el.dataset.bsFeed,'wrapper');
 assert.equal(card.dataset.bsFeed,'card');assert.equal(card.querySelector('.bili-video-card').dataset.bsFeed,undefined);
 assert.equal(d.querySelector('#nested-ad').dataset.bsAd,'true');assert.equal(d.querySelector('#live').dataset.bsAd,undefined);
 assert.equal(card.parentNode,parent);card.click();assert(clicked);
 const sentinel=d.querySelector('.load-more-anchor');sentinel.innerHTML='<div class="bili-video-card">加载占位</div>';
 a.w.BiliSpace.syncRoute();assert.equal(sentinel.dataset.bsFeed,'sentinel');assert.equal(sentinel.firstElementChild.dataset.bsFeed,undefined);
 assert.equal(a.w.getComputedStyle(sentinel).display,'block');assert.equal(a.w.getComputedStyle(sentinel).height,'1px');
 a.w.BiliSpace.update({hideAds:false});assert.equal(d.documentElement.dataset.bsAds,'false');assert(d.querySelector('#nested-ad').isConnected);a.close();
});
test('category trigger replaces native Back and supports click, keyboard, Escape and existing settings',()=>{
 const a=app({html}),s=a.w.document.querySelector('#bili-space-root').shadowRoot,t=s.querySelector('.back'),links=s.querySelector('#header-categories');
 assert.equal(t.dataset.window,undefined);assert.equal(t.getAttribute('aria-expanded'),'false');assert(links.inert);
 t.click();assert.equal(t.getAttribute('aria-expanded'),'true');assert.equal(links.inert,false);
 assert.equal([...links.querySelectorAll('a')].find(e=>e.textContent==='漫画').href,'https://manga.bilibili.com/');
 assert(!a.messages.some(m=>m.type==='window'&&m.action==='back'));
 t.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(s.activeElement,links.querySelector('a'));
 links.querySelector('a').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(t.getAttribute('aria-expanded'),'false');assert.equal(s.activeElement,t);
 t.click();a.w.BiliSpace.update({headerBack:false});assert.equal(t.hidden,true);assert(links.inert);assert.equal(t.getAttribute('aria-expanded'),'false');a.close();
});
