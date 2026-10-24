/* Better Bili Space — explicit ad markers, native chrome, real GPU spatial scaler. */
const DEFAULTS = {theme:'dark',accent:'#fb7299',progressColor:'#fb7299',progressHeight:4,progressRadius:6,progressAlways:false,progressThumb:true,showChannels:true,hideAds:true,btr:true,font:true,zoom:100,srMode:'off',srScale:2,headerHome:true,headerDynamic:true,headerHistory:true,headerBrand:true,headerSearch:true,headerMessages:true,headerAccount:true,headerBack:true};
const PREFS = { ...DEFAULTS, ...INITIAL };
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const AD_SELECTORS = [
  '.recommended-swipe','.bili-feed4-layout .recommended-swipe',
  '.ad-report','.ad-floor-exp','.ad-floor-cover','.video-page-card-small.ad',
  '.video-page-special-card-small','.video-page-game-card-small',
  '#slide_ad','.ad-slide','.vcd','.video-page-ad-small','.video-page-ad',
  '.video-page-special-card','.activity-m-v1',
  'a[href*="/cm.bilibili.com/"]','a[href*="/game.bilibili.com/"]',
  'a[href*="specialRecommendByOp"]','[data-target-url*="specialRecommendByOp"]',
  '.left-entry a[href*="/blackboard/activity-"]','.left-entry .download-entry',
  '.left-entry a[href*="app.bilibili.com"]','.left-entry a[href*="bilibili.com/s16"]'
];
const AD_CONTAINER = '.feed-card,.bili-video-card,.video-card,.video-page-card-small,.video-page-special-card-small,.ad-report,.ad-floor-exp,.video-page-special-card';
let root, shadow, style, currentTab='appearance', lastFocus, scanTimer, gpu;
let status='未开启', pipActive=false, fullActive=false;
const pipHiddenHosts=new Map();
let revision=0;
let routeKey='', loadingTimer, accountRequest, accountChecked=0;
const mediaTheme=matchMedia('(prefers-color-scheme: dark)');
const HEADER_ITEMS=[
  ['headerHome','首页','[data-route="home"]'],['headerDynamic','动态','[data-route="dynamic"]'],['headerHistory','历史','[data-route="history"]'],
  ['headerBrand','居中标题','.brand'],['headerSearch','搜索栏','.search'],['headerMessages','消息按钮','.messages'],['headerAccount','头像 / 登录入口','.account'],['headerBack','后退按钮','.back']
];
function applyHeaderPreferences(){
  if(!shadow)return;
  for(const [key,,selector] of HEADER_ITEMS)$(selector,shadow).hidden=!PREFS[key];
  $('nav',shadow).hidden=!$$('nav a',shadow).some(a=>!a.hidden);
}
function mountVideoHome(){
  let button=$('#bili-space-video-home');
  if(pageKind()!=='video'){if(button)button.hidden=true;return;}
  if(button){button.hidden=false;return;}
  const host=$('.left-container,.video-info-container,#viewbox_report,.video-container-v1,.video-container-v2');
  if(!host)return;
  button=document.createElement('a');button.id='bili-space-video-home';button.className='bs-video-home';
  button.href='https://www.bilibili.com/';button.setAttribute('aria-label','返回 B站首页');
  button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></svg><span>首页</span>';
  host.prepend(button);
}

function pageKind(){
  const path=location.pathname.replace(/^\/(?:zh-Hans|zh-Hant|en)(?=\/|$)/,'')||'/';
  if(location.hostname==='search.bilibili.com')return 'search';
  if(location.hostname==='t.bilibili.com'||/^\/opus(?:\/|$)/.test(path))return 'dynamic';
  if(/\/(?:account\/)?history(?:\/|$)/.test(path))return 'history';
  if(/^\/(?:video|bangumi|list)(?:\/|$)/.test(path))return 'video';
  if(location.hostname==='message.bilibili.com')return 'messages';
  return /^\/(?:index\.html)?$/.test(path)?'home':'other';
}
function syncRoute(){
  const key=location.href,kind=pageKind();
  document.documentElement.dataset.bsPage=kind;
  mountVideoHome();
  if(!shadow)return;
  $$('nav a[data-route]',shadow).forEach(a=>{
    if(a.dataset.route===kind)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  if(key!==routeKey){
    routeKey=key;
    const query=new URLSearchParams(location.search).get('keyword');
    if(query!==null)$('.search input',shadow).value=query;
  }
}
function setLoading(on,failed=false){
  if(!shadow)return;
  const form=$('.search',shadow);form.setAttribute('aria-busy',String(on));
  $('#search-status',shadow).textContent=on?'正在加载搜索结果…':failed?'加载失败，请重试':'';
  clearTimeout(loadingTimer);
  if(on)loadingTimer=setTimeout(()=>setLoading(false,true),20000);
}
function submitSearch(){
  const input=$('.search input',shadow),query=input.value.trim();
  if(!query)return;
  const url='https://search.bilibili.com/all?keyword='+encodeURIComponent(query);
  setLoading(true);native('navigate',{url});
}
async function refreshAccount(force=false){
  if(accountRequest||(!force&&Date.now()-accountChecked<60000))return;
  accountChecked=Date.now();accountRequest=new AbortController();
  const timeout=setTimeout(()=>accountRequest?.abort(),8000);
  try{
    const response=await fetch('https://api.bilibili.com/x/web-interface/nav',{credentials:'include',signal:accountRequest.signal});
    if(!response.ok)throw Error('account status unavailable');
    const result=await response.json(),data=result.data;
    if(result.code!==0||!data?.isLogin)return;
    const face=new URL(data.face,location.href);
    if(!['https:','http:'].includes(face.protocol)||!/(^|\.)(hdslb|bilibili)\.com$/i.test(face.hostname))return;
    face.protocol='https:';
    const account=$('.account',shadow),img=document.createElement('img');
    img.src=face.href;img.alt=data.uname||'我的头像';img.referrerPolicy='no-referrer';
    account.replaceChildren(img);account.setAttribute('aria-label',data.uname||'我的主页');account.title=data.uname||'我的主页';
    if(/^\d+$/.test(String(data.mid)))account.href='https://space.bilibili.com/'+data.mid;
    account.dataset.authenticated='true';
  }catch(_){
    // Login cookies stay in the browser. A failed status read must not fake a profile.
  }finally{clearTimeout(timeout);accountRequest=null;}
}

function applyPreferences() {
  const html=document.documentElement;
  syncRoute();
  const dark=PREFS.theme==='dark'||(PREFS.theme==='system'&&mediaTheme.matches);
  html.dataset.bsTheme=dark?'dark':'light';
  html.classList.toggle('night-mode',dark);
  html.dataset.bsFont=String(PREFS.font);
  html.dataset.bsChannels=String(PREFS.showChannels);
  html.dataset.bsAds=String(PREFS.hideAds);
  html.dataset.bsAlways=String(PREFS.progressAlways);
  html.dataset.bsThumb=String(PREFS.progressThumb);
  html.style.setProperty('--bs-accent',PREFS.accent);
  html.style.setProperty('--bs-progress',PREFS.progressColor);
  html.style.setProperty('--bs-progress-height',`${PREFS.progressHeight}px`);
  html.style.setProperty('--bs-progress-radius',`${PREFS.progressRadius}px`);
  if(root){root.style.setProperty('--accent',PREFS.accent);root.style.setProperty('--font',PREFS.font?'BiliDouyin,"Microsoft YaHei UI",sans-serif':'"Microsoft YaHei UI",sans-serif');root.dataset.theme=dark?'dark':'light';}
  applyHeaderPreferences();
  if(shadow)renderSettings();
  scheduleScan();
}
function update(patch) {
  const before=PREFS.srMode+PREFS.srScale;
  Object.assign(PREFS,patch);applyPreferences();native('config',{value:patch,revision:++revision});
  if(before!==PREFS.srMode+PREFS.srScale)startGpu();
}
function toast(text){
  if(!shadow)return;
  const el=$('#toast',shadow);el.textContent=text;el.hidden=false;
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,3800);
}
function diagnostic(text){native('diagnostic',{message:text});}

function markAds(scope=document){
  // Never remove framework-owned nodes or infer ads from ordinary video/comment text.
  for(const selector of AD_SELECTORS){
    for(const node of $$(selector,scope)){
      if(node.closest('#bilibili-player,.bpx-player-video-area'))continue;
      const card=node.closest(AD_CONTAINER)||node;
      card.dataset.bsAd='true';
    }
  }
  for(const el of $$('.bili-video-card__info--text-ad,.bili-video-card__stats--text,[data-ad-label]',scope)){
    if(['广告','推广'].includes(el.textContent.trim())){
      const card=el.closest(AD_CONTAINER);if(card)card.dataset.bsAd='true';
    }
  }
}
function scheduleScan(){
  if(scanTimer)return;
  scanTimer=setTimeout(()=>{scanTimer=0;syncRoute();markAds();mountPlayerTools();if(PREFS.srMode!=='off'&&(!gpu||gpu.video!==$('video')))startGpu();},180);
}

const pageCss = `
@font-face{font-family:BiliDouyin;src:local("DouyinSans Bold"),local("DOUYINSANSBOLD-GB"),local("抖音美好体 Bold");font-display:swap}
:root{--bs-accent:#fb7299;--bs-progress:#fb7299;--bs-progress-height:4px;--bs-progress-radius:6px;--bs-feed-columns:4;--bs-header-height:58px;scroll-padding-top:70px}
html[data-bs-font=true] body,html[data-bs-font=true] button,html[data-bs-font=true] input,html[data-bs-font=true] textarea{font-family:BiliDouyin,"Microsoft YaHei UI",sans-serif!important}
html[data-bs-theme=dark]{color-scheme:dark;--bg1:#161618;--bg2:#202023;--bg3:#29292e;--bg1_float:#202023;--bg2_float:#29292e;--bg3_float:#333338;--graph_bg_thin:#202023;--graph_bg_regular:#29292e;--graph_bg_thick:#333338;--text1:#eeeef0;--text2:#b0b0b8;--text3:#8a8a94;--text4:#73737e;--line_light:#27272c;--line_regular:#303034;--line_bold:#45454c}
html[data-bs-theme=dark] body{background:#161618!important;color:#eeeef0}
html[data-bs-theme=light]{color-scheme:light;--bg1:#fafafa;--bg2:#f1f1f3;--text1:#202024;--text2:#67676e}
html,body{min-width:0!important;max-width:100%;overflow-x:clip}
body{padding-top:var(--bs-header-height)!important;margin:0!important}
#app,#i_cecream,.bili-layout,.bili-feed4-layout,.search-layout{min-width:0!important;max-width:100%!important}
.bili-header__bar,.bili-header__banner,.bili-banner,.mini-header,.international-header{display:none!important}
#biliMainHeader,#bili-header-container,#internationalHeader{display:none!important}
.bili-header{height:auto!important;min-height:0!important;background:none!important}
html[data-bs-ads=true] [data-bs-ad=true]{display:none!important}
html[data-bs-channels=false] .bili-header__channel,html[data-bs-channels=false] .channel-container,html[data-bs-channels=false] .bili-feed4-layout .channel-floor{display:none!important}
html[data-bs-page=home] .bili-feed4-layout{width:auto!important;margin-left:clamp(20px,3vw,48px)!important;margin-right:clamp(20px,3vw,48px)!important}
html[data-bs-ads=true] .bili-feed4-layout .recommended-container_floor-aside{display:block!important;min-width:0!important}
html[data-bs-ads=true] .bili-feed4-layout .recommended-container_floor-aside>.container{display:grid!important;grid-template-columns:repeat(var(--bs-feed-columns),minmax(0,1fr))!important;grid-template-rows:none!important;grid-auto-flow:row dense!important;grid-auto-rows:auto!important;gap:28px 20px!important;align-content:start!important;width:100%!important;min-width:0!important}
html[data-bs-ads=true] .recommended-container_floor-aside>.container>:is(.feed-card,.bili-video-card,.floor-single-card){grid-column:auto!important;grid-row:auto!important;width:auto!important;min-width:0!important;margin-top:0!important}
html[data-bs-page=home] :is(.bili-feed4-layout .container,.bili-feed4-layout .feed2){min-width:0!important}
html[data-bs-channels=false] :is(.bili-header__channel,.channel-container,.channel-floor){height:0!important;min-height:0!important;margin:0!important;padding:0!important}
html[data-bs-page=history] :is(.history-record,.history-container,.history-page,.history-wrap){margin-top:0!important;padding-top:20px!important}
html[data-bs-page=dynamic] :is(.bili-dyn-home--member,.bili-dyn-home--unlogin,.bili-dyn-home,.bili-dyn-home__center){margin-top:0!important;padding-top:16px!important}
html[data-bs-page=search] :is(.search-input,.search-wrap .search-block,.search-header .search-form){display:none!important}
html[data-bs-page=search] :is(.search-header,.search-layout,.search-page){padding-top:0!important;margin-top:0!important;min-width:0!important}
html[data-bs-page=search] .search-header{height:auto!important}
html[data-bs-page=search] .search-all-list{padding-top:18px!important}
html[data-bs-page=video] :is(.video-container-v1,.video-container,.video-container-v2,#viewbox_report){margin-top:0!important;padding-top:16px!important}
html[data-bs-theme=dark] :is(.search-content,.search-layout,.search-header,.search-page,.history-record,.history-page,.bili-footer-overseas){background:#161618!important;color:var(--text1)!important}
html[data-bs-theme=dark] :is(.channel-link,.channel-link__right,.channel-items__left>a,.channel-items__right>a,.vui_button,.vui_button--default,.history-filter,.history-filter-bar,.filter-item,.filter-select,.vui_popover__content,.vui_select__dropdown,.vui_dropdown__menu,.bili-dyn-list__item,.bili-dyn-publishing,.bili-dyn-sidebar,.bili-dyn-my-info,.bili-dyn-up-list,.bili-dyn-topic-box){background:#26262b!important;color:#d4d4dc!important;border-color:#38383f!important}
html[data-bs-theme=dark] :is(.vui_button--blue,.vui_button--primary,.vui_button--active,.filter-item.active){background:#35303a!important;color:#ff9fbb!important}
html[data-bs-theme=dark] :is(#bilibili-player,#bilibili-player-wrap,#playerWrap,.player-wrap,.player-container,.video-container-v1,.video-container-v2,.bpx-player-container,.bpx-player-video-wrap){box-shadow:none!important;outline:none!important;border-color:#303034!important}
html[data-bs-theme=dark] :is(#bilibili-player,.bpx-player-container,.bpx-player-video-wrap){background:#000!important}
html[data-bs-theme=dark] :is(.bpx-player-sending-bar,.bilibili-player-video-sendbar){background:#202023!important;border-color:#303034!important;box-shadow:none!important}
html[data-bs-theme=dark] :is(.bpx-player-dm-wrap,.bpx-player-dm-input,.bilibili-player-video-danmaku-input,.bpx-player-sending-area){background:#2c2c32!important;color:#eeeef0!important;border-color:#3b3b42!important}
html[data-bs-theme=dark] :is(.bpx-player-dm-input input,.bpx-player-dm-input textarea){background:transparent!important;color:#eeeef0!important}
html[data-bs-theme=dark] :is(.roll-btn,.feed-roll-btn,.floor-single-card,.bili-live-card,.living-card,.vui_pagenation--btn,.vui_pagination--btn){background:#26262b!important;color:#d4d4dc!important;border-color:#38383f!important}
.bs-video-home{display:flex!important;align-items:center;gap:6px;width:fit-content;align-self:flex-start;padding:4px 9px;margin:0 0 10px;border:1px solid var(--line_regular,#dedee3);border-radius:7px;color:var(--text2,#67676e)!important;font-size:12px;line-height:20px;text-decoration:none!important;background:var(--bg2,#f1f1f3)}
.bs-video-home svg{width:15px;height:15px;flex-shrink:0}.bs-video-home:hover{color:var(--bs-accent)!important;border-color:var(--bs-accent)}.bs-video-home[hidden]{display:none!important}
@media(min-width:1600px){:root{--bs-feed-columns:5}}
@media(max-width:1100px){:root{--bs-feed-columns:3}}
@media(max-width:800px){:root{--bs-feed-columns:2}}
@media(max-width:800px){:root{--bs-header-height:102px}}
.bpx-player-progress-schedule-current,.bpx-player-progress-schedule-current:before,.bilibili-player-video-progress-slider .bui-bar{background:var(--bs-progress)!important}
.bpx-player-progress-schedule,.bpx-player-progress-schedule-wrap{height:var(--bs-progress-height)!important;border-radius:var(--bs-progress-radius)!important}
.bpx-player-progress-schedule-current,.bpx-player-progress-schedule-buffer,.bpx-player-progress-schedule-total{border-radius:var(--bs-progress-radius)!important}
html[data-bs-thumb=false] .bpx-player-progress-schedule-current:before{display:none!important}
html[data-bs-always=true] .bpx-player-control-bottom{opacity:1!important;visibility:visible!important;transform:none!important}
html[data-bs-pip=true] body{padding:0!important;overflow:hidden!important;background:#000!important}
html[data-bs-pip=true] body *{visibility:hidden!important}
html[data-bs-pip=true] #__bilibili_thread_ripper_launcher__,html[data-bs-pip=true] #__bilibili_thread_ripper_error_notice__,html[data-bs-pip=true] #__bilibili_thread_ripper_settings_dialog__{display:none!important}
html[data-bs-pip=true] #bilibili-player,html[data-bs-pip=true] .bpx-player-container{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483000!important;margin:0!important}
html[data-bs-pip=true] video,html[data-bs-pip=true] .bs-gpu-canvas,html[data-bs-pip=true] .bs-pip-controls,html[data-bs-pip=true] .bs-pip-controls *{visibility:visible!important}
html[data-bs-pip=true] .bpx-player-video-wrap{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}
html[data-bs-pip=true] video{position:fixed!important;inset:0!important;object-fit:contain!important;width:100vw!important;height:100vh!important}
html[data-bs-pip=true] .bs-gpu-canvas{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}
html[data-bs-full=true] body{padding-top:0!important}
.bs-gpu-canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:2;background:#000}
.bs-player-tool{position:relative;display:inline-flex;align-items:center;height:100%;margin-right:12px;color:#fff;font-family:BiliDouyin,"Microsoft YaHei UI",sans-serif}
.bs-player-tool button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:6px;font-size:13px}
.bs-player-tool svg{width:19px;height:19px}
.bs-sr-menu{position:absolute;bottom:42px;right:0;width:248px;background:#242427;color:#f6f6f7;padding:16px;border:1px solid #45454a;border-radius:12px;box-shadow:0 12px 36px #0005;font-size:13px;line-height:1.6;z-index:50}
.bs-sr-menu[hidden]{display:none}
.bs-sr-menu label{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:12px 0}
.bs-sr-menu select{background:#36363b;border:1px solid #55555c;border-radius:6px;padding:5px;color:#fff;font:inherit}
.bs-sr-menu p{font-size:11px;color:#bdbdc8;margin:10px 0 0}
.bs-sr-menu output{display:block;color:#f4b7c8;font-size:11px;margin-top:10px;overflow-wrap:anywhere}
.bs-pip-controls{position:fixed;bottom:12px;right:12px;z-index:2147483646;display:none;gap:6px;opacity:0;transition:opacity 150ms}
html[data-bs-pip=true] .bs-pip-controls{display:flex}
html[data-bs-pip=true] body:hover .bs-pip-controls,html[data-bs-pip=true] .bs-pip-controls:focus-within{opacity:1}
.bs-pip-controls button{background:#16161bd9;border:1px solid #ffffff40;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer}
button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid var(--bs-accent);outline-offset:3px}
@media(prefers-reduced-motion:reduce){.bs-pip-controls{transition:none!important}}
`;

const shellCss=`
:host{all:initial;font-family:var(--font,BiliDouyin,"Microsoft YaHei UI",sans-serif);color:#f5f5f7;--accent:#fb7299;--bg:#202023;--panel:#27272b;--ink:#f5f5f7;--muted:#adadb7;--line:#ffffff12;--field:#333338;position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-size:14px}
:host{color-scheme:dark}:host([data-theme=light]){color-scheme:light;--bg:#f8f8fa;--panel:#fff;--ink:#25252a;--muted:#696973;--line:#00000012;--field:#ededf1;color:var(--ink)}
*{box-sizing:border-box}button,input,select{font:inherit}button,a,input,select{pointer-events:auto}button{cursor:pointer;color:inherit}button:active{transform:scale(.97)}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}[hidden]{display:none!important}
svg{width:20px;height:20px;vertical-align:middle}a{color:inherit;text-decoration:none}
header{height:var(--bs-header-height,58px);display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:16px;padding:0 24px;background:var(--bg);color:var(--ink);border-bottom:1px solid var(--line);pointer-events:auto;user-select:none}
.header-left{grid-column:1;grid-row:1;display:flex;align-items:center;gap:16px;min-width:0;max-width:100%;height:100%}.header-right{grid-column:3;grid-row:1;display:flex;align-items:center;justify-content:flex-end;gap:14px;min-width:0;height:100%}
.lights{display:flex;align-items:center;flex:0 0 auto;gap:9px;margin-right:0}.lights .light{display:block;flex:0 0 14px;width:14px;height:14px;min-width:14px;border:0;border-radius:50%;padding:0;position:relative;line-height:0;appearance:none}.light.close{background:#ff5f57}.light.min{background:#febc2e}.light.max{background:#28c840}.lights .light svg{display:block;position:absolute;inset:3px;width:8px;height:8px;fill:none;stroke:#111a;stroke-width:1.4;stroke-linecap:round;opacity:0;pointer-events:none;transition:opacity 150ms ease}.lights:hover svg,.lights .light:focus-visible svg{opacity:1}
.lights .light:before{content:'';position:absolute;inset:-5px;border-radius:50%}
.brand{grid-column:2;grid-row:1;justify-self:center;font-family:BiliDouyin,sans-serif;font-size:16px;white-space:nowrap;letter-spacing:-.5px}.brand b{font-weight:400;color:var(--accent)}
nav{display:flex;flex-shrink:0;gap:22px;height:100%;align-items:center}nav a{font-size:13px;color:var(--muted);position:relative}nav a[aria-current=page]{color:var(--ink)}nav a[aria-current=page]:after{content:'';position:absolute;left:25%;right:25%;bottom:-10px;height:2px;border-radius:2px;background:var(--accent)}nav a:hover{color:var(--accent)}
.search{flex:1;margin-left:0;width:0;min-width:60px;max-width:380px;position:relative}.search input{width:100%;border:1px solid var(--line);background:var(--field);color:var(--ink);border-radius:9px;padding:9px 36px 9px 13px;outline-offset:1px;font-size:12px}.search button{position:absolute;right:7px;top:5px;border:0;background:none;color:var(--muted);padding:4px}
.account{font-size:12px;color:var(--muted);white-space:nowrap;display:flex;align-items:center;justify-content:center;flex-shrink:0;min-width:30px;height:32px}.account img{width:30px;height:30px;display:block;border-radius:50%;object-fit:cover;border:1px solid var(--line)}.messages{display:flex;align-items:center;justify-content:center;width:32px;height:34px;flex-shrink:0;color:var(--muted);border-radius:8px}.messages:hover{background:var(--field);color:var(--ink)}.back{background:none;border:0;color:var(--muted);font:22px/1 sans-serif;padding:4px}
.search[aria-busy=true] button svg{opacity:0}.search[aria-busy=true] button:after{content:'';position:absolute;inset:6px;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:bs-search-spin .7s linear infinite}.search[aria-busy=true]:after{content:'';position:fixed;left:0;right:0;top:calc(var(--bs-header-height,58px) - 1px);height:2px;background:var(--accent);transform-origin:left;animation:bs-search-progress 1.2s ease-in-out infinite}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@keyframes bs-search-spin{to{transform:rotate(360deg)}}@keyframes bs-search-progress{0%{transform:scaleX(.1)}70%{transform:scaleX(.85)}100%{transform:scaleX(1);opacity:.35}}
#settings-trigger{position:fixed;bottom:22px;left:20px;width:44px;height:44px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:13px;box-shadow:0 4px 18px #0002}
#settings-trigger svg{width:23px;height:23px}#settings-trigger circle,#settings-trigger path{stroke:currentColor}
.scrim{position:fixed;inset:0;background:#08080c80;display:grid;place-items:center;padding:40px;pointer-events:auto}
.dialog{width:min(940px,100%);height:min(660px,calc(100vh - 80px));min-height:400px;display:grid;grid-template-columns:210px 1fr;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:0 32px 100px #0006;overflow:hidden}
aside{border-right:1px solid var(--line);padding:28px 16px;display:flex;flex-direction:column;background:var(--panel)}.eyebrow{font:10px/1.5 Consolas,monospace;letter-spacing:2px;color:var(--muted)}h1{font-size:21px;letter-spacing:-.5px;font-weight:400;margin:7px 10px 28px}.eyebrow{margin-left:10px}
.tabs{display:grid;gap:6px}.tabs button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:none;border-radius:9px;padding:11px 12px;color:var(--muted);font-size:13px}.tabs button[aria-selected=true]{background:var(--field);color:var(--ink)}.tabs button[aria-selected=true] svg{color:var(--accent)}.aside-footer{margin-top:auto;padding:10px;color:var(--muted);font-size:11px;line-height:1.8}.aside-footer b{display:block;color:var(--ink);font-weight:400;font-size:12px}
main{padding:34px 36px;overflow:auto;position:relative;scrollbar-width:thin;scrollbar-color:var(--muted) var(--bg)}#dismiss{position:absolute;right:22px;top:22px;background:var(--field);color:var(--muted);border:0;width:28px;height:28px;border-radius:50%;font:20px/1 sans-serif}
h2{font-size:23px;font-weight:400;letter-spacing:-.5px;margin:0 0 6px}p.subtitle{font-size:12px;color:var(--muted);margin:0 0 25px;line-height:1.8;max-width:90%}.section-label{font-size:10px;color:var(--muted);letter-spacing:1px;margin:25px 0 11px}
.themes{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.theme{background:none;border:1px solid var(--line);border-radius:10px;padding:8px 8px 10px;text-align:left;font-size:12px}.theme[aria-pressed=true]{border-color:var(--accent)}.theme span{display:block;padding:9px 3px 0}.mini{height:68px;border-radius:5px;background:#fafafa;display:flex;padding:9px;gap:7px}.mini.dark{background:#151517}.mini.auto{background:linear-gradient(90deg,#fafafa 50%,#151517 50%)}.mini i{width:17%;background:#92929e35;border-radius:3px}.mini em{flex:1;background:#92929e25;border-radius:3px;margin-top:13px;position:relative}.mini em:before{content:'';position:absolute;top:-13px;left:0;width:40%;height:6px;border-radius:3px;background:#92929e35}
.row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:17px 0;border-bottom:1px solid var(--line);min-height:66px}.row label,.row .label{font-size:13px}.hint{display:block;font-size:11px;color:var(--muted);line-height:1.7;margin-top:4px;max-width:370px}.row select{background:var(--field);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:7px 10px;font-size:12px}
input[type=checkbox]{appearance:none;width:34px;height:20px;border-radius:12px;background:#77778070;position:relative;cursor:pointer;flex-shrink:0;margin:0}input[type=checkbox]:before{content:'';width:14px;height:14px;position:absolute;top:3px;left:3px;border-radius:50%;background:#fff;transition:transform 130ms ease-out}input[type=checkbox]:checked{background:var(--accent)}input[type=checkbox]:checked:before{transform:translateX(14px)}input[type=color]{width:34px;height:28px;cursor:pointer;border:1px solid var(--line);border-radius:6px;background:var(--field);padding:3px}
input[type=range]{width:130px;accent-color:var(--accent)}.range{display:flex;align-items:center;gap:10px}.range output{font:11px Consolas,monospace;width:36px;color:var(--muted)}
.preview{height:88px;background:#111113;border-radius:10px;margin-top:18px;position:relative;color:#fff;overflow:hidden}.preview:before{content:'进度条预览';position:absolute;left:18px;top:14px;font-size:11px;color:#c0c0c8}.track{height:var(--height);position:absolute;bottom:20px;left:18px;right:18px;background:#ffffff25;border-radius:var(--radius)}.buffer{position:absolute;inset:0 20% 0 0;background:#ffffff30;border-radius:inherit}.played{position:absolute;inset:0 42% 0 0;background:var(--progress);border-radius:inherit}.thumb{position:absolute;right:0;top:50%;width:10px;height:10px;background:var(--progress);border-radius:50%;transform:translate(50%,-50%)}
.note{padding:12px 15px;background:var(--field);border-radius:8px;color:var(--muted);font-size:11px;line-height:1.9;margin-top:20px}.note strong{color:var(--ink);font-weight:400}.link{background:none;border:0;padding:0;color:var(--accent);font-size:12px}.actions{display:flex;gap:20px;align-items:center;margin-top:22px}.status{font-size:11px;color:var(--muted)}#toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--panel);color:var(--ink);padding:13px 22px;border-radius:10px;border:1px solid var(--line);box-shadow:0 8px 32px #0003;max-width:80vw;font-size:12px;pointer-events:auto}
@media(max-width:1050px){nav{gap:14px}.header-left,.header-right{gap:12px}header{gap:12px}.dialog{grid-template-columns:170px 1fr}main{padding:30px 25px}}
@media(max-width:800px){header{grid-template-rows:58px 44px;column-gap:10px;row-gap:0;padding:0 16px}.header-right{grid-column:1/-1;grid-row:2}.header-left nav{flex-shrink:1;min-width:0;overflow-x:auto;scrollbar-width:none}.header-left nav a{flex-shrink:0}.search{max-width:none;min-width:96px}.lights{margin-right:0}}
@media(max-width:620px){header{column-gap:8px;padding:0 12px}.header-left,.header-right{gap:8px}.lights{gap:6px}nav{gap:10px}nav a{font-size:12px}.search{min-width:70px}.account{max-width:38px;overflow:hidden;font-size:10px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

const icon = (name) => {
  if(name==='sparkles')return ICON_SPARKLES;
  const paths={appearance:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor"/>',progress:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',clean:'<path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7Z"/><path d="m8 12 3 3 5-6"/>',play:'<path d="m9 5 11 7-11 7Z"/>',plugins:'<path d="M8 3v5M16 3v5M5 8h14v4a7 7 0 0 1-14 0ZM12 19v3"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.play}</svg>`;
};
const tabs={appearance:['外观与主题','appearance'],header:['顶部栏','progress'],progress:['进度条','progress'],clean:['页面净化','clean'],play:['播放与画质','sparkles'],plugins:['扩展插件','plugins']};
const toggle=(key,title,hint)=>`<div class="row"><label for="pref-${key}">${title}<span class="hint">${hint}</span></label><input id="pref-${key}" data-pref="${key}" type="checkbox" ${PREFS[key]?'checked':''}></div>`;
const range=(key,title,min,max,unit)=>`<div class="row"><label for="pref-${key}">${title}</label><div class="range"><input id="pref-${key}" type="range" data-pref="${key}" min="${min}" max="${max}" value="${PREFS[key]}"><output>${PREFS[key]}${unit}</output></div></div>`;
function tabContent(){
  if(currentTab==='header')return `<h2>顶部，只放你需要的。</h2><p class="subtitle">选择客户端顶部显示的内容，立即生效并自动保存。标题始终按窗口居中。</p>${HEADER_ITEMS.map(([key,label])=>toggle(key,label,key==='headerBrand'?'在窗口正中显示 bili space。':'控制顶部的'+label+'是否显示。')).join('')}<div class="note">红黄绿窗口控制始终保留，避免隐藏后无法操作窗口。视频网页中的“首页”按钮独立保留，不受顶部导航开关影响。</div><div class="actions"><button id="header-reset" class="link">恢复顶部默认布局</button></div>`;
  if(currentTab==='appearance')return `<h2>让空间，像你。</h2><p class="subtitle">少一点干扰，多一点喜欢。每次调整，都会自动保存。</p><div class="section-label">主题 / APPEARANCE</div><div class="themes">${[['light','浅色'],['dark','深色'],['system','跟随系统']].map(([id,title])=>`<button class="theme" data-theme-choice="${id}" aria-pressed="${PREFS.theme===id}"><div class="mini ${id==='system'?'auto':id}"><i></i><em></em></div><span>${title}</span></button>`).join('')}</div><div class="row"><label for="pref-accent">强调色<span class="hint">属于你的那一点颜色。</span></label><input id="pref-accent" data-pref="accent" type="color" value="${PREFS.accent}"></div>${toggle('font','抖音美好体','使用你已安装的 DouyinSans；未安装时回退到系统字体。')}${range('zoom','界面缩放',75,150,'%')}<div class="note">${icon('appearance')} 内容保持清晰，装饰适可而止。支持键盘操作与系统减少动态效果设置。</div>`;
  if(currentTab==='progress')return `<h2>掌握每一秒。</h2><p class="subtitle">进度条的颜色、粗细与形状，由你决定。</p><div class="preview" style="--height:${PREFS.progressHeight}px;--radius:${PREFS.progressRadius}px;--progress:${PREFS.progressColor}"><div class="track"><div class="buffer"></div><div class="played">${PREFS.progressThumb?'<i class="thumb"></i>':''}</div></div></div><div class="row"><label for="pref-progressColor">播放进度颜色</label><input id="pref-progressColor" data-pref="progressColor" type="color" value="${PREFS.progressColor}"></div>${range('progressHeight','进度条高度',1,12,'px')}${range('progressRadius','圆角',0,12,'px')}${toggle('progressThumb','显示拖动圆点','保持原生拖动与预览行为。')}${toggle('progressAlways','始终显示播放控制条','关闭时跟随 B站播放器自动隐藏。')}`;
  if(currentTab==='clean')return `<h2>只留下想看的。</h2><p class="subtitle">识别明确的广告容器，不根据标题猜测，不删除评论和正常推荐。</p>${toggle('hideAds','自动清理广告与运营推广','首页轮播、赛事/下载入口、视频下方横幅与右侧推广卡片。')}${toggle('showChannels','显示首页频道分区','图二中的动态、热门、番剧、动画等频道导航。')}<div class="note"><strong>非破坏式净化</strong><br>隐藏广告节点而非删除，关闭开关即可恢复。不会隐藏普通直播卡片，也不改写评论。网站更新后规则可能需要维护。</div><div class="actions"><button class="link" id="rescan">重新检查当前页面</button><span class="status" id="ad-count"></span></div>`;
  if(currentTab==='play')return `<h2>细节，多看一点。</h2><p class="subtitle">超分入口也在播放器分辨率左侧。画中画没有标题栏。</p><div class="row"><label for="pref-srMode">超分辨率<span class="hint">GPU 空间缩放 + 边缘锐化；不是 AI 模型超分。</span></label><select id="pref-srMode" data-pref="srMode"><option value="off">关闭</option><option value="performance">性能 · 最高 30fps</option><option value="quality">质量 · 最高 60fps</option></select></div><div class="row"><label for="pref-srScale">目标倍率<span class="hint">受源视频尺寸、GPU及 4K 像素预算限制。</span></label><select id="pref-srScale" data-pref="srScale"><option value="1">1× · 锐化</option><option value="2">2×</option><option value="3">3×</option></select></div><div class="row"><div class="label">当前处理状态<span class="hint" id="gpu-status"></span></div><button class="link" id="pip-action">进入画中画 ↗</button></div><div class="note"><strong>真实处理，可随时关闭</strong><br>以 WebGL 对解码帧进行缩放与锐化。跨域帧不可读取、GPU 不可用或受保护的视频会停止增强并保留原生播放，不假报成功。画中画复用当前播放窗口，Esc 或右下角按钮返回。</div>`;
  return `<h2>熟悉的能力，内置。</h2><p class="subtitle">本地固定版本，不下载远程更新，不绕过会员、地区或版权限制。</p>${toggle('btr','Bilibili 线程撕裂者','多 CDN / Range 并发缓冲。开关变更后需刷新页面。')}<div class="actions"><button id="btr-settings" class="link">打开线程撕裂者设置 ↗</button><button id="reload" class="link">刷新页面</button></div><div class="row"><div class="label">一键拉黑 UP主<span class="hint">仅首页推荐按钮。视频页、搜索页、隐藏直播与插件广告过滤均关闭。拉黑会同步至 B站账号。</span></div><span class="status">首页限定</span></div><div class="note">线程撕裂者：2026.10.24.1 · MIT<br>一键拉黑：1.6.4 · 本地首页限定适配 · MIT<br>登录后点击拉黑才会执行账号操作。本客户端未自动替你拉黑任何人。</div>`;
}
function renderSettings(){
  if(!shadow)return;
  const panel=$('#tab-content',shadow);if(!panel)return;
  // Preserve the active slider while dragging rather than replacing its DOM node.
  if(panel.contains(shadow.activeElement)&&shadow.activeElement?.matches('input[type=range],input[type=color]')){
    const input=shadow.activeElement;
    if(input.type==='range')input.nextElementSibling.textContent=PREFS[input.dataset.pref]+(input.dataset.pref==='zoom'?'%':'px');
    const preview=$('.preview',panel);if(preview){preview.style.setProperty('--height',PREFS.progressHeight+'px');preview.style.setProperty('--radius',PREFS.progressRadius+'px');preview.style.setProperty('--progress',PREFS.progressColor);}return;
  }
  panel.innerHTML=tabContent();
  $$('.tabs button',shadow).forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===currentTab));b.tabIndex=b.dataset.tab===currentTab?0:-1;});
  $$('select[data-pref]',panel).forEach(s=>s.value=String(PREFS[s.dataset.pref]));
  const gs=$('#gpu-status',panel);if(gs)gs.textContent=status;
  const ac=$('#ad-count',panel);if(ac)ac.textContent=`已识别 ${$$('[data-bs-ad=true]').length} 个推广节点`;
}
function closeSettings(){
  if(!shadow)return;$('#settings',shadow).hidden=true;lastFocus?.focus();
}
function openSettings(){
  lastFocus=shadow.activeElement||document.activeElement;$('#settings',shadow).hidden=false;renderSettings();$('#dismiss',shadow).focus();
}
function mountShell(){
  root=document.createElement('bili-space-shell');root.id='bili-space-root';shadow=root.attachShadow({mode:'open'});
  shadow.innerHTML=`<style>${shellCss}</style><header id="chrome"><div class="header-left"><div class="lights"><button class="light close" data-window="close" aria-label="关闭窗口" title="关闭"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9"/></svg></button><button class="light min" data-window="minimize" aria-label="最小化窗口" title="最小化"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7"/></svg></button><button class="light max" data-window="maximize" aria-label="最大化或还原窗口" title="最大化或还原"><svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx=".5"/></svg></button></div><button class="back" data-window="back" aria-label="后退">‹</button><nav aria-label="主导航"><a data-route="home" href="https://www.bilibili.com/">首页</a><a data-route="dynamic" href="https://t.bilibili.com/">动态</a><a data-route="history" href="https://www.bilibili.com/account/history">历史</a></nav></div><div class="brand">bili <b>space</b></div><div class="header-right"><form class="search" role="search" aria-busy="false"><input name="keyword" aria-label="搜索视频" placeholder="搜索你感兴趣的内容" autocomplete="off"><button aria-label="搜索">${icon('search')}</button><span class="sr-only" id="search-status" role="status" aria-live="polite"></span></form><a class="messages" href="https://message.bilibili.com/#/reply" aria-label="消息" title="消息">${ICON_MESSAGE}</a><a class="account" href="https://passport.bilibili.com/login?gourl=https%3A%2F%2Fwww.bilibili.com%2F">登录 B站</a></div></header><button id="settings-trigger" aria-label="客户端设置" title="客户端设置 · Ctrl+,">${ICON_SETTINGS}</button><div class="scrim" id="settings" hidden><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><aside><div class="eyebrow">YOUR SPACE</div><h1 id="settings-title">客户端设置</h1><div class="tabs" role="tablist" aria-label="设置分类">${Object.entries(tabs).map(([key,[label,i]])=>`<button role="tab" data-tab="${key}" aria-controls="tab-content">${icon(i)}${label}</button>`).join('')}</div><div class="aside-footer"><b>Better Bili Space</b>0.1.2 · 为专注而设计<br>修改即时生效 · 自动保存</div></aside><main><button id="dismiss" aria-label="关闭设置">×</button><div id="tab-content" role="tabpanel"></div><div class="actions"><button class="link" id="reset">恢复默认设置</button></div></main></section></div><div role="status" id="toast" hidden></div>`;
  document.documentElement.append(root);
  shadow.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(b?.dataset.window){native('window',{action:b.dataset.window});return;}
    if(b?.id==='settings-trigger')openSettings();
    if(b?.id==='dismiss'||e.target.id==='settings')closeSettings();
    if(b?.dataset.tab){currentTab=b.dataset.tab;renderSettings();$(`[data-tab="${currentTab}"]`,shadow).focus();}
    if(b?.dataset.themeChoice)update({theme:b.dataset.themeChoice});
    if(b?.id==='reset'){update({...DEFAULTS});toast('已恢复默认设置');}
    if(b?.id==='header-reset'){update(Object.fromEntries(HEADER_ITEMS.map(([key])=>[key,true])));toast('已恢复顶部默认布局');}
    if(b?.id==='rescan'){markAds();renderSettings();toast('已重新检查当前页面');}
    if(b?.id==='btr-settings'){closeSettings();if(!PREFS.btr)toast('请先开启线程撕裂者并刷新页面');else document.dispatchEvent(new CustomEvent('btr-userscript-open-settings'));}
    if(b?.id==='reload')native('window',{action:'reload'});
    if(b?.id==='pip-action'){closeSettings();requestPip();}
  });
  shadow.addEventListener('input',e=>{
    const el=e.target,key=el.dataset.pref;if(!key)return;
    let v=el.type==='checkbox'?el.checked:['range','number'].includes(el.type)||key==='srScale'?Number(el.value):el.value;
    update({[key]:v});
    if(key==='btr')toast('已保存；刷新页面后切换线程撕裂者');
  });
  $('.search',shadow).addEventListener('submit',e=>{e.preventDefault();submitSearch();});
  $('#chrome',shadow).addEventListener('mousedown',e=>{if(e.button===0&&!e.target.closest('button,a,input,form'))native('window',{action:'drag'});});
  $('#chrome',shadow).addEventListener('dblclick',e=>{if(!e.target.closest('button,a,input'))native('window',{action:'maximize'});});
  shadow.addEventListener('keydown',e=>{
    if(e.target.matches('[role=tab]')&&['ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();let keys=Object.keys(tabs),n=keys.indexOf(currentTab);currentTab=keys[(n+(e.key==='ArrowDown'?1:keys.length-1))%keys.length];renderSettings();$(`[data-tab="${currentTab}"]`,shadow).focus();
    }
    if(e.key==='Tab'&&!$('#settings',shadow).hidden){
      const items=$$('button,input,select,a[href]',$('.dialog',shadow)).filter(el=>el.tabIndex>=0&&!el.disabled&&el.getClientRects().length);
      if(!items.length)return;
      if(e.shiftKey&&shadow.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}
      if(!e.shiftKey&&shadow.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}
    }
  });
  renderSettings();
}

function requestPip(){
  const video=$('video');if(!video){toast('先打开一个视频，再进入画中画');return;}
  native('window',{action:'pip'});
}
function mountPlayerTools(){
  const quality=$('.bpx-player-ctrl-quality,.bilibili-player-video-btn-quality');
  if(!quality||$('.bs-player-tool',quality.parentElement))return;
  const control=document.createElement('div');control.className='bs-player-tool';
  control.innerHTML=`<button class="bs-sr-toggle" aria-label="超分辨率设置" aria-expanded="false">${ICON_SPARKLES}<span>超分</span></button><div class="bs-sr-menu" hidden><strong>超分辨率 · GPU</strong><label>处理模式<select aria-label="超分模式"><option value="off">关闭</option><option value="performance">性能</option><option value="quality">质量</option></select></label><label>目标倍率<select aria-label="超分倍率"><option value="1">1× 锐化</option><option value="2">2×</option><option value="3">3×</option></select></label><p>空间缩放与锐化，非 AI 模型。受 GPU、跨域权限与 4K 预算限制。</p><output></output><button class="bs-pip" aria-label="进入无标题栏画中画">↗ 画中画</button></div>`;
  quality.before(control);
  const button=$('button',control),menu=$('.bs-sr-menu',control),sels=$$('select',control);
  const sync=()=>{sels[0].value=PREFS.srMode;sels[1].value=PREFS.srScale;$('output',control).textContent=status;};sync();
  button.addEventListener('click',e=>{e.stopPropagation();menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));sync();});
  sels[0].addEventListener('change',()=>{update({srMode:sels[0].value});sync();});
  sels[1].addEventListener('change',()=>{update({srScale:Number(sels[1].value)});sync();});
  $('.bs-pip',control).addEventListener('click',()=>{menu.hidden=true;requestPip();});
  control.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;button.focus();}});
  document.addEventListener('pointerdown',e=>{if(!control.contains(e.target)){menu.hidden=true;button.setAttribute('aria-expanded','false');}},{passive:true});
}

class SpatialScaler {
  constructor(video,mode,scale){
    this.video=video;this.mode=mode;this.scale=scale;this.frames=0;this.last=-Infinity;this.stopped=false;
    this.canvas=document.createElement('canvas');this.canvas.className='bs-gpu-canvas';
    this.gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:false});
    if(!this.gl)throw Error('WebGL 不可用');
    const gl=this.gl;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const vs=shader(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}');
    const fs=shader(gl.FRAGMENT_SHADER,`precision mediump float;varying vec2 uv;uniform sampler2D image;uniform vec2 texel;void main(){vec3 c=texture2D(image,uv).rgb;vec3 l=texture2D(image,uv-vec2(texel.x,0.)).rgb;vec3 r=texture2D(image,uv+vec2(texel.x,0.)).rgb;vec3 u=texture2D(image,uv-vec2(0.,texel.y)).rgb;vec3 d=texture2D(image,uv+vec2(0.,texel.y)).rgb;vec3 avg=(l+r+u+d)*.25;${mode==='quality'?'avg=(avg*4.+texture2D(image,uv+texel).rgb+texture2D(image,uv-texel).rgb+texture2D(image,uv+vec2(texel.x,-texel.y)).rgb+texture2D(image,uv+vec2(-texel.x,texel.y)).rgb)*.125;':''}vec3 edge=c-avg;float contrast=length(edge);float gain=${mode==='quality'?'.55':'.28'}*(1.-smoothstep(.12,.5,contrast));gl_FragColor=vec4(clamp(c+edge*gain,min(min(l,r),min(u,d)),max(max(l,r),max(u,d))),1.);}`);
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error('着色器链接失败');gl.useProgram(this.program);
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const p=gl.getAttribLocation(this.program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.uniform1i(gl.getUniformLocation(this.program,'image'),0);this.texel=gl.getUniformLocation(this.program,'texel');
    this.oldOpacity=video.style.opacity;this.parent=video.parentElement;this.oldPosition=this.parent.style.position;
    if(getComputedStyle(this.parent).position==='static'){this.parent.style.position='relative';this.changedPosition=true;}
    this.parent.append(this.canvas);
    this.lost=e=>{e.preventDefault();this.fail('GPU 上下文丢失，已恢复原生播放');};
    this.canvas.addEventListener('webglcontextlost',this.lost);
    this.tick=this.tick.bind(this);this.schedule();
  }
  schedule(){if(this.stopped)return;this.frame=this.video.requestVideoFrameCallback?this.video.requestVideoFrameCallback(this.tick):requestAnimationFrame(this.tick);}
  tick(now){
    if(this.stopped)return;
    if(!this.video.isConnected){this.stop();scheduleScan();return;}
    if(!document.hidden&&this.video.readyState>=2&&now-this.last>=1000/(this.mode==='quality'?60:30)-1){
      try{
        const gl=this.gl,w=this.video.videoWidth,h=this.video.videoHeight;
        if(!w||!h){this.schedule();return;}
        const max=gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const multiplier=Math.min(this.scale,max/w,max/h,Math.sqrt(3840*2160/(w*h)));
        if(multiplier<1)throw Error('源分辨率超过本机 GPU / 4K 像素预算');
        const ow=Math.max(1,Math.floor(w*multiplier)),oh=Math.max(1,Math.floor(h*multiplier));
        if(this.canvas.width!==ow||this.canvas.height!==oh){this.canvas.width=ow;this.canvas.height=oh;gl.viewport(0,0,ow,oh);}
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.video);
        if(gl.getError()!==gl.NO_ERROR)throw Error('GPU 帧上传失败');
        gl.uniform2f(this.texel,1/w,1/h);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        if(gl.getError()!==gl.NO_ERROR)throw Error('GPU 渲染失败');
        this.video.style.opacity='0';this.frames++;this.last=now;
        const text=`${w}×${h} → ${ow}×${oh} · ${multiplier.toFixed(2)}× · ${this.mode==='quality'?'质量':'性能'} · GPU`;
        if(status!==text){status=text;updateStatus();diagnostic('SR rendering: '+text);}
      }catch(e){this.fail('无法增强：'+e.message+'；已保留原生播放');return;}
    }
    this.schedule();
  }
  fail(text){this.stop();status=text;updateStatus();toast(text);diagnostic(text);}
  stop(){
    if(this.stopped)return;this.stopped=true;
    if(this.video.cancelVideoFrameCallback)this.video.cancelVideoFrameCallback(this.frame);else cancelAnimationFrame(this.frame);
    this.video.style.opacity=this.oldOpacity;if(this.changedPosition)this.parent.style.position=this.oldPosition;
    this.canvas.removeEventListener('webglcontextlost',this.lost);this.canvas.remove();
    const gl=this.gl;gl.deleteTexture(this.texture);gl.deleteBuffer(this.buffer);gl.deleteProgram(this.program);gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
function updateStatus(){
  const label=shadow&&$('#gpu-status',shadow);if(label)label.textContent=status;
  $$('.bs-sr-menu output').forEach(el=>el.textContent=status);
}
function startGpu(){
  gpu?.stop();gpu=null;
  if(PREFS.srMode==='off'){status='未开启';updateStatus();return;}
  const video=$('video');if(!video){status='等待视频';updateStatus();return;}
  try{status='等待可读取的视频帧';gpu=new SpatialScaler(video,PREFS.srMode,PREFS.srScale);updateStatus();}
  catch(e){status=e.message;updateStatus();toast('增强不可用，原生播放不受影响：'+e.message);diagnostic(status);}
}

function boot(){
  style=document.createElement('style');style.id='bili-space-style';style.textContent=pageCss;document.documentElement.append(style);
  mountShell();applyPreferences();markAds();mountPlayerTools();startGpu();refreshAccount();
  if(pageKind()==='search'&&document.readyState!=='complete')setLoading(true);
  window.addEventListener('load',()=>setLoading(false),{once:true});
  window.addEventListener('focus',()=>refreshAccount());
  for(const method of ['pushState','replaceState']){
    const original=history[method];
    history[method]=function(...args){const result=Reflect.apply(original,this,args);syncRoute();scheduleScan();return result;};
  }
  window.addEventListener('popstate',()=>{syncRoute();scheduleScan();});
  window.addEventListener('hashchange',syncRoute);
  const observer=new MutationObserver(records=>{
    if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&!n.closest?.('#bili-space-root,.bs-player-tool,.bs-gpu-canvas'))))scheduleScan();
  });observer.observe(document.body,{childList:true,subtree:true});
  mediaTheme.addEventListener('change',applyPreferences);
  const controls=document.createElement('div');controls.className='bs-pip-controls';controls.innerHTML='<button type="button" aria-label="返回客户端">↙ 返回</button><button type="button" aria-label="播放或暂停">Ⅱ / ▶</button>';
  document.body.append(controls);$('button',controls).onclick=()=>native('window',{action:'pip'});$$('button',controls)[1].onclick=()=>{const v=$('video');if(v){if(v.paused)v.play().catch(()=>{});else v.pause();}};
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey&&e.key===','){e.preventDefault();openSettings();}
    if(e.key==='Escape'){closeSettings();if(pipActive)native('window',{action:'pip'});}
    if(e.key==='F5'){e.preventDefault();native('window',{action:'reload'});}
  });
  document.addEventListener('mousedown',e=>{if(pipActive&&e.button===0&&!e.target.closest('button'))native('window',{action:'drag'});});
  window.BiliSpace={
    openSettings,closeSettings,update,markAds,requestPip,setLoading,refreshAccount,syncRoute,
    acceptConfig(next,ack){if(ack<revision)return;Object.assign(PREFS,next);applyPreferences();},
    setPip(on){
      pipActive=on;document.documentElement.dataset.bsPip=String(on);root.style.display=on?'none':'';
      // Upstream hosts use inline all:initial!important; a stylesheet cannot override it.
      if(on){
        $$('[id^="__bilibili_thread_ripper_"]').forEach(el=>{pipHiddenHosts.set(el,[el.style.getPropertyValue('display'),el.style.getPropertyPriority('display')]);el.style.setProperty('display','none','important');});
      }else{
        for(const [el,[value,priority]] of pipHiddenHosts){if(value)el.style.setProperty('display',value,priority);else el.style.removeProperty('display');}pipHiddenHosts.clear();
      }
    },
    setFullscreen(on){fullActive=on;document.documentElement.dataset.bsFull=String(on);root.style.display=on?'none':'';},
    get state(){return {prefs:{...PREFS},status,frames:gpu?.frames||0,stopped:gpu?.stopped??true,pip:pipActive,full:fullActive,route:pageKind(),loading:$('.search',shadow).getAttribute('aria-busy')==='true',ads:$$('[data-bs-ad=true]').length};}
  };
  diagnostic('Better Bili Space ready');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
