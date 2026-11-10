const test=require('node:test'),assert=require('node:assert/strict');
const {app}=require('./ui-harness.cjs');
test('back invokes native history and personalization combines header and progress controls',()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot;
 a.w.__bsAcceptNavigationState({back:true,forward:false,visible:0});s.querySelector('.history-back').click();assert(a.messages.some(m=>m.type==='window'&&m.action==='back'));
 a.w.BiliSpace.openSettings();assert(!s.querySelector('[data-tab=header]'));assert(!s.querySelector('[data-tab=progress]'));
 for(const key of ['headerUpload','logoAutoHide','feedColumns','progressHeight'])assert(s.querySelector(`[data-pref=${key}]`),key);
 assert.equal(s.querySelector('.upload').parentNode,s);
 a.w.BiliSpace.update({headerUpload:false,feedColumns:6});assert(s.querySelector('.upload').hidden);
 assert.match(a.w.document.getElementById('bs-ui-scale').textContent,/--bs-feed-columns:6}/);
 a.w.BiliSpace.update({feedColumns:0});assert.equal(a.w.document.documentElement.style.getPropertyValue('--bs-feed-columns'),'');
 }finally{a.close();}
});
test('logo hides outside home by default and the preference restores it',()=>{
 const a=app({url:'https://search.bilibili.com/all?keyword=test'});try{
 const s=a.w.document.querySelector('#bili-space-root').shadowRoot;assert(s.querySelector('.brand-label').hidden);
 a.w.BiliSpace.update({logoAutoHide:false});assert.equal(s.querySelector('.brand-label').hidden,false);
 assert.equal(a.w.BiliCommunity44.instance.o.disableDanmaku,true);
 }finally{a.close();}
});
test('reused search cards discard stale advertising markers',async()=>{
 const a=app({url:'https://search.bilibili.com/all?keyword=test',html:'<body><div class="bili-video-card" data-bs-ad="true"><span class="bili-video-card__stats--text">广告</span></div></body>'});try{
 const card=a.w.document.querySelector('.bili-video-card');assert.equal(card.dataset.bsAd,'true');
 await new Promise(r=>setTimeout(r,250));
 card.querySelector('span').firstChild.data='123 次播放';
 await new Promise(r=>setTimeout(r,300));assert.equal(card.dataset.bsAd,undefined);
 }finally{a.close();}
});
