const test=require('node:test'),assert=require('node:assert/strict');
const {app}=require('./ui-harness.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('back is a centered SVG, hidden at home and visible on inner routes',()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,b=s.querySelector('.history-back');assert(b.hidden);assert(b.querySelector('svg'));assert.equal(b.textContent,'');
 a.w.history.pushState({},'', '/video/BV1234567890');a.w.BiliSpace.syncRoute();assert.equal(b.hidden,false);b.click();assert(a.messages.some(m=>m.type==='window'&&m.action==='back'));
 a.w.history.pushState({},'', '/');a.w.BiliSpace.syncRoute();assert(b.hidden);
 }finally{a.close();}
});
test('official HTTP and protocol-relative covers are upgraded, unrelated hosts are rejected',async()=>{
 const a=app();try{const url=a.w.BiliFavoriteCoverURL;assert.equal(url('http://i0.hdslb.com/bfs/archive/example.jpg'),'https://i0.hdslb.com/bfs/archive/example.jpg');assert.equal(url('//i1.hdslb.com/x.webp'),'https://i1.hdslb.com/x.webp');assert.equal(url('https://i0.biliimg.com/test.jpg'),'https://i0.biliimg.com/test.jpg');assert.equal(url('https://hdslb.com.attacker.invalid/x.jpg'),'');assert.equal(url('javascript:alert(1)'),'');
 }finally{a.close();}
});
test('signed-out avatar mounts the official login component directly, without an iframe or navigation',async()=>{
 const a=app();try{a.w.MiniLogin=class{constructor(options){this.mount=a.w.document.querySelector(options.el);this.mask=a.w.document.createElement('div');this.mask.className='bili-mini-mask';this.mask.innerHTML='<section class="bili-mini-content-wp"><input placeholder="请输入账号"><button class="bili-mini-close-icon">关闭</button></section>';this.mount.append(this.mask);}showComponent(){this.mask.style.display='block';}closeComponent(){this.mask.style.display='none';}};
 const s=a.w.document.querySelector('#bili-space-root').shadowRoot,count=a.messages.filter(m=>m.type==='navigate').length;s.querySelector('.account').click();await wait(0);const panel=a.w.document.querySelector('#bili-space-login-mount');assert.equal(panel.hidden,false);assert(panel.querySelector('.bili-mini-content-wp'));assert.equal(panel.querySelectorAll('iframe').length,0);assert.equal(a.messages.filter(m=>m.type==='navigate').length,count);
 panel.querySelector('.bili-mini-close-icon').click();assert(panel.hidden);assert.match(a.w.document.querySelector('#bili-space-mini-login-style').textContent,/background:var\(--bg\)!important/);
 }finally{a.close();}
});
test('account card offers add and logout and dispatches only metadata to the native host',async()=>{
 const a=app({loggedIn:true});try{await wait(40);const s=a.w.document.querySelector('#bili-space-root').shadowRoot;a.w.BiliSpace.showAccountCard(false);s.querySelector('.account-switch').click();assert.equal(s.querySelector('.account-manager').hidden,false);assert.equal(s.querySelector('.account-logout').hidden,false);
 a.w.BiliSpace.acceptAccountState({items:[{mid:'1234',uname:'Test account',face:''}],active:'1234',busy:false});assert.match(s.querySelector('.account-row').textContent,/Test account/);
 s.querySelector('.account-add').click();assert(a.messages.some(m=>m.type==='accounts'&&m.action==='add'));
 s.querySelector('.account-logout').click();assert(a.messages.some(m=>m.type==='accounts'&&m.action==='logout'));assert(!a.messages.filter(m=>m.type==='accounts').some(m=>'cookies' in m||'password' in m));
 }finally{a.close();}
});
