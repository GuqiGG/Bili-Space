const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const initial={theme:'dark',accent:'#fb7299',progressColor:'#fb7299',progressHeight:4,progressRadius:6,progressAlways:false,progressThumb:true,showChannels:true,hideAds:true,btr:true,font:true,zoom:100,srMode:'off',srScale:2};
function app(){
 const dom=new JSDOM(fs.readFileSync('assets/fixture.html','utf8'),{url:'https://www.bilibili.com/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,messages=[];
 w.matchMedia=()=>({matches:true,addEventListener(){}});
 w.structuredClone=structuredClone;
 w.chrome={webview:{postMessage:m=>messages.push(m)}};
 w.eval(`const INITIAL=${JSON.stringify(initial)};const GM_INITIAL={};const ICON_SETTINGS=${JSON.stringify(fs.readFileSync('assets/settings.svg','utf8'))};const ICON_SPARKLES=${JSON.stringify(fs.readFileSync('assets/sparkles.svg','utf8'))};const ICON_MESSAGE=${JSON.stringify(fs.readFileSync('assets/message-square-more.svg','utf8'))};\n`+fs.readFileSync('assets/bridge.js','utf8')+'\n'+fs.readFileSync('assets/enhance.js','utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {dom,w,messages,close:()=>w.close()};
}
test('explicit home, banner and right-side ad markers; no title-based false positive',()=>{
 const a=app(),d=a.w.document;
 for(const q of ['.recommended-swipe','#ad-card','.ad-report','.video-page-special-card-small'])assert.equal(d.querySelector(q).dataset.bsAd,'true',q);
 assert.equal(d.querySelector('.normal-comment').dataset.bsAd,undefined);
 assert.equal(d.querySelector('.normal-recommendation').dataset.bsAd,undefined);
 assert.equal(d.documentElement.dataset.bsAds,'true');
 a.w.BiliSpace.update({hideAds:false});assert.equal(d.documentElement.dataset.bsAds,'false');
 assert(d.querySelector('.ad-report').isConnected,'non-destructive hide');a.close();
});
test('native settings in lower left; Douyin font, channels, theme and progress options apply',()=>{
 const a=app(),d=a.w.document,s=d.querySelector('#bili-space-root').shadowRoot;
 assert(s.querySelector('#settings-trigger svg'));
 a.w.BiliSpace.openSettings();assert.equal(s.querySelector('#settings').hidden,false);
 a.w.BiliSpace.update({showChannels:false,theme:'light',progressHeight:9,progressRadius:2,progressColor:'#12abef',progressAlways:true,progressThumb:false});
 assert.equal(d.documentElement.dataset.bsChannels,'false');assert.equal(d.documentElement.dataset.bsTheme,'light');assert.equal(d.documentElement.dataset.bsFont,'true');
 assert.equal(d.documentElement.style.getPropertyValue('--bs-progress-height'),'9px');assert.equal(d.documentElement.style.getPropertyValue('--bs-progress'),'#12abef');
 assert.equal(d.documentElement.dataset.bsAlways,'true');assert.equal(d.documentElement.dataset.bsThumb,'false');
 assert(a.messages.some(m=>m.type==='config'));
 a.w.BiliSpace.closeSettings();assert.equal(s.querySelector('#settings').hidden,true);a.close();
});
test('sparkles control precedes resolution; performance/quality and multipliers exist',()=>{
 const a=app(),d=a.w.document,q=d.querySelector('.bpx-player-ctrl-quality'),tool=q.previousElementSibling;
 assert(tool.classList.contains('bs-player-tool'));assert(tool.querySelector('svg'));
 assert.deepEqual([...tool.querySelectorAll('select')[0].options].map(x=>x.value),['off','performance','quality']);
 assert.deepEqual([...tool.querySelectorAll('select')[1].options].map(x=>x.value),['1','2','3']);
 tool.querySelector('button').click();assert.equal(tool.querySelector('.bs-sr-menu').hidden,false);a.close();
});
test('native PiP keeps a video-only DOM state and restores normal chrome',()=>{
 const a=app(),d=a.w.document;
 a.w.BiliSpace.requestPip();assert(a.messages.some(m=>m.type==='window'&&m.action==='pip'));
 a.w.BiliSpace.setPip(true);assert.equal(d.documentElement.dataset.bsPip,'true');assert.equal(d.querySelector('#bili-space-root').style.display,'none');
 a.w.BiliSpace.setPip(false);assert.equal(d.documentElement.dataset.bsPip,'false');assert.equal(a.w.BiliSpace.state.pip,false);a.close();
});
test('WebGPU unavailable fails visibly without hiding original video',()=>{
 const a=app(),d=a.w.document;d.querySelector('video').style.opacity='0.7';
 a.w.HTMLCanvasElement.prototype.getContext=()=>null;
 a.w.BiliSpace.update({srMode:'quality',srScale:3});
 assert.match(a.w.BiliSpace.state.status,/WebGPU/);assert.equal(d.querySelector('video').style.opacity,'0.7');assert.equal(d.querySelector('.bs-gpu-canvas'),null);a.close();
});
test('incremental ad card insertion is detected',async()=>{
 const a=app(),d=a.w.document,n=d.createElement('div');n.className='bili-video-card';n.innerHTML='<span class="bili-video-card__info--text-ad">骞垮憡</span>';d.querySelector('.feed-list').append(n);
 await new Promise(r=>setTimeout(r,250));assert.equal(n.dataset.bsAd,'true');a.close();
});
test('modified blocker hard-locks optional features and non-home routes',()=>{
 const {execFileSync}=require('node:child_process');
 const policy=JSON.parse(execFileSync(process.execPath,['tests/blocker-policy.cjs','assets/blocker.home.user.js'],{encoding:'utf8'}));
 assert.deepEqual(policy.settings,{hideLiveCards:false,blockAdCards:false,videoProfileButton:false});assert.deepEqual(policy.routes,['home','disabled','disabled','disabled','home']);
 assert.deepEqual(policy.uids,['123','456','']);
});
