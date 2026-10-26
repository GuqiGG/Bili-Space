/* Better Bili Space — explicit ad markers, native chrome, local AI super resolution. */
const ICON_TV='<svg xmlns="http://www.w3.org/2000/svg" class="bs-tv" viewBox="0 0 32 32" aria-hidden="true"><path d="m10 3 6 5 6-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><rect x="3" y="8" width="26" height="21" rx="6" fill="currentColor"/><path d="M10 16v5m12-5v5" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>';
const ICON_DOWNLOAD='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/></svg>';
const DEFAULT_CATEGORIES=[0,1,2,3,4,13,14,16];
const DEFAULTS = {theme:'dark',accent:'#fb7299',progressColor:'#fb7299',progressHeight:4,progressRadius:6,progressAlways:false,progressThumb:true,showChannels:true,hideAds:true,btr:true,font:true,zoom:100,volumeBoost:100,srMode:'off',srScale:2,srFps:60,closeAction:'tray',videoLoadingMode:'page',clipboardAutoOpen:true,experimentalControlsV1:false,fiMode:'off',fiFps:60,fiFlowScale:50,trafficLights:true,headerHome:true,headerDynamic:true,headerHistory:true,headerBrand:true,headerSearch:true,headerMessages:true,headerUpload:true,headerAccount:true,headerBack:true,autoZoom:true,autoZoomTarget:1280,downloader:true,downloaderPath:'',proxy:false,proxyAll:false,proxyNode:'',categoryPreset:0,categorySelection:DEFAULT_CATEGORIES.slice()};
const PREFS = { ...DEFAULTS, ...INITIAL };
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
function playbackVideo(){const main=[...new Set($$('.bpx-player-video-wrap video,#bilibili-player video,.bilibili-player-video video'))],all=main.length?main:$$('video');return all.sort((a,b)=>{const score=v=>{const r=v.getBoundingClientRect();return (!v.hidden&&getComputedStyle(v).display!=='none'&&r.width>1&&r.height>1?100:0)+v.readyState;};return score(b)-score(a);})[0]||null;}
const AD_SELECTORS = [
  '.recommended-swipe','.bili-feed4-layout .recommended-swipe',
  '.ad-report','.ad-floor-exp','.ad-floor-cover','.video-page-card-small.ad',
  '.video-page-special-card-small','.video-page-game-card-small',
  '#slide_ad','.ad-slide','.vcd','.video-page-ad-small','.video-page-ad',
  '.video-page-special-card','.activity-m-v1',
  '.couplet-locs','.palette-button-adcard','.desktop-download-tip',
  'a[href*="/cm.bilibili.com/"]','a[href*="/game.bilibili.com/"]',
  'a[href*="specialRecommendByOp"]','[data-target-url*="specialRecommendByOp"]',
  '.left-entry a[href*="/blackboard/activity-"]','.left-entry .download-entry',
  '.left-entry a[href*="app.bilibili.com"]','.left-entry a[href*="bilibili.com/s16"]'
];
const AD_CONTAINER = '.feed-card,.bili-video-card,.video-card,.video-page-card-small,.video-page-special-card-small,.ad-report,.ad-floor-exp,.video-page-special-card';
let root, shadow, style, currentTab='appearance', lastFocus, scanTimer, gpu, interpolator;
let status='未开启', pipActive=false, fullActive=false;
let downloaderInfo={installed:false,mcp:false,running:false,message:'正在检测下载器…'};
const pipHiddenHosts=new Map();
let revision=0;
let routeKey='', loadingTimer, accountRequest, accountChecked=0;
let homeLoadWakeKey='',homeLoadWakeTimer,homeLoadRetryTimer;
const mediaTheme=matchMedia('(prefers-color-scheme: dark)');
const HEADER_ITEMS=[
  ['headerHome','首页','[data-route="home"]'],['headerDynamic','动态','[data-route="dynamic"]'],['headerHistory','历史','[data-route="history"]'],
  ['headerBrand','居中标题','.brand'],['headerSearch','搜索栏','.search'],['headerMessages','消息按钮','.messages'],['headerUpload','投稿按钮','.upload'],['headerAccount','头像 / 登录入口','.account'],['headerBack','分区展开入口','.back']
];
function applyHeaderPreferences(){
  if(!shadow)return;
  const left=$('.header-left',shadow);left.dataset.controls=PREFS.trafficLights?'traffic':'windows';$('.lights',shadow).hidden=!PREFS.trafficLights;$('.window-actions',shadow).hidden=Boolean(PREFS.trafficLights);
  for(const [key,,selector] of HEADER_ITEMS)$(selector,shadow).hidden=!PREFS[key];
  const categoriesOpen=$('.back',shadow).getAttribute('aria-expanded')==='true';
  $('.primary-nav',shadow).hidden=categoriesOpen||!$$('.primary-nav a',shadow).some(a=>!a.hidden);
  if(!PREFS.headerBack)setCategories(false);
  $$('#header-categories a',shadow).forEach((a,i)=>a.hidden=!PREFS.categorySelection.includes(i));
}
function mountVideoHome(){
  const bar=$('#bili-space-video-bar');
  if(pageKind()!=='video'){if(bar)bar.hidden=true;return;}
  if(bar){bar.hidden=false;const download=$('#bili-space-video-download',bar);if(download)download.hidden=!PREFS.downloader;return;}
  const host=$('.left-container')||$('.video-info-container')||$('#viewbox_report')||$('.video-container-v1,.video-container-v2');
  if(!host)return;
  const row=document.createElement('div');row.id='bili-space-video-bar';row.className='bs-video-bar';
  row.innerHTML=`<a id="bili-space-video-home" class="bs-video-home" href="https://www.bilibili.com/" aria-label="返回 B站首页">${ICON_TV}<span>首页</span></a><button type="button" id="bili-space-video-download" class="bs-video-download" aria-label="用下载器保存这个视频" title="使用内置下载器保存视频"${PREFS.downloader?'':' hidden'}>${ICON_DOWNLOAD}<span>下载</span></button>`;
  host.prepend(row);
}
// Resolve an official combined audio/video stream; native code saves it without another app.
let downloadTimer;
async function downloadJson(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(url,{credentials:'include',signal:controller.signal});if(!response.ok)throw Error('下载接口返回 HTTP '+response.status);return await response.json();}finally{clearTimeout(timer);}}
function downloadWbiQuery(params,keys){
  const raw=[keys?.img_url,keys?.sub_url].map(x=>new URL(x).pathname.split('/').pop().split('.')[0]).join('');if(raw.length!==64)throw Error('未能获取官方签名参数');
  const order=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52],key=order.map(i=>raw[i]).join('').slice(0,32),values={...params,wts:Math.floor(Date.now()/1000)};
  const query=Object.keys(values).sort().map(k=>encodeURIComponent(k)+'='+encodeURIComponent(String(values[k]).replace(/[!'()*]/g,''))).join('&');return query+'&w_rid='+profileMd5(query+key);
}
function downloadStreamUrl(stream){
  const candidates=[stream?.baseUrl,stream?.base_url,stream?.url,...(Array.isArray(stream?.backupUrl)?stream.backupUrl:[]),...(Array.isArray(stream?.backup_url)?stream.backup_url:[])],urls=[];
  for(const raw of candidates){if(typeof raw!=='string')continue;try{const u=new URL(raw,location.href);if(u.protocol==='http:')u.protocol='https:';if(u.protocol!=='https:'||u.username||u.password||u.hash)continue;const host=u.hostname.toLowerCase();if(['bilivideo.com','bilivideo.cn','hdslb.com'].some(d=>host===d||host.endsWith('.'+d))||host==='upos-hz-mirrorakam.akamaized.net')urls.push(u.href);}catch{}}
  // Prefer ordinary CDN backups over peer-assisted hosts; do not trust arbitrary peer domains.
  return urls.find(url=>!/(?:mcdn|pcdn|mirror14b)/i.test(new URL(url).hostname))||urls[0]||'';
}
function chooseDownloadStreams(data){
  const videos=(data?.dash?.video||[]).filter(x=>x.codecid===7||String(x.codecs||'').startsWith('avc1')).sort((a,b)=>b.id-a.id||b.bandwidth-a.bandwidth),audios=(data?.dash?.audio||[]).filter(x=>String(x.codecs||'').startsWith('mp4a')).sort((a,b)=>b.bandwidth-a.bandwidth);
  const url=x=>{const result=downloadStreamUrl(x);if(!result)throw Error('没有可用的官方 CDN 地址（含备用地址），未启动下载');return result;};
  if(videos.length){if(!audios.length)throw Error('暂不支持该视频的非 AAC 音轨，未保存无声视频');return {url:url(videos[0]),audioUrl:url(audios[0]),quality:videos[0].id};}
  if(data?.durl?.length===1)return {url:url(data.durl[0]),audioUrl:'',quality:data.quality};
  throw Error('未获取到可保存的 AVC/AAC 视频流；不绕过账号或地区限制');
}
async function requestDownload(){
  const button=$('#bili-space-video-download');if(!button||button.dataset.state==='busy')return;
  button.dataset.state='busy';$('span',button).textContent='解析中';
  try{
    const bvid=location.pathname.match(/BV[a-zA-Z0-9]{10}/)?.[0];if(!bvid)throw Error('当前内置下载仅支持 BV 视频页');
    const view=await downloadJson('https://api.bilibili.com/x/web-interface/view?bvid='+bvid);
    if(view.code!==0)throw Error(view.message||'视频信息获取失败');
    const page=Math.max(1,Number(new URLSearchParams(location.search).get('p'))||1),cid=view.data.pages?.[page-1]?.cid;if(!cid)throw Error('未找到当前分P');
    const nav=await downloadJson('https://api.bilibili.com/x/web-interface/nav');
    const query=downloadWbiQuery({bvid,cid,qn:127,fnver:0,fnval:4048,fourk:1},nav.data?.wbi_img);
    const info=await downloadJson('https://api.bilibili.com/x/player/wbi/playurl?'+query);
    if(info.code!==0)throw Error(info.message||'下载地址获取失败');
    const media=chooseDownloadStreams(info.data);if(!/^https:\/\//.test(media.url)||media.audioUrl&&!/^https:\/\//.test(media.audioUrl))throw Error('下载地址不是安全 HTTPS 地址');
    $('span',button).textContent='选择保存位置';native('downloader',{action:'save',...media,title:view.data.title||document.title});
  }catch(e){settleDownload(false,e.message||'解析失败');}
}
function settleDownload(ok,message,silent){
  clearTimeout(downloadTimer);
  const button=$('#bili-space-video-download');
  if(button){
    button.dataset.state=ok?'done':'blocked';
    const label=$('span',button);if(label)label.textContent=ok?'已保存':'下载';
    setTimeout(()=>{if(button.dataset.state==='busy')return;button.dataset.state='';const text=$('span',button);if(text)text.textContent='下载';},ok?4000:6000);
  }
  if(!silent||message)toast(message);
}

// The player's bottom bars keep pixel heights computed for B站's own column width. At other
// widths the danmaku bar lands on top of the like/coin/favorite/share toolbar (or leaves a hole),
// so measure the real gap and offset the toolbar instead of fighting the player's internals.
let videoAlignTimer;
function alignVideoToolbar(){
  if(pageKind()!=='video'||fullActive||pipActive)return;
  const bar=$('.bpx-player-sending-area')||$('.bpx-player-sending-bar');
  const toolbar=$('.video-toolbar-container');
  if(!bar||!toolbar||bar.getBoundingClientRect().height<10)return;
  toolbar.style.removeProperty('margin-top');
  const base=parseFloat(getComputedStyle(toolbar).marginTop)||0;
  const delta=Math.round(bar.getBoundingClientRect().bottom-toolbar.getBoundingClientRect().top);
  if(!delta)return;
  toolbar.style.setProperty('margin-top',Math.max(-480,Math.min(480,Math.round(base+delta)))+'px','important');
}
function scheduleVideoAlign(){
  const video=playbackVideo();
  if(video&&!video.dataset.bsAlign){
    video.dataset.bsAlign='1';
    video.addEventListener('loadedmetadata',scheduleVideoAlign);
    video.addEventListener('resize',scheduleVideoAlign);
  }
  clearTimeout(videoAlignTimer);
  requestAnimationFrame(()=>{
    alignVideoToolbar();
    videoAlignTimer=setTimeout(()=>{alignVideoToolbar();setTimeout(()=>{alignVideoToolbar();setTimeout(alignVideoToolbar,900);},420);},120);
  });
}
function pageKind(){
  const path=location.pathname.replace(/^\/(?:zh-Hans|zh-Hant|en)(?=\/|$)/,'')||'/';
  if(location.hostname==='space.bilibili.com')return 'space';
  if(location.hostname==='search.bilibili.com')return 'search';
  if(location.hostname==='t.bilibili.com'||/^\/opus(?:\/|$)/.test(path))return 'dynamic';
  if(/\/(?:account\/)?history(?:\/|$)/.test(path))return 'history';
  if(/^\/(?:video|bangumi|list)(?:\/|$)/.test(path))return 'video';
  if(location.hostname==='message.bilibili.com')return 'messages';
  return /^\/(?:index\.html)?$/.test(path)?'home':'other';
}
let headerSurfaceReady=false,headerVideoTarget=false,headerRouteFrame;
function animateHeaderRoute(){if(!shadow)return;const left=$('.header-left',shadow);cancelAnimationFrame(headerRouteFrame);headerRouteFrame=requestAnimationFrame(()=>{headerRouteFrame=requestAnimationFrame(()=>{left.dataset.video=String(headerVideoTarget);});});}
function surfaceRevealed(){headerSurfaceReady=true;animateHeaderRoute();}
function syncRoute(){
  const key=location.href,kind=pageKind();
  document.documentElement.dataset.bsPage=kind;
  mountVideoHome();
  if(kind==='video')scheduleVideoAlign();
  else{const toolbar=$('.video-toolbar-container');if(toolbar)toolbar.style.removeProperty('margin-top');}
  mountHomeBanner();
  compactHomeFeed();
  if(!shadow)return;
  const topHome=$('.video-home-top',shadow);if(topHome)topHome.hidden=kind!=='video';headerVideoTarget=kind==='video';if(headerSurfaceReady)animateHeaderRoute();
  $$('nav a[data-route]',shadow).forEach(a=>{
    if(a.dataset.route===kind)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  if(key!==routeKey){
    const previous=routeKey;routeKey=key;if(previous&&kind==='video'){beginVideoLoading();setTimeout(()=>settleVideoLoading(),200);}else if(kind!=='video')cancelVideoLoading();
    const query=new URLSearchParams(location.search).get('keyword');
    if(query!==null)$('.search input',shadow).value=query;
  }
}
function mountHomeBanner(){
  if(pageKind()!=='home')return;
  const banner=$('.bili-header__banner')||$('.bili-header .bili-banner');if(!banner)return;
  banner.dataset.bsBanner='true';
  // Reveal only the banner's header ancestors, not the duplicate webpage toolbar.
  for(let host=banner.parentElement;host&&host.matches('.bili-header,#biliMainHeader,#bili-header-container,#internationalHeader,.international-header');host=host.parentElement){
    host.dataset.bsBannerHost='true';
  }
  if(!$('.bs-banner-brand',banner)){
    const brand=document.createElement('span');brand.className='bs-banner-brand';
    brand.setAttribute('aria-label','Bili Space');brand.innerHTML='Bili <b>Space</b>';banner.append(brand);
  }
  // Native animated layers and handlers remain untouched. Static overseas banners get a subtle fallback.
  if(!banner.dataset.bsMotion){
    banner.dataset.bsMotion=$('.animated-banner,video,canvas',banner)?'native':'static';
    if(banner.dataset.bsMotion==='static'){
      let frame;
      banner.addEventListener('pointermove',e=>{
        if(e.pointerType!=='mouse'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
        cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const r=banner.getBoundingClientRect();banner.style.setProperty('--bs-banner-x',(((e.clientX-r.left)/r.width-.5)*12).toFixed(2)+'px');});
      },{passive:true});
      banner.addEventListener('pointerleave',()=>{cancelAnimationFrame(frame);banner.style.setProperty('--bs-banner-x','0px');});
    }
  }
}
function compactHomeFeed(){
  if(pageKind()!=='home')return;
  markAds();
  const cardSelector='.feed-card,.bili-feed-card,.bili-video-card,.floor-single-card';
  for(const layout of $$('.bili-feed4-layout')){
    const feeds=$$('.feed2',layout);
    const hosts=feeds.length?feeds:$$('.recommended-container_floor-aside,.recommended-container_overseas',layout);
    for(const host of hosts){
      host.dataset.bsFeed='grid';
      host.dataset.bsPrefetch=String(!navigator.connection?.saveData);
      for(const card of $$(cardSelector,host)){
        // A promotion may itself contain video-card markup; never flatten its clipping box.
        if(card.closest('[data-bs-ad=true]'))continue;
        const sentinel=card.closest('.load-more-anchor');
        if(sentinel){sentinel.dataset.bsFeed='sentinel';continue;}
        // Keep Vue-owned nodes and their event handlers; flatten layout boxes only.
        const outer=card.parentElement.closest(cardSelector);
        if(outer&&host.contains(outer))continue;
        card.dataset.bsFeed='card';const inner=card.matches('.bili-video-card')?null:$('.bili-video-card',card);if(inner&&getComputedStyle(inner).display==='none')card.dataset.bsEmpty='true';else delete card.dataset.bsEmpty;
        for(let p=card.parentElement;p&&p!==host;p=p.parentElement)p.dataset.bsFeed='wrapper';
      }
      wakeHomeLoader(host);
    }
  }
  if(!navigator.connection?.saveData){
    let budget=12;
    for(const img of $$('.bili-feed4-layout [data-bs-feed=card] img[loading=lazy]')){
      if(!budget)break;const r=img.getBoundingClientRect();
      if(r.bottom>=0&&r.top<innerHeight*2.5){img.loading='eager';img.decoding='async';if(r.top>innerHeight)img.fetchPriority='low';budget--;}
    }
  }
}
function wakeHomeLoader(host){
  if(!PREFS.hideAds||navigator.connection?.saveData)return;
  const anchor=$('.load-more-anchor',host);if(!anchor)return;
  const near=()=>{const r=anchor.getBoundingClientRect();return anchor.isConnected&&r.height>0&&r.bottom>0&&r.bottom<innerHeight+180;};
  if(!near())return;
  const key=location.href+':'+$$('.bili-video-card a[href*="/video/"],.floor-single-card:not(.floor-skeleton)',host).length;
  if(key===homeLoadWakeKey)return;
  homeLoadWakeKey=key;clearTimeout(homeLoadWakeTimer);clearTimeout(homeLoadRetryTimer);
  // Current Bili pagination checks geometry on scroll, not only IntersectionObserver.
  // Recheck after layout without scrolling the viewport or duplicating its API/controller.
  const wake=()=>{if(pageKind()==='home'&&PREFS.hideAds&&!navigator.connection?.saveData&&near()){
    host.dataset.bsPrefetchWakes=String(Number(host.dataset.bsPrefetchWakes||0)+1);window.dispatchEvent(new Event('scroll'));
  }};
  homeLoadWakeTimer=setTimeout(()=>{wake();homeLoadRetryTimer=setTimeout(()=>{if(key===homeLoadWakeKey)wake();},1200);},450);
}

// Existing headerBack preference remains compatible with previously saved settings.
const CATEGORIES=[['番剧','https://www.bilibili.com/anime/'],['国创','https://www.bilibili.com/guochuang/'],['漫画','https://manga.bilibili.com/'],['直播','https://live.bilibili.com/'],['动画','https://www.bilibili.com/v/douga/'],['游戏','https://www.bilibili.com/v/game/'],['音乐','https://www.bilibili.com/v/music/'],['舞蹈','https://www.bilibili.com/v/dance/'],['鬼畜','https://www.bilibili.com/v/kichiku/'],['知识','https://www.bilibili.com/v/knowledge/'],['科技','https://www.bilibili.com/v/tech/'],['美食','https://www.bilibili.com/v/food/'],['生活','https://www.bilibili.com/v/life/'],['影视','https://www.bilibili.com/v/cinephile/'],['电影','https://www.bilibili.com/movie/'],['电视剧','https://www.bilibili.com/tv/'],['纪录片','https://www.bilibili.com/documentary/'],['专栏','https://www.bilibili.com/read/home']];
function setCategories(open,keyboard=false){
  if(!shadow)return;
  const trigger=$('.back',shadow),links=$('#header-categories',shadow),lane=$('.nav-lane',shadow),nav=$('.primary-nav',shadow);
  open=Boolean(open&&PREFS.headerBack);
  trigger.dataset.instant=String(keyboard);trigger.setAttribute('aria-expanded',String(open));links.inert=!open;
  trigger.setAttribute('aria-label',open?'返回主导航':'展开分区');
  $('.header-left',shadow).dataset.categories=String(open);
  nav.hidden=open||!$$('a',nav).some(a=>!a.hidden);nav.inert=open;
  lane.style.setProperty('--category-space','100%');
  nav.style.transform='none';
  if(keyboard)lane.classList.add('instant');else lane.classList.remove('instant');
}
let playbackSuspended=false,completedVideoKey='',videoLoadTimer,videoWaitTimer,loadFrameOwner,loadFrameHandle;const watchedLoadingVideos=new WeakSet(),videoLoadingEvents=[],loadingAutoplay=new WeakMap();
function cancelLoadingFrame(){if(loadFrameOwner?.cancelVideoFrameCallback&&loadFrameHandle!=null)loadFrameOwner.cancelVideoFrameCallback(loadFrameHandle);loadFrameOwner=null;loadFrameHandle=null;}
function videoLoadingKey(value=location.href){try{const url=new URL(value,location.href);if(!/(^|\.)bilibili\.com$/i.test(url.hostname)&&url.hostname!=='bili-space.local')return '';const path=url.pathname.replace(/^\/(?:zh-Hans|zh-Hant|en)(?=\/|$)/,'').replace(/\/$/,'');return /^\/(?:video|bangumi|list)(?:\/|$)/.test(path)?path+'?p='+(url.searchParams.get('p')||'1'):'';}catch{return '';}}
function watchVideoLoading(){const video=playbackVideo();if(!video||watchedLoadingVideos.has(video))return;watchedLoadingVideos.add(video);const start=()=>{if(video.isConnected&&pageKind()==='video'&&videoLoadingKey()!==completedVideoKey){beginVideoLoading();settleVideoLoading();}};video.addEventListener('emptied',start);video.addEventListener('loadstart',start);video.addEventListener('loadedmetadata',()=>{const key=videoLoadingKey();if(loadingAutoplay.get(video)?.key!==key)autoplayLoadingVideo(video,{dataset:{key}});});for(const event of ['loadeddata','playing','timeupdate'])video.addEventListener(event,()=>{if($('#bs-video-loading'))settleVideoLoading();});if($('#bs-video-loading'))settleVideoLoading();}
function recordVideoLoading(event){videoLoadingEvents.push({event,time:performance.now(),videoReady:playbackVideo()?.readyState,videoTime:playbackVideo()?.currentTime});if(videoLoadingEvents.length>24)videoLoadingEvents.shift();}
function cancelVideoLoading(){clearTimeout(videoLoadTimer);clearTimeout(videoWaitTimer);cancelLoadingFrame();const layer=$('#bs-video-loading');if(layer){layer.remove();recordVideoLoading('cancelled');}}
function beginVideoLoading(target=location.href){
  const key=videoLoadingKey(target);if(!key||key===completedVideoKey)return;
  let layer=$('#bs-video-loading');if(layer?.dataset.key===key)return;if(layer)cancelVideoLoading();
  recordVideoLoading('enter');layer=document.createElement('div');layer.id='bs-video-loading';layer.dataset.key=key;layer.setAttribute('role','status');layer.setAttribute('aria-live','polite');layer.innerHTML='<div>'+ICON_TV+'<p>正在打开视频…</p></div>';document.documentElement.append(layer);setTimeout(()=>settleVideoLoading(),0);
}
function beginNavigation(target){const url=new URL(target,location.href);if(videoLoadingKey(url.href)){setLoading(false);beginVideoLoading(url.href);}else{cancelVideoLoading();setLoading(url.hostname==='search.bilibili.com');}}
function finishVideoLoading(){
  const layer=$('#bs-video-loading');if(!layer||layer.classList.contains('leaving'))return;completedVideoKey=layer.dataset.key;clearTimeout(videoWaitTimer);cancelLoadingFrame();clearTimeout(videoLoadTimer);if(!layer.classList.contains('leaving'))recordVideoLoading('exit');layer.classList.add('leaving');layer.style.background='transparent';const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;videoLoadTimer=setTimeout(()=>{layer.remove();recordVideoLoading('removed');},reduced?0:120);
}
function autoplayLoadingVideo(video,layer){
  if(playbackSuspended||!video||video.readyState<1||!video.paused||video.ended||video.error)return;
  let state=loadingAutoplay.get(video);if(!state||state.key!==layer.dataset.key){state={key:layer.dataset.key,attempts:0,last:-Infinity,pending:false};loadingAutoplay.set(video,state);}
  if(state.pending||state.attempts>=3||performance.now()-state.last<750)return;
  state.attempts++;state.last=performance.now();state.pending=true;video.autoplay=true;
  try{Promise.resolve(video.play()).catch(error=>{state.error=error?.name||'PlaybackError';}).finally(()=>state.pending=false);}catch(error){state.error=error?.name||'PlaybackError';state.pending=false;}
}
function videoInterfaceReady(){return !!$('.video-info-container,#viewbox_report,.video-container-v1,.video-container-v2,.left-container,.bpx-player-container,.bpx-player-video-wrap,#bilibili-player');}
function settleVideoLoading(failed=false){
  const layer=$('#bs-video-loading');if(!layer)return;if(failed){toast('页面加载失败，请检查网络后重试。');finishVideoLoading();return;}
  if(layer.dataset.waiting)return;layer.dataset.waiting='true';const start=performance.now();
  const wait=()=>{
    if($('#bs-video-loading')!==layer||layer.classList.contains('leaving'))return;
    const video=playbackVideo(),waitForVideo=PREFS.videoLoadingMode==='video';
    if(waitForVideo)autoplayLoadingVideo(video,layer);
    if(layer.dataset.key===videoLoadingKey()&&(waitForVideo?video?.readyState>=2:videoInterfaceReady())){finishVideoLoading();return;}
    if(performance.now()-start>12000){finishVideoLoading();return;}
    $('p',layer).textContent=PREFS.videoLoadingMode==='video'?'正在加载视频画面…':'正在打开视频页面…';videoWaitTimer=setTimeout(wait,50);
  };wait();
}

function setLoading(on,failed=false){
  if(!on&&pageKind()==='video')settleVideoLoading(failed);else if(pageKind()!=='video')cancelVideoLoading();
  if(!shadow)return;
  const form=$('.search',shadow);form.setAttribute('aria-busy',String(on));
  $('#search-status',shadow).textContent=on?'正在加载搜索结果…':failed?'加载失败，请重试':'';
  clearTimeout(loadingTimer);
  if(on)loadingTimer=setTimeout(()=>setLoading(false,true),20000);
}
let searchHistory=[],searchSuggestions=[],searchSuggestTimer,searchSuggestRequest,searchSuggestRevision=0,searchActive=-1,searchComposing=false,searchSuggestStatus='';
function sanitizeSearchHistory(items){return Array.isArray(items)?[...new Set(items.filter(x=>typeof x==='string'&&x.trim()&&x.length<=100&&!/[\r\n\t\0]/.test(x)).map(x=>x.trim()))].slice(0,20):[];}
function acceptSearchHistory(items){searchHistory=sanitizeSearchHistory(items);if(shadow&&root?.isConnected&&!$('#search-panel',shadow).hidden)renderSearchPanel();}
const OFFICIAL_HISTORY_URL='https://s1.hdslb.com/bfs/seed/jinkela/short/cols/iframe.html',OFFICIAL_HISTORY_ORIGIN='https://s1.hdslb.com',OFFICIAL_HISTORY_KEY='search_history:search_history';
let officialHistoryFrame,officialHistoryReady,officialHistoryQueue=Promise.resolve(),officialHistoryStatus='';
async function historyFrame(){
  if(officialHistoryReady)return officialHistoryReady;
  officialHistoryReady=new Promise((resolve,reject)=>{const start=()=>{officialHistoryFrame=$('iframe[src="'+OFFICIAL_HISTORY_URL+'"]');if(officialHistoryFrame){resolve(officialHistoryFrame);return;}const frame=document.createElement('iframe');officialHistoryFrame=frame;frame.dataset.count='1';frame.hidden=true;frame.src=OFFICIAL_HISTORY_URL;frame.setAttribute('aria-hidden','true');const timer=setTimeout(()=>reject(Error('history frame timeout')),5000);frame.addEventListener('load',()=>{frame.dataset.loaded='true';clearTimeout(timer);resolve(frame);},{once:true});document.body.append(frame);};if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});}).catch(error=>{officialHistoryReady=null;throw error;});return officialHistoryReady;
}
async function officialHistoryRequest(type,value,key=OFFICIAL_HISTORY_KEY){const frame=await historyFrame();return new Promise((resolve,reject)=>{const id='bili-space-history-'+crypto.randomUUID(),timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('official history unavailable'));},2000);function receive(e){if(e.origin!==OFFICIAL_HISTORY_ORIGIN||e.source!==frame.contentWindow||e.data?.type!=='COLS_RES'||e.data.id!==id||e.data.key!==key)return;clearTimeout(timer);window.removeEventListener('message',receive);resolve(e.data.value);}window.addEventListener('message',receive);frame.contentWindow.postMessage({type,key,id,...(type==='COLS_SET'?{value}:{})},OFFICIAL_HISTORY_ORIGIN);});}
function officialRecords(raw){try{const values=JSON.parse(raw||'[]');if(!Array.isArray(values))return [];const seen=new Set();return values.filter(x=>x&&typeof x.value==='string'&&x.value.trim()&&x.value.length<=100&&!seen.has(x.value)&&seen.add(x.value)).slice(0,20);}catch{return [];}}
async function readOfficialSearchHistory(){let raw=await officialHistoryRequest('COLS_GET');if(raw===null||raw===undefined){const legacy=localStorage.getItem('search_history');if(legacy){raw=legacy;await officialHistoryRequest('COLS_SET',JSON.stringify(officialRecords(raw)));}}return officialRecords(raw);}
async function loadOfficialSearchHistory(){try{const records=await readOfficialSearchHistory();officialHistoryStatus='';acceptSearchHistory(records.map(x=>x.value));}catch{officialHistoryStatus='B站搜索历史暂时不可用';if(shadow&&root?.isConnected&&!$('#search-panel',shadow).hidden)renderSearchPanel();}}
function changeSearchHistory(action,term){const operation=officialHistoryQueue.then(async()=>{let records=await readOfficialSearchHistory();if(action==='add')records=[{value:term,timestamp:Date.now()},...records.filter(x=>x.value!==term)].slice(0,20);else if(action==='delete')records=records.filter(x=>x.value!==term);else records=[];await officialHistoryRequest('COLS_SET',JSON.stringify(records));await officialHistoryRequest('COLS_SET','1','search_history:migrated');officialHistoryStatus='';acceptSearchHistory(records.map(x=>x.value));});officialHistoryQueue=operation.catch(()=>{officialHistoryStatus='B站搜索历史暂时不可用';toast('无法更新B站搜索历史，请稍后重试。');if(shadow&&root?.isConnected&&!$('#search-panel',shadow).hidden)renderSearchPanel();});return officialHistoryQueue;}

function closeSearchPanel(){if(!shadow)return;$('#search-panel',shadow).hidden=true;$('.search input',shadow).setAttribute('aria-expanded','false');$('.search input',shadow).removeAttribute('aria-activedescendant');clearTimeout(searchSuggestTimer);searchSuggestRequest?.abort();searchSuggestRevision++;searchActive=-1;}
function renderSearchPanel(){
  const panel=$('#search-panel',shadow),input=$('.search input',shadow);panel.replaceChildren();searchActive=-1;input.removeAttribute('aria-activedescendant');
  const heading=(label)=>{const h=document.createElement('h2');h.textContent=label;panel.append(h);return h;};
  const choice=(term,history)=>{const row=document.createElement('div');row.className=history?'search-history-chip':'search-row';const button=document.createElement('button');button.type='button';button.className='search-choice';button.dataset.query=term;button.textContent=term;button.id='search-option-'+panel.querySelectorAll('[data-query]').length;button.setAttribute('role','option');button.tabIndex=-1;row.append(button);if(history){const remove=document.createElement('button');remove.type='button';remove.className='search-remove';remove.dataset.remove=term;remove.textContent='×';remove.setAttribute('aria-label','删除搜索历史：'+term);row.append(remove);}(history?$('.search-history-chips',panel):panel).append(row);};
  if(searchHistory.length){const h=heading('搜索历史'),clear=document.createElement('button');clear.type='button';clear.className='search-clear';clear.dataset.clear='true';clear.textContent='清空';clear.setAttribute('aria-label','清空搜索历史');h.append(clear);const chips=document.createElement('div');chips.className='search-history-chips';panel.append(chips);searchHistory.forEach(term=>choice(term,true));}
  else{heading('搜索历史');const empty=document.createElement('p');empty.textContent=officialHistoryStatus||'暂无搜索历史';panel.append(empty);}
  heading('猜你想搜');searchSuggestions.forEach(term=>choice(term,false));if(!searchSuggestions.length){const status=document.createElement('p');status.setAttribute('role','status');status.textContent=searchSuggestStatus||'输入关键词，获取官方搜索联想';panel.append(status);}
}
function openSearchPanel(){if(!shadow)return;$('#search-panel',shadow).hidden=false;$('.search input',shadow).setAttribute('aria-expanded','true');renderSearchPanel();loadOfficialSearchHistory();queueSearchSuggestions();}
function queueSearchSuggestions(){
  clearTimeout(searchSuggestTimer);searchSuggestRequest?.abort();const revision=++searchSuggestRevision,query=$('.search input',shadow).value;searchSuggestions=[];searchSuggestStatus=query?'正在获取官方联想…':'';renderSearchPanel();if(!query.trim()){searchSuggestStatus='输入关键词，获取官方搜索联想';renderSearchPanel();return;}
  searchSuggestTimer=setTimeout(async()=>{const controller=new AbortController();searchSuggestRequest=controller;const timeout=setTimeout(()=>controller.abort(),5000);try{
    const term=query.toWellFormed?query.toWellFormed():Array.from(query).map(c=>c.length===1&&/[\uD800-\uDFFF]/.test(c)?'�':c).join(''),params='highlight=0&term='+encodeURIComponent(term)+'&spmid=333.1007';
    const response=await fetch('https://api.bilibili.com/x/web-interface/suggest?'+params,{credentials:'include',signal:controller.signal});if(!response.ok)throw Error('suggestion unavailable');const data=await response.json(),payload=data.data||data;if(data.code!==0)throw Error('suggestion unavailable');const tags=payload.result?.tag??[];if(!Array.isArray(tags))throw Error('invalid suggestions');if(revision!==searchSuggestRevision)return;
    searchSuggestions=sanitizeSearchHistory(tags.map(item=>item.value||item.term)).slice(0,8);searchSuggestStatus=searchSuggestions.length?'':'暂无官方联想';
  }catch{if(revision!==searchSuggestRevision)return;searchSuggestions=[];searchSuggestStatus='官方联想暂时不可用';}finally{clearTimeout(timeout);if(revision===searchSuggestRevision&&!$('#search-panel',shadow).hidden)renderSearchPanel();}},180);
}
function chooseSearch(term){$('.search input',shadow).value=term;submitSearch();}
function installSearchPanel(){
  const form=$('.search',shadow),input=$('input',form),panel=$('#search-panel',shadow);
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls','search-panel');input.setAttribute('aria-expanded','false');
  input.addEventListener('focus',openSearchPanel);input.addEventListener('click',()=>{if(panel.hidden)openSearchPanel();});input.addEventListener('input',e=>{if(e.isComposing||searchComposing)return;panel.hidden=false;input.setAttribute('aria-expanded','true');queueSearchSuggestions();});
  input.addEventListener('compositionstart',()=>searchComposing=true);input.addEventListener('compositionend',()=>{searchComposing=false;openSearchPanel();});
  input.addEventListener('keydown',e=>{if(e.isComposing||searchComposing)return;const options=$$('[data-query]',panel);if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopPropagation();closeSearchPanel();return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();e.stopPropagation();if(panel.hidden)openSearchPanel();const choices=$$('[data-query]',panel);if(!choices.length)return;searchActive=(searchActive+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices.forEach((el,i)=>{el.classList.toggle('selected',i===searchActive);el.setAttribute('aria-selected',String(i===searchActive));});input.setAttribute('aria-activedescendant',choices[searchActive].id);choices[searchActive].scrollIntoView?.({block:'nearest'});}else if(e.key==='Enter'&&!panel.hidden&&options[searchActive]){e.preventDefault();e.stopPropagation();chooseSearch(options[searchActive].dataset.query);}});
  panel.addEventListener('pointerdown',e=>e.preventDefault());panel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.remove!==undefined){changeSearchHistory('delete',b.dataset.remove);renderSearchPanel();}else if(b.dataset.clear){changeSearchHistory('clear');renderSearchPanel();}else if(b.dataset.query!==undefined)chooseSearch(b.dataset.query);});
  form.addEventListener('focusout',e=>{if(!form.contains(e.relatedTarget))closeSearchPanel();});document.addEventListener('pointerdown',e=>{if(!e.composedPath().includes(form))closeSearchPanel();},{passive:true});
}
async function submitSearch(){
  const input=$('.search input',shadow),query=input.value.trim();
  if(!query||searchComposing)return;
  closeSearchPanel();
  const url='https://search.bilibili.com/all?keyword='+encodeURIComponent(query);
  beginNavigation(url);await changeSearchHistory('add',query);native('navigate',{url});
}
function profileMd5(text){
  const bytes=new TextEncoder().encode(text),size=(((bytes.length+8)>>>6)+1)*64,buffer=new Uint8Array(size);buffer.set(bytes);buffer[bytes.length]=128;const view=new DataView(buffer.buffer);view.setUint32(size-8,bytes.length*8,true);view.setUint32(size-4,Math.floor(bytes.length/536870912),true);let a=0x67452301,b=0xefcdab89,c=0x98badcfe,d=0x10325476;const shifts=[[7,12,17,22],[5,9,14,20],[4,11,16,23],[6,10,15,21]];
  for(let offset=0;offset<size;offset+=64){let A=a,B=b,C=c,D=d;for(let i=0;i<64;i++){let f,g;if(i<16){f=(B&C)|(~B&D);g=i;}else if(i<32){f=(D&B)|(~D&C);g=(5*i+1)%16;}else if(i<48){f=B^C^D;g=(3*i+5)%16;}else{f=C^(B|~D);g=(7*i)%16;}const n=(A+f+(Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0)+view.getUint32(offset+g*4,true))|0,r=shifts[i>>>4][i%4],old=D;D=C;C=B;B=(B+((n<<r)|(n>>>(32-r))))|0;A=old;}a=(a+A)|0;b=(b+B)|0;c=(c+C)|0;d=(d+D)|0;}
  const result=new DataView(new ArrayBuffer(16));[a,b,c,d].forEach((n,i)=>result.setInt32(i*4,n,true));return [...new Uint8Array(result.buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function ownSpaceInfoPath(profile){const keys=profile.wbi;if(!keys?.img_url||!keys?.sub_url)return '';try{const raw=[keys.img_url,keys.sub_url].map(x=>new URL(x).pathname.split('/').pop().split('.')[0]).join(''),order=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];if(raw.length!==64)return '';const key=order.map(i=>raw[i]).join('').slice(0,32),params={mid:String(profile.mid),platform:'web',web_location:'1550101',wts:String(Math.floor(Date.now()/1000))},query=Object.keys(params).sort().map(k=>encodeURIComponent(k)+'='+encodeURIComponent(params[k].replace(/[!'()*]/g,''))).join('&');return '/x/space/wbi/acc/info?'+query+'&w_rid='+profileMd5(query+key);}catch{return '';}}
const OFFICIAL_SPACE_BANNERS={1:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_spring.png",2:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_bike.png",5:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_become_idol.png",11:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_universe.png",10:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_star_war.png",12:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_ace_agent.png",3:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_starry_sky.png",14:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_sunny.png",6:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_greenery.png",13:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_wonderland.png",15:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_extracurricular.png",4:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_star_cluster.png",7:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_lolita.png",9:"https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_dark_door.png"};
function profileMediaUrl(value){if(typeof value!=='string'||!value||value.length>4096)return '';try{const url=new URL(value.startsWith('bfs/')?'https://i0.hdslb.com/'+value:value,location.href);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!/(^|\.)(hdslb|bilibili|bilivideo)\.com$/i.test(url.hostname))return '';url.protocol='https:';return url.href;}catch{return '';}}
function setProfileImage(host,className,url,alt){let image=$('.'+className,host);if(!url){image?.remove();return;}if(!image){image=document.createElement('img');image.className=className;image.alt=alt;image.referrerPolicy='no-referrer';image.onerror=()=>image.hidden=true;host.append(image);}if(image.getAttribute('src')!==url){image.hidden=false;image.src=url;}}
const PROFILE_MEDIA_CACHE='bili-space-backgrounds-v1',PROFILE_MEDIA_LIMIT=8*1024*1024,PROFILE_MEDIA_ENTRIES=12;const profileMediaBlobs=new Map(),profileMediaPending=new Map();
async function boundedProfileBlob(response){const type=response.headers.get('content-type')||'';if(!/^(image\/|video\/(mp4|webm))/.test(type)||Number(response.headers.get('content-length')||0)>PROFILE_MEDIA_LIMIT)return null;if(!response.body?.getReader){const blob=await response.blob();return blob.size<=PROFILE_MEDIA_LIMIT?blob:null;}const reader=response.body.getReader(),chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>PROFILE_MEDIA_LIMIT){await reader.cancel();return null;}chunks.push(value);}return new Blob(chunks,{type});}
function cachedProfileMedia(value){const url=profileMediaUrl(value);if(!url)return Promise.resolve('');if(profileMediaBlobs.has(url))return Promise.resolve(profileMediaBlobs.get(url));if(profileMediaPending.has(url))return profileMediaPending.get(url);if(typeof caches==='undefined'||!URL.createObjectURL)return Promise.resolve(url);
  const task=(async()=>{try{const cache=await caches.open(PROFILE_MEDIA_CACHE);let response=await cache.match(url),blob;if(response){blob=await boundedProfileBlob(response);}else{response=await fetch(url,{mode:'cors',credentials:'omit',cache:'force-cache',referrerPolicy:'no-referrer'});if(!response.ok||Number(response.headers.get('content-length')||0)>PROFILE_MEDIA_LIMIT)return url;blob=await boundedProfileBlob(response);if(!blob)return url;try{await cache.put(url,new Response(blob,{headers:{'Content-Type':blob.type}}));const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-PROFILE_MEDIA_ENTRIES)))await cache.delete(key);}catch{}}
    if(!blob||blob.size>PROFILE_MEDIA_LIMIT||!/^(image\/|video\/(mp4|webm))/.test(blob.type))return url;const object=URL.createObjectURL(blob);profileMediaBlobs.set(url,object);return object;
  }catch{return url;}finally{profileMediaPending.delete(url);}})();profileMediaPending.set(url,task);return task;
}
async function warmProfileMediaCache(){if(typeof caches==='undefined'||!URL.createObjectURL)return;try{const cache=await caches.open(PROFILE_MEDIA_CACHE),keys=await cache.keys();await Promise.all(keys.slice(-PROFILE_MEDIA_ENTRIES).map(key=>cachedProfileMedia(key.url)));cacheSpaceBackgrounds();}catch{}}
function cachedProfileBanner(mid){try{const record=JSON.parse(localStorage.getItem('bili-space:background:'+mid)||'null');if(record?.mid!==String(mid)||Date.now()-record.updated>30*86400000)return {};return {banner:profileMediaUrl(record.banner),bannerStatic:profileMediaUrl(record.bannerStatic)};}catch{return {};}}
function rememberProfileBanner(profile){if(!profile?.banner)return;try{localStorage.setItem('bili-space:background:'+profile.mid,JSON.stringify({mid:String(profile.mid),banner:profileMediaUrl(profile.banner),bannerStatic:profileMediaUrl(profile.bannerStatic),updated:Date.now()}));}catch{}}
function bindCachedProfileMedia(media,source,ready){if(media.dataset.bsBackgroundSource===source)return;media.dataset.bsBackgroundSource=source;const apply=url=>{if(media.dataset.bsBackgroundSource!==source)return;if(media.getAttribute('src')!==url)media.src=url;ready?.();};if(profileMediaBlobs.has(source))apply(profileMediaBlobs.get(source));else cachedProfileMedia(source).then(apply);}
function cacheSpaceBackgrounds(){if(location.hostname!=='space.bilibili.com')return;for(const node of $$('.space-theme-bg,.header-toutu,.header-toutu [style*="background"],.space-header [style*="background-image"]')){const css=getComputedStyle(node).backgroundImage,match=css.match(/^url\((["']?)(.*?)\1\)$/);if(!match)continue;const source=profileMediaUrl(match[2]);if(!source)continue;const apply=url=>{if(!node.isConnected||node.dataset.bsBackgroundSource!==source)return;const current=getComputedStyle(node).backgroundImage;if(current.includes(source)||current.includes(match[2]))node.style.setProperty('background-image','url("'+url+'")',node.style.getPropertyPriority('background-image'));};node.dataset.bsBackgroundSource=source;if(profileMediaBlobs.has(source))apply(profileMediaBlobs.get(source));else cachedProfileMedia(source).then(apply);}}
function mergeAccountDecorations(info={},cardData={}){
  if(!accountProfile)return;const card=cardData.card||{},mid=String(accountProfile.mid);if(info.mid!==undefined&&String(info.mid)!==mid)info={};if(card.mid!==undefined&&String(card.mid)!==mid)return;
  const photo=info.top_photo_v2||info.toutu||{},theme=info.theme||{},pendant=info.pendant||card.pendant||accountProfile.pendant||{},vip=info.vip||card.vip||accountProfile.vip||{};
  accountProfile.face=profileMediaUrl(info.face||card.face||accountProfile.face);
  accountProfile.banner=profileMediaUrl(photo.l_200h_img||photo.l_img||OFFICIAL_SPACE_BANNERS[photo.sid]||theme.toutu||info.top_photo||cardData.space?.l_img||accountProfile.banner);
  accountProfile.bannerStatic=profileMediaUrl(info.top_photo||photo.l_img||accountProfile.banner);
  accountProfile.pendant=pendant;accountProfile.vip=vip;rememberProfileBanner(accountProfile);
}
function renderAccountDecorations(){
  const card=$('#account-card',shadow),account=$('.account',shadow),portrait=$('.account-portrait',card),banner=$('.account-banner',card),profile=accountProfile;
  const face=profileMediaUrl(profile?.face),pendant=profile?.pendant||{},vip=profile?.vip||{},reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame=profileMediaUrl((reduced&&pendant.image_enhance_frame)||pendant.image_enhance||pendant.image||pendant.image_enhance_frame);
  const vipType=Number(vip.type??vip.vipType),vipStatus=Number(vip.status??vip.vipStatus),isVip=vipType>0&&vipStatus===1;
  const badge=isVip?(profileMediaUrl(vip.avatar_subscript_url||vip.avatar_icon?.icon_resource?.url)||'https://i0.hdslb.com/bfs/seed/jinkela/short/user-avatar/'+(Number(vip.avatar_subscript)===2?'small-vip':'big-vip')+'.svg'):'';
  if(face){if(!$('.account-face',account))account.replaceChildren();for(const host of [account,portrait]){setProfileImage(host,'account-face',face,profile.uname||'我的头像');setProfileImage(host,'account-pendant',frame,pendant.name||'头像挂件');setProfileImage(host,'account-vip-badge',badge,'大会员');}}else{portrait.replaceChildren();if(!profile){account.replaceChildren(document.createTextNode('登录 B站'));account.removeAttribute('title');account.setAttribute('aria-label','登录 B站');delete account.dataset.authenticated;account.href='https://passport.bilibili.com/login?gourl=https%3A%2F%2Fwww.bilibili.com%2F';}}
  portrait.hidden=!face;
  const label=$('.account-vip-label',card);label.textContent=isVip?(vip.label?.text||'大会员'):'';label.hidden=!isVip;
  const src=profileMediaUrl((reduced&&profile?.bannerStatic)||profile?.banner);banner.hidden=!src;
  if(!src){$('video',banner)?.pause();banner.replaceChildren();return;}
  const video=/\.(mp4|webm)(?:$|[?#])/i.test(src);let media=banner.firstElementChild;if(!media||media.tagName!==(video?'VIDEO':'IMG')){media=document.createElement(video?'video':'img');media.referrerPolicy='no-referrer';if(video){media.muted=true;media.loop=true;if(profile.bannerStatic&&profile.bannerStatic!==src)media.poster=profile.bannerStatic;media.playsInline=true;media.preload='metadata';media.setAttribute('aria-label','主页动态横幅');media.onerror=()=>{if(profile.bannerStatic&&profile.bannerStatic!==src){profile.banner=profile.bannerStatic;renderAccountDecorations();}else banner.hidden=true;};}else{media.alt='我的主页横幅';media.onerror=()=>banner.hidden=true;}banner.replaceChildren(media);}bindCachedProfileMedia(media,src,()=>{if(video&&!card.hidden&&!reduced)media.play().catch(()=>{});});
  if(video){if(!card.hidden&&!reduced)media.play().catch(()=>{});else media.pause();}
}
let accountProfile=null,accountStatsAt=0,accountStatsRequest=null,accountHideTimer,accountShowTimer,accountMotion;
function renderAccountCard(){
  if(!shadow)return;const card=$('#account-card',shadow);if(!card)return;
  renderAccountDecorations();
  $('.account-name',card).textContent=accountProfile?.uname||'尚未登录';$('.account-name',card).title=accountProfile?.uname||'';
  $('.account-level',card).textContent=Number.isInteger(accountProfile?.level)?'Lv.'+accountProfile.level:'等级 —';
  for(const key of ['follower','following','likes'])$('[data-stat='+key+']',card).textContent=Number.isFinite(accountProfile?.[key])?new Intl.NumberFormat('zh-CN').format(accountProfile[key]):'—';
  $('.account-status',card).textContent=accountProfile?'数据来自 B站；未获取的项目显示 —'+(!accountProfile.banner?'；主页横幅暂未获取':''):'登录后可查看昵称、等级和账号统计';
}
async function refreshAccountStats(){
  if(!accountProfile||accountStatsRequest||Date.now()-accountStatsAt<(accountProfile.banner?60000:5000))return;accountStatsAt=Date.now();const current=accountProfile;
  const get=async path=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);try{const r=await fetch('https://api.bilibili.com'+path,{credentials:'include',signal:controller.signal});if(!r.ok)return null;const j=await r.json();return j.code===0?j.data:null;}catch{return null;}finally{clearTimeout(timer);}};
  const spacePath=ownSpaceInfoPath(current),officialRequest=spacePath?get(spacePath).then(data=>{if(data&&accountProfile===current){mergeAccountDecorations(data);renderAccountCard();}return data;}):Promise.resolve(null);
  accountStatsRequest=Promise.all([get('/x/web-interface/nav/stat'),get('/x/space/upstat?mid='+encodeURIComponent(current.mid)),get('/x/space/myinfo'),get('/x/web-interface/card?mid='+encodeURIComponent(current.mid)),get('/x/space/v2/myinfo'),officialRequest]).then(([stats,up,info,card,space,official])=>{if(accountProfile!==current)return;for(const key of ['follower','following'])if(Number.isFinite(stats?.[key])&&stats[key]>=0)current[key]=stats[key];if(Number.isFinite(up?.likes)&&up.likes>=0)current.likes=up.likes;mergeAccountDecorations({...space,...info,...official,top_photo_v2:official?.top_photo_v2||info?.top_photo_v2||space?.toutu,theme:official?.theme||info?.theme||space?.theme},card||{});renderAccountCard();}).finally(()=>accountStatsRequest=null);await accountStatsRequest;
}
function showAccountCard(animate=true){clearTimeout(accountHideTimer);const card=$('#account-card',shadow),wasHidden=card.hidden||card.dataset.open!=='true';card.hidden=false;renderAccountCard();$('.account',shadow).setAttribute('aria-expanded','true');const from=accountMotion?getComputedStyle(card).transform:null;accountMotion?.cancel();card.dataset.open='true';if(animate&&wasHidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&card.animate){card.style.transition='none';const frames=[];for(let i=0;i<=30;i++){const t=i/30*.5,x=1-Math.exp(-5*t)*(Math.cos(Math.sqrt(75)*t)+5/Math.sqrt(75)*Math.sin(Math.sqrt(75)*t)),scale=.96+.04*x;frames.push({offset:i/30,opacity:Math.min(1,t/.12),transform:i===30?'translateY(0) scale(1)':(i===0&&from&&from!=='none'?from:'translateY('+(-6*(1-x))+'px) scale('+scale+')')});}accountMotion=card.animate(frames,{duration:500,easing:'linear'});}refreshAccountStats();}

function hideAccountCard(){clearTimeout(accountShowTimer);const card=$('#account-card',shadow);if(!card)return;const visual=getComputedStyle(card);const from={opacity:visual.opacity,transform:visual.transform};accountMotion?.cancel();card.dataset.open='false';$('.account',shadow).setAttribute('aria-expanded','false');if(card.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){card.style.transition='none';accountMotion=card.animate([from,{opacity:0,transform:'translateY(-4px) scale(.98)'}],{duration:120,easing:'cubic-bezier(.23,1,.32,1)'});}accountHideTimer=setTimeout(()=>{card.hidden=true;$('video',card)?.pause();},180);}

async function refreshAccount(force=false){
  if(accountRequest||(!force&&Date.now()-accountChecked<60000))return;
  accountChecked=Date.now();accountRequest=new AbortController();
  const timeout=setTimeout(()=>accountRequest?.abort(),8000);
  try{
    const response=await fetch('https://api.bilibili.com/x/web-interface/nav',{credentials:'include',signal:accountRequest.signal});
    if(!response.ok)throw Error('account status unavailable');
    const result=await response.json(),data=result.data;
    if(result.code!==0||!data?.isLogin){accountProfile=null;renderAccountCard();return;}if(!accountProfile||String(accountProfile.mid)!==String(data.mid)){accountProfile={mid:data.mid,...cachedProfileBanner(data.mid)};accountStatsAt=0;}Object.assign(accountProfile,{uname:String(data.uname||'我的主页'),level:Number.isInteger(data.level_info?.current_level)?data.level_info.current_level:null,face:profileMediaUrl(data.face),wbi:data.wbi_img||accountProfile.wbi,vip:data.vip||{type:data.vipType,status:data.vipStatus,avatar_subscript:data.vip_avatar_subscript},pendant:data.pendant||accountProfile.pendant});renderAccountCard();
    const face=new URL(data.face,location.href);
    if(!['https:','http:'].includes(face.protocol)||!/(^|\.)(hdslb|bilibili)\.com$/i.test(face.hostname))return;
    face.protocol='https:';
    const account=$('.account',shadow),img=document.createElement('img');
    img.src=face.href;img.alt=data.uname||'我的头像';img.referrerPolicy='no-referrer';
    renderAccountDecorations();account.setAttribute('aria-label',data.uname||'我的主页');account.title=data.uname||'我的主页';
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
  html.style.setProperty('background-color',dark?'#161618':'#fafafa','important');const early=$('#bs-navigation-surface');if(early)early.textContent=`html,body${location.hostname==='space.bilibili.com'?'':',#app'}{background-color:${dark?'#161618':'#fafafa'}!important}`;native('surface',{dark});applyAudioBoost();watchVideoLoading();
  html.classList.toggle('night-mode',dark);
  html.classList.toggle('bili_dark',dark);
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
  const launcher=$('#__bilibili_thread_ripper_launcher__');if(launcher)launcher.style.setProperty('display','none','important');
  scheduleScan();
}
function update(patch) {

  const before=PREFS.srMode+PREFS.srScale+PREFS.srFps;
  Object.assign(PREFS,patch);applyPreferences();native('config',{value:patch,revision:++revision});
  if(before!==PREFS.srMode+PREFS.srScale+PREFS.srFps)startGpu();
  if('fiMode' in patch||'fiFps' in patch||'fiFlowScale' in patch)startInterpolation();
  if('downloader' in patch)mountVideoHome();
  if((patch.srMode&&patch.srMode!=='off')||(patch.fiMode&&patch.fiMode!=='off'))toast('警告：超分与补帧是测试功能，可能卡顿、闪烁或抖动；不保证画质提升，异常时请关闭。');
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
      const inner=node.closest(AD_CONTAINER)||node;
      const card=inner.closest('.feed-card,.floor-single-card')||inner;
      card.dataset.bsAd='true';
    }
  }
  for(const el of $$('.bili-video-card__info--text-ad,.bili-video-card__stats--text,[data-ad-label]',scope)){
    if(['广告','推广'].includes(el.textContent.trim())){
      const inner=el.closest(AD_CONTAINER),card=inner?.closest('.feed-card,.floor-single-card')||inner;if(card)card.dataset.bsAd='true';
    }
  }
}

function cleanDescriptionUrl(raw){
  let text=raw.replace(/[。。，，；;！!？?、）)\]】》]+$/u,'');
  const m=text.match(/^(https?:\/\/)([^/?#]+)([\s\S]*)$/i);if(!m)return null;
  let host=m[2];
  // Clean mixed ASCII hostname labels only; retain real IDNs and Unicode paths/query.
  const repaired=host.split('.').map(label=>/[a-z0-9]/i.test(label)?label.replace(/[\p{Script=Han}\p{Extended_Pictographic}\u200d\ufe0e\ufe0f]/gu,''):label).join('.');
  if(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?$/i.test(repaired))host=repaired;
  try{const url=new URL(m[1]+host+m[3]);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;return url.href;}catch{return null;}
}
function linkifyDescriptions(){
  const roots=$$('.basic-desc-info,.video-desc .desc-info-text,.video-desc-container .desc-info-text,#v_desc .info');
  for(const root of roots){
    // A sticker splitting a hostname is removed only when the following text completes a domain.
    for(const img of $$('img',root)){
      if(img.closest('a'))continue;const before=img.previousSibling,after=img.nextSibling;
      if(before?.nodeType!==3||after?.nodeType!==3)continue;
      const left=before.nodeValue.match(/https?:\/\/[^\s/?#]+$/i),right=after.nodeValue.match(/^[^\s<>"“”]+/u);if(!left||!right)continue;
      const candidate=left[0]+right[0],host=candidate.match(/^https?:\/\/([^/?#]+)/i)?.[1]?.replace(/[^\x00-\x7f]/gu,'');
      if(!host||!right[0].split(/[/?#]/)[0].includes('.')||!/^(?:[a-z0-9-]+\.)+[a-z]{2,63}(?::\d{1,5})?$/i.test(host))continue;
      const cleaned=cleanDescriptionUrl(candidate);if(!cleaned)continue;
      before.nodeValue=before.nodeValue.slice(0,left.index)+candidate;after.nodeValue=after.nodeValue.slice(right[0].length);img.remove();
    }
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement?.closest('a,script,style,button,textarea,[contenteditable=true]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const text=node.nodeValue,pattern=/https?:\/\/[^\s<>"“”]+/giu;let match,last=0,changed=false;const fragment=document.createDocumentFragment();
      while((match=pattern.exec(text))){const cleaned=cleanDescriptionUrl(match[0]);if(!cleaned)continue;const stripped=match[0].replace(/[。。，，；;！!？?、）)\]】》]+$/u,'');fragment.append(document.createTextNode(text.slice(last,match.index)));const a=document.createElement('a');a.href=cleaned;a.textContent=cleaned;a.dataset.bsDescriptionLink='true';a.style.cssText='color:#00aeec!important;cursor:pointer;text-decoration:underline;overflow-wrap:anywhere';a.rel='noopener noreferrer';fragment.append(a);last=match.index+stripped.length;changed=true;}
      if(changed){fragment.append(document.createTextNode(text.slice(last)));node.replaceWith(fragment);}
    }
    for(const a of $$('a[href]',root)){
      if(a.dataset.bsExternalBound)continue;const cleaned=cleanDescriptionUrl(a.getAttribute('href')||'')||cleanDescriptionUrl(a.textContent.trim());if(!cleaned)continue;
      const labelUrl=cleanDescriptionUrl(a.textContent.trim());if(labelUrl&&a.textContent!==labelUrl)a.textContent=labelUrl;a.dataset.bsExternalBound='true';a.href=cleaned;a.style.setProperty('color','#00aeec','important');a.addEventListener('click',e=>{if(e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();native('open-external',{url:a.href});},true);
    }
  }
}

function scheduleScan(){
  if(scanTimer)return;
  scanTimer=setTimeout(()=>{scanTimer=0;syncRoute();markAds();linkifyDescriptions();cacheSpaceBackgrounds();applyAudioBoost();watchVideoLoading();const launcher=$('#__bilibili_thread_ripper_launcher__');if(launcher)launcher.style.setProperty('display','none','important');mountPlayerTools();if(PREFS.fiMode!=='off'&&(!interpolator||interpolator.video!==playbackVideo()))startInterpolation();if(PREFS.srMode!=='off'&&(!gpu||gpu.video!==playbackVideo()))startGpu();},180);
}

// Short wheel easing only: precision gestures retain the OS's own momentum.
function installWheelInertia(){
  let motion,frame;
  const cancel=()=>{cancelAnimationFrame(frame);motion=null;};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change',cancel);
  document.addEventListener('pointerdown',cancel,{passive:true});
  document.addEventListener('keydown',cancel,{passive:true});
  window.addEventListener('blur',cancel);
  function tick(now){
    if(!motion)return;
    const m=motion;
    if(!m.el.isConnected||reduced.matches){cancel();return;}
    const t=Math.min(1,(now-m.start)/150);
    // CSS ease-out (0,0,.58,1), evaluated for the scroll offset, not a visual transform.
    let lo=0,hi=1,u=0;
    for(let i=0;i<12;i++){u=(lo+hi)/2;const x=3*(1-u)*u*u*.58+u*u*u;if(x<t)lo=u;else hi=u;}
    const progress=3*(1-u)*u*u+u*u*u;
    m.el.scrollTo({top:t===1?m.to:m.from+(m.to-m.from)*progress,behavior:'instant'});
    if(t<1)frame=requestAnimationFrame(tick);else motion=null;
  }
  document.addEventListener('wheel',e=>{
    if(e.defaultPrevented||!e.cancelable||e.ctrlKey||e.metaKey||e.shiftKey||reduced.matches||pipActive||fullActive){cancel();return;}
    const delta=e.deltaY,precision=e.deltaMode===0&&(Math.abs(delta)<40||Math.abs(delta-Math.round(delta))>.01||(e.wheelDeltaY&&Math.abs(e.wheelDeltaY+delta*3)<.01));
    if(!delta||Math.abs(e.deltaX)>Math.abs(delta)||precision){cancel();return;}
    const path=e.composedPath();
    if(path.some(el=>el?.matches?.('input,select,textarea,[contenteditable=true],.bpx-player-container,.bilibili-player'))){cancel();return;}
    const scrolling=document.scrollingElement;
    let el=path.find(el=>{
      if(!el?.matches||el===document.body||el===document.documentElement)return false;
      const css=getComputedStyle(el),limit=el.scrollHeight-el.clientHeight;
      return /auto|scroll/.test(css.overflowY)&&limit>1&&(delta>0?el.scrollTop<limit-1:el.scrollTop>1);
    })||scrolling;
    if(!el)return;
    const max=el.scrollHeight-el.clientHeight,from=el.scrollTop;
    const step=delta*(e.deltaMode===1?16:e.deltaMode===2?el.clientHeight:1);
    const previous=motion&&motion.el===el&&Math.sign(motion.to-from)===Math.sign(step)?motion.to:from;
    const to=Math.max(0,Math.min(max,previous+Math.max(-180,Math.min(180,step))));
    if(Math.abs(to-from)<.5)return;
    e.preventDefault();cancel();motion={el,from,to,start:performance.now()};frame=requestAnimationFrame(tick);
  },{passive:false});
}

const pageCss = `
@font-face{font-family:BiliDouyin;src:local("DouyinSans Bold"),local("DOUYINSANSBOLD-GB"),local("抖音美好体 Bold");font-display:swap}
#bs-video-loading{position:fixed;inset:var(--bs-header-height,58px) 0 0;z-index:2147483000;display:grid;place-items:center;text-align:center;background:var(--bg1,#161618);color:var(--text1,#eeeef0);animation:bs-loading-in 120ms cubic-bezier(.23,1,.32,1) both}#bs-video-loading svg{width:56px;height:56px;color:var(--bs-accent,#fb7299);animation:bs-loading-spin 700ms cubic-bezier(.77,0,.175,1) infinite}#bs-video-loading.leaving{animation:bs-loading-out 120ms cubic-bezier(.23,1,.32,1) forwards;pointer-events:none}@keyframes bs-loading-in{from{opacity:0}to{opacity:1}}@keyframes bs-loading-out{to{opacity:0}}@keyframes bs-loading-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#bs-video-loading,#bs-video-loading svg{animation:none!important}#bs-video-loading.leaving{opacity:0}}
#bs-close-animation{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:var(--bg1,#161618);color:var(--bs-accent,#fb7299);text-align:center;animation:bs-close-in 180ms cubic-bezier(.23,1,.32,1) both}#bs-close-animation svg{width:64px;height:64px;animation:bs-tv-exit 240ms cubic-bezier(.77,0,.175,1) both}#bs-close-animation p{color:var(--text1,#eeeef0)}@keyframes bs-close-in{from{opacity:0}to{opacity:1}}@keyframes bs-tv-exit{to{transform:rotate(360deg) scale(.96)}}@media(prefers-reduced-motion:reduce){#bs-close-animation,#bs-close-animation svg{animation:none!important}}
:root{--bs-accent:#fb7299;--bs-progress:#fb7299;--bs-progress-height:4px;--bs-progress-radius:6px;--bs-feed-columns:4;--bs-header-height:58px;scroll-padding-top:70px}
html[data-bs-font=true] body,html[data-bs-font=true] button,html[data-bs-font=true] input,html[data-bs-font=true] textarea{font-family:BiliDouyin,"Microsoft YaHei UI",sans-serif!important}
html[data-bs-theme=dark]{color-scheme:dark;--bg1:#161618;--bg2:#202023;--bg3:#29292e;--bg1_rgb:22,22,24;--bg2_rgb:32,32,35;--bg3_rgb:41,41,46;--bg1_float_rgb:32,32,35;--bg2_float_rgb:41,41,46;--bg3_float_rgb:51,51,56;--text1_rgb:238,238,240;--text2_rgb:176,176,184;--line_regular_rgb:48,48,52;--bg1_float:#202023;--bg2_float:#29292e;--bg3_float:#333338;--graph_bg_thin:#202023;--graph_bg_regular:#29292e;--graph_bg_thick:#333338;--text1:#eeeef0;--text2:#b0b0b8;--text3:#8a8a94;--text4:#73737e;--line_light:#27272c;--line_regular:#303034;--line_bold:#45454c}
html[data-bs-theme=dark] body{background:#161618!important;color:#eeeef0}
/* Space backgrounds deliberately use negative layers; isolate them above the document surface. */
html[data-bs-page=space] #app{isolation:isolate;background-color:transparent!important}html[data-bs-page=space] .space-header{isolation:isolate;background-color:transparent!important}html[data-bs-page=space] .space-theme-bg{pointer-events:none}html[data-bs-page=space] .header-toutu{display:block!important}
html[data-bs-theme=light]{color-scheme:light;--bg1:#fafafa;--bg2:#f1f1f3;--text1:#202024;--text2:#67676e}
html,body{min-width:0!important;max-width:100%;overflow-x:clip}
html,body,body *{scrollbar-width:none!important}html::-webkit-scrollbar,body::-webkit-scrollbar,body *::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}
body{padding-top:var(--bs-header-height)!important;margin:0!important}
#app,#i_cecream,.bili-layout,.bili-feed4-layout,.search-layout{min-width:0!important;max-width:100%!important}
.bili-header__bar,.mini-header,.international-header{display:none!important}
html:not([data-bs-page=home]) :is(.bili-header__banner,.bili-banner){display:none!important}
#biliMainHeader,#bili-header-container,#internationalHeader{display:none!important}
.bili-header{height:auto!important;min-height:0!important;background:none!important}
html[data-bs-page=home] [data-bs-banner-host=true]{display:block!important;position:static!important;height:auto!important;min-height:0!important;margin-top:0!important;padding-top:0!important;background:none!important}
html[data-bs-page=home] :is(#biliMainHeader,#bili-header-container,#internationalHeader)[data-bs-banner-host=true]{display:block!important}
html[data-bs-page=home] [data-bs-banner=true]{display:block!important;position:relative!important;inset:auto!important;height:clamp(100px,8vw,142px)!important;min-height:0!important;min-width:0!important;width:100%!important;overflow:hidden!important;margin:0!important;isolation:isolate}
html[data-bs-page=home] [data-bs-banner=true] :is(.banner-img,#bili-header-banner-img){position:absolute!important;inset:0!important;width:100%!important;height:100%!important}
html[data-bs-page=home] [data-bs-banner=true] :is(.banner-img,#bili-header-banner-img) img{width:100%!important;height:100%!important;object-fit:cover!important}
[data-bs-motion=static] .banner-img{transform:translateX(var(--bs-banner-x,0px)) scale(1.025);transition:transform 160ms ease-out;will-change:transform}
.bs-banner-brand{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;z-index:5;font:clamp(26px,2.5vw,38px)/1.2 BiliDouyin,sans-serif!important;letter-spacing:-1px;color:#fff!important;text-shadow:0 2px 12px #082c22,0 1px 3px #0009;text-decoration:none!important;white-space:nowrap;pointer-events:none!important}
.bs-banner-brand b{color:var(--bs-accent)!important;font-weight:400}
html[data-bs-ads=true] [data-bs-ad=true]{display:none!important}
html[data-bs-channels=false] .bili-header__channel,html[data-bs-channels=false] .channel-container,html[data-bs-channels=false] .bili-feed4-layout .channel-floor{display:none!important}
html[data-bs-page=home] .bili-feed4-layout{width:auto!important;margin-left:clamp(20px,3vw,48px)!important;margin-right:clamp(20px,3vw,48px)!important}
html[data-bs-page=home][data-bs-ads=true] [data-bs-feed=grid]{display:grid!important;position:relative!important;grid-template-columns:repeat(var(--bs-feed-columns),minmax(0,1fr))!important;grid-template-rows:none!important;grid-template-areas:none!important;grid-auto-flow:row dense!important;grid-auto-rows:auto!important;gap:28px 20px!important;align-items:start!important;align-content:start!important;width:100%!important;min-width:0!important;max-width:100%!important;margin:0!important;padding:20px 0 0!important}
html[data-bs-page=home][data-bs-ads=true] [data-bs-feed=card][data-bs-empty=true]{display:none!important}
html[data-bs-page=home][data-bs-ads=true] .fixed-channel-shim{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;pointer-events:none!important}
html[data-bs-page=home][data-bs-ads=true] [data-bs-feed=wrapper]{display:contents!important}
html[data-bs-page=home][data-bs-ads=true] [data-bs-feed=wrapper]::before,html[data-bs-page=home][data-bs-ads=true] [data-bs-feed=wrapper]::after{content:none!important}
html[data-bs-page=home][data-bs-ads=true] [data-bs-feed=card]{position:relative!important;inset:auto!important;grid-area:auto!important;order:0!important;width:auto!important;min-width:0!important;max-width:100%!important;height:auto!important;min-height:0!important;margin:0!important;align-self:start!important}
html[data-bs-page=home][data-bs-ads=true] [data-bs-feed=grid] .load-more-anchor{display:block!important;position:absolute!important;bottom:0!important;left:0!important;width:100%!important;height:1px!important;overflow:hidden!important;margin:0!important}
html[data-bs-page=home][data-bs-ads=true] [data-bs-feed=grid][data-bs-prefetch=true] .load-more-anchor{bottom:min(140vh,80%)!important}
html[data-bs-page=home][data-bs-ads=true] [data-bs-ad=true]{display:none!important}
html[data-bs-page=home] :is(.bili-feed4-layout .container,.bili-feed4-layout .feed2){min-width:0!important}
html[data-bs-channels=false] :is(.bili-header__channel,.channel-container,.channel-floor){height:0!important;min-height:0!important;margin:0!important;padding:0!important}
html[data-bs-page=history] :is(.history-record,.history-container,.history-page,.history-wrap){margin-top:0!important;padding-top:20px!important}
html[data-bs-page=dynamic] :is(.bili-dyn-home--member,.bili-dyn-home--unlogin,.bili-dyn-home,.bili-dyn-home__center){margin-top:0!important;padding-top:16px!important}
html[data-bs-page=search] :is(.search-input,.search-wrap .search-block,.search-header .search-form){display:none!important}
html[data-bs-page=search] :is(.search-header,.search-layout,.search-page){padding-top:0!important;margin-top:0!important;min-width:0!important}
html[data-bs-page=search] .search-header{height:auto!important}
html[data-bs-page=search] .search-all-list{padding-top:18px!important}
html[data-bs-page=video] :is(.video-container-v1,.video-container,.video-container-v2,#viewbox_report){margin-top:0!important;padding-top:16px!important}

/* Video layout must shrink before document overflow is clipped. */
html[data-bs-page=video] :is(.video-container-v1,.video-container-v2)>.left-container{grid-column:1!important;grid-row:1!important}
html[data-bs-page=video] :is(.video-container-v1,.video-container-v2)>.right-container{grid-column:2!important;grid-row:1!important}
html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) .bpx-player-video-wrap{max-width:100%!important;min-width:0!important;width:100%!important}
html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) .bpx-player-video-wrap video{max-width:100%!important;object-fit:contain!important}
html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) :is(#app,.video-detail){min-width:0!important;max-width:100%!important;width:100%!important;box-sizing:border-box!important}
html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) :is(.video-container-v1,.video-container-v2){display:grid!important;grid-template-columns:minmax(0,1fr) minmax(240px,320px)!important;gap:24px!important;width:100%!important;max-width:1800px!important;min-width:0!important;box-sizing:border-box!important;padding-inline:clamp(12px,2vw,32px)!important;margin-inline:auto!important;left:auto!important;right:auto!important;transform:none!important}
html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) :is(.left-container,.right-container){width:100%!important;max-width:100%!important;min-width:0!important;margin-inline:0!important;box-sizing:border-box!important}
html[data-bs-page=video] :is(.video-info-container,.video-title,.up-info-container,.video-desc-container,.video-toolbar-container,.video-toolbar-left,.video-toolbar-right){min-width:0!important;max-width:100%!important;box-sizing:border-box!important;overflow-wrap:anywhere}
html[data-bs-page=video] .video-title{white-space:normal!important;height:auto!important}
html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) :is(#bilibili-player,#bilibili-player-wrap,#playerWrap,.bpx-player-container:not([data-screen=mini]):not(.bpx-state-mini):not(.bpx-state-miniscreen),.bpx-player-sending-bar){width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
html[data-bs-page=video] .video-toolbar-container{flex-wrap:wrap!important;gap:12px!important}
/* Opaque theme surface prevents the player's black canvas showing through this toolbar. */
html[data-bs-page=video] .video-toolbar-container{background-color:var(--bg1,#fafafa)!important;box-shadow:none!important}
html[data-bs-page=video] :is(.video-toolbar-left,.video-toolbar-right){background-color:transparent!important}
html[data-bs-page=video] .bpx-player-dm-input{min-width:0!important;flex:1!important}
@media(max-width:1060px){
html[data-bs-page=video] :is(.video-container-v1,.video-container-v2)>.right-container{grid-column:1!important;grid-row:2!important}
html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) :is(.video-container-v1,.video-container-v2){grid-template-columns:minmax(0,1fr)!important;gap:20px!important}
html[data-bs-page=video] .right-container{position:static!important;inset:auto!important}
}


/* The website's scroll mini-player is not the full-width main player. */
html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) :is(.bpx-player-container[data-screen=mini],.bpx-player-container.bpx-state-mini,.bpx-player-container.bpx-state-miniscreen,.bilibili-player.mode-miniscreen){position:fixed!important;width:min(360px,calc(100vw - 32px))!important;max-width:calc(100vw - 32px)!important;min-width:0!important;height:auto!important;aspect-ratio:16/9!important;max-height:calc(100vh - 100px)!important;left:auto!important;right:20px!important;top:auto!important;bottom:24px!important;transform:none!important}
html[data-bs-page=video] :is([data-screen=mini],.bpx-state-mini,.bpx-state-miniscreen) .bpx-player-video-area{width:100%!important;height:100%!important;aspect-ratio:16/9}

html[data-bs-theme=dark] :is(.search-content,.search-layout,.search-header,.search-page,.history-record,.history-page,.bili-footer-overseas){background:#161618!important;color:var(--text1)!important}
html[data-bs-theme=dark] :is(.channel-link,.channel-link__right,.channel-items__left>a,.channel-items__right>a,.vui_button,.vui_button--default,.history-filter,.history-filter-bar,.filter-item,.filter-select,.vui_popover__content,.vui_select__dropdown,.vui_dropdown__menu,.bili-dyn-list__item,.bili-dyn-publishing,.bili-dyn-sidebar,.bili-dyn-my-info,.bili-dyn-up-list,.bili-dyn-topic-box){background:#26262b!important;color:#d4d4dc!important;border-color:#38383f!important}
html[data-bs-theme=dark] :is(.vui_button--blue,.vui_button--primary,.vui_button--active,.filter-item.active){background:#35303a!important;color:#ff9fbb!important}
html[data-bs-theme=dark] :is(#bilibili-player,#bilibili-player-wrap,#playerWrap,.player-wrap,.player-container,.video-container-v1,.video-container-v2,.bpx-player-container,.bpx-player-video-wrap){box-shadow:none!important;outline:none!important;border-color:#303034!important}
html[data-bs-theme=dark] :is(#bilibili-player,.bpx-player-container,.bpx-player-video-wrap){background:#000!important}
html[data-bs-theme=dark] :is(.bpx-player-sending-bar,.bilibili-player-video-sendbar){background:#202023!important;border-color:#303034!important;box-shadow:none!important}
html[data-bs-theme=dark] :is(.bpx-player-dm-wrap,.bpx-player-dm-input,.bilibili-player-video-danmaku-input,.bpx-player-sending-area){background:#2c2c32!important;color:#eeeef0!important;border-color:#3b3b42!important}
html[data-bs-theme=dark] :is(.bpx-player-dm-input input,.bpx-player-dm-input textarea){background:transparent!important;color:#eeeef0!important}
html[data-bs-theme=dark] :is(.roll-btn,.feed-roll-btn,.floor-single-card,.bili-live-card,.living-card,.vui_pagenation--btn,.vui_pagination--btn){background:#26262b!important;color:#d4d4dc!important;border-color:#38383f!important}
html[data-bs-page=messages] #message-pc-header{display:none!important;height:0!important;min-height:0!important}
html[data-bs-page=messages] .message-layout{width:calc(100% - 48px)!important;max-width:1440px!important;margin:16px auto!important;height:calc(100vh - var(--bs-header-height) - 32px)!important;min-height:0!important;border-radius:12px;overflow:hidden}
html[data-bs-page=messages][data-bs-theme=dark] :is(.message-bg,.message-bgc,#skeleton-bg){background:#161618!important;background-image:none!important}
html[data-bs-page=messages][data-bs-theme=dark] :is(#app,#message-pc-app,.message-main){background:#161618!important;color:var(--text1)!important}
html[data-bs-page=messages][data-bs-theme=dark] .message-aside{background:#202023!important;color:var(--text1)!important}
html[data-bs-page=messages][data-bs-theme=dark] :is(.message-header,.message-box-shadow){background:var(--bg2)!important;color:var(--text1)!important;box-shadow:none!important;border-color:var(--line_regular)!important}
.bs-video-bar{display:flex!important;align-items:center;gap:8px;width:fit-content;margin:0 0 10px;align-self:flex-start}
.bs-video-home,.bs-video-download{display:inline-flex!important;align-items:center;gap:6px;width:fit-content;padding:4px 9px;border:1px solid var(--line_regular,#dedee3);border-radius:7px;color:var(--text2,#67676e)!important;font-size:12px;line-height:20px;text-decoration:none!important;background:var(--bg2,#f1f1f3);font-family:inherit;cursor:pointer;appearance:none;transition:color 160ms ease,border-color 160ms ease,opacity 160ms ease}
.bs-video-home svg,.bs-video-download svg{width:15px;height:15px;flex-shrink:0}
.bs-video-home:hover,.bs-video-download:hover{color:var(--bs-accent,#fb7299)!important;border-color:var(--bs-accent,#fb7299)}
.bs-video-download:active{transform:scale(.98)}
.bs-video-download[data-state=busy]{color:var(--bs-accent,#fb7299)!important;border-color:var(--bs-accent,#fb7299);opacity:.7;cursor:progress}
.bs-video-download[data-state=done]{color:#2f9e63!important;border-color:#2f9e63}
.bs-video-download[data-state=blocked]{color:#c9812f!important;border-color:#c9812f}
.bs-video-bar[hidden],.bs-video-home[hidden],.bs-video-download[hidden]{display:none!important}
@media(min-width:1600px){:root{--bs-feed-columns:5}}
@media(max-width:1100px){:root{--bs-feed-columns:3}}
@media(max-width:800px){:root{--bs-feed-columns:2}}
@media(max-width:800px){:root{--bs-header-height:102px}}
.bpx-player-progress-schedule-current,.bpx-player-progress-schedule-current:before,.bilibili-player-video-progress-slider .bui-bar{background:var(--bs-progress)!important}
.bpx-player-progress-schedule,.bpx-player-progress-schedule-wrap{height:var(--bs-progress-height)!important;border-radius:var(--bs-progress-radius)!important}
.bpx-player-progress-schedule-current,.bpx-player-progress-schedule-buffer,.bpx-player-progress-schedule-total{border-radius:var(--bs-progress-radius)!important}
html[data-bs-thumb=false] .bpx-player-progress-schedule-current:before{display:none!important}
html[data-bs-always=true] .bpx-player-control-bottom{opacity:1!important;visibility:visible!important;transform:none!important}
html[data-bs-page=video] .bpx-player-ctrl-volume-box{height:160px!important;padding-block:10px!important}html[data-bs-page=video] .bpx-player-ctrl-volume-progress,html[data-bs-page=video] .bpx-player-ctrl-volume-progress .bui-area,html[data-bs-page=video] .bpx-player-ctrl-volume-progress .bui-track{height:110px!important;min-height:110px!important}html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) .bpx-player-container[data-screen=normal]{aspect-ratio:16/9!important;height:auto!important}html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) .bpx-player-container[data-screen=normal] .bpx-player-video-wrap{height:100%!important}
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
.bs-player-tool{position:relative;display:inline-flex;align-items:center;align-self:center;height:var(--bs-player-height,32px);vertical-align:top;margin:0;top:var(--bs-player-offset,0px);flex:0 0 auto;color:var(--bs-player-color,#fff);font:inherit;opacity:var(--bs-player-opacity,1)}
.bs-player-tool button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:3px;padding:0 5px;line-height:1;font-size:var(--bs-player-font,12px);height:100%;box-sizing:border-box;transform:none;vertical-align:middle;white-space:nowrap;opacity:1;transition:opacity 150ms}.bs-player-tool button:hover,.bs-player-tool button:focus-visible{opacity:1}.bs-player-tool button[aria-expanded=true]{opacity:1}
.bs-player-tool svg{width:16px;height:16px;display:block;flex-shrink:0}.bs-fi-canvas{z-index:3}
@media(max-width:620px){.bs-player-tool>button span{display:none}.bs-player-tool>button{padding:0 4px}}
.bs-sr-menu{position:absolute;bottom:calc(100% + 12px);right:0;width:248px;max-width:calc(100vw - 24px);max-height:min(380px,60vh);overflow:auto;background:var(--bs-player-menu-bg,rgba(21,21,21,.9));color:var(--bs-player-menu-color,#fff);padding:14px 16px;border:0;border-radius:var(--bs-player-menu-radius,4px);box-shadow:none;font-family:inherit;font-size:var(--bs-player-menu-font,12px);font-weight:400;line-height:1.6;z-index:50}
.bs-sr-menu[hidden]{display:none}
.bs-sr-menu label{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:12px 0}
.bs-sr-menu select{background:#ffffff12;border:1px solid #ffffff26;border-radius:4px;padding:4px;color:inherit;color-scheme:dark;font:inherit}
.bs-sr-menu p{font-size:11px;color:#bdbdc8;margin:10px 0 0}
.bs-sr-menu output{display:block;color:inherit;opacity:.7;font-size:11px;margin-top:10px;overflow-wrap:anywhere}
.bs-pip-controls{position:fixed;bottom:12px;right:12px;z-index:2147483646;display:none;gap:6px;opacity:0;transition:opacity 150ms}
html[data-bs-pip=true] .bs-pip-controls{display:flex}
html[data-bs-pip=true] body:hover .bs-pip-controls,html[data-bs-pip=true] .bs-pip-controls:focus-within{opacity:1}
.bs-pip-controls button{background:#16161bd9;border:1px solid #ffffff40;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer}
button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid var(--bs-accent);outline-offset:3px}
@media(prefers-reduced-motion:reduce){.bs-pip-controls,[data-bs-motion=static] .banner-img{transition:none!important;transform:none!important}}
`;

const shellCss=`
:host{all:initial;font-family:var(--font,BiliDouyin,"Microsoft YaHei UI",sans-serif);color:#f5f5f7;--accent:#fb7299;--bg:#202023;--panel:#27272b;--ink:#f5f5f7;--muted:#adadb7;--line:#ffffff12;--field:#333338;position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-size:14px}
:host{color-scheme:dark}:host([data-theme=light]){color-scheme:light;--bg:#f8f8fa;--panel:#fff;--ink:#25252a;--muted:#696973;--line:#00000012;--field:#ededf1;color:var(--ink)}
*{scrollbar-width:none!important}*::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}
*{box-sizing:border-box}button,input,select{font:inherit}button,a,input,select{pointer-events:auto}button{cursor:pointer;color:inherit}button:active{transform:scale(.97)}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}[hidden]{display:none!important}
svg{width:20px;height:20px;vertical-align:middle}a{color:inherit;text-decoration:none}
header{height:var(--bs-header-height,58px);display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:16px;padding:0 24px;background:var(--bg);color:var(--ink);border-bottom:1px solid var(--line);pointer-events:auto;user-select:none}
.video-home-top{position:absolute;left:0;top:50%;height:32px;width:64px;display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;font-size:14px;font-weight:600;line-height:20px;white-space:nowrap;opacity:0;transform:translate(-8px,-50%);pointer-events:none;transition:opacity 180ms cubic-bezier(.23,1,.32,1),transform 240ms cubic-bezier(.23,1,.32,1)}.video-home-top[hidden]{display:none}.video-home-top svg{display:block;width:20px;height:20px;flex:0 0 20px;color:var(--accent)}.header-left[data-video=true] .video-home-top{opacity:1;transform:translate(0,-50%);pointer-events:auto}.header-left>.lights,.header-left>.back,.header-left>.nav-lane{transition:transform 240ms cubic-bezier(.23,1,.32,1);transform:translateX(0)}.header-left[data-video=true]>.lights,.header-left[data-video=true]>.back,.header-left[data-video=true]>.nav-lane{transform:translateX(80px)}.header-left[data-video=true]{padding-right:80px;--header-home-shift:80px}@media(max-width:800px){.header-left[data-video=true]>.back{display:none}.header-left[data-video=true]{grid-column:1/-1}.header-left[data-video=true]~.brand{visibility:hidden}}@media(prefers-reduced-motion:reduce){.video-home-top,.header-left>.lights,.header-left>.back,.header-left>.nav-lane{transition:none!important}}

.header-left nav a{display:inline-flex;align-items:center;justify-content:center;height:32px;line-height:20px}.header-left>.lights{height:32px}.header-left[data-controls=windows]>.lights{display:none!important}.header-left[data-controls=windows]>.nav-lane{order:0}.header-left[data-controls=windows]>.back{order:0;margin-left:0}.window-actions{display:flex;gap:3px;align-items:center;margin-left:12px;padding-left:12px;border-left:1px solid var(--line);flex-shrink:0}.window-actions button{width:28px;height:32px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent}.window-actions button:hover{background:var(--field)}.window-actions button:last-child:hover{background:#e55353;color:white}.window-actions svg{width:14px;height:14px;stroke:currentColor;stroke-width:1.5;fill:none;display:block}.header-left[data-controls=windows][data-video=true]>.back,.header-left[data-controls=windows][data-video=true]>.nav-lane{transform:translateX(0)}.header-left[data-controls=windows][data-video=true]{padding-right:0;--header-home-shift:0px}.header-left[data-controls=windows] .video-home-top{position:static;width:auto;gap:8px;padding-right:12px;border-right:1px solid var(--line);opacity:1;transform:none;pointer-events:auto}.header-left[data-controls=windows] .video-home-top svg{color:var(--accent)}.header-left[data-controls=windows][data-video=true] .primary-nav a[data-route=home]{display:none}.window-actions[hidden]{display:none!important}
.header-left{position:relative;grid-column:1;grid-row:1;display:flex;align-items:center;gap:16px;min-width:0;max-width:100%;height:100%}.header-right{grid-column:3;grid-row:1;display:flex;align-items:center;justify-content:flex-end;gap:14px;min-width:0;height:100%}
.back{flex-shrink:0}.nav-lane{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center;overflow:hidden}.nav-lane .primary-nav{transition:transform 240ms cubic-bezier(0.23,1,0.32,1);will-change:transform}
.category-links{position:absolute;left:0;top:0;height:100%;width:var(--category-space,0px);display:flex;align-items:center;gap:18px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 16px),transparent);opacity:0;transform:translateX(-12px);transition:opacity 180ms ease,transform 240ms cubic-bezier(0.23,1,0.32,1);pointer-events:none}.category-links::-webkit-scrollbar{display:none}
.category-links a{flex-shrink:0;font-size:15px;white-space:nowrap;color:var(--muted);padding:8px 0}.category-links a:hover,.category-links a:focus-visible{color:var(--accent)}.header-left[data-categories=true] .category-links{opacity:1;transform:translateX(0);pointer-events:auto}.back{transition:transform 180ms ease}.header-left[data-categories=true] .back{color:var(--accent);transform:translateX(var(--header-home-shift,0px))}.nav-lane.instant .primary-nav,.nav-lane.instant .category-links{transition:none}
.back svg{transform:rotate(0deg);transition:transform 180ms cubic-bezier(.23,1,.32,1)}.back[aria-expanded=true] svg{transform:rotate(180deg)}.back[data-instant=true] svg{transition:none}@media(prefers-reduced-motion:reduce){.back svg{transition:none!important}}
.lights{display:flex;align-items:center;flex:0 0 auto;gap:9px;margin-right:0}.lights .light{display:block;flex:0 0 14px;width:14px;height:14px;min-width:14px;border:0;border-radius:50%;padding:0;position:relative;line-height:0;appearance:none}.light.close{background:#ff5f57}.light.min{background:#febc2e}.light.max{background:#28c840}.lights .light svg{display:block;position:absolute;inset:3px;width:8px;height:8px;fill:none;stroke:#111a;stroke-width:1.4;stroke-linecap:round;opacity:0;pointer-events:none;transition:opacity 150ms ease}.lights:hover svg,.lights .light:focus-visible svg{opacity:1}
.lights .light:before{content:'';position:absolute;inset:-5px;border-radius:50%}
.brand{grid-column:2;grid-row:1;justify-self:center;font-family:BiliDouyin,sans-serif;font-size:16px;white-space:nowrap;letter-spacing:-.5px}.brand b{font-weight:400;color:var(--accent)}
nav{display:flex;flex-shrink:0;gap:22px;height:100%;align-items:center}nav a{font-size:14px;color:var(--muted);position:relative}nav a[aria-current=page]{color:var(--ink)}nav a[aria-current=page]:after{content:'';position:absolute;left:25%;right:25%;bottom:-10px;height:2px;border-radius:2px;background:var(--accent)}nav a:hover{color:var(--accent)}
.search{flex:1;margin-left:0;width:0;min-width:60px;max-width:380px;position:relative}.search input{width:100%;border:1px solid var(--line);background:var(--field);color:var(--ink);border-radius:9px;padding:9px 36px 9px 13px;outline-offset:1px;font-size:12px}.search > button{position:absolute;right:7px;top:5px;border:0;background:none;color:var(--muted);padding:4px}
.account-wrap{position:relative;flex:0 0 auto}.account-card{position:absolute;right:0;top:calc(100% + 10px);width:290px;max-width:calc(100vw - 32px);padding:18px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 36px #0003;opacity:0;transform:translateY(-4px) scale(.98);transform-origin:top right;transition:opacity 180ms cubic-bezier(.23,1,.32,1),transform 180ms cubic-bezier(.23,1,.32,1);pointer-events:none}.account-card[data-open=true]{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}.account-card[hidden]{display:none}.account-identity{display:flex;align-items:center;gap:12px}.account-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}.account-banner{height:100px;margin:-18px -18px 14px;overflow:hidden;border-radius:13px 13px 0 0;background:var(--field)}.account-banner[hidden],.account-portrait[hidden],.account-vip-label[hidden]{display:none}.account-banner img,.account-banner video{display:block;width:100%;height:100%;object-fit:cover}.account-portrait{position:relative;width:52px;height:52px;flex-shrink:0}.account-portrait .account-face{width:52px;height:52px;border-radius:50%;object-fit:cover}.account-vip-label{font-size:10px;background:#fb729918;color:#fb7299;border-radius:4px;padding:2px 5px}.account-portrait .account-pendant{position:absolute;inset:-9px;width:70px;height:70px;object-fit:contain;pointer-events:none}.account-portrait .account-vip-badge{position:absolute;right:-1px;bottom:-1px;width:17px;height:17px;object-fit:contain}.account-name{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.account-level{color:var(--accent);font-size:12px;flex-shrink:0}.account-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px;text-align:center}.account-stats b{display:block;font-size:15px;overflow-wrap:anywhere}.account-stats span{font-size:12px;color:var(--muted)}.account-status{font-size:11px;color:var(--muted);line-height:1.5;margin:14px 0 0}@media(prefers-reduced-motion:reduce){.account-card{transition:none!important}}
.account{font-size:12px;color:var(--muted);white-space:nowrap;display:flex;align-items:center;justify-content:center;flex-shrink:0;min-width:30px;height:32px}.account{position:relative;overflow:visible!important}.account .account-face{width:30px;height:30px;display:block;border-radius:50%;object-fit:cover;border:1px solid var(--line)}.account .account-pendant{position:absolute;inset:-5px;width:40px;height:40px;object-fit:contain;pointer-events:none}.account .account-vip-badge{position:absolute;right:-2px;bottom:-2px;width:12px;height:12px;object-fit:contain;pointer-events:none}.upload{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;height:32px;padding:0 14px;border-radius:8px;background:#fb7299;color:#fff!important;font-size:13px;font-weight:500;line-height:20px}.upload:hover{background:#ff85a7}.upload:active{transform:scale(.97)}.messages{display:flex;align-items:center;justify-content:center;width:32px;height:34px;flex-shrink:0;color:var(--muted);border-radius:8px}.messages:hover{background:var(--field);color:var(--ink)}.back{background:none;border:0;color:var(--muted);display:grid;place-items:center;width:26px;height:32px;line-height:0;padding:0}.back svg{display:block;width:20px;height:20px}
.search[aria-busy=true] > button svg{opacity:0}.search[aria-busy=true] > button:after{content:'';position:absolute;inset:6px;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:bs-search-spin .7s linear infinite}.search[aria-busy=true]:after{content:'';position:fixed;left:0;right:0;top:calc(var(--bs-header-height,58px) - 1px);height:2px;background:var(--accent);transform-origin:left;animation:bs-search-progress 1.2s ease-in-out infinite}
.search-panel{position:absolute;top:calc(100% + 9px);left:0;right:0;max-height:min(460px,calc(100vh - var(--bs-header-height,58px) - 24px));overflow:auto;overscroll-behavior:contain;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:12px;box-shadow:0 12px 32px #0004;pointer-events:auto;text-align:left}.search-panel[hidden]{display:none}.search-panel h2{position:relative;display:flex;justify-content:space-between;align-items:center;gap:8px;margin:5px 0 9px;font-size:12px;color:var(--muted);font-weight:500}.search-panel p{font-size:12px;color:var(--muted);margin:12px 2px}.search-history-chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}.search-history-chip{display:inline-flex;align-items:center;max-width:100%;min-width:0;background:var(--field);border-radius:6px}.search-history-chip .search-choice{flex:0 1 auto!important;max-width:200px;padding:6px 8px!important;font-size:12px!important}.search-history-chip .search-remove{width:22px!important;height:24px!important;font-size:16px!important}.search-row{display:flex;align-items:center;min-width:0;border-radius:7px}.search-panel button{border:0;background:none;color:var(--ink);font:inherit;cursor:pointer}.search-panel .search-choice{flex:1;min-width:0;text-align:left;padding:9px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;border-radius:7px}.search-choice:hover,.search-choice.selected{background:var(--field);color:var(--accent)}.search-panel .search-remove{flex:none;width:28px;height:28px;color:var(--muted);font-size:19px;border-radius:6px}.search-remove:hover,.search-panel .search-clear:hover{color:var(--accent);background:var(--field)}.search-panel .search-clear{padding:3px 5px;color:var(--muted);font-size:11px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@keyframes bs-search-spin{to{transform:rotate(360deg)}}@keyframes bs-search-progress{0%{transform:scaleX(.1)}70%{transform:scaleX(.85)}100%{transform:scaleX(1);opacity:.35}}
#settings-trigger{position:fixed;bottom:22px;left:20px;width:44px;height:44px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:13px;box-shadow:0 4px 18px #0002}
#settings-trigger svg{width:23px;height:23px}#settings-trigger circle,#settings-trigger path{stroke:currentColor}
.scrim{position:fixed;inset:0;background:#08080c80;display:grid;place-items:center;padding:40px;pointer-events:auto}
.dialog{width:min(940px,100%);height:min(660px,calc(100vh - 80px));min-height:260px;min-width:min(360px,100%);max-width:100%;max-height:100%;resize:both;display:grid;grid-template-columns:210px 1fr;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:0 32px 100px #0006;overflow:hidden}
aside{border-right:1px solid var(--line);padding:28px 16px;display:flex;flex-direction:column;background:var(--panel)}.eyebrow{font:10px/1.5 Consolas,monospace;letter-spacing:2px;color:var(--muted)}h1{font-size:21px;letter-spacing:-.5px;font-weight:400;margin:7px 10px 28px}.eyebrow{margin-left:10px}
.tabs{display:grid;gap:6px;overflow:auto;min-height:0}.tabs button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:none;border-radius:9px;padding:11px 12px;color:var(--muted);font-size:13px}.tabs button[aria-selected=true]{background:var(--field);color:var(--ink)}.tabs button[aria-selected=true] svg{color:var(--accent)}.aside-footer{margin-top:auto;padding:10px;color:var(--muted);font-size:11px;line-height:1.8}.aside-footer b{display:block;color:var(--ink);font-weight:400;font-size:12px}
main{padding:34px 36px;overflow:auto;position:relative;scrollbar-width:thin;scrollbar-color:var(--muted) var(--bg)}#dismiss{position:absolute;right:22px;top:22px;background:var(--field);color:var(--muted);border:0;width:28px;height:28px;border-radius:50%;font:20px/1 sans-serif}
h2{font-size:23px;font-weight:400;letter-spacing:-.5px;margin:0 0 6px}p.subtitle{font-size:12px;color:var(--muted);margin:0 0 25px;line-height:1.8;max-width:90%}.section-label{font-size:10px;color:var(--muted);letter-spacing:1px;margin:25px 0 11px}
.themes{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.theme{background:none;border:1px solid var(--line);border-radius:10px;padding:8px 8px 10px;text-align:left;font-size:12px}.theme[aria-pressed=true]{border-color:var(--accent)}.theme span{display:block;padding:9px 3px 0}.mini{height:68px;border-radius:5px;background:#fafafa;display:flex;padding:9px;gap:7px}.mini.dark{background:#151517}.mini.auto{background:linear-gradient(90deg,#fafafa 50%,#151517 50%)}.mini i{width:17%;background:#92929e35;border-radius:3px}.mini em{flex:1;background:#92929e25;border-radius:3px;margin-top:13px;position:relative}.mini em:before{content:'';position:absolute;top:-13px;left:0;width:40%;height:6px;border-radius:3px;background:#92929e35}
.row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:17px 0;border-bottom:1px solid var(--line);min-height:66px}.row label,.row .label{font-size:13px}.hint{display:block;font-size:11px;color:var(--muted);line-height:1.7;margin-top:4px;max-width:370px}.row select{background:var(--field);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:7px 10px;font-size:12px}
input[type=checkbox]{appearance:none;width:34px;height:20px;border-radius:12px;background:#77778070;position:relative;cursor:pointer;flex-shrink:0;margin:0}input[type=checkbox]:before{content:'';width:14px;height:14px;position:absolute;top:3px;left:3px;border-radius:50%;background:#fff;transition:transform 130ms ease-out}input[type=checkbox]:checked{background:var(--accent)}input[type=checkbox]:checked:before{transform:translateX(14px)}input[type=color]{width:34px;height:28px;cursor:pointer;border:1px solid var(--line);border-radius:6px;background:var(--field);padding:3px}
input[type=range]{width:130px;accent-color:var(--accent)}.range{display:flex;align-items:center;gap:10px}.range output{font:11px Consolas,monospace;width:36px;color:var(--muted)}
.preview{height:88px;background:#111113;border-radius:10px;margin-top:18px;position:relative;color:#fff;overflow:hidden}.preview:before{content:'进度条预览';position:absolute;left:18px;top:14px;font-size:11px;color:#c0c0c8}.track{height:var(--height);position:absolute;bottom:20px;left:18px;right:18px;background:#ffffff25;border-radius:var(--radius)}.buffer{position:absolute;inset:0 20% 0 0;background:#ffffff30;border-radius:inherit}.played{position:absolute;inset:0 42% 0 0;background:var(--progress);border-radius:inherit}.thumb{position:absolute;right:0;top:50%;width:10px;height:10px;background:var(--progress);border-radius:50%;transform:translate(50%,-50%)}
.note{padding:12px 15px;background:var(--field);border-radius:8px;color:var(--muted);font-size:11px;line-height:1.9;margin-top:20px}.note strong{color:var(--ink);font-weight:400}.link{background:none;border:0;padding:0;color:var(--accent);font-size:12px}.actions{display:flex;gap:20px;align-items:center;margin-top:22px}.status{font-size:11px;color:var(--muted)}#toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--panel);color:var(--ink);padding:13px 22px;border-radius:10px;border:1px solid var(--line);box-shadow:0 8px 32px #0003;max-width:80vw;font-size:12px;pointer-events:auto}
.chip-actions{display:flex;gap:18px;margin:0 0 16px}.chip-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.chip{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font-size:13px;cursor:pointer;background:var(--panel);pointer-events:auto}.chip input{margin:0;pointer-events:auto}.chip:has(input:checked){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
@media(max-width:1050px){.chip-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:1050px){nav{gap:14px}.header-left,.header-right{gap:12px}header{gap:12px}.dialog{grid-template-columns:170px 1fr}main{padding:30px 25px}}
@media(max-width:800px){header{grid-template-rows:58px 44px;column-gap:10px;row-gap:0;padding:0 16px}.header-right{grid-column:1/-1;grid-row:2}.header-left nav{flex-shrink:1;min-width:0;overflow-x:auto;scrollbar-width:none}.header-left nav a{flex-shrink:0}.search{max-width:none;min-width:96px}.lights{margin-right:0}}
@media(max-width:1050px){.nav-lane{overflow:visible}.category-links{position:fixed;top:var(--bs-header-height,58px);left:16px;width:calc(100vw - 32px);height:auto;max-height:220px;overflow:auto;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px 12px;padding:16px 20px;background:var(--bg);border:1px solid var(--line);border-radius:0 0 12px 12px;box-shadow:0 12px 28px #0003;mask-image:none;transform:translateY(-8px)}.header-left[data-categories=true] .category-links{transform:translateY(0)}.nav-lane .primary-nav{transform:none!important}}
@media(max-width:620px){.scrim{padding:12px}.dialog{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);height:calc(100vh - 24px);width:100%;min-height:0}.dialog aside{padding:10px;min-height:0}.dialog aside h1,.dialog aside .eyebrow,.dialog .aside-footer{display:none}.dialog .tabs{display:flex;overflow:auto;gap:4px}.dialog .tabs button{width:auto;white-space:nowrap;padding:10px;font-size:12px}.dialog main{padding:24px 18px}.dialog #dismiss{right:8px;top:4px;width:22px;height:22px}.chip-grid{grid-template-columns:repeat(2,minmax(0,1fr))}header{column-gap:8px;padding:0 12px}.header-left,.header-right{gap:8px}.lights{gap:6px}nav{gap:10px}nav a{font-size:12px}.search{min-width:70px}.account{max-width:38px;overflow:hidden;font-size:10px}}
.dialog[data-compact=true]{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.dialog[data-compact=true] aside{padding:10px;min-height:0}.dialog[data-compact=true] aside h1,.dialog[data-compact=true] aside .eyebrow,.dialog[data-compact=true] .aside-footer{display:none}.dialog[data-compact=true] .tabs{display:flex;overflow:auto;gap:4px}.dialog[data-compact=true] .tabs button{width:auto;white-space:nowrap;padding:10px;font-size:12px}.dialog[data-compact=true] main{padding:24px 18px}.dialog[data-compact=true] .chip-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-height:480px){.scrim{padding:12px}.dialog{height:calc(100vh - 24px);min-height:0}.dialog aside{padding:12px}.dialog .aside-footer,.dialog aside h1,.dialog aside .eyebrow{display:none}.dialog main{padding:24px 18px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

const icon = (name) => {
  if(name==='sparkles')return ICON_SPARKLES;
  const paths={appearance:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor"/>',progress:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',clean:'<path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7Z"/><path d="m8 12 3 3 5-6"/>',play:'<path d="m9 5 11 7-11 7Z"/>',plugins:'<path d="M8 3v5M16 3v5M5 8h14v4a7 7 0 0 1-14 0ZM12 19v3"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.play}</svg>`;
};
let proxyInfo=typeof RUNTIME==='undefined'?{}:{...RUNTIME};
function proxyState(next){
  if(next&&typeof next==='object')proxyInfo={...proxyInfo,...next};
  const el=shadow&&$('#proxy-status',shadow);
  if(el)el.textContent=proxyLine();
  const select=shadow&&$('#proxy-node',shadow);
  if(select&&Array.isArray(proxyInfo.nodes))fillProxyNodes(select);
}
function proxyLine(){
  if(proxyInfo.running)return `运行中 · 127.0.0.1:${proxyInfo.port||'—'} · 节点 ${proxyInfo.node||'自动'}${proxyInfo.message?' · '+proxyInfo.message:''}`;
  return proxyInfo.enabled?'已开启但未运行：'+(proxyInfo.message||'等待重启'):(proxyInfo.message||'已关闭，直连');
}
function proxyStatus(text){if(typeof RUNTIME!=='undefined')RUNTIME.proxyStatus=text;proxyInfo.message=text;proxyState();}
function fillProxyNodes(select){
  const nodes=Array.isArray(proxyInfo.nodes)?proxyInfo.nodes:[];
  const current=proxyInfo.node||PREFS.proxyNode||'';
  select.replaceChildren();
  if(!nodes.length){
    const option=document.createElement('option');option.value='';option.textContent='暂无节点，请用内置免费节点或导入配置';select.append(option);
  }else for(const name of nodes){
    const option=document.createElement('option');option.value=name;option.textContent=name;if(name===current)option.selected=true;select.append(option);
  }
  select.disabled=!nodes.length||!proxyInfo.running;
}
async function checkProxyRegion(){
  const out=shadow&&$('#proxy-region',shadow);if(!out)return;
  out.textContent='正在检测当前出口…';
  try{
    const response=await fetch('https://api.bilibili.com/x/web-interface/zone',{cache:'no-store'});
    const json=await response.json(),data=json.data||{};
    if(!response.ok||json.code!==0)throw Error('接口返回 '+json.code);
    const mainland=['中国','中国大陆'].includes(data.country);
    out.textContent=`当前出口：${data.country||'未知'}${data.city?' · '+data.city:''}${data.addr?' · '+data.addr:''} — ${mainland?'大陆出口；是否能播放仍受版权、账号权限等限制':'不能解锁“仅限中国大陆”的番剧'}`;
  }catch(e){out.textContent='检测失败：'+e.message+'（直连也可能被网站拒绝）';}
}
const tabs={categories:['分区选择','progress'],network:['客户端代理','plugins'],appearance:['个性化','appearance'],header:['顶部栏','progress'],progress:['进度条','progress'],clean:['页面净化','clean'],play:['播放与画质','sparkles'],plugins:['扩展插件','plugins']};
const toggle=(key,title,hint)=>`<div class="row"><label for="pref-${key}">${title}<span class="hint">${hint}</span></label><input id="pref-${key}" data-pref="${key}" type="checkbox" ${PREFS[key]?'checked':''}></div>`;
const range=(key,title,min,max,unit)=>`<div class="row"><label for="pref-${key}">${title}</label><div class="range"><input id="pref-${key}" type="range" data-pref="${key}" min="${min}" max="${max}" value="${PREFS[key]}"><output>${PREFS[key]}${unit}</output></div></div>`;
function tabContent(){
  if(currentTab==='categories'){
    const total=CATEGORIES.length,chosen=PREFS.categorySelection.length;
    return `<h2>只显示常去的分区。</h2><p class="subtitle">点左上角的小箭头展开，勾选后立即生效；没选的分区不会占位。当前 ${chosen} / ${total}。</p><div class="chip-actions"><button class="link" id="category-default">推荐 8 个</button><button class="link" id="category-all">全选</button><button class="link" id="category-none">全不选</button></div><div class="chip-grid">${CATEGORIES.map(([label],i)=>`<label class="chip"><input id="category-${i}" type="checkbox" data-category="${i}" ${PREFS.categorySelection.includes(i)?'checked':''}><span>${label}</span></label>`).join('')}</div><div class="note">分区只是快捷入口，关闭后仍可从视频页或搜索进入。</div>`;
  }
  if(currentTab==='network'){
    const on=Boolean(proxyInfo.running||PREFS.proxy);
    return `<h2>番剧与访问，一个开关。</h2><p class="subtitle">内置 Mihomo（Clash 兼容内核）。只代理这个客户端，不改系统代理，不开 TUN，不接管全局网络。</p><div class="row"><label for="proxy-switch">代理开关<span class="hint">${on?'当前已开启。关闭后立即改为直连。':'当前关闭。开启后客户端会自动重启一次以接管网络。'}</span></label><input id="proxy-switch" type="checkbox" data-action="proxy-toggle" ${on?'checked':''}></div><div class="note" id="proxy-status">${proxyLine()}</div><div class="row"><label for="proxy-node">当前节点<span class="hint">切换节点即时生效，不需要重启。</span></label><select id="proxy-node" aria-label="代理节点"></select></div>${toggle('proxyAll','全局代理','默认只代理 B站相关域名，其余流量直连。开启后所有流量走节点。')}<div class="actions"><button class="link" id="proxy-free">用内置免费节点</button><button class="link" id="proxy-import">导入 Clash 配置…</button><button class="link" id="proxy-check">检测出口地区</button></div><div class="note" id="proxy-region">点“检测出口地区”查看当前 IP 落在哪个国家或地区。</div><div class="note"><strong>为什么开了代理还看不了番剧？</strong><br>B站番剧按 IP 地区授权。“仅限中国大陆”的番剧必须用中国大陆出口；公开免费节点基本都在日本、香港、新加坡、美国，能加速访问和部分港澳台版权内容，但不能解锁只在大陆授权的番剧。要解决这一点，导入你自己的回国订阅，或换用带大陆出口的服务。免费节点由公开订阅整理并实测可用，运营者不可审计，不要用它登录敏感账号。</div>`;
  }
  if(currentTab==='header')return `<h2>顶部，只放你需要的。</h2><p class="subtitle">选择客户端顶部显示的内容，立即生效并自动保存。标题始终按窗口居中。</p>${HEADER_ITEMS.map(([key,label])=>toggle(key,label,key==='headerBrand'?'在窗口正中显示 Bili Space。':'控制顶部的'+label+'是否显示。')).join('')}<div class="note">红黄绿窗口控制始终保留，避免隐藏后无法操作窗口。视频网页中的“首页”按钮独立保留，不受顶部导航开关影响。</div><div class="actions"><button id="header-reset" class="link">恢复顶部默认布局</button></div>`;
  if(currentTab==='appearance')return `<h2>让空间，像你。</h2>${toggle('trafficLights','使用红绿灯窗口按钮','关闭后导航移至左侧，最小化、最大化、关闭按钮移至头像右侧。')}<p class="subtitle">少一点干扰，多一点喜欢。每次调整，都会自动保存。</p><div class="row"><label for="pref-closeAction">关闭窗口 / Ctrl+W<span class="hint">自动保存，不再反复询问；托盘右键始终可退出。</span></label><select id="pref-closeAction" data-pref="closeAction"><option value="tray">隐藏到托盘</option><option value="exit">直接退出</option></select></div><div class="row"><label for="pref-videoLoadingMode">视频加载动画结束时机<span class="hint">只决定遮罩何时消失，不改变视频加载速度；自动保存，下一次打开视频时使用。</span></label><select id="pref-videoLoadingMode" data-pref="videoLoadingMode"><option value="page">页面界面就绪（更快）</option><option value="video">视频画面就绪</option></select></div>${toggle('clipboardAutoOpen','剪贴板 BV 自动跳转','仅在客户端运行时读取新复制的文本；识别完整 BV 号或 B站视频链接，不记录剪贴板内容，不弹出或抢焦点。')}<div class="section-label">主题 / APPEARANCE</div><div class="themes">${[['light','浅色'],['dark','深色'],['system','跟随系统']].map(([id,title])=>`<button class="theme" data-theme-choice="${id}" aria-pressed="${PREFS.theme===id}"><div class="mini ${id==='system'?'auto':id}"><i></i><em></em></div><span>${title}</span></button>`).join('')}</div><div class="row"><label for="pref-accent">强调色<span class="hint">属于你的那一点颜色。</span></label><input id="pref-accent" data-pref="accent" type="color" value="${PREFS.accent}"></div>${toggle('font','抖音美好体','使用你已安装的 DouyinSans；未安装时回退到系统字体。')}${range('zoom','窗口缩放',75,200,'%')}${toggle('autoZoom','最大化 / 全屏时自动放大','让界面跟着屏幕变大，而不是缩在左上角。')}<div class="row"><label for="pref-autoZoomTarget">全屏放大档位<span class="hint">按这个内容宽度排版；数值越小，界面越大。</span></label><select id="pref-autoZoomTarget" data-pref="autoZoomTarget"><option value="1100">超大 · 1100</option><option value="1280">舒适 · 1280</option><option value="1440">标准 · 1440</option><option value="1600">紧凑 · 1600</option></select></div><div class="note">${icon('appearance')} 内容保持清晰，装饰适可而止。支持键盘操作与系统减少动态效果设置。</div>`;
  if(currentTab==='progress')return `<h2>掌握每一秒。</h2><p class="subtitle">进度条的颜色、粗细与形状，由你决定。</p><div class="preview" style="--height:${PREFS.progressHeight}px;--radius:${PREFS.progressRadius}px;--progress:${PREFS.progressColor}"><div class="track"><div class="buffer"></div><div class="played">${PREFS.progressThumb?'<i class="thumb"></i>':''}</div></div></div><div class="row"><label for="pref-progressColor">播放进度颜色</label><input id="pref-progressColor" data-pref="progressColor" type="color" value="${PREFS.progressColor}"></div>${range('progressHeight','进度条高度',1,12,'px')}${range('progressRadius','圆角',0,12,'px')}${toggle('progressThumb','显示拖动圆点','保持原生拖动与预览行为。')}${toggle('progressAlways','始终显示播放控制条','关闭时跟随 B站播放器自动隐藏。')}`;
  if(currentTab==='clean')return `<h2>只留下想看的。</h2><p class="subtitle">识别明确的广告容器，不根据标题猜测，不删除评论和正常推荐。</p>${toggle('hideAds','自动清理广告与运营推广','首页轮播、赛事/下载入口、视频下方横幅与右侧推广卡片。')}${toggle('showChannels','显示首页频道分区','图二中的动态、热门、番剧、动画等频道导航。')}<div class="note"><strong>非破坏式净化</strong><br>隐藏广告节点而非删除，关闭开关即可恢复。不会隐藏普通直播卡片，也不改写评论。网站更新后规则可能需要维护。</div><div class="actions"><button class="link" id="rescan">重新检查当前页面</button><span class="status" id="ad-count"></span></div>`;
  if(currentTab==='play')return `<h2>细节，多看一点。</h2><div class="row"><label for="pref-volumeBoost">音量增益<span class="hint">最高 200%，与播放器音量叠加。先调低原音量，过度放大会失真；不支持安全处理时保留原声。</span></label><input id="pref-volumeBoost" data-pref="volumeBoost" type="range" min="100" max="200" step="5" value="${PREFS.volumeBoost}"><output>${PREFS.volumeBoost}%</output></div><p class="subtitle">实验功能仅在客户端设置中提供；画中画没有标题栏。</p><div class="note" role="note"><strong>⚠ 测试功能</strong><br>超分和补帧可能卡顿、闪烁、抖动或产生伪影，不保证改善画质。开启即表示你了解测试风险，异常请关闭。</div><div class="row"><label for="pref-srMode">超分辨率<span class="hint">本地 Anime4K CNN / WebGPU；帧不上传，不出本机。</span></label><select id="pref-srMode" data-pref="srMode"><option value="off">关闭</option><option value="performance">性能</option><option value="quality">质量</option></select></div><div class="row"><label for="pref-srFps">超分目标帧率<span class="hint">60/120fps 为调度上限，不保证实际性能；不会增加源视频帧数。</span></label><select id="pref-srFps" data-pref="srFps"><option value="60">60 fps</option><option value="120">120 fps</option></select></div><div class="row"><label for="pref-srScale">目标倍率<span class="hint">Anime4K 固定 ×2 推理，再按目标倍率缩放；只处理真正需要放大的画面。</span></label><select id="pref-srScale" data-pref="srScale"><option value="1">1× · 原生（不推理）</option><option value="2">2×</option><option value="3">3×</option></select></div><div class="row"><label for="pref-fiMode">补帧模式</label><select id="pref-fiMode" data-pref="fiMode"><option value="off">关闭</option><option value="rife">RIFE AI 光流</option></select></div><div class="row"><label for="pref-fiFps">补帧目标</label><select id="pref-fiFps" data-pref="fiFps"><option value="60">60 fps</option><option value="120">120 fps</option></select></div><div class="row"><label for="pref-fiFlowScale">光流规模</label><select id="pref-fiFlowScale" data-pref="fiFlowScale"><option value="25">25% · 性能</option><option value="50">50% · 均衡</option><option value="100">100% · 质量</option></select></div><p id="fi-status">${interpolator?.status||'补帧未开启'} · RIFE 光流重投影，按源帧率固定的短呈现缓冲 + 推理延迟</p><div class="row"><div class="label">当前处理状态<span class="hint" id="gpu-status"></span></div><button class="link" id="pip-action">进入画中画 ↗</button></div><div class="note"><strong>真实处理，可随时关闭</strong><br>使用随客户端打包的 Anime4K CNN 着色器在本机 GPU 推理，按画面实际显示尺寸决定输出大小：源已经比显示更清晰时不浪费算力，并会写明原因。跨域帧不可读取、GPU 不可用或受保护的视频会停止增强并保留原生播放，不假报成功。画中画复用当前播放窗口，Esc 或右下角按钮返回。</div>`;
  return `<h2>熟悉的能力，内置。</h2><p class="subtitle">本地固定版本，不下载远程更新，不绕过会员、地区或版权限制。</p>${toggle('btr','Bilibili 线程撕裂者','多 CDN / Range 并发缓冲。开关变更后需刷新页面。')}<div class="actions"><button id="btr-settings" class="link">打开线程撕裂者设置 ↗</button><button id="reload" class="link">刷新页面</button></div><div class="row"><div class="label">一键拉黑 UP主<span class="hint">仅首页推荐按钮。视频页、搜索页、隐藏直播与插件广告过滤均关闭。拉黑会同步至 B站账号。</span></div><span class="status">首页限定</span></div><div class="section-label">内置下载器 / DOWNLOAD</div>${toggle('downloader','视频页显示下载按钮','点击后选择保存位置，直接在客户端内下载。无需安装或启动其他软件。')}<div class="note">采用 WBI 解析 → DASH 音视频分轨下载 → 本机 MP4 无损封装的流程。支持 AVC + AAC，自动选择账号可用的最高 AVC 清晰度；单文件 MP4 也可保存。暂不支持批量、多段、番剧与非 AVC/AAC 编码。不会绕过会员、地区或版权限制。下载中请勿退出客户端。</div><div class="note">线程撕裂者与首页拉黑保留原有功能。</div>`;
}
function renderSettings(){
  if(!shadow)return;
  const panel=$('#tab-content',shadow);if(!panel)return;
  // Preserve the active slider while dragging rather than replacing its DOM node.
  if(panel.contains(shadow.activeElement)&&shadow.activeElement?.matches('input[type=range],input[type=color]')){
    const input=shadow.activeElement;
    if(input.type==='range')input.nextElementSibling.textContent=PREFS[input.dataset.pref]+(['zoom','volumeBoost'].includes(input.dataset.pref)?'%':'px');
    const preview=$('.preview',panel);if(preview){preview.style.setProperty('--height',PREFS.progressHeight+'px');preview.style.setProperty('--radius',PREFS.progressRadius+'px');preview.style.setProperty('--progress',PREFS.progressColor);}return;
  }
  panel.innerHTML=tabContent();
  $$('.tabs button',shadow).forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===currentTab));b.tabIndex=b.dataset.tab===currentTab?0:-1;});
  $$('select[data-pref]',panel).forEach(s=>s.value=String(PREFS[s.dataset.pref]));
  const nodeSelect=$('#proxy-node',panel);if(nodeSelect)fillProxyNodes(nodeSelect);
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
  shadow.innerHTML=`<style>${shellCss}</style><header id="chrome"><div class="header-left" data-video="false"><a class="video-home-top" href="https://www.bilibili.com/" aria-label="返回首页" hidden>${ICON_TV}<span>首页</span></a><div class="lights"><button class="light close" data-window="close" aria-label="关闭窗口" title="关闭"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9"/></svg></button><button class="light min" data-window="minimize" aria-label="最小化窗口" title="最小化"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7"/></svg></button><button class="light max" data-window="maximize" aria-label="最大化或还原窗口" title="最大化或还原"><svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx=".5"/></svg></button></div><button class="back" type="button" aria-label="展开分区" aria-controls="header-categories" aria-expanded="false" title="分区 · 点击展开 / 返回"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.6 4.4-6.2 5.6 6.2 5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="nav-lane"><div id="header-categories" class="category-links" role="navigation" aria-label="频道分区" inert>${CATEGORIES.map(([label,url])=>`<a href="${url}">${label}</a>`).join('')}</div><nav class="primary-nav" aria-label="主导航"><a data-route="home" href="https://www.bilibili.com/">首页</a><a data-route="dynamic" href="https://t.bilibili.com/">动态</a><a data-route="history" href="https://www.bilibili.com/account/history">历史</a></nav></div></div><div class="brand">Bili <b>Space</b></div><div class="header-right"><form class="search" role="search" aria-busy="false"><input name="keyword" aria-label="搜索视频" placeholder="搜索你感兴趣的内容" autocomplete="off"><button aria-label="搜索">${icon('search')}</button><span class="sr-only" id="search-status" role="status" aria-live="polite"></span><section id="search-panel" class="search-panel" aria-label="搜索历史和官方联想" hidden></section></form><a class="messages" href="https://message.bilibili.com/#/reply" aria-label="消息" title="消息">${ICON_MESSAGE}</a><a class="upload" href="https://member.bilibili.com/platform/upload/video/frame" aria-label="投稿" title="投稿到B站">投稿</a><div class="account-wrap"><a class="account" aria-controls="account-card" aria-expanded="false" href="https://passport.bilibili.com/login?gourl=https%3A%2F%2Fwww.bilibili.com%2F">登录 B站</a><section id="account-card" class="account-card" role="region" aria-label="我的账户信息" hidden><div class="account-banner" hidden></div><div class="account-identity"><div class="account-portrait" hidden></div><div class="account-card-head"><strong class="account-name"></strong><span class="account-level"></span><span class="account-vip-label" hidden></span></div></div><div class="account-stats"><div><b data-stat="follower">—</b><span>粉丝</span></div><div><b data-stat="following">—</b><span>关注</span></div><div><b data-stat="likes">—</b><span>获赞</span></div></div><p class="account-status"></p></section></div><div class="window-actions" aria-label="窗口控制" hidden><button type="button" data-window="minimize" aria-label="最小化"><svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg></button><button type="button" data-window="maximize" aria-label="最大化或还原"><svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="1"/></svg></button><button type="button" data-window="close" aria-label="关闭"><svg viewBox="0 0 16 16"><path d="m3 3 10 10M13 3 3 13"/></svg></button></div></div></header><button id="settings-trigger" aria-label="客户端设置" title="客户端设置 · Ctrl+,">${ICON_SETTINGS}</button><div class="scrim" id="settings" hidden><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><aside><div class="eyebrow">YOUR SPACE</div><h1 id="settings-title">客户端设置</h1><div class="tabs" role="tablist" aria-label="设置分类">${Object.entries(tabs).map(([key,[label,i]])=>`<button role="tab" data-tab="${key}" aria-controls="tab-content">${icon(i)}${label}</button>`).join('')}</div><div class="aside-footer"><b>Better Bili Space</b>0.1.30 · 为专注而设计<br>修改即时生效 · 自动保存</div></aside><main><button id="dismiss" aria-label="关闭设置">×</button><div id="tab-content" role="tabpanel"></div><div class="actions"><button class="link" id="reset">恢复默认设置</button></div></main></section></div><div role="status" id="toast" hidden></div>`;
  document.documentElement.append(root);
  const dialog=$('.dialog',shadow);if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0)dialog.dataset.compact=String(entry.contentRect.width<620);});observer.observe(dialog);}
  shadow.addEventListener('click',e=>{
    const upload=e.target.closest('a.upload');if(upload){e.preventDefault();native('open-external',{url:upload.href});return;}
    const b=e.target.closest('button');
    if(b?.dataset.window){native('window',{action:b.dataset.window});return;}
    if(b?.classList.contains('back')){setCategories(b.getAttribute('aria-expanded')!=='true',e.detail===0);return;}
    if(b?.id==='settings-trigger')openSettings();
    if(b?.id==='dismiss'||e.target.id==='settings')closeSettings();
    if(b?.dataset.tab){currentTab=b.dataset.tab;renderSettings();$(`[data-tab="${currentTab}"]`,shadow).focus();if(currentTab==='plugins')native('downloader',{action:'status'});}
    if(b?.dataset.themeChoice)update({theme:b.dataset.themeChoice});
    if(b?.id==='proxy-free'){toast('正在重启客户端以启用内置免费节点…');native('proxy',{action:'free',url:location.href});}
    if(b?.id==='proxy-import')native('proxy',{action:'import',url:location.href});
    if(b?.id==='proxy-check')checkProxyRegion();
    if(b?.id==='proxy-refresh')native('proxy',{action:'nodes'});
    if(b?.id==='category-reset')update({categorySelection:DEFAULTS.categorySelection.slice()});
    if(b?.id==='category-default')update({categorySelection:DEFAULT_CATEGORIES.slice(),categoryPreset:1});
    if(b?.id==='category-all')update({categorySelection:CATEGORIES.map((_,i)=>i),categoryPreset:1});
    if(b?.id==='category-none')update({categorySelection:[],categoryPreset:1});
    if(b?.id==='reset'){update({...DEFAULTS});toast('已恢复默认设置');}
    if(b?.id==='header-reset'){update(Object.fromEntries(HEADER_ITEMS.map(([key])=>[key,true])));toast('已恢复顶部默认布局');}
    if(b?.id==='rescan'){markAds();renderSettings();toast('已重新检查当前页面');}
    if(b?.id==='btr-settings'){closeSettings();if(!PREFS.btr)toast('请先开启线程撕裂者并刷新页面');else document.dispatchEvent(new CustomEvent('btr-userscript-open-settings'));}
    if(b?.id==='reload')native('window',{action:'reload'});
    if(b?.id==='pip-action'){closeSettings();requestPip();}
    if(b?.id==='downloader-check'){native('downloader',{action:'status'});toast('正在检测下载器…');}
    if(b?.id==='downloader-enable')native('downloader',{action:'enable'});
    if(b?.id==='downloader-open')native('downloader',{action:'open'});
    if(b?.id==='downloader-browse')native('downloader',{action:'browse'});
  });
  shadow.addEventListener('input',e=>{
    const el=e.target;
    if(el.dataset.action==='proxy-toggle'){
      const on=el.checked;
      proxyInfo.enabled=on;
      const line=$('#proxy-status',shadow);if(line)line.textContent=on?'正在重启客户端以启用代理…':'正在重启客户端以关闭代理…';
      toast(on?'正在重启客户端启用代理…':'正在重启客户端关闭代理…');
      native('proxy',{action:on?'enable':'disable',url:location.href});return;
    }
    if(el.id==='proxy-node'){
      if(el.value){proxyInfo.node=el.value;native('proxy',{action:'select',node:el.value});toast('已切换到 '+el.value);}return;
    }
    if(el.dataset.category!==undefined){const selected=new Set(PREFS.categorySelection);if(el.checked)selected.add(Number(el.dataset.category));else selected.delete(Number(el.dataset.category));update({categorySelection:[...selected].sort((a,b)=>a-b),categoryPreset:1});return;}
    const key=el.dataset.pref;if(!key)return;
    let v=el.type==='checkbox'?el.checked:['range','number'].includes(el.type)||['srScale','srFps','fiFps','fiFlowScale','autoZoomTarget'].includes(key)?Number(el.value):el.value;
    update({[key]:v});
    if(key==='btr')toast('已保存；刷新页面后切换线程撕裂者');
    if(key==='proxyAll')toast('已切换分流方式；重启客户端后完整生效');
  });
  installSearchPanel();
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
  const accountWrap=$('.account-wrap',shadow);accountWrap.addEventListener('pointerenter',e=>{if(e.pointerType&&e.pointerType!=='mouse')return;clearTimeout(accountHideTimer);accountShowTimer=setTimeout(showAccountCard,150);});accountWrap.addEventListener('pointerleave',()=>{clearTimeout(accountShowTimer);accountHideTimer=setTimeout(hideAccountCard,160);});accountWrap.addEventListener('focusin',()=>showAccountCard(false));accountWrap.addEventListener('focusout',e=>{if(!accountWrap.contains(e.relatedTarget))hideAccountCard();});
  const trigger=$('.back',shadow),left=$('.header-left',shadow),lane=$('.nav-lane',shadow);
  $('#header-categories',shadow).addEventListener('wheel',e=>{const links=e.currentTarget;if(innerWidth>1050&&links.scrollWidth>links.clientWidth&&!e.ctrlKey){links.scrollLeft+=e.deltaY||e.deltaX;e.preventDefault();}},{passive:false});
  left.addEventListener('focusout',()=>setTimeout(()=>{if(!left.contains(shadow.activeElement))setCategories(false);},0));
  left.addEventListener('keydown',e=>{if(e.key==='Escape'){setCategories(false,true);trigger.focus();e.stopPropagation();}if(e.target===trigger&&e.key==='ArrowDown'){e.preventDefault();setCategories(true,true);$('#header-categories a:not([hidden])',shadow)?.focus();}});
  document.addEventListener('pointerdown',e=>{if(!e.composedPath().includes(left))setCategories(false);},{passive:true});
  let feedResize;window.addEventListener('resize',()=>{setCategories(trigger.getAttribute('aria-expanded')==='true');cancelAnimationFrame(feedResize);feedResize=requestAnimationFrame(()=>{compactHomeFeed();window.dispatchEvent(new Event('scroll'));alignVideoToolbar();});});
  setCategories(false);
  renderSettings();
}

function requestPip(){
  const video=playbackVideo();if(!video){toast('先打开一个视频，再进入画中画');return;}
  const enter=()=>native('window',{action:'pip'});if(document.fullscreenElement)document.exitFullscreen().then(enter).catch(()=>toast('请先退出全屏后进入画中画'));else enter();
}
function syncPlayerAppearance(quality){
  const reference=$('.bpx-player-ctrl-quality-result,.bpx-player-ctrl-quality-text',quality)||quality;
  const css=getComputedStyle(reference),sample=$('.bpx-player-ctrl-quality-menu,.bpx-player-ctrl-playbackrate-menu,.bilibili-player-video-quality-menu');
  const menu=sample&&getComputedStyle(sample),background=menu?.backgroundColor;
  $$('.bs-player-tool',quality.parentElement).forEach(el=>{
    const rect=quality.getBoundingClientRect();el.style.setProperty('--bs-player-height',rect.height+'px');el.style.setProperty('--bs-player-offset','0px');const own=el.getBoundingClientRect();el.style.setProperty('--bs-player-offset',(rect.top-own.top)+'px');el.style.fontFamily=css.fontFamily;el.style.fontWeight=css.fontWeight;el.style.setProperty('--bs-player-color',css.color);el.style.setProperty('--bs-player-font',css.fontSize);el.style.setProperty('--bs-player-opacity',css.opacity);
    el.style.setProperty('--bs-player-menu-bg',background&&background!=='rgba(0, 0, 0, 0)'?background:'rgba(21,21,21,.9)');
    el.style.setProperty('--bs-player-menu-radius',menu?.borderRadius||'4px');el.style.setProperty('--bs-player-menu-font',menu?.fontSize||'12px');el.style.setProperty('--bs-player-menu-color',menu?.color||css.color);
  });
}
function mountPlayerTools(){
  $$('.bs-player-tool').forEach(el=>el.remove());
}

const originalVideoOpacity=new WeakMap(),originalHostPosition=new WeakMap();
function rememberVideo(video){if(!originalVideoOpacity.has(video))originalVideoOpacity.set(video,video.style.opacity);const host=video.parentElement;if(!originalHostPosition.has(host))originalHostPosition.set(host,host.style.position);return originalVideoOpacity.get(video);}
function restoreVideo(video,exclude){
  const active=[gpu,interpolator].filter(p=>p&&p!==exclude&&p.video===video&&!p.stopped);
  video.style.opacity=active.some(p=>p.frames>0&&p.canvas.width>0&&p.canvas.style.visibility!=='hidden')?'0':originalVideoOpacity.get(video)||'';
  if(!active.length&&video.parentElement)video.parentElement.style.position=originalHostPosition.get(video.parentElement)||'';
}
class PresentationClock {
  constructor(){this.queue=[];this.current=null;this.delay=null;this.presented=-Infinity;this.lastPhase=0;}
  enqueue(pair){if(this.delay===null)this.delay=Math.min(100,Math.max(32,pair.interval*2.5));this.queue.push(pair);if(this.queue.length>6)this.queue.shift();}
  sample(now){
    const target=now-(this.delay||0);let next;
    while(this.queue.length&&this.queue[0].time-this.queue[0].interval<=target){const pair=this.queue.shift();if(pair.time>=this.presented)next=pair;}
    if(next)this.current=next;if(!this.current)return null;
    const pair=this.current,start=pair.time-pair.interval,raw=Math.max(0,Math.min(1,(target-start)/pair.interval));
    // RIFE predicts the midpoint: do not invent quarter-phase optical flow.
    const phase=raw<.25?0:raw<.75?.5:1,time=start+phase*pair.interval;
    if(time<this.presented)return null;this.presented=time;this.lastPhase=phase;return {pair,phase,time};
  }
}

class FrameInterpolator {
  constructor(video,fps,automatic=true){
    if(!navigator.gpu||typeof ort==='undefined')throw Error('AI 光流补帧需要 WebGPU');
    this.video=video;this.fps=fps;this.frames=0;this.generated=0;this.inferences=0;this.dropped=0;this.stopped=false;this.ready=false;this.status='加载本地 RIFE AI 光流模型…';this.clock=new PresentationClock();this.uploadedPair=null;this.clockHistory=[];this.lastDraw=-Infinity;this.epoch=0;
    this.oldOpacity=rememberVideo(video);this.parent=video.parentElement;this.canvas=document.createElement('canvas');this.canvas.className='bs-gpu-canvas bs-fi-canvas';this.canvas.style.visibility='hidden';
    this.gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!this.gl)throw Error('WebGL 重投影不可用');
    const gl=this.gl;if(!gl.getExtension('OES_texture_float'))throw Error('显卡不支持光流浮点纹理');
    const shader=(type,code)=>{const sh=gl.createShader(type);gl.shaderSource(sh,code);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
    const vs=shader(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}');
    const fs=shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 uv;uniform sampler2D a;uniform sampler2D b;uniform sampler2D motion;uniform sampler2D mask;uniform float phase;uniform vec2 flowSize;
      vec4 field(sampler2D t,vec2 v){vec2 p=v*flowSize-.5;vec2 f=fract(p);vec2 q=(floor(p)+.5)/flowSize;vec2 d=1./flowSize;return mix(mix(texture2D(t,q),texture2D(t,q+vec2(d.x,0.)),f.x),mix(texture2D(t,q+vec2(0.,d.y)),texture2D(t,q+d),f.x),f.y);}
      void main(){if(phase<=.001){gl_FragColor=texture2D(a,uv);return;}if(phase>=.999){gl_FragColor=texture2D(b,uv);return;}
      vec2 fuv=vec2(uv.x,1.-uv.y);vec4 flow=field(motion,fuv);float m=field(mask,fuv).r;
      vec2 pa=uv+vec2(flow.r,-flow.g)*(2.*phase)/flowSize;vec2 pb=uv+vec2(flow.b,-flow.a)*(2.*(1.-phase))/flowSize;
      float weight=(1.-phase)*m/max(.00001,(1.-phase)*m+phase*(1.-m));gl_FragColor=mix(texture2D(b,pb),texture2D(a,pa),weight);}`);
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error('光流着色器链接失败');gl.useProgram(this.program);
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(this.program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    this.textures=[0,1,2,3].map(i=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,i<2?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,i<2?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;});
    ['a','b','motion','mask'].forEach((n,i)=>gl.uniform1i(gl.getUniformLocation(this.program,n),i));this.phase=gl.getUniformLocation(this.program,'phase');this.flowSize=gl.getUniformLocation(this.program,'flowSize');
    this.work=document.createElement('canvas');this.workCtx=this.work.getContext('2d',{willReadFrequently:true});
    if(getComputedStyle(this.parent).position==='static')this.parent.style.position='relative';this.parent.append(this.canvas);
    this.lost=e=>{e.preventDefault();this.fail('AI 光流 GPU 上下文丢失，已恢复原始画面');};this.canvas.addEventListener('webglcontextlost',this.lost);
    this.reset=()=>{this.epoch++;this.clock=new PresentationClock();this.uploadedPair=null;this.ready=false;this.lastFrame=null;this.pending=null;this.canvas.style.visibility='hidden';restoreVideo(this.video,this);};video.addEventListener('seeking',this.reset);video.addEventListener('ratechange',this.reset);
    this.capture=this.capture.bind(this);this.render=this.render.bind(this);this.automatic=automatic;
    if(automatic){this.queueCapture();this.raf=requestAnimationFrame(this.render);}
    localRifeSession().then(()=>{if(!this.stopped&&this.inferences===0){this.status='RIFE 已就绪，等待相邻真实帧';this.showStatus();}}).catch(e=>this.fail('AI 光流不可用：'+e.message));
  }
  queueCapture(){if(this.stopped)return;this.captureHandle=this.video.requestVideoFrameCallback?this.video.requestVideoFrameCallback(this.capture):requestAnimationFrame(this.capture);}
  capture(now){if(this.stopped)return;if(!this.video.isConnected){this.stop();scheduleScan();return;}if(!document.hidden&&!this.video.paused&&!this.video.seeking&&this.video.readyState>=2)this.push(this.video,now);this.queueCapture();}
  push(source,now){
    if(this.stopped||this.video.seeking)return;
    try{
      const w=source.videoWidth||source.width,h=source.videoHeight||source.height;if(!w||!h)return;if(w*h>4.2e6)throw Error('光流呈现支持至约 4MP');
      const current=document.createElement('canvas');current.width=w;current.height=h;current.getContext('2d',{alpha:false}).drawImage(source,0,0);
      const previous=this.lastFrame;this.lastFrame={canvas:current,time:now};if(!previous||previous.canvas.width!==w||previous.canvas.height!==h||now-previous.time>250||now<=previous.time)return;
      if(this.pending)this.dropped++;this.pending={previous:previous.canvas,current,time:now,interval:now-previous.time,epoch:this.epoch};this.process();
    }catch(e){this.fail('AI 光流未启用：'+e.message);}
  }
  async process(){
    if(this.stopped||this.busy||!this.pending)return;this.busy=true;const pair=this.pending;this.pending=null;
    try{await this.prepare(pair);}catch(e){if(!this.stopped)this.fail('AI 光流未启用：'+e.message);}
    finally{this.busy=false;if(!this.stopped&&this.pending)this.process();}
  }
  async prepare(pair,force=false){
    const w=pair.current.width,h=pair.current.height,scale=Math.min(PREFS.fiFlowScale/100,640/w,384/h);
    const fw=Math.max(64,Math.min(640,Math.ceil(w*scale/64)*64)),fh=Math.max(64,Math.min(384,Math.ceil(h*scale/64)*64));
    if(this.work.width!==fw||this.work.height!==fh){this.work.width=fw;this.work.height=fh;}
    this.workCtx.drawImage(pair.previous,0,0,fw,fh);const first=this.workCtx.getImageData(0,0,fw,fh).data;
    this.workCtx.drawImage(pair.current,0,0,fw,fh);const second=this.workCtx.getImageData(0,0,fw,fh).data;
    const result=await inferRife(first,second,fw,fh);
    if(this.stopped||pair.epoch!==this.epoch)return;
    this.inferences++;this.inferenceMs=result.ms;this.estimate=[fw,fh];
    if(!force&&performance.now()-pair.time>250){this.status='RIFE 模型预热完成，正在同步最新帧';this.showStatus();return;}
    if(result.width!==fw||result.height!==fh)throw Error('RIFE 光流尺寸与输入不匹配');
    const prepared={...pair,result,fw,fh};if(force)this.upload(prepared);else this.clock.enqueue(prepared);
  }
  upload(pair){
    const {result,fw,fh}=pair,w=pair.current.width,h=pair.current.height;
    const gl=this.gl;if(Math.max(w,h)>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw Error('呈现尺寸超出显卡限制');
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;gl.viewport(0,0,w,h);}
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    [pair.previous,pair.current].forEach((frame,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,frame);});
    const count=fw*fh,field=new Float32Array(count*4);for(let i=0,j=0;i<count;i++,j+=4){field[j]=result.flow[i];field[j+1]=result.flow[count+i];field[j+2]=result.flow[2*count+i];field[j+3]=result.flow[3*count+i];}
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.textures[2]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,fw,fh,0,gl.RGBA,gl.FLOAT,field);
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.textures[3]);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,fw,fh,0,gl.LUMINANCE,gl.FLOAT,result.mask);
    if(gl.getError()!==gl.NO_ERROR)throw Error('光流 / 遮挡纹理上传失败');gl.useProgram(this.program);gl.uniform2f(this.flowSize,fw,fh);this.lastInput=pair.time-pair.interval;this.interval=pair.interval;this.ready=true;this.uploadedPair=pair;
  }
  draw(phase){const gl=this.gl;gl.useProgram(this.program);this.textures.forEach((t,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);});gl.uniform1f(this.phase,phase);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);if(gl.getError()!==gl.NO_ERROR)throw Error('光流重投影失败');}
  render(now){
    if(this.stopped)return;if(this.video.paused||document.hidden){this.canvas.style.visibility='hidden';restoreVideo(this.video,this);}
    if(!document.hidden&&!this.video.paused&&!this.video.seeking&&now-this.lastDraw>=1000/this.fps-2){
      try{const sample=this.clock.sample(now);if(sample){if(sample.pair!==this.uploadedPair)this.upload(sample.pair);const phase=sample.phase;this.draw(phase);this.clockHistory.push(sample.time);if(this.clockHistory.length>120)this.clockHistory.shift();this.lastDraw=now;this.frames++;if(phase>.01&&phase<.99)this.generated++;this.canvas.style.visibility='visible';this.video.style.opacity='0';this.status=`RIFE AI 光流 · ${this.estimate.join('×')} 估计 · ${this.inferenceMs.toFixed(0)}ms · 中间帧 ${this.generated} · AI ×2 / 目标 ${this.fps}Hz`;this.showStatus();}}catch(e){this.fail(e.message);return;}
    }
    this.raf=requestAnimationFrame(this.render);
  }
  showStatus(){$$('.bs-fi-status').forEach(el=>el.textContent=this.status);const el=shadow&&$('#fi-status',shadow);if(el)el.textContent=this.status;}
  fail(message){this.stop();this.status=message;this.showStatus();diagnostic(message);}
  stop(){if(this.stopped)return;this.stopped=true;this.epoch++;this.pending=null;this.lastFrame=null;this.clock=new PresentationClock();this.uploadedPair=null;cancelAnimationFrame(this.raf);if(this.video.cancelVideoFrameCallback&&this.captureHandle!=null)this.video.cancelVideoFrameCallback(this.captureHandle);else cancelAnimationFrame(this.captureHandle);this.video.removeEventListener('seeking',this.reset);this.video.removeEventListener('ratechange',this.reset);this.canvas.removeEventListener('webglcontextlost',this.lost);this.canvas.remove();const gl=this.gl;this.textures.forEach(t=>gl.deleteTexture(t));gl.deleteBuffer(this.buffer);gl.deleteProgram(this.program);restoreVideo(this.video,this);}
}
function startInterpolation(){
  interpolator?.stop();interpolator=null;if(PREFS.fiMode==='off')return;const video=playbackVideo();if(!video)return;
  try{interpolator=new FrameInterpolator(video,PREFS.fiFps);}catch(e){diagnostic(e.message);toast('AI 光流不可用：'+e.message);}
}

// ESPCN's learned luminance network runs locally; no frame or tensor leaves this process.
let aiSessionPromise,rifeSessionPromise,gpuRuntimePromise;
// ORT's Asyncify backend owns shared WASM state; SR and flow must never enter it concurrently.
let inferenceQueue=Promise.resolve();
function exclusiveGpu(task){const run=inferenceQueue.then(task,task);inferenceQueue=run.catch(()=>{});return run;}
async function runLocalSession(session,feeds){return exclusiveGpu(async()=>{const tensors=await session.run(feeds);try{return Object.fromEntries(Object.entries(tensors).map(([name,t])=>[name,{dims:[...t.dims],data:t.data.slice()}]));}finally{Object.values(tensors).forEach(t=>t.dispose());}});}

async function ensureGpuRuntime(){
  if(!navigator.gpu||typeof ort==='undefined')throw Error('本地 AI 需要 WebGPU；已保留原生播放');
  if(!gpuRuntimePromise)gpuRuntimePromise=(async()=>{
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('找不到 WebGPU 显卡');
    ort.env.webgpu.adapter=adapter;ort.env.wasm.wasmPaths='https://bili-space.local/ai/';ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  })().catch(e=>{gpuRuntimePromise=null;throw e;});
  return gpuRuntimePromise;
}
async function loadLocalModel(path){await ensureGpuRuntime();const r=await fetch('https://bili-space.local/ai/'+path);if(!r.ok)throw Error('本地模型读取失败 HTTP '+r.status);const bytes=await r.arrayBuffer();return exclusiveGpu(()=>ort.InferenceSession.create(bytes,{executionProviders:['webgpu'],graphOptimizationLevel:'all'}));}
async function localAiSession(){if(!aiSessionPromise)aiSessionPromise=loadLocalModel('espcn-x3-dynamic.onnx').catch(e=>{aiSessionPromise=null;throw e;});return aiSessionPromise;}
async function localRifeSession(){if(!rifeSessionPromise)rifeSessionPromise=loadLocalModel('rife49-flow.onnx').catch(e=>{rifeSessionPromise=null;throw e;});return rifeSessionPromise;}
async function inferRife(frame0,frame1,w,h){
  const session=await localRifeSession(),pixels=w*h;
  const planar=rgba=>{const rgb=new Float32Array(pixels*3);for(let i=0,j=0;i<pixels;i++,j+=4){rgb[i]=rgba[j]/255;rgb[pixels+i]=rgba[j+1]/255;rgb[2*pixels+i]=rgba[j+2]/255;}return rgb;};
  const input0=new ort.Tensor('float32',planar(frame0),[1,3,h,w]),input1=new ort.Tensor('float32',planar(frame1),[1,3,h,w]),time=new ort.Tensor('float32',Float32Array.of(.5),[1]);let result;
  const begin=performance.now();
  try{result=await runLocalSession(session,{img0:input0,img1:input1,timestep:time});const flow=result[session.outputNames[0]],mask=result[session.outputNames[1]];return {flow:flow.data.slice(),mask:mask.data.slice(),width:flow.dims[3],height:flow.dims[2],ms:performance.now()-begin};}
  finally{input0.dispose();input1.dispose();time.dispose();}
}
const SR_MAX_IN_PX=1920*1080, SR_MAX_OUT_PX=4.2e6, SR_HARD_CAP=3;
class AIScaler {
  constructor(video,mode,scale){
    if(!navigator.gpu||typeof ort==='undefined')throw Error('WebGPU 本地 AI 不可用；已保留原生播放');
    this.video=video;this.mode=mode;this.scale=scale;this.frames=0;this.last=-Infinity;this.stopped=false;
    this.interval=1000/(PREFS.srFps===120?120:60);this.stamps=[];this.epoch=0;
    this.canvas=document.createElement('canvas');this.canvas.className='bs-gpu-canvas';this.canvas.style.visibility='hidden';
    this.ctx=this.canvas.getContext('2d',{alpha:false,desynchronized:true});
    this.input=document.createElement('canvas');this.inputCtx=this.input.getContext('2d',{willReadFrequently:true,alpha:false});
    this.output=document.createElement('canvas');this.outputCtx=this.output.getContext('2d',{alpha:false});
    this.oldOpacity=rememberVideo(video);this.parent=video.parentElement;this.oldPosition=this.parent.style.position;
    if(getComputedStyle(this.parent).position==='static'){this.parent.style.position='relative';this.changedPosition=true;}
    this.parent.append(this.canvas);this.tick=this.tick.bind(this);
    this.seekReset=()=>{this.epoch++;this.canvas.style.visibility='hidden';restoreVideo(this.video,this);};video.addEventListener('seeking',this.seekReset);
    status='正在加载本地 ESPCN ×3 / WebGPU…';updateStatus();
    localAiSession().then(session=>{if(this.stopped)return;this.session=session;this.schedule();}).catch(e=>this.fail(e.message));
  }
  schedule(){if(this.stopped)return;this.frame=this.video.requestVideoFrameCallback?this.video.requestVideoFrameCallback(this.tick):requestAnimationFrame(this.tick);}
  // Output size follows what is actually on screen: a 1080p source in a small player is left
  // alone, a 360p/480p/720p source gets real inference, and the pixel budget caps the rest.
  plan(){
    const w=this.video.videoWidth,h=this.video.videoHeight;
    if(!w||!h)return null;
    if(w*h>SR_MAX_IN_PX)return {reason:`源 ${w}×${h} 超出本地推理上限，已保留原生播放`};
    const box=this.video.getBoundingClientRect();
    const dpr=Math.min(devicePixelRatio||1,2);
    const shown=Math.max((box.width||0)*dpr,(box.height||0)*dpr*(w/h||1),1);
    let factor=Math.min(this.scale,SR_HARD_CAP,shown/w,Math.sqrt(SR_MAX_OUT_PX/(w*h)));
    if(!Number.isFinite(factor)||factor<1.02)return {reason:'画面已经不比源更大，AI 推理不会带来可见提升'};
    return {w,h,factor,outW:Math.round(w*factor),outH:Math.round(h*factor)};
  }
  async tick(now){
    if(this.stopped)return;
    if(!this.video.isConnected){this.stop();scheduleScan();return;}
    if(document.hidden||this.video.readyState<2){this.schedule();return;}
    if(!this.session){this.schedule();return;}
    if(now-this.last<this.interval-1){this.schedule();return;}
    const plan=this.plan();
    if(!plan){this.schedule();return;}
    if(!plan.outW){this.idle(plan.reason);this.schedule();return;}
    try{
      const {w,h,outW,outH,factor}=plan,begin=performance.now(),epoch=this.epoch;
      if(this.input.width!==w||this.input.height!==h){this.input.width=w;this.input.height=h;this.luma=null;}
      this.inputCtx.drawImage(this.video,0,0,w,h);
      const rgba=this.inputCtx.getImageData(0,0,w,h).data,len=w*h;
      if(!this.luma||this.luma.length!==len)this.luma=new Float32Array(len);
      const y=this.luma;
      for(let i=0,j=0;i<len;i++,j+=4)y[i]=(rgba[j]*0.299+rgba[j+1]*0.587+rgba[j+2]*0.114)*(1/255);
      const input=new ort.Tensor('float32',y,[1,1,h,w]);let result;
      try{result=await runLocalSession(this.session,{[this.session.inputNames[0]]:input});}finally{input.dispose();}
      const tensor=result[this.session.outputNames[0]];
      if(this.stopped||epoch!==this.epoch){if(!this.stopped)this.schedule();return;}
      const oh=tensor.dims[2],ow=tensor.dims[3],values=tensor.data;
      if(ow!==w*3||oh!==h*3){throw Error('AI 模型输出尺寸错误');}
      const out=this.output;
      if(out.width!==ow||out.height!==oh){out.width=ow;out.height=oh;this.pixels=null;}
      if(!this.pixels)this.pixels=this.outputCtx.createImageData(ow,oh);
      const pixels=this.pixels.data;
      // Fill 3×3 blocks per source pixel: the learned luminance replaces Y and keeps the
      // original chroma offsets, so colour is untouched and no per-output-pixel division runs.
      for(let yy=0,row=0;yy<h;yy++,row+=w){
        const baseY=yy*3;
        for(let xx=0;xx<w;xx++){
          const k=(row+xx)*4;
          const oldY=rgba[k]*0.299+rgba[k+1]*0.587+rgba[k+2]*0.114;
          const dr=rgba[k]-oldY,dg=rgba[k+1]-oldY,db=rgba[k+2]-oldY;
          for(let dy=0;dy<3;dy++){
            let p=((baseY+dy)*ow+xx*3)*4, s=(baseY+dy)*ow+xx*3;
            for(let dx=0;dx<3;dx++){
              const v=values[s+dx]*255;
              pixels[p]=v+dr;pixels[p+1]=v+dg;pixels[p+2]=v+db;pixels[p+3]=255;p+=4;
            }
          }
        }
      }
      this.outputCtx.putImageData(this.pixels,0,0);
      if(this.canvas.width!==outW||this.canvas.height!==outH){this.canvas.width=outW;this.canvas.height=outH;}
      this.ctx.imageSmoothingEnabled=true;this.ctx.imageSmoothingQuality='high';
      this.ctx.drawImage(out,0,0,outW,outH);
      this.canvas.style.visibility='visible';
      this.video.style.opacity='0';this.frames++;this.last=now;this.inferenceMs=performance.now()-begin;
      this.stamps.push(now);while(this.stamps.length&&now-this.stamps[0]>1500)this.stamps.shift();
      const fps=this.stamps.length>1?Math.round((this.stamps.length-1)*1000/(now-this.stamps[0])):0;
      status=`本地 AI ESPCN ×3 · ${w}×${h} → ${outW}×${outH}（${factor.toFixed(2)}×）· ${this.inferenceMs.toFixed(0)}ms/帧 · ${fps?fps+'fps':'统计中'}`;
      updateStatus();if(this.frames===1)diagnostic(status);
    }catch(e){this.fail('AI 未启用：'+e.message+'；已恢复原生播放');return;}
    this.schedule();
  }
  idle(reason){
    this.canvas.style.visibility='hidden';restoreVideo(this.video,this);
    if(this.canvas.width){this.canvas.width=0;this.canvas.height=0;}
    if(status!==reason){status=reason;updateStatus();diagnostic(reason);}
  }
  fail(text){if(this.stopped)return;this.stop();status=text;updateStatus();toast(text);diagnostic(text);}
  stop(){if(this.stopped)return;this.stopped=true;if(this.video.cancelVideoFrameCallback&&this.frame!=null)this.video.cancelVideoFrameCallback(this.frame);else cancelAnimationFrame(this.frame);this.video.removeEventListener('seeking',this.seekReset);restoreVideo(this.video,this);this.canvas.remove();this.pixels=null;this.luma=null;}
}
async function benchScale(w,h,runs=6){
  const session=await localAiSession();
  const data=new Float32Array(w*h);for(let i=0;i<data.length;i++)data[i]=((i*37)%255)/255;
  const input=new ort.Tensor('float32',data,[1,1,h,w]);
  let result;
  const begin=performance.now();
  for(let i=0;i<runs;i++){result=await runLocalSession(session,{[session.inputNames[0]]:input});}
  const ms=(performance.now()-begin)/runs;
  input.dispose();
  return {w,h,ms:Math.round(ms*10)/10,fps:Math.round(10000/ms)/10};
}
function updateStatus(){
  const label=shadow&&$('#gpu-status',shadow);if(label)label.textContent=status;
  $$('.bs-player-tool[data-kind=sr] output').forEach(el=>el.textContent=status);
}

class Anime4KScaler {
  constructor(video,mode,scale){
    if(!navigator.gpu||!window['anime4k-webgpu'])throw Error('Anime4K WebGPU 不可用');
    this.video=video;this.mode=mode;this.scale=scale;this.frames=0;this.stopped=false;this.last=-Infinity;
    rememberVideo(video);this.canvas=document.createElement('canvas');this.canvas.className='bs-gpu-canvas bs-anime4k-canvas';this.canvas.style.zIndex='4';this.canvas.style.visibility='hidden';
    if(getComputedStyle(video.parentElement).position==='static')video.parentElement.style.position='relative';video.parentElement.append(this.canvas);
    this.loop=this.loop.bind(this);this.init().then(()=>{if(!this.stopped)this.raf=requestAnimationFrame(this.loop);}).catch(e=>this.fail(e.message));
  }
  async init(){
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('无 WebGPU 显卡');
    this.device=await adapter.requestDevice();if(this.stopped){this.device.destroy();return;}
    this.device.addEventListener('uncapturederror',e=>{e.preventDefault();if(!this.stopped)this.fail(e.error.message);});
    this.device.lost.then(info=>{if(!this.stopped)this.fail('GPU 已丢失：'+info.message);});
    this.context=this.canvas.getContext('webgpu');if(!this.context)throw Error('WebGPU 画布不可用');
    this.format=navigator.gpu.getPreferredCanvasFormat();this.context.configure({device:this.device,format:this.format,alphaMode:'opaque'});
    const code=`@group(0) @binding(0) var image:texture_2d<f32>; @group(0) @binding(1) var samp:sampler;
      struct Out{@builtin(position) pos:vec4f,@location(0) uv:vec2f};
      @vertex fn vs(@builtin(vertex_index) i:u32)->Out{var pts=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));var o:Out;o.pos=vec4f(pts[i],0.,1.);o.uv=vec2f((pts[i].x+1.)*.5,(1.-pts[i].y)*.5);return o;}
      @fragment fn fs(o:Out)->@location(0) vec4f{return vec4f(textureSample(image,samp,o.uv).rgb,1.);}`;
    const module=this.device.createShaderModule({code});this.present=this.device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:this.format}]},primitive:{topology:'triangle-list'}});
    this.sampler=this.device.createSampler({magFilter:'linear',minFilter:'linear'});
  }
  setup(w,h){
    if(this.w===w&&this.h===h)return;
    // Input-size changes discard all intermediate textures instead of leaking them.
    if(this.input)this.releaseTextures();this.w=w;this.h=h;
    this.input=this.device.createTexture({size:[w,h],format:'rgba16float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
    const lib=window['anime4k-webgpu'];this.pipeline=new (this.mode==='quality'?lib.CNNx2UL:lib.CNNx2M)({device:this.device,inputTexture:this.input});
    this.bind=this.device.createBindGroup({layout:this.present.getBindGroupLayout(0),entries:[{binding:0,resource:this.pipeline.getOutputTexture().createView()},{binding:1,resource:this.sampler}]});
  }
  releaseTextures(){
    const seen=new Set();const visit=o=>{if(!o||typeof o!=='object'||seen.has(o))return;seen.add(o);if(typeof o.destroy==='function'&&typeof o.createView==='function'){o.destroy();return;}if(Array.isArray(o))o.forEach(visit);else if(o!==this.device)for(const [key,v] of Object.entries(o))if(key!=='device')visit(v);};visit(this.pipeline);this.input?.destroy();this.input=null;this.pipeline=null;
  }
  async loop(now){
    if(this.stopped)return;
    try{
      if(!this.video.isConnected){this.stop();return;}
      const fi=interpolator&&!interpolator.stopped&&interpolator.ready&&interpolator.canvas.style.visibility==='visible'?interpolator:null;
      const source=fi?fi.canvas:this.video,w=source.videoWidth||source.width,h=source.videoHeight||source.height;
      const stamp=fi?fi.frames:this.video.currentTime;
      if(this.video.readyState>=2&&!this.video.paused&&!document.hidden&&w&&h&&this.scale>1&&stamp!==this.lastStamp&&now-this.last>=1000/PREFS.srFps-1){
        this.setup(w,h);const rect=this.video.getBoundingClientRect();const factor=Math.min(this.scale,Math.max(1,rect.width*devicePixelRatio/w,rect.height*devicePixelRatio/h),Math.sqrt(4.2e6/(w*h)));
        this.canvas.width=Math.max(1,Math.round(w*factor));this.canvas.height=Math.max(1,Math.round(h*factor));
        const begin=performance.now();this.device.queue.copyExternalImageToTexture({source},{texture:this.input},[w,h]);
        const encoder=this.device.createCommandEncoder();this.pipeline.pass(encoder);
        const pass=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(this.present);pass.setBindGroup(0,this.bind);pass.draw(3);pass.end();this.device.queue.submit([encoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();if(this.stopped)return;
        this.frames++;this.last=now;this.lastStamp=stamp;this.canvas.style.visibility='visible';this.video.style.opacity='0';
        this.inferenceMs=performance.now()-begin;status=`Anime4K CNN ×2 · ${w}×${h} · ${this.inferenceMs.toFixed(1)}ms · 目标 ${PREFS.srFps}fps`;updateStatus();
      }
      if(this.scale<=1){this.canvas.style.visibility='hidden';restoreVideo(this.video,this);}
    }catch(e){this.fail(e.message);return;}
    this.raf=requestAnimationFrame(this.loop);
  }
  fail(message){this.stop();status='Anime4K 未启用：'+message+'；恢复原生播放';updateStatus();diagnostic(status);}
  stop(){if(this.stopped)return;this.stopped=true;cancelAnimationFrame(this.raf);this.releaseTextures();this.context?.unconfigure();this.device?.destroy();this.canvas.remove();restoreVideo(this.video,this);}
}

function startGpu(){
  gpu?.stop();gpu=null;
  if(PREFS.srMode==='off'){status='未开启';updateStatus();return;}
  const video=playbackVideo();if(!video){status='等待视频';updateStatus();return;}
  try{status='等待可读取的视频帧';gpu=new Anime4KScaler(video,PREFS.srMode,PREFS.srScale);updateStatus();}
  catch(e){status=e.message;updateStatus();toast('增强不可用，原生播放不受影响：'+e.message);diagnostic(status);}
}

let volumeDrag=null;const volumeWatched=new WeakSet();
function playerVolumePercent(){const video=playbackVideo();return video?Math.round((video.muted?0:video.volume)*Math.max(1,Math.min(2,Number(PREFS.volumeBoost||100)/100))*100):0;}
function syncNativeVolume(){
  const host=$('.bpx-player-ctrl-volume');if(!host)return;const percent=playerVolumePercent(),number=$('.bpx-player-ctrl-volume-number',host),track=$('.bui-track',host),bar=$('.bui-bar-normal',host),thumb=$('.bui-thumb',host);host.dataset.bsMaxVolume='200';if(number&&number.textContent!==String(percent))number.textContent=String(percent);
  if(track){track.setAttribute('role','slider');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','200');track.setAttribute('aria-valuenow',String(percent));track.setAttribute('aria-label','音量，最高200%');const height=track.getBoundingClientRect().height||48,ratio=percent/200;const fill='scaleY('+ratio+')',pos='translateY('+(-height*ratio)+'px)';if(bar&&bar.style.transform!==fill)bar.style.transform=fill;if(thumb&&thumb.style.transform!==pos)thumb.style.transform=pos;}
}
function setPlayerVolume(percent,persist=false){
  const video=playbackVideo();if(!video)return;percent=Math.max(0,Math.min(200,Math.round(Number(percent)||0)));PREFS.volumeBoost=Math.max(100,percent);video.volume=Math.min(1,percent/100);video.muted=percent===0;applyAudioBoost();syncNativeVolume();if(persist)update({volumeBoost:PREFS.volumeBoost});
}
let volumeHintTimer;
function showPlayerVolumeHint(){
  const player=$('.bpx-player-video-wrap')||$('.bpx-player-container');if(!player)return;
  let hint=$('[data-bs-volume-hint]',player);
  if(!hint){hint=document.createElement('div');hint.dataset.bsVolumeHint='';hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');hint.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:90;pointer-events:none;padding:12px 20px;border-radius:10px;background:rgba(0,0,0,.65);color:#fff;font:500 18px/1.4 sans-serif;transition:opacity 150ms ease';player.append(hint);}
  hint.textContent='音量 '+playerVolumePercent()+'%';hint.style.opacity='1';clearTimeout(volumeHintTimer);volumeHintTimer=setTimeout(()=>{hint.style.opacity='0';},1100);
}
function installPlayerInteractions(){
  document.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key)||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||pageKind()!=='video'||!playbackVideo())return;const path=e.composedPath();if(path.some(el=>el?.matches?.('input,textarea,select,[contenteditable=true],[role=textbox],[role=dialog]'))||shadow&&!$('#settings',shadow).hidden)return;e.preventDefault();e.stopImmediatePropagation();setPlayerVolume(playerVolumePercent()+(e.key==='ArrowUp'?5:-5),true);showPlayerVolumeHint();},true);

  document.addEventListener('click',e=>{const button=e.target.closest?.('.bpx-player-ctrl-pip,.bilibili-player-video-btn-pip');if(!button||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();requestPip();},true);
  const change=e=>{const track=volumeDrag?.track;if(!track)return;const rect=track.getBoundingClientRect();if(rect.height>0)setPlayerVolume((rect.bottom-e.clientY)/rect.height*200);};
  document.addEventListener('pointerdown',e=>{const slider=e.target.closest?.('.bpx-player-ctrl-volume-progress');if(!slider||e.button!==0)return;const track=$('.bui-track',slider)||slider;e.preventDefault();e.stopImmediatePropagation();volumeDrag={track,pointer:e.pointerId};track.setPointerCapture?.(e.pointerId);change(e);},true);
  document.addEventListener('pointermove',e=>{if(!volumeDrag||volumeDrag.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();change(e);},true);
  const end=e=>{if(!volumeDrag||volumeDrag.pointer!==e.pointerId)return;const track=volumeDrag.track;track.releasePointerCapture?.(e.pointerId);volumeDrag=null;update({volumeBoost:PREFS.volumeBoost});};document.addEventListener('pointerup',end,true);document.addEventListener('pointercancel',end,true);
  document.addEventListener('mousedown',e=>{if(e.target.closest?.('.bpx-player-ctrl-volume-progress')){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('wheel',e=>{if(!e.target.closest?.('.bpx-player-ctrl-volume-progress')||e.ctrlKey)return;e.preventDefault();e.stopImmediatePropagation();setPlayerVolume(playerVolumePercent()+(e.deltaY<0?5:-5),true);},{capture:true,passive:false});
}
let audioContext,audioVideo;const audioGraphs=new WeakMap(),audioStarting=new WeakSet();
function applyAudioBoost(){
  const video=playbackVideo();if(!video)return;
  if(!volumeWatched.has(video)){volumeWatched.add(video);video.addEventListener('volumechange',()=>{if(Number(PREFS.volumeBoost)>100&&video.volume<.999){PREFS.volumeBoost=100;const graph=audioGraphs.get(video);if(graph)graph.gain.gain.value=1;}syncNativeVolume();});}syncNativeVolume();
  const amount=Math.max(1,Math.min(2,Number(PREFS.volumeBoost||100)/100));
  if(audioVideo&&audioVideo!==video){const old=audioGraphs.get(audioVideo);if(old)old.gain.gain.value=1;}audioVideo=video;
  let graph=audioGraphs.get(video);if(!graph&&amount<=1)return;
  if(!graph){
    try{
      const src=video.currentSrc||video.src;
      if(src&&!src.startsWith('blob:')&&!video.crossOrigin&&new URL(src,location.href).origin!==location.origin){video.dataset.bsAudio='unsupported-cors';return;}
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      audioContext=audioContext||new Audio();
      if(audioContext.state!=='running'){
        video.dataset.bsAudio='pending-gesture';if(!audioStarting.has(video)){audioStarting.add(video);audioContext.resume().then(()=>{audioStarting.delete(video);if(audioContext.state==='running')applyAudioBoost();}).catch(()=>audioStarting.delete(video));}return;
      }
      const source=audioContext.createMediaElementSource(video),gain=audioContext.createGain();source.connect(gain);gain.connect(audioContext.destination);graph={source,gain};audioGraphs.set(video,graph);
      video.addEventListener('play',()=>audioContext?.resume().catch(()=>{}));
    }catch(e){diagnostic('音量增益不可用，保留原声：'+e.message);return;}
  }
  graph.gain.gain.value=amount;video.dataset.bsAudio='gain-'+Math.round(amount*100);audioContext.resume().catch(()=>{});
}

function pauseForTray(){playbackSuspended=true;$$('video,audio').forEach(media=>media.pause());if(shadow)$$('video',shadow).forEach(media=>media.pause());finishVideoLoading();recordVideoLoading('tray-paused');}
function restoreFromTray(){playbackSuspended=false;}
function beginClose(){
  if(PREFS.closeAction==='tray')pauseForTray();
  if(document.querySelector('#bs-close-animation'))return;
  const layer=document.createElement('div');layer.id='bs-close-animation';layer.setAttribute('role','status');layer.setAttribute('aria-label','正在关闭 Bili Space');layer.innerHTML='<div>'+ICON_TV+'<p>Bili Space</p></div>';
  document.documentElement.append(layer);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(()=>native('window',{action:'close-ready'}),reduced?0:240);
}

function prepareShell(){if(root||!document.documentElement)return;style=document.createElement('style');style.id='bili-space-style';style.textContent=pageCss;document.documentElement.append(style);mountShell();warmProfileMediaCache();applyHeaderPreferences();const dark=PREFS.theme==='dark'||(PREFS.theme==='system'&&mediaTheme.matches);root.dataset.theme=dark?'dark':'light';document.documentElement.dataset.bsTheme=dark?'dark':'light';root.style.setProperty('--accent',PREFS.accent);if(pageKind()==='search')setLoading(true);surfaceRevealed();}
function boot(){
  prepareShell();native('app-visibility');installWheelInertia();installPlayerInteractions();
  if(pageKind()==='video'){beginVideoLoading();settleVideoLoading();}
  document.addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const link=e.composedPath().find(el=>el?.matches?.('a[href]'));if(!link)return;try{const url=new URL(link.href,location.href);if(/(^|\.)bilibili\.com$/i.test(url.hostname)&&/\/video\/BV[a-z0-9]{10}/i.test(url.pathname))beginVideoLoading(url.href);}catch{}},true);
  // One-time migration: profiles that never touched the category list still carry all 18.
  if(!Number(INITIAL.categoryPreset)&&Array.isArray(PREFS.categorySelection)&&PREFS.categorySelection.length===CATEGORIES.length)update({categorySelection:DEFAULT_CATEGORIES.slice(),categoryPreset:1});
  if(!PREFS.experimentalControlsV1)update({srMode:'off',fiMode:'off',experimentalControlsV1:true});
  applyPreferences();markAds();linkifyDescriptions();cacheSpaceBackgrounds();mountHomeBanner();compactHomeFeed();mountPlayerTools();startGpu();startInterpolation();if(PREFS.srMode!=='off'||PREFS.fiMode!=='off')toast('警告：测试版超分/补帧已开启，可能卡顿或闪烁，可在设置 → 播放中关闭。');refreshAccount();
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
    if(pageKind()==='home'&&records.some(r=>r.type==='childList'&&[...r.addedNodes].some(n=>n.nodeType===1&&n.closest?.('.bili-feed4-layout'))))compactHomeFeed();
    if(records.some(r=>(r.type==='attributes'&&r.target.closest?.('.bili-feed4-layout')&&r.target.matches?.('.feed-card,.bili-feed-card,.bili-video-card,.floor-single-card'))||((r.type==='characterData'||r.type==='childList')&&(r.target.nodeType===1?r.target:r.target.parentElement)?.closest('.basic-desc-info,.desc-info-text,#v_desc .info'))||[...r.addedNodes].some(n=>n.nodeType===1&&!n.closest?.('#bili-space-root,.bs-player-tool,.bs-gpu-canvas')))){if(pageKind()==='home')compactHomeFeed();scheduleScan();}
  });observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style']});
  mediaTheme.addEventListener('change',applyPreferences);
  document.addEventListener('pointerdown',applyAudioBoost,{passive:true});document.addEventListener('keydown',applyAudioBoost);
  const controls=document.createElement('div');controls.className='bs-pip-controls';controls.innerHTML='<button type="button" aria-label="返回客户端">↙ 返回</button><button type="button" aria-label="播放或暂停">Ⅱ / ▶</button>';
  document.body.append(controls);$('button',controls).onclick=()=>native('window',{action:'pip'});$$('button',controls)[1].onclick=()=>{const v=playbackVideo();if(v){if(v.paused)v.play().catch(()=>{});else v.pause();}};
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey&&e.key.toLowerCase()==='w'){e.preventDefault();e.stopImmediatePropagation();native('window',{action:'close'});return;}
    if(e.ctrlKey&&e.key===','){e.preventDefault();openSettings();}
    if(e.key==='Escape'){if(!$('#settings',shadow).hidden)closeSettings();if(pipActive)native('window',{action:'pip'});}
    if(e.key==='F5'){e.preventDefault();native('window',{action:'reload'});}
  });
  document.addEventListener('mousedown',e=>{if(pipActive&&e.button===0&&!e.target.closest('button'))native('window',{action:'drag'});});
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('#bili-space-video-download');
    if(!button)return;
    e.preventDefault();e.stopPropagation();requestDownload();
  },true);
  window.BiliSpace={pauseForTray,restoreFromTray,setPlayerVolume,acceptSearchHistory,beginNavigation,showAccountCard,hideAccountCard,surfaceRevealed,beginVideoLoading,finishVideoLoading,beginClose,proxyStatus,proxyState,proxyToast(text){toast(text);},bench:benchScale,
    openSettings,closeSettings,update,markAds,requestPip,setLoading,refreshAccount,syncRoute,checkProxyRegion,
    downloaderStatus(info){
      downloaderInfo={...downloaderInfo,...(info||{})};
      const line=$('#downloader-status',shadow);if(line)line.textContent=downloaderInfo.message||'';
      const button=$('#bili-space-video-download');if(button)button.hidden=!PREFS.downloader;
    },
    downloadPhase(text){const button=$('#bili-space-video-download');if(button)$('span',button).textContent=String(text||'下载中');},
    downloadStarted(){const button=$('#bili-space-video-download');if(button){button.dataset.state='busy';$('span',button).textContent='下载中';}},
    downloadResult(result){settleDownload(Boolean(result?.ok),String(result?.message||''));},
    downloaderNotice(text){toast(String(text||''));},
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
    get state(){return {prefs:{...PREFS},status,headerSurfaceReady,videoLoadingEvents:[...videoLoadingEvents],audioBoost:PREFS.volumeBoost,audioState:playbackVideo()?.dataset.bsAudio||'native',frames:gpu?.frames||0,stopped:gpu?.stopped??true,pip:pipActive,full:fullActive,route:pageKind(),loading:$('.search',shadow).getAttribute('aria-busy')==='true',ads:$$('[data-bs-ad=true]').length,proxy:proxyInfo,interpolation:interpolator?{inferences:interpolator.inferences,inferenceMs:interpolator.inferenceMs,estimate:interpolator.estimate,dropped:interpolator.dropped,frames:interpolator.frames,generated:interpolator.generated,stopped:interpolator.stopped,status:interpolator.status,presentationTimes:[...interpolator.clockHistory],presentationDelay:interpolator.clock.delay}:null};}
  };
  if(typeof RUNTIME!=='undefined'&&RUNTIME.testing)window.BiliSpace.testInterpolation=async()=>{
    const stage=new FrameInterpolator(playbackVideo(),60,false),w=192,h=128;
    const frame=(x,y=32)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='rgb(32,32,32)';ctx.fillRect(0,0,w,h);ctx.fillStyle='white';ctx.fillRect(x,y,48,64);return c;};
    const previous=frame(48,24),current=frame(64,40);await stage.prepare({previous,current,time:performance.now(),interval:33,epoch:stage.epoch},true);stage.draw(.5);
    const pixels=new Uint8Array(w*h*4);stage.gl.readPixels(0,0,w,h,stage.gl.RGBA,stage.gl.UNSIGNED_BYTE,pixels);
    let aiError=0,blendError=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const truth=x>=56&&x<104&&y>=32&&y<96?255:32;const blend=((x>=48&&x<96&&y>=32&&y<96?255:32)+(x>=64&&x<112&&y>=32&&y<96?255:32))/2;const v=pixels[(y*w+x)*4];aiError+=(v-truth)**2;blendError+=(blend-truth)**2;}
    const result={aiMse:aiError/(w*h),blendMse:blendError/(w*h),oldEdge:pixels[(64*w+50)*4],newEdge:pixels[(64*w+100)*4],inferences:stage.inferences,estimate:stage.estimate,ms:stage.inferenceMs};stage.stop();return result;
  };
  if(typeof RUNTIME!=='undefined'&&RUNTIME.testing)window.BiliSpace.testRife=async(w=192,h=128)=>{
    const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=w;a.height=b.height=h;
    const paint=(c,offset)=>{const x=c.getContext('2d');x.fillStyle='#202020';x.fillRect(0,0,w,h);x.fillStyle='white';x.fillRect(w/4+offset,h/4,w/4,h/2);return x.getImageData(0,0,w,h).data;};
    const r=await inferRife(paint(a,0),paint(b,16),w,h);return {flow:[r.width,r.height],maxMotion:r.flow.reduce((v,n)=>Math.max(v,Math.abs(n)),0),maskRange:[r.mask.reduce((v,n)=>Math.min(v,n),1),r.mask.reduce((v,n)=>Math.max(v,n),0)],ms:r.ms};
  };
  loadOfficialSearchHistory();
  if(document.readyState==='complete')window.__bsPaintReady?.();
  diagnostic('Better Bili Space ready');
}
if(document.documentElement)prepareShell();else{const earlyShell=new MutationObserver(()=>{if(document.documentElement){earlyShell.disconnect();prepareShell();}});earlyShell.observe(document,{childList:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
