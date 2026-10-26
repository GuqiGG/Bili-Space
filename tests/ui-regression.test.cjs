const test=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('./ui-harness.cjs');
test('history/locale history and dynamic highlight their own navigation, never home',()=>{
 for(const [url,title] of [['https://www.bilibili.com/account/history','历史'],['https://www.bilibili.com/zh-Hans/history','历史'],['https://t.bilibili.com/','动态']]){
  const a=app({url}),s=a.w.document.querySelector('#bili-space-root').shadowRoot;
  assert.equal(s.querySelector('nav a[aria-current=page]').textContent,title);
  assert.equal(s.querySelectorAll('nav a[aria-current=page]').length,1);a.close();
 }
});
test('SPA route changes update selected nav and search query without wiping pending edits',()=>{
 const a=app(),s=a.w.document.querySelector('#bili-space-root').shadowRoot;
 a.w.history.pushState({},'','/account/history');assert.equal(s.querySelector('[aria-current=page]').textContent,'历史');
 s.querySelector('.search input').value='还没提交';a.w.BiliSpace.update({showChannels:false});assert.equal(s.querySelector('.search input').value,'还没提交');a.close();
});
test('login status renders API avatar; messages link is present; no text impersonating a profile',async()=>{
 const a=app({loggedIn:true}),s=a.w.document.querySelector('#bili-space-root').shadowRoot;
 await new Promise(r=>setTimeout(r,10));
 assert.equal(s.querySelector('.account img').src,'https://i0.hdslb.com/bfs/face/test-avatar.png');
 assert.equal(s.querySelector('.account').href,'https://space.bilibili.com/1234');
 assert.equal(s.querySelector('.account').getAttribute('aria-label'),'测试账号');
 assert.equal(s.querySelector('.messages').href,'https://message.bilibili.com/#/reply');a.close();
});
test('signed out retains a working login link',async()=>{
 const a=app(),s=a.w.document.querySelector('#bili-space-root').shadowRoot;
 await new Promise(r=>setTimeout(r,10));assert.equal(s.querySelector('.account img'),null);assert.match(s.querySelector('.account').href,/passport.bilibili.com/);a.close();
});
test('search keeps decoded keyword, hides only native duplicate input and shows cancellable loader',async()=>{
 const a=app({url:'https://search.bilibili.com/zh-Hans/all?keyword=%E8%8B%8F%E4%B8%B9',html:'<div class="search-header"><div class="search-input"><input></div><div class="search-tabs">综合 视频</div></div>'}),s=a.w.document.querySelector('#bili-space-root').shadowRoot;
 assert.equal(s.querySelector('.search input').value,'苏丹');assert.equal(a.w.getComputedStyle(a.w.document.querySelector('.search-input')).display,'none');assert.notEqual(a.w.getComputedStyle(a.w.document.querySelector('.search-tabs')).display,'none');
 s.querySelector('form').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(s.querySelector('form').getAttribute('aria-busy'),'true');await new Promise(r=>setTimeout(r,30));assert(a.messages.some(m=>m.type==='navigate'&&m.url==='https://search.bilibili.com/all?keyword=%E8%8B%8F%E4%B8%B9'));
 a.w.BiliSpace.setLoading(false);assert.equal(s.querySelector('form').getAttribute('aria-busy'),'false');a.close();
});
test('traffic lights use centered vector glyphs rather than baseline-aligned text characters',()=>{
 const a=app(),s=a.w.document.querySelector('#bili-space-root').shadowRoot;
 assert.equal(s.querySelectorAll('.lights .light svg').length,3);assert.equal(s.querySelectorAll('.lights .light span').length,0);a.close();
});
test('history wrapper reserve is removed, player glow is absent and danmaku uses a dark surface',()=>{
 const a=app({url:'https://www.bilibili.com/video/BVtest',html:'<header id="biliMainHeader"></header><div class="video-container-v1"><div id="bilibili-player"><div class="bpx-player-sending-bar"><input class="bpx-player-dm-input"></div></div></div>'}),d=a.w.document;
 assert.equal(a.w.getComputedStyle(d.querySelector('#biliMainHeader')).display,'none');
 assert.equal(a.w.getComputedStyle(d.querySelector('#bilibili-player')).boxShadow,'none');assert.equal(a.w.getComputedStyle(d.querySelector('.bpx-player-sending-bar')).backgroundColor,'rgb(32, 32, 35)');a.close();
});
