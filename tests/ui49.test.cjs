const test=require('node:test'),assert=require('node:assert/strict');
const {app}=require('./ui-harness.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('typing hides history; clearing restores it; official fallback handles wrapped responses',async()=>{
 const a=app({officialHistory:[{value:'历史猫'}]});try{
 const s=a.w.document.querySelector('#bili-space-root').shadowRoot,input=s.querySelector('.search input'),panel=s.querySelector('#search-panel');
 a.w.fetch=async url=>{if(String(url).startsWith('https://api.bilibili.com/x/web-interface/suggest?'))throw Error('unavailable');return {ok:true,json:async()=>({code:0,data:{result:{tag:[{value:'官方建议'}]}}})};};
 input.focus();await wait(20);assert.match(panel.textContent,/历史猫/);
 input.value='a';input.dispatchEvent(new a.w.Event('input'));assert.doesNotMatch(panel.textContent,/历史猫|搜索历史/);
 await wait(230);assert.match(panel.textContent,/官方建议/);
 input.value='';input.dispatchEvent(new a.w.Event('input'));assert.match(panel.textContent,/历史猫/);assert.doesNotMatch(panel.textContent,/猜你想搜/);
 }finally{a.close();}
});
test('favorites default on, immediately precedes messages, loads folders and safe video cards',async()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,wrap=s.querySelector('.favorites-wrap');
 assert.equal(wrap.hidden,false);assert(wrap.nextElementSibling.matches('.messages'));
 a.w.fetch=async url=>({ok:true,json:async()=>String(url).includes('/nav')?{code:0,data:{isLogin:true,mid:123}}:String(url).includes('list-all')?{code:0,data:{list:[{id:7,title:'我的收藏',media_count:1}]}}:{code:0,data:{medias:[{bvid:'BV1234567890',title:'<img src=x onerror=alert(1)>',upper:{name:'UP主'},cover:'https://i0.hdslb.com/test.jpg'}],has_more:false}}});
 s.querySelector('.favorites').click();await wait(30);assert.equal(s.querySelector('.favorites-panel').hidden,false);assert.match(s.querySelector('.favorites-folder').textContent,/我的收藏/);
 const card=s.querySelector('.favorites-video');assert(card);assert.equal(card.querySelector('strong').children.length,0);card.click();assert(a.messages.some(m=>m.type==='navigate'&&m.url==='https://www.bilibili.com/video/BV1234567890'));
 a.w.BiliSpace.update({headerFavorites:false});assert(wrap.hidden);
 }finally{a.close();}
});
test('favorites signed out state offers login and closes with Escape',async()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot;s.querySelector('.favorites').click();await wait(20);
 assert.match(s.querySelector('.favorites-body').textContent,/登录/);
 s.querySelector('.favorites').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(s.querySelector('.favorites-panel').hidden);
 }finally{a.close();}
});

test('upload plus is home-only and shares settings stacking level; favorites uses the message icon colors',()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,upload=s.querySelector('.upload'),css=s.querySelector('style').textContent;
 assert.equal(upload.hidden,false);assert(upload.querySelector('svg'));assert.equal(upload.textContent,'');
 assert.match(css,/\.upload,#settings-trigger\{z-index:1\}/);assert.match(css,/\.favorites\{[^}]*color:var\(--muted\)/);
 a.w.history.pushState({},'', '/video/BV1234567890');a.w.BiliSpace.syncRoute();assert(upload.hidden);
 a.w.history.pushState({},'', '/');a.w.BiliSpace.syncRoute();assert.equal(upload.hidden,false);
 assert.equal(s.querySelector('.back svg path').getAttribute('d'),'m12.6 4.4-6.2 5.6 6.2 5.6');
 }finally{a.close();}
});
