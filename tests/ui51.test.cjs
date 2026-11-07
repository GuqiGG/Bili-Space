const test=require('node:test'),assert=require('node:assert/strict');
const {app}=require('./ui-harness.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('focusing account actions preserves the clicked DOM node and dispatches add, switch and logout',async()=>{
 const a=app({loggedIn:true});try{await wait(40);const s=a.w.document.querySelector('#bili-space-root').shadowRoot;
 a.w.BiliSpace.showAccountCard(false);s.querySelector('.account-switch').focus();s.querySelector('.account-switch').click();
 a.w.BiliSpace.acceptAccountState({items:[{mid:'1234',uname:'First'},{mid:'5678',uname:'Second'}],active:'1234',busy:false});
 for(const [selector,action] of [['.account-add','add'],['.account-row:nth-of-type(2)','switch'],['.account-logout','logout']]){
   const b=s.querySelector(selector);assert(b,selector);b.focus();assert(b.isConnected,'focus must not replace '+selector);b.click();assert(a.messages.some(m=>m.type==='accounts'&&m.action===action),action);
 }
 }finally{a.close();}
});
test('the original website channel row can be toggled from personalization independently of header categories',()=>{
 const a=app();try{const api=a.w.BiliSpace,s=a.w.document.querySelector('#bili-space-root').shadowRoot;api.openSettings();
 assert(s.querySelector('[data-pref="showChannels"]'));api.update({showChannels:false});assert.equal(a.w.document.documentElement.dataset.bsChannels,'false');assert(!s.querySelector('.back').hidden);
 api.update({showChannels:true});assert.equal(a.w.document.documentElement.dataset.bsChannels,'true');
 }finally{a.close();}
});
test('frost no longer slides the home banner under a frosted header',()=>{
 const html=require('node:fs').readFileSync('tests/fixtures/home-nested.html','utf8'),a=app({html});try{
 const api=a.w.BiliSpace,d=a.w.document;api.update({experimentalFrost:true});assert.equal(d.documentElement.dataset.bsBannerUnderlap,'false');
 api.update({experimentalFrost:false});assert.equal(d.documentElement.dataset.bsBannerUnderlap,'false');
 api.update({experimentalFrost:true});a.w.history.pushState({},'','/video/BV1cjHK6GEJE');api.syncRoute();assert.equal(d.documentElement.dataset.bsBannerUnderlap,'false');
 }finally{a.close();}
});
