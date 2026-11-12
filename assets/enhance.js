/* Bili-Space — explicit ad markers, native chrome, local AI super resolution. */
const ICON_TV='<svg xmlns="http://www.w3.org/2000/svg" class="bs-tv" viewBox="0 0 32 32" aria-hidden="true"><path d="m10 3 6 5 6-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><rect x="3" y="8" width="26" height="21" rx="6" fill="currentColor"/><path d="M10 16v5m12-5v5" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>';
const ICON_DOWNLOAD='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/></svg>';
const DEFAULT_CATEGORIES=[0,1,2,3,4,13,14,16];
const APP_META=typeof APP_INFO!=='undefined'?APP_INFO:{name:'Bili-Space',version:'0.1.37',author:'未署名'};
const DEFAULTS = {theme:'dark',accent:'#fb7299',progressColor:'#fb7299',progressHeight:4,progressRadius:6,progressAlways:false,progressThumb:true,showChannels:true,hideAds:true,btr:true,font:true,zoom:100,volumeBoost:100,soundBalance:true,downloadConnections:256,srMode:'off',srScale:2,srFps:60,closeAction:'tray',videoLoadingMode:'page',clipboardAutoOpen:true,experimentalFrost:false,experimentalControlsV1:false,fiMode:'off',srModel:'auto',fiFps:60,fiFlowScale:50,trafficLights:false,logoAutoHide:true,feedColumns:0,experimentalBounce:true,settingsZoom:100,experimentalFullscreenMotion:false,onboardingSeen:false,whatsNewSeen:'',shareSeen:'',newsSeen:[],language:'',languageChosen:false,officialVideoStyle:false,showClock:false,videoLinkButton:true,videoLinkCompact:false,pipDanmaku:true,pipDanmakuMinWidth:520,headerHome:true,headerSwipe:true,headerDynamic:true,headerHistory:true,headerBrand:true,headerSearch:true,headerFavorites:true,headerWatchlater:true,clickGui:false,searchWidth:0,watchlaterOpen:'list',headerMessages:true,headerUpload:true,headerAccount:true,headerBack:true,autoZoom:true,autoZoomTarget:1280,downloader:true,downloaderPath:'',proxy:false,proxyAll:false,proxyNode:'',categoryPreset:0,pluginsDisabled:[],categorySelection:DEFAULT_CATEGORIES.slice()};
const PREFS = { ...DEFAULTS, ...INITIAL };
/* With visual hosting the header runs once, in a persistent header view above the pages (CHROME_VIEW); pages then
   keep their header space but hide their own copy (content mode). */
const CHROME_HOST=typeof RUNTIME!=='undefined'&&!!RUNTIME.chromeHost,CHROME_VIEW=CHROME_HOST&&location.pathname==='/__bili_space_chrome__',CONTENT_VIEW=CHROME_HOST&&!CHROME_VIEW;
let chromeLocation=null;
const NATIVE_PLATFORM=typeof RUNTIME!=='undefined'?RUNTIME.platform||'windows':'windows';
if(NATIVE_PLATFORM!=='windows'){PREFS.srMode='off';PREFS.fiMode='off';PREFS.downloader=false;}else if(typeof RUNTIME!=='undefined'&&RUNTIME.legacyWin7){PREFS.srMode='off';PREFS.fiMode='off';}
/* PiP-only renderer. Protocol fields are independently parsed; no third-party parser code. */
function parsePipDanmaku(buffer){
 const bytes=new Uint8Array(buffer);if(bytes.length>8*1024*1024)throw Error('弹幕数据过大');const decoder=new TextDecoder();
 function fields(start,end,visit){let p=start;const varint=()=>{let n=0,m=1;for(let i=0;i<10;i++){if(p>=end)throw Error('弹幕数据不完整');const b=bytes[p++];if(i<7)n+=(b&127)*m;if(!(b&128))return n;m*=128;}throw Error('弹幕编码错误');};
  while(p<end){const tag=varint(),field=Math.floor(tag/8),wire=tag&7;if(!field)throw Error('弹幕字段错误');if(wire===0)visit(field,varint(),false);else if(wire===2){const n=varint(),a=p;p+=n;if(p>end)throw Error('弹幕数据越界');visit(field,[a,p],true);}else if(wire===1||wire===5){p+=wire===1?8:4;if(p>end)throw Error('弹幕数据越界');}else throw Error('弹幕格式不支持');}}
 const result=[];fields(0,bytes.length,(field,value,nested)=>{if(field!==1||!nested)return;if(result.length>=12000)throw Error('弹幕条目过多');const item={time:0,mode:1,size:25,color:0xffffff,text:''};fields(value[0],value[1],(f,v,isText)=>{if(isText){if(f===7)item.text=decoder.decode(bytes.subarray(v[0],v[1])).slice(0,300);}else if(f===2)item.time=v/1000;else if(f===3)item.mode=v;else if(f===4)item.size=v;else if(f===5)item.color=v&0xffffff;});if(item.text&&Number.isFinite(item.time)&&item.time>=0&&[1,2,3,4,5,6].includes(item.mode))result.push(item);});return result.sort((a,b)=>a.time-b.time);
}
class PipDanmaku {
 constructor(){this.cache=new Map();this.pending=new Map();this.active=[];this.lanes=[];this.merge=new Map();this.last=-1;this.generation=0;this.status='关闭';}
 clear(){for(const item of this.active){item.animation?.cancel();item.node.remove();}this.active=[];this.lanes=[];this.merge.clear();this.last=-1;}
 stop(){clearInterval(this.timer);this.timer=null;this.abort?.abort();this.generation++;this.clear();if(this.stage)this.stage.hidden=true;this.status='关闭';}
 requestSignal(){return AbortSignal.any&&AbortSignal.timeout?AbortSignal.any([this.abort.signal,AbortSignal.timeout(15000)]):this.abort.signal;}
 async json(url,allowAnonymous=false){const r=await fetch(url,{credentials:'include',signal:this.requestSignal()});if(!r.ok)throw Error('弹幕接口不可用');const data=await r.json();if(data.code!==0&&!(allowAnonymous&&data.data?.wbi_img))throw Error('弹幕接口不可用');return data.data;}
 async identify(){const bvid=location.pathname.match(/BV[a-z0-9]{10}/i)?.[0],page=Math.max(1,Number(new URLSearchParams(location.search).get('p'))||1);let view=window.__INITIAL_STATE__?.videoData;
  if(!view||view.bvid&&view.bvid!==bvid)view=null;if(!view&&bvid)view=await this.json('https://api.bilibili.com/x/web-interface/view?bvid='+encodeURIComponent(bvid));
  const cid=Number(view?.pages?.[page-1]?.cid||view?.cid||window.cid);if(!Number.isSafeInteger(cid)||cid<=0)throw Error('暂无弹幕信息');return cid;
 }
 async segment(index){const key=this.cid+':'+index;if(this.cache.has(key))return this.cache.get(key);if(this.pending.has(key))return this.pending.get(key);const generation=this.generation;
  const request=(async()=>{const params={type:1,oid:this.cid,segment_index:index},query=downloadWbiQuery(params,this.keys);const r=await fetch('https://api.bilibili.com/x/v2/dm/wbi/web/seg.so?'+query,{credentials:'include',signal:this.requestSignal()});if(!r.ok)throw Error('弹幕加载失败');if(Number(r.headers?.get('Content-Length'))>8*1024*1024)throw Error('弹幕数据过大');const items=parsePipDanmaku(await r.arrayBuffer());if(generation!==this.generation)return [];this.cache.set(key,items);while(this.cache.size>3)this.cache.delete(this.cache.keys().next().value);this.status='已加载';return items;})();this.pending.set(key,request);try{return await request;}finally{if(generation===this.generation)this.pending.delete(key);}
 }
 start(video,width,height){const key=currentVideoLink();if(this.video===video&&this.key===key&&this.timer){this.resize(width,height);return;}
  this.stop();this.video=video;this.key=key;this.cid=0;this.keys=null;this.cache.clear();this.pending.clear();this.abort=new AbortController();const generation=this.generation;this.status='加载中';
  if(!this.stage){this.stage=document.createElement('div');this.stage.id='bs-pip-danmaku';this.stage.setAttribute('aria-hidden','true');document.body.append(this.stage);}this.stage.hidden=false;this.resize(width,height);
  this.timer=setInterval(()=>this.tick(),120);
  (async()=>{const cid=await this.identify(),nav=await this.json('https://api.bilibili.com/x/web-interface/nav',true);if(generation!==this.generation)return;this.cid=cid;this.keys=nav.wbi_img;await this.segment(Math.floor(video.currentTime/360)+1);this.last=Math.max(0,video.currentTime-.2);})().catch(e=>{if(generation===this.generation&&e.name!=='AbortError'){this.status='暂不可用';diagnostic('画中画弹幕：'+e.message);}});
 }
 resize(width,height){const ratio=this.video.videoWidth&&this.video.videoHeight?this.video.videoWidth/this.video.videoHeight:16/9,w=Math.min(width,height*ratio),h=w/ratio;if(this.width===w&&this.height===h)return;this.width=w;this.height=h;this.font=Math.max(13,Math.min(24,w/34));this.stage.style.cssText=`left:${(width-w)/2}px;top:${(height-h)/2}px;width:${w}px;height:${h}px;--bs-pip-dm-font:${this.font}px`;this.stage.dataset.font=String(this.font.toFixed(1));this.clear();}
 emit(item,time){const prefs=window.BiliCommunity44?.state?.settings,custom=prefs?.danmakuEnabled,helpers=window.BiliCommunity44?.helpers;if(custom&&prefs.density===0)return;if(custom&&helpers&&(helpers.blocked(item.text,prefs.keywords)||(prefs.filterNoise&&helpers.noise(item.text))||!helpers.areaAllowed(item.mode,prefs)))return;const mergeKey=custom&&prefs.mergeRepeats&&helpers?(Number(item.mode)||1)+':'+String(item.text??'').normalize('NFKC').trim().toLocaleLowerCase():'';if(mergeKey){const live=this.merge.get(mergeKey);if(live&&time-live.started<=prefs.mergeWindow&&live.node.isConnected){live.count++;live.node.textContent=live.text+' ×'+Math.min(9999,live.count);return;}}const rowHeight=this.font*1.6,count=Math.max(1,Math.min(10,Math.floor(this.height*.65/rowHeight*(custom?prefs.density/100:1))));let lane=-1;for(let i=0;i<count;i++)if(!this.lanes[i]||this.lanes[i]<=time){lane=i;break;}if(lane<0)return;
  const node=document.createElement('span');node.className='bs-pip-comment';node.textContent=item.text;if(custom)node.style.opacity=String(prefs.opacity/100);node.style.color='#'+item.color.toString(16).padStart(6,'0');node.style.fontSize=Math.max(10,Math.min(32,this.font*(item.size||25)/25))+'px';node.style.top=(item.mode===4?Math.max(0,this.height-50-lane*rowHeight):8+lane*rowHeight)+'px';this.stage.append(node);const fixed=[4,5].includes(item.mode)||matchMedia('(prefers-reduced-motion: reduce)').matches,duration=(fixed?4000:6500)/(custom?prefs.speed:1);this.lanes[lane]=time+duration/1000;
  const textWidth=node.getBoundingClientRect().width||item.text.length*this.font;const frames=fixed?[{transform:`translateX(${Math.max(0,(this.width-textWidth)/2)}px)`},{transform:`translateX(${Math.max(0,(this.width-textWidth)/2)}px)`}]:item.mode===6?[{transform:`translateX(${-textWidth}px)`},{transform:`translateX(${this.width}px)`}]:[{transform:`translateX(${this.width}px)`},{transform:`translateX(${-textWidth}px)`}];
  if(!node.animate){node.remove();return;}const animation=node.animate(frames,{duration,easing:'linear',fill:'forwards'});animation.playbackRate=this.video.playbackRate||1;const record={node,animation,end:time+duration/1000,mergeKey};this.active.push(record);if(mergeKey)this.merge.set(mergeKey,{node,text:String(item.text??''),count:1,started:time});animation.onfinish=()=>{node.remove();this.active=this.active.filter(r=>r!==record);if(mergeKey&&this.merge.get(mergeKey)?.node===node)this.merge.delete(mergeKey);};
 }
 tick(){if(!pipActive||!PREFS.pipDanmaku||currentVideoLink()!==this.key||playbackVideo()!==this.video){syncPipPresentation();return;}const time=this.video.currentTime;if(!Number.isFinite(time))return;
  if(this.last>=0&&(time<this.last-.2||time-this.last>2))this.clear();
  for(const record of [...this.active]){if(record.end<time){record.animation.cancel();record.node.remove();this.active=this.active.filter(r=>r!==record);}else{record.animation.playbackRate=this.video.playbackRate||1;this.video.paused?record.animation.pause():record.animation.play();}}
  if(this.video.paused){this.last=time;return;}if(!this.cid||!this.keys)return;const index=Math.floor(time/360)+1,key=this.cid+':'+index,items=this.cache.get(key);
  if(!items){if(!this.pending.has(key)&&Date.now()>(this.retryAt||0)){this.retryAt=Date.now()+10000;this.segment(index).catch(()=>{this.status='暂不可用';});}return;}
  const from=this.last<0?time-.2:this.last;for(const item of items)if(item.time>from&&item.time<=time)this.emit(item,time);this.last=time;
 }
}
const pipDanmaku=new PipDanmaku();
function syncPipPresentation(){const video=playbackVideo(),eligible=pipActive&&PREFS.pipDanmaku&&innerWidth>=PREFS.pipDanmakuMinWidth&&innerHeight>=140;if(!eligible||!video){if(pipDanmaku.timer)pipDanmaku.stop();}else pipDanmaku.start(video,innerWidth,innerHeight);syncPipPlayback();}
function syncPipPlayback(){const button=$('.bs-pip-play');if(!button)return;const paused=playbackVideo()?.paused!==false;button.dataset.paused=String(paused);button.setAttribute('aria-label',paused?'播放':'暂停');button.setAttribute('aria-pressed',String(!paused));button.title=paused?'播放':'暂停';}

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
  ['headerHome','首页','[data-route="home"]'],['headerSwipe','精选','[data-route="swipe"]'],['headerDynamic','动态','[data-route="dynamic"]'],['headerHistory','历史','[data-route="history"]'],
  ['headerBrand','显示 Logo','.brand'],['headerSearch','搜索栏','.search'],['headerFavorites','收藏夹按钮','.favorites-wrap'],['headerWatchlater','稍后再看按钮','.watchlater'],['headerMessages','消息按钮','.messages'],['headerUpload','投稿按钮','.upload'],['headerAccount','头像 / 登录入口','.account'],['headerBack','分区展开入口','.back']
];
function applyHeaderPreferences(){
  if(!shadow)return;
  if(!PREFS.headerFavorites)favoritesController?.close();
  if($('.upload',shadow).parentElement!==shadow)shadow.append($('.upload',shadow));
  const left=$('.header-left',shadow);let slot=$('.brand-slot',shadow);if(!slot){slot=document.createElement('span');slot.className='brand-slot';left.insertBefore(slot,$('.nav-lane',shadow));slot.append($('.brand-label',shadow));}left.dataset.controls=PREFS.trafficLights?'traffic':'windows';$('.lights',shadow).hidden=!PREFS.trafficLights;$('.window-actions',shadow).hidden=Boolean(PREFS.trafficLights);if(NATIVE_PLATFORM==='macos'){left.dataset.controls='native';$('.lights',shadow).hidden=true;$('.window-actions',shadow).hidden=true;}
  for(const [key,,selector] of HEADER_ITEMS)if(key!=='headerBack')$(selector,shadow).hidden=!PREFS[key];
  syncCategoryVisibility();
  syncHeaderBrand();
  syncNavigationControls();
  $('.upload',shadow).hidden=!PREFS.headerUpload||pageKind()!=='home';
  const categoriesOpen=$('.back',shadow).getAttribute('aria-expanded')==='true';
  $('.primary-nav',shadow).hidden=categoriesOpen||!$$('.primary-nav a',shadow).some(a=>!a.hidden);
  if(!PREFS.headerBack)setCategories(false);
  updateHeaderClock();requestAnimationFrame(layoutHeaderLeading);syncPipPresentation();
  $$('#header-categories a',shadow).forEach((a,i)=>a.hidden=!PREFS.categorySelection.includes(i));
  let empty=$('.category-empty',shadow);if(!empty){empty=document.createElement('button');empty.type='button';empty.className='category-empty';empty.textContent='未选择分区 · 前往设置';empty.onclick=()=>{openSettings('categories');currentTab='categories';renderSettings();};$('#header-categories',shadow).append(empty);}empty.hidden=PREFS.categorySelection.length>0;
}
let brandMotion=[],brandShown,brandStateRequested=false;
/* Header motion is compositor-only: the layout change applies at once, elements that moved slide from their previous
   place with `translate`, new ones fade in, and leaving ones are replaced by a fading ghost outside the layout.
   Nothing animates width or margin, so a page busy loading cannot stall the header. */
let headerFlipMotion=[];
function headerZoom(){return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bs-ui-scale'))||1;}
function headerFlip(apply,extra=[]){
  const left=shadow&&$('.header-left',shadow);if(!left||CONTENT_VIEW){apply();return;}
  const tracked=[...left.children,...extra].filter(el=>el&&!el.dataset.ghost);
  const visible=el=>!el.hidden&&el.isConnected&&getComputedStyle(el).display!=='none';
  const before=new Map(tracked.map(el=>[el,visible(el)?el.getBoundingClientRect():null])),origin=left.getBoundingClientRect();
  headerFlipMotion.forEach(m=>{m.onfinish=null;m.cancel();});headerFlipMotion=[];$$('[data-ghost]',left).forEach(g=>g.remove());
  apply();settleHeader();
  if(!left.animate||headerMotionReduced())return;
  const zoom=headerZoom(),slide={duration:380,easing:'cubic-bezier(.32,.72,0,1)'};
  // New items uncover from the side their neighbours slide away from, so nothing sweeps across a half-shown item.
  let drift=0;for(const el of tracked){const was=before.get(el);if(was&&visible(el))drift+=was.left-el.getBoundingClientRect().left;}
  const hidden=drift>0?'inset(-4px 0 -4px 100%)':'inset(-4px 100% -4px 0)';
  for(const el of tracked){
    const was=before.get(el),now=visible(el)?el.getBoundingClientRect():null;
    if(was&&now){const dx=(was.left-now.left)/zoom;if(Math.abs(dx)>.5)headerFlipMotion.push(holdForReveal(el.animate([{translate:dx+'px 0px'},{translate:'0px 0px'}],slide)));}
    // Arrivals take exactly as long as departures (200ms), so the logo comes in while back/forward go out.
    else if(!was&&now)headerFlipMotion.push(holdForReveal(el.animate([{opacity:0,clipPath:hidden},{opacity:getComputedStyle(el).opacity,clipPath:'inset(-4px 0 -4px 0)'}],{duration:200,easing:'cubic-bezier(0,0,.2,1)'})));
    else if(was&&!now&&was.width>0){
      const wasHidden=el.hidden;el.hidden=false;const look=getComputedStyle(el),keep={display:look.display==='none'?'inline-flex':look.display,alignItems:'center',justifyContent:look.justifyContent,fontSize:look.fontSize,fontWeight:look.fontWeight,fontFamily:look.fontFamily,lineHeight:look.lineHeight,color:look.color,padding:look.padding,boxSizing:'border-box'};el.hidden=wasHidden;
      const ghost=el.cloneNode(true);ghost.hidden=false;Object.assign(ghost.style,keep);ghost.removeAttribute('id');ghost.dataset.ghost='true';ghost.inert=true;ghost.setAttribute('aria-hidden','true');
      Object.assign(ghost.style,{position:'absolute',left:(was.left-origin.left)/zoom+'px',top:(was.top-origin.top)/zoom+'px',width:was.width/zoom+'px',height:was.height/zoom+'px',margin:'0',pointerEvents:'none'});
      left.append(ghost);const m=holdForReveal(ghost.animate([{opacity:1,translate:'0px 0px'},{opacity:0,translate:'-8px 0px'}],{duration:200,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}));m.onfinish=()=>ghost.remove();headerFlipMotion.push(m);
    }
  }
}
function syncHeaderBrand(){
  const slot=$('.brand-slot',shadow),label=$('.brand-label',shadow);if(!slot||!label)return;
  if(brandShown===undefined&&typeof RUNTIME!=='undefined'&&!brandStateRequested){brandStateRequested=true;slot.hidden=true;label.hidden=true;let fallback;window.__bsAcceptBrandState=previous=>{if(brandShown!==undefined)return;clearTimeout(fallback);brandShown=typeof previous==='boolean'?previous:false;syncHeaderBrand();};fallback=setTimeout(()=>window.__bsAcceptBrandState(false),150);native('header-brand',{action:'read'});return;}
  if(brandShown===undefined&&brandStateRequested)return;
  const show=!!PREFS.headerBrand&&(!PREFS.logoAutoHide||pageKind()==='home');if(brandShown===show){if(!brandMotion.length){slot.hidden=!show;label.hidden=!show;}return;}
  const initial=brandShown===undefined;brandShown=show;native('header-brand',{action:'write',shown:show});
  if(initial&&show){slot.hidden=false;label.hidden=false;return;}
  headerFlip(()=>{slot.hidden=!show;label.hidden=!show;});
}
let navigationState,navigationMask,navigationRequested=false,navigationMotion=[];
window.__bsAcceptNavigationState=value=>{/* the header view learns history from chromeActive; this only seeds it */if(!(CHROME_VIEW&&navigationState))navigationState={back:!!value.back,forward:!!value.forward};acceptRouteOrigin(value.route);if(navigationMask===undefined)navigationMask=Number(value.visible)&3;if(categoryShown===undefined)categoryShown=!!value.categoryVisible;syncNavigationControls();syncCategoryVisibility();};
function syncNavigationControls(){
  if(CHROME_VIEW&&chromeHoldControls)return;const group=$('.history-controls',shadow);if(!group)return;
  if(!navigationState){if(typeof RUNTIME!=='undefined'){group.hidden=true;if(!navigationRequested){navigationRequested=true;native('navigation-state',{action:'read'});}return;}navigationState={back:history.length>1,forward:false};navigationMask=0;}
  const home=pageKind()==='home',mask=home?0:3,previous=navigationMask;
  const buttons=[$('.history-back',shadow),$('.history-forward',shadow)];buttons[0].disabled=!navigationState.back;buttons[1].disabled=!navigationState.forward;
  if(previous===mask){group.hidden=!mask;buttons.forEach((b,i)=>b.hidden=!(mask&(1<<i)));return;}
  navigationMask=mask;native('navigation-state',{action:'visibility',visible:mask});
  headerFlip(()=>{group.hidden=!mask;buttons.forEach((b,i)=>b.hidden=!(mask&(1<<i)));},buttons);
}
let categoryShown,categoryMotion=[];
function syncCategoryVisibility(){
  const button=$('.back',shadow);if(!button)return;
  if(categoryShown===undefined){if(typeof RUNTIME!=='undefined'){button.hidden=true;return;}categoryShown=false;}
  const show=!!PREFS.headerBack,previous=categoryShown;if(previous===show){button.hidden=!show;return;}
  categoryShown=show;native('navigation-state',{action:'category-visibility',visible:show});
  headerFlip(()=>{button.hidden=!show;});
}
// The clock shows minutes, so it wakes once a minute, on the minute, and only while it is switched on.
let headerClockTimer;function scheduleHeaderClock(){clearTimeout(headerClockTimer);updateHeaderClock();if(CONTENT_VIEW||!PREFS.showClock)return;const now=new Date();headerClockTimer=setTimeout(scheduleHeaderClock,(60-now.getSeconds())*1000-now.getMilliseconds()+30);}
function updateHeaderClock(){if(!shadow)return;const clock=$('.header-clock',shadow);if(!clock)return;clock.hidden=!PREFS.showClock;if(clock.hidden){clock.textContent='';return;}const now=new Date();clock.textContent=now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false});clock.dateTime=now.toISOString();clock.title=now.toLocaleString();}
function layoutHeaderLeading(){if(!shadow)return;const brand=$('.brand',shadow),dock=$('.brand-leading',shadow),nav=$('.primary-nav',shadow),left=$('.header-left',shadow);if(!dock||brand.hidden)return;const stop=nav&&!nav.hidden?nav.getBoundingClientRect().right:left.getBoundingClientRect().left+110;const available=Math.max(36,brand.getBoundingClientRect().left-stop-16);dock.style.maxWidth=available+'px';dock.dataset.compact=String(available<(PREFS.showClock?150:100));
  // The clock never overlaps the nav: with too little room beside the logo it steps aside instead of being cut.
  const clock=$('.header-clock',dock);if(clock)dock.dataset.clockHidden=String(PREFS.showClock&&available<(clock.scrollWidth||44)+(dock.dataset.compact==='true'?44:8));}
let favoritesController,accountsController;
let copiedVideoLinkTimer;
function currentVideoLink(){
  const location=chromeLocation||window.location;if(pageKind()!=='video')return '';const path=location.pathname.replace(/^\/(?:zh-Hans|zh-Hant|en)(?=\/|$)/,'').replace(/\/$/,'');
  const url=new URL('https://www.bilibili.com'+path);for(const key of ['p','t']){const value=new URLSearchParams(location.search).get(key);if(value&&/^\d+(?:\.\d+)?$/.test(value))url.searchParams.set(key,value);}return url.href;
}
function syncVideoLink(){
  if(!shadow)return;const button=$('.video-link',shadow);if(!button)return;const url=currentVideoLink();button.hidden=!url||!PREFS.videoLinkButton;button.dataset.mini=String(!!PREFS.videoLinkCompact);
  if(button.dataset.url!==url){clearTimeout(copiedVideoLinkTimer);delete button.dataset.copied;delete button.dataset.copyUrl;button.dataset.url=url;$('.video-link-text',button).textContent=url.replace('https://www.','');}
  requestAnimationFrame(layoutHeaderLeading);button.title=url?'点击复制链接 · Shift+点击复制当前时间点\n'+url:'';button.setAttribute('aria-label',url?'复制视频链接（Shift+点击含当前时间）：'+url:'复制视频链接');
}
function copyCurrentVideoLink(withTime=false){
  const base=currentVideoLink();if(!base)return;const url=new URL(base),video=playbackVideo();
  if(withTime){if(!video||!Number.isFinite(video.currentTime)||video.currentTime<0){toast('当前视频时间尚未就绪');return;}url.searchParams.set('t',String(Math.floor(video.currentTime)));}
  const button=$('.video-link',shadow);button.dataset.copyUrl=url.href;native('copy-video-link',{url:url.href});
}
function videoLinkCopied(ok,url){
  const button=$('.video-link',shadow);if(!button||button.dataset.url!==currentVideoLink()||(button.dataset.copyUrl?button.dataset.copyUrl!==url:button.dataset.url!==url))return;
  if(!ok){toast('复制失败，请重试');return;}clearTimeout(copiedVideoLinkTimer);button.dataset.copied='true';$('.video-link-text',button).textContent=button.dataset.url===url?'已复制':'已复制时间点';
  copiedVideoLinkTimer=setTimeout(()=>{delete button.dataset.copied;$('.video-link-text',button).textContent=button.dataset.url.replace('https://www.','');},1400);
}
function mountVideoHome(){
  const bar=$('#bili-space-video-bar');
  if(pageKind()!=='video'){if(bar)bar.hidden=true;return;}
  if(bar){bar.hidden=false;const download=$('#bili-space-video-download',bar),progress=$('#bili-space-download-progress',bar);if(download)download.hidden=!PREFS.downloader;if(progress)progress.hidden=!PREFS.downloader||!progress.textContent;const cancel=$('#bili-space-download-cancel',bar);if(cancel)cancel.hidden=!PREFS.downloader||download?.dataset.state!=='busy'||cancel.dataset.started!=='true';return;}
  const host=$('.left-container')||$('.video-info-container')||$('#viewbox_report')||$('.video-container-v1,.video-container-v2');
  if(!host)return;
  const row=document.createElement('div');row.id='bili-space-video-bar';row.className='bs-video-bar';
  row.innerHTML=`<a id="bili-space-video-home" class="bs-video-home" href="https://www.bilibili.com/" aria-label="返回 B站首页">${ICON_TV}<span>首页</span></a><button type="button" id="bili-space-video-download" class="bs-video-download" aria-label="用下载器保存这个视频" title="使用内置下载器保存视频"${PREFS.downloader?'':' hidden'}>${ICON_DOWNLOAD}<span>下载</span></button><span id="bili-space-download-progress" class="bs-download-progress" role="status" aria-live="off" hidden></span><button type="button" id="bili-space-download-cancel" class="bs-video-download" hidden>取消</button>`;
  host.prepend(row);
}
// Resolve an official combined audio/video stream; native code saves it without another app.
let downloadTimer,downloadDisplayPage,downloadCancelling=false;
function downloadDisplay(text){const button=$('#bili-space-video-download'),label=$('#bili-space-download-progress');if(downloadCancelling||!PREFS.downloader||!button||!label||button.dataset.state!=='busy'||downloadDisplayPage!==currentVideoLink())return;label.hidden=false;label.textContent=text;}
function downloadProgress(info){const speed=Math.max(0,Number(info?.bytesPerSecond)||0),unit=speed>=1048576?(speed/1048576).toFixed(1)+' MB/s':speed>=1024?(speed/1024).toFixed(1)+' KB/s':Math.round(speed)+' B/s';const seconds=info?.etaSeconds,eta=seconds===null||!Number.isFinite(Number(seconds))?'计算中':Math.max(0,Math.ceil(seconds)),remaining=typeof eta==='number'?(eta>=3600?Math.floor(eta/3600)+'小时':'')+String(Math.floor(eta%3600/60)).padStart(2,'0')+':'+String(eta%60).padStart(2,'0'):eta;downloadDisplay((info?.percent===null?'下载中':Math.floor(Math.max(0,Math.min(100,Number(info.percent)||0)))+'%')+' · '+unit+' · 预计剩余 '+remaining);}
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
  downloadCancelling=false;button.dataset.state='busy';downloadDisplayPage=currentVideoLink();$('span',button).textContent='解析中';downloadDisplay('正在解析下载信息…');
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
    $('span',button).textContent='选择保存位置';downloadDisplay('等待选择保存位置…');native('downloader',{action:'save',...media,title:view.data.title||document.title});
  }catch(e){settleDownload(false,e.message||'解析失败');}
}
function settleDownload(ok,message,silent){
  clearTimeout(downloadTimer);downloadCancelling=false;const cancel=$('#bili-space-download-cancel');if(cancel){cancel.hidden=true;cancel.disabled=false;cancel.textContent='取消';delete cancel.dataset.started;}
  const button=$('#bili-space-video-download');
  if(button&&button.dataset.state==='busy'){
    const progress=$('#bili-space-download-progress');if(progress){progress.hidden=!PREFS.downloader;progress.textContent=ok?'已保存':message.includes('取消')?'已取消':'下载未完成';}downloadDisplayPage='';
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
// While a navigation is being previewed, the header is laid out for the destination instead of the current page.
let routePreview=null;
function pageKind(at=routePreview||chromeLocation||location){
  const path=at.pathname.replace(/^\/(?:zh-Hans|zh-Hant|en)(?=\/|$)/,'')||'/';
  if(at.hostname==='space.bilibili.com')return 'space';
  if(at.hostname==='search.bilibili.com')return 'search';
  if(at.hostname==='t.bilibili.com'||/^\/opus(?:\/|$)/.test(path))return 'dynamic';
  if(/\/(?:account\/)?history(?:\/|$)/.test(path))return 'history';
  if(/^\/(?:video|bangumi|list)(?:\/|$)/.test(path))return 'video';
  if(at.hostname==='message.bilibili.com')return 'messages';
  return /^\/(?:index\.html)?$/.test(path)?(CHROME_VIEW&&at.hash==='#swipe'?'swipe':'home'):'other';
}
/* Brand, history and category changes are decided before the native host shows a freshly loaded page; hold them on their first frame until it is visible. */
const revealMotion=[];let revealFallback;function holdForReveal(m){if(typeof RUNTIME!=='undefined'&&!headerSurfaceReady&&m?.pause){m.pause();revealMotion.push(m);clearTimeout(revealFallback);revealFallback=setTimeout(releaseHeldMotion,1200);}return m;}
// The fallback never plays held motion in a page that is still hidden (a video view loading behind the opener).
function releaseHeldMotion(){if(document.visibilityState==='hidden'){document.addEventListener('visibilitychange',releaseHeldMotion,{once:true});return;}revealMotion.splice(0).forEach(x=>{try{x.play();}catch{}});}
let headerSurfaceReady=false,headerRouteFrame,routeOrigin=typeof RUNTIME!=='undefined'?undefined:'',routeArrived=false,reportedRoute,videoHomeShown,videoHomeMotion=[],videoHomeTimer;
const headerMotionReduced=()=>CONTENT_VIEW||matchMedia('(prefers-reduced-motion: reduce)').matches;
/* The previous page's route comes back from the native host, so a full page load can continue the header motion it started. */
function acceptRouteOrigin(route){if(routeOrigin!==undefined)return;routeOrigin=['home','swipe','dynamic','history','video','other'].includes(route)?route:'';if(!headerSurfaceReady&&shadow&&routeOrigin)syncVideoHome(routeOrigin==='video',false);arriveHeaderRoute();}
function arriveHeaderRoute(){if(routeArrived||!headerSurfaceReady||routeOrigin===undefined||!shadow)return;routeArrived=true;const kind=pageKind();syncVideoHome(kind==='video',true);if(routeOrigin&&routeOrigin!==kind)slideRouteIndicator(routeLink(routeOrigin),routeLink(kind));}
function surfaceRevealed(){const first=!headerSurfaceReady;headerSurfaceReady=true;const held=revealMotion.splice(0);held.forEach(m=>{try{m.play();}catch{}});if(first&&routeOrigin===undefined)setTimeout(()=>acceptRouteOrigin(''),150);arriveHeaderRoute();}
/* Local-first pages: the native host opens the account's saved copy instantly, so after each visit the official HTML of the
   current page and the other header destinations is refetched quietly and saved for the next switch. */
const LOCAL_PAGES=/^https:\/\/(?:www\.bilibili\.com\/(?:zh-Hans\/?)?(?:history|account\/history)?|t\.bilibili\.com\/(?:zh-Hans)?|message\.bilibili\.com\/|space\.bilibili\.com\/(?:zh-Hans\/)?\d{1,20}\/?)$/;
function warmLocalPages(){
  if(CHROME_VIEW||typeof RUNTIME==='undefined'||navigator.connection?.saveData)return;const mid=(document.cookie.match(/(?:^|;\s*)DedeUserID=(\d{1,20})(?:;|$)/)||[])[1];
  const now=Date.now(),urls=[...new Set([location.href.split(/[?#]/)[0],'https://www.bilibili.com/','https://t.bilibili.com/','https://www.bilibili.com/history','https://message.bilibili.com/',mid&&'https://space.bilibili.com/'+mid].filter(u=>u&&LOCAL_PAGES.test(u)))].filter(u=>{try{const key='bs-warm:'+u,last=Number(localStorage.getItem(key))||0;if(now-last<600000)return false;localStorage.setItem(key,String(now));}catch{}return true;});
  if(!urls.length)return;if(NATIVE_PLATFORM==='macos'){native('page-warm',{urls});return;}
  urls.forEach((url,i)=>setTimeout(()=>fetch(url,{credentials:'include',mode:'no-cors',cache:'no-store',priority:'low'}).catch(()=>{}),i*1500));
}
window.addEventListener('load',()=>setTimeout(()=>(window.requestIdleCallback||setTimeout)(warmLocalPages,{timeout:4000}),6000),{once:true});
function routeLink(route){return route&&shadow?$('.primary-nav a[data-route="'+route+'"]',shadow):null;}
/* The current-page underline travels from the previous item instead of jumping; with no previous item it grows from its centre. */
function slideRouteIndicator(fromLink,toLink){
  if(!toLink?.animate||headerMotionReduced()||toLink.closest('nav')?.hidden)return;const to=toLink.getBoundingClientRect();if(!to.width)return;
  const from=fromLink&&fromLink!==toLink?fromLink.getBoundingClientRect():null;
  const frames=from?.width?[{transform:'translateX('+((from.left+from.width/2)-(to.left+to.width/2))+'px) scaleX('+(from.width/to.width)+')'},{transform:'none'}]:[{transform:'scaleX(0)',opacity:0},{transform:'none',opacity:1}];
  try{toLink.animate(frames,{duration:420,easing:'cubic-bezier(.32,.72,0,1)',pseudoElement:'::after'});}catch{}
}
/* Video pages trade the nav Home item for the television Home: with window buttons both resize in place, with traffic lights the row shifts. */
function syncVideoHome(show,animate){
  const left=$('.header-left',shadow),top=$('.video-home-top',shadow),home=$('.primary-nav a[data-route=home]',shadow);if(!left||!top)return;
  if(videoHomeShown===show)return;const previous=videoHomeShown,windows=left.dataset.controls==='windows';videoHomeShown=show;
  const topWidth=top.hidden?0:top.getBoundingClientRect().width,homeWidth=home&&getComputedStyle(home).display!=='none'?home.getBoundingClientRect().width:0;
  cancelAnimationFrame(headerRouteFrame);clearTimeout(videoHomeTimer);videoHomeMotion.forEach(m=>{m.onfinish=null;m.cancel();});videoHomeMotion=[];delete top.dataset.leaving;if(home)delete home.dataset.leaving;
  if(!animate||previous===undefined||!top.animate||headerMotionReduced()){left.dataset.instant='true';top.hidden=!show;left.dataset.video=String(show);void left.offsetWidth;delete left.dataset.instant;return;}
  settleHeader();
  if(!windows){if(show){top.hidden=false;headerRouteFrame=requestAnimationFrame(()=>{headerRouteFrame=requestAnimationFrame(()=>{left.dataset.video='true';});});}else{left.dataset.video='false';videoHomeTimer=setTimeout(()=>{if(!videoHomeShown)top.hidden=true;},260);}return;}
  headerFlip(()=>{top.hidden=!show;left.dataset.video=String(show);},[...$$('.primary-nav a',shadow)]);
}
// With 跳转到普通视频页, a video opened from 稍后再看 (/list/watchlater?bvid=…, /medialist/play/watchlater/…) becomes its plain
// video page, keeping the part and time; the list page itself is left alone.
function redirectWatchlater(){if(CHROME_VIEW||PREFS.watchlaterOpen!=='video')return false;let url;try{url=new URL(location.href);}catch{return false;}
  if(!/(^|\.)bilibili\.com$/.test(url.hostname))return false;const path=url.pathname;let bvid='';
  if(/^\/list\/watchlater\/?$/.test(path))bvid=url.searchParams.get('bvid')||'';else{const m=path.match(/^\/medialist\/play\/watchlater\/(BV[0-9A-Za-z]{10})/);if(m)bvid=m[1];}
  if(!/^BV[0-9A-Za-z]{10}$/.test(bvid))return false;const target=new URL('https://www.bilibili.com/video/'+bvid+'/');for(const key of ['p','t'])if(/^\d+(\.\d+)?$/.test(url.searchParams.get(key)||''))target.searchParams.set(key,url.searchParams.get(key));
  location.replace(target.href);return true;}
function syncRoute(){
  if(redirectWatchlater())return;
  const key=(chromeLocation||location).href,kind=pageKind();
  document.documentElement.dataset.bsPage=kind;if(CONTENT_VIEW)document.documentElement.dataset.bsHosted='true';syncFeedRoll();
  if(kind!=='home')document.documentElement.dataset.bsBannerUnderlap='false';
  if(shadow){syncNavigationControls();syncHeaderBrand();$('.upload',shadow).hidden=!PREFS.headerUpload||kind!=='home';}
  mountVideoHome();
  if(kind==='video'&&key!==routeKey)scheduleVideoAlign();
  else{const toolbar=$('.video-toolbar-container');if(toolbar)toolbar.style.removeProperty('margin-top');}
  mountHomeBanner();
  compactHomeFeed();
  if(!shadow)return;
  if(CHROME_VIEW&&swipeOn!==(kind==='swipe'))setSwipeActive(kind==='swipe');
  syncVideoLink();syncVideoHome(kind==='video',routeArrived);if(kind!==reportedRoute){reportedRoute=kind;native('navigation-state',{action:'route',route:kind});}
  const formerRoute=$('nav a[aria-current=page]',shadow);
  $$('nav a[data-route]',shadow).forEach(a=>{
    if(a.dataset.route===kind)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  const currentRoute=$('nav a[aria-current=page]',shadow);if(routeArrived&&currentRoute&&currentRoute!==formerRoute)slideRouteIndicator(formerRoute,currentRoute);syncRouteRefreshLabels();
  if(key!==routeKey){
    const previous=routeKey;routeKey=key;native('navigation-state',{action:'read'});if(previous&&kind==='video'){beginVideoLoading();setTimeout(()=>settleVideoLoading(),200);}else if(kind!=='video')cancelVideoLoading();
    const query=new URLSearchParams(location.search).get('keyword');
    if(query!==null)$('.search input',shadow).value=query;
  }
}
function mountHomeBanner(){
  if(pageKind()!=='home')return;
  const banner=$('.bili-header__banner')||$('.bili-header .bili-banner');if(!banner)return;
  banner.dataset.bsBanner='true';document.documentElement.dataset.bsBannerUnderlap='false';
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
let primaryNavMotion;
/* Opening the channel list pushes the main nav out to the right as the channels slide in from the left, and closing reverses it. */
function setPrimaryNavHidden(nav,hide,instant){
  const shown=!nav.hidden&&nav.dataset.leaving!=='true';if(shown===!hide)return;
  const from=primaryNavMotion?{opacity:getComputedStyle(nav).opacity,translate:getComputedStyle(nav).translate||'0px 0px'}:null;primaryNavMotion?.cancel();primaryNavMotion=null;delete nav.dataset.leaving;
  if(instant||!nav.animate||headerMotionReduced()){nav.hidden=hide;return;}
  if(hide){nav.dataset.leaving='true';const m=primaryNavMotion=nav.animate([from||{opacity:1,translate:'0px 0px'},{opacity:0,translate:'12px 0px'}],{duration:180,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});m.playbackRate=CATEGORY_SPEED;m.onfinish=()=>{if(primaryNavMotion!==m)return;nav.hidden=true;delete nav.dataset.leaving;m.cancel();primaryNavMotion=null;};}
  else{nav.hidden=false;const m=primaryNavMotion=nav.animate([from||{opacity:0,translate:'12px 0px'},{opacity:1,translate:'0px 0px'}],{duration:320,easing:'cubic-bezier(.32,.72,0,1)'});m.playbackRate=CATEGORY_SPEED;m.onfinish=()=>{if(primaryNavMotion===m)primaryNavMotion=null;};}
}
let headerSettleTimer;
// The current nav item only offers refresh 1.5s after the header last moved, and only once the pointer moves again.
function settleHeader(ms=1500){const left=shadow&&$('.header-left',shadow);if(!left)return;left.dataset.settling='true';clearTimeout(headerSettleTimer);headerSettleTimer=setTimeout(()=>{const release=()=>{delete left.dataset.settling;};left.addEventListener('pointermove',release,{once:true});},ms);}
// Samples an underdamped spring: `step` settles 0→1 with overshoot, `kick` starts and ends at rest and swings around 0 (peak 1).
function springCurve(stiffness,damping,steps=60){
  const w=Math.sqrt(stiffness),z=Math.min(.95,damping/(2*w)),wd=w*Math.sqrt(1-z*z),decay=t=>Math.exp(-z*w*t);
  let end=.1;while(end<4&&decay(end)>.003)end+=.02;
  const at=i=>i/steps*end,raw=[...Array(steps+1).keys()].map(i=>decay(at(i))*Math.sin(wd*at(i))),peak=Math.max(...raw.map(Math.abs))||1;
  return{duration:Math.round(end*1000),step:[...Array(steps+1).keys()].map(i=>{const t=at(i);return i===steps?1:1-decay(t)*(Math.cos(wd*t)+z*w/wd*Math.sin(wd*t));}),kick:raw.map((v,i)=>i===steps?0:v/peak)};
}
// Pointer-leave flourishes for the Windows caption buttons; each glyph ends exactly where it started.
const WINDOW_LEAVE_MOTION={
  close(svg,button,from=0){
    // A replay picks the spin up from the current angle and still lands on a whole turn.
    const to=from+1080+((360-from%360)%360),timing={duration:1350,easing:'cubic-bezier(.07,.83,.16,1)'};
    svg.animate([{transform:`rotate(${from}deg)`,filter:'blur(.8px)'},{filter:'blur(.45px)',offset:.3},{transform:`rotate(${to}deg)`,filter:'blur(0px)'}],timing);
    // Trailing copies lag by an angle that shrinks with progress, so the smear tightens as the spin slows.
    for(const [lag,alpha] of [[30,.5],[60,.3],[90,.16],[120,.07]]){
      const ghost=svg.cloneNode(true);ghost.classList.add('motion-ghost');ghost.setAttribute('aria-hidden','true');button.append(ghost);
      ghost.animate([{transform:`rotate(${from-lag}deg)`,opacity:alpha,filter:'blur(1.1px)'},{opacity:alpha*.35,offset:.32},{opacity:0,offset:.62},{transform:`rotate(${to}deg)`,opacity:0,filter:'blur(0px)'}],timing).finished.catch(()=>{}).finally(()=>ghost.remove());
    }
  },
  maximize(svg){
    const {duration,step,kick}=springCurve(240,10),n=kick.length-1;
    svg.animate(step.map((v,i)=>{const k=kick[i],lead=kick[Math.min(n,i+4)],s=1+k*.2;return{transform:`rotate(${v*90}deg) scale(${s*(1+lead*.14)},${s*(1-lead*.14)})`};}),{duration:duration+120});
  },
  minimize(svg,button,from,e){
    const path=svg.querySelector('path'),r=svg.getBoundingClientRect();
    if(!path||!r.width||!CSS.supports?.('d','path("M0 0")')){const {duration,kick}=springCurve(300,9);svg.animate(kick.map(k=>({transform:`translateY(${k*3}px) scale(${1+k*.5},${1-k*.3})`})),{duration});return;}
    // The line is a rubber band the pointer drags as it leaves: the near end stretches and the middle bows toward it, then it springs back.
    const k=16/r.width,mx=(e.clientX-r.left)*k-8,my=(e.clientY-r.top)*k-8,len=Math.hypot(mx,my)||1,ux=mx/len,uy=my/len,f=n=>n.toFixed(2);
    const shape=p=>{const x1=3+ux*p*(ux>0?.8:2.8),x2=13+ux*p*(ux>0?2.8:.8),y=8+uy*p*.9;return{d:`path("M${f(x1)} ${f(y)}Q${f(8+ux*p*1.8)} ${f(8+uy*p*5.5)} ${f(x2)} ${f(y)}")`};};
    const grab=130,{duration,step}=springCurve(380,7),total=grab+duration,a=grab/total;
    const frames=[{...shape(0),offset:0,easing:'cubic-bezier(.2,.9,.35,1)'},{...shape(1),offset:a},...step.slice(1).map((v,i)=>({...shape(1-v),offset:a+(1-a)*(i+1)/(step.length-1)}))];
    path.animate(frames,{duration:total});
  }
};
function windowLeaveMotion(e,button){
  const svg=button.querySelector('svg:not(.motion-ghost)'),play=WINDOW_LEAVE_MOTION[button.dataset.window];
  if(e.pointerType!=='mouse'||!play||!svg?.animate||headerMotionReduced())return;
  // Every leave replays from the top; the close spin continues from wherever it currently points.
  const m=getComputedStyle(svg).transform.match(/matrix\(([^,]+),([^,]+)/),angle=m?(Math.atan2(+m[2],+m[1])*180/Math.PI+360)%360:0;
  svg.getAnimations({subtree:true}).forEach(a=>a.cancel());button.querySelectorAll('.motion-ghost').forEach(g=>g.remove());
  play(svg,button,Math.round(angle),e);
}
let categoryLinkMotion=[],categoryHoldTimer,categoryNavTimer=0;
// Keeps the strip visible while links leave on their own; the CSS fade would otherwise hide them after 180ms.
function holdCategoryStrip(links,hold){clearTimeout(categoryHoldTimer);links.style.opacity=hold?'1':'';links.style.transform=hold?'none':'';links.style.transition=hold?'none':'';}
// Rare collapse: one channel snags, strains toward the trigger like rubber, snaps free the wrong way, hangs out there, then dashes home.
function stuckCategoryFrames(dx,dy){
  const side=dx<=0?1:-1,out=side*150;
  return[
    {transform:'none',easing:'linear'},
    {transform:'translate(0px,0px) rotate(0deg)',offset:.08},
    {transform:`translate(${-side*2}px,0px) rotate(${-side*4}deg)`,offset:.12},{transform:`translate(${side*2}px,0px) rotate(${side*3}deg)`,offset:.16},
    {transform:`translate(${-side*3}px,0px) rotate(${-side*5}deg)`,offset:.2},{transform:`translate(${side}px,0px) rotate(${side*2}deg)`,offset:.24},
    {transform:`translate(${-side*4}px,0px) rotate(${-side*6}deg)`,offset:.28,easing:'cubic-bezier(.3,0,.7,1)'},
    {transform:`translate(${(dx*.14).toFixed(1)}px,${(dy*.14).toFixed(1)}px) scale(1.75,.62)`,offset:.46,easing:'cubic-bezier(.15,0,.2,1)'},
    {transform:`translate(${out*.35}px,-2px) rotate(${-side*14}deg) scale(.86,1.18)`,offset:.52,easing:'cubic-bezier(.1,.7,.3,1)'},
    {transform:`translate(${out}px,-6px) rotate(${-side*26}deg) scale(.9)`,offset:.64,opacity:1,easing:'ease-in-out'},
    {transform:`translate(${out*.96}px,-2px) rotate(${-side*18}deg) scale(.92)`,offset:.72,easing:'ease-in-out'},
    {transform:`translate(${out}px,-5px) rotate(${-side*22}deg) scale(.9)`,offset:.78,easing:'cubic-bezier(.3,1.6,.6,1)'},
    {transform:`translate(${out*.97}px,-3px) rotate(${side*10}deg) scale(1.12,.9)`,offset:.83,opacity:1,easing:'cubic-bezier(.6,0,.9,.4)'},
    {transform:`translate(${((out+dx)/2).toFixed(1)}px,${(dy/2).toFixed(1)}px) rotate(0deg) scale(1.7,.68)`,offset:.93,opacity:.85,filter:'blur(1.5px)'},
    {transform:`translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(.25,.45)`,opacity:0,filter:'blur(4px)'}
  ];
}
// The whole channel-strip choreography plays at 1.14x; timers that wait for it are divided by the same rate.
const CATEGORY_SPEED=1.14;
function animateCategoryLinks(links,open){
  categoryLinkMotion.forEach(m=>m.cancel());categoryLinkMotion=[];holdCategoryStrip(links,false);
  if(!links.animate||headerMotionReduced())return;
  const items=$$(':scope>a:not([hidden]),:scope>.category-empty',links),dropdown=getComputedStyle(links).position==='fixed';
  const away=d=>dropdown?`translateY(${(d*-14).toFixed(2)}px)`:`translateX(${(d*-34).toFixed(2)}px)`;
  if(open){
    // Each link springs out from the trigger a beat after its left neighbour, overshoots, and wobbles like jelly as it lands.
    const {duration,step,kick}=springCurve(320,11),n=kick.length-1,gap=Math.min(32,420/Math.max(1,items.length));
    const frames=step.map((v,i)=>{const wobble=kick[Math.min(n,i+3)]*.12,s=.7+.3*v;return{transform:`${away(1-v)} scale(${(s*(1+wobble)).toFixed(4)},${(s*(1-wobble)).toFixed(4)})`,opacity:Math.min(1,v*1.8).toFixed(3),filter:`blur(${(Math.max(0,1-v)*6).toFixed(2)}px)`};});
    categoryLinkMotion=items.map((item,i)=>item.animate(frames,{duration,delay:i*gap,fill:'backwards'}));categoryLinkMotion.forEach(m=>m.playbackRate=CATEGORY_SPEED);
  }else{
    // Links wind up away from the trigger, then get sucked into it, stretching on the way; the nearest goes first.
    const trigger=$('.back',shadow),aim=trigger?.getBoundingClientRect(),zoom=headerZoom(),gap=Math.min(24,160/Math.max(1,items.length));
    if(!aim||!items.length)return;
    const tx=aim.left+aim.width/2,ty=aim.top+aim.height/2,stuck=items.length>1&&(categoryEggForced||Math.random()<.01)?Math.floor(Math.random()*items.length):-1;
    holdCategoryStrip(links,true);
    categoryLinkMotion=items.map((item,i)=>{
      const r=item.getBoundingClientRect(),dx=(tx-(r.left+r.width/2))/zoom,dy=(ty-(r.top+r.height/2))/zoom,wind=dx<0?6:-6;
      if(i===stuck)return item.animate(stuckCategoryFrames(dx,dy),{duration:2300,delay:i*gap,fill:'forwards'});
      return item.animate([
        {transform:'none',easing:'cubic-bezier(.3,0,.5,1)'},
        {transform:`translate(${wind}px,0px) scale(1.06,.94)`,offset:.28,easing:'cubic-bezier(.6,0,.9,.5)'},
        {transform:`translate(${(dx*.55).toFixed(1)}px,${(dy*.55).toFixed(1)}px) scale(1.45,.72)`,offset:.72,opacity:.9,filter:'blur(1px)'},
        {transform:`translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(.25,.45)`,opacity:0,filter:'blur(4px)'}
      ],{duration:300,delay:i*gap,fill:'forwards'});
    });
    categoryLinkMotion.forEach(m=>m.playbackRate=CATEGORY_SPEED);
    const timing=categoryLinkMotion.map(m=>m.effect.getTiming()),last=Math.max(...timing.map(t=>(t.delay||0)+t.duration))/CATEGORY_SPEED;
    categoryHoldTimer=setTimeout(()=>holdCategoryStrip(links,false),last+20);
    // Hand the lane back to the main nav as the last channel is swallowed (for the snag, as it dashes home).
    return Math.max(...timing.map((t,i)=>(t.delay||0)+t.duration*(i===stuck?.97:.8)))/CATEGORY_SPEED;
  }
  return 0;
}
function setCategories(open,keyboard=false){
  if(!shadow)return;
  const trigger=$('.back',shadow),links=$('#header-categories',shadow),lane=$('.nav-lane',shadow),nav=$('.primary-nav',shadow);
  open=Boolean(open&&PREFS.headerBack);
  let navDelay=0;
  if(trigger.getAttribute('aria-expanded')!==String(open)){clearTimeout(categoryNavTimer);categoryNavTimer=0;if(keyboard){categoryLinkMotion.forEach(m=>m.cancel());categoryLinkMotion=[];holdCategoryStrip(links,false);}else navDelay=animateCategoryLinks(links,open)||0;}
  if(!keyboard&&trigger.getAttribute('aria-expanded')!==String(open))settleHeader();trigger.dataset.instant=String(keyboard);trigger.setAttribute('aria-expanded',String(open));links.inert=!open;
  trigger.setAttribute('aria-label',open?'返回主导航':'展开分区');
  $('.header-left',shadow).dataset.categories=String(open);
  // The main nav waits until the channels have been pulled back in, so the two never share the lane.
  const hideNav=open||!$$('a',nav).some(a=>!a.hidden);
  if(!hideNav&&navDelay)categoryNavTimer=setTimeout(()=>{categoryNavTimer=0;if(trigger.getAttribute('aria-expanded')!=='true')setPrimaryNavHidden(nav,false,false);},navDelay);
  else if(hideNav||!categoryNavTimer){clearTimeout(categoryNavTimer);categoryNavTimer=0;setPrimaryNavHidden(nav,hideNav,keyboard);}
  nav.inert=open;
  lane.style.setProperty('--category-space','100%');
  nav.style.transform='none';
  if(keyboard)lane.classList.add('instant');else lane.classList.remove('instant');
}
let playbackSuspended=false,completedVideoKey='',videoLoadTimer,videoWaitTimer,loadFrameOwner,loadFrameHandle;const watchedLoadingVideos=new WeakSet(),videoLoadingEvents=[];
function cancelLoadingFrame(){if(loadFrameOwner?.cancelVideoFrameCallback&&loadFrameHandle!=null)loadFrameOwner.cancelVideoFrameCallback(loadFrameHandle);loadFrameOwner=null;loadFrameHandle=null;}
function videoLoadingKey(value=location.href){try{const url=new URL(value,location.href);if(!/(^|\.)bilibili\.com$/i.test(url.hostname)&&url.hostname!=='bili-space.local')return '';const path=url.pathname.replace(/^\/(?:zh-Hans|zh-Hant|en)(?=\/|$)/,'').replace(/\/$/,'');return /^\/(?:video|bangumi|list)(?:\/|$)/.test(path)?path+'?p='+(url.searchParams.get('p')||'1'):'';}catch{return '';}}
function watchVideoLoading(){const video=playbackVideo();if(!video||watchedLoadingVideos.has(video))return;watchedLoadingVideos.add(video);const start=()=>{if(video.isConnected&&pageKind()==='video'&&videoLoadingKey()!==completedVideoKey){beginVideoLoading();settleVideoLoading();}};video.addEventListener('emptied',start);video.addEventListener('loadstart',start);for(const event of ['loadeddata','playing','timeupdate'])video.addEventListener(event,()=>{if($('#bs-video-loading'))settleVideoLoading();});if($('#bs-video-loading'))settleVideoLoading();}
function recordVideoLoading(event){videoLoadingEvents.push({event,time:performance.now(),videoReady:playbackVideo()?.readyState,videoTime:playbackVideo()?.currentTime});if(videoLoadingEvents.length>24)videoLoadingEvents.shift();}
let videoLoadingCap=0;
function cancelVideoLoading(){clearTimeout(videoLoadTimer);clearTimeout(videoWaitTimer);cancelLoadingFrame();const layer=$('#bs-video-loading');if(layer){layer.remove();recordVideoLoading('cancelled');}}
function beginVideoLoading(target=location.href){
  const key=videoLoadingKey(target);if(!key||key===completedVideoKey)return;
  let layer=$('#bs-video-loading');if(layer?.dataset.key===key)return;if(layer)cancelVideoLoading();
  recordVideoLoading('enter');layer=document.createElement('div');layer.id='bs-video-loading';layer.dataset.key=key;layer.setAttribute('role','status');layer.setAttribute('aria-live','polite');layer.innerHTML='<div>'+ICON_TV+'<p>正在打开视频…</p></div>';document.documentElement.append(layer);setTimeout(()=>settleVideoLoading(),0);
  // Whatever happens to the navigation (a request that never ends keeps the page from ever reporting it finished), the cover goes after 15s.
  clearTimeout(videoLoadingCap);videoLoadingCap=setTimeout(()=>{if($('#bs-video-loading')===layer)finishVideoLoading();},15000);
}
/* The header moves the moment a navigation starts, in the page that is still fully loaded, and records the
   destination's state with the native host so the new page opens already settled instead of replaying it. */
function previewHeaderRoute(target){
  if(!shadow)return;let url;try{url=new URL(target,location.href);}catch{return;}
  if(!/(^|\.)bilibili\.com$/i.test(url.hostname))return;const kind=pageKind(url);if(kind===pageKind())return;
  const former=$('nav a[aria-current=page]',shadow);routePreview=url;settleHeader();if(CHROME_VIEW){navigationState={back:true,forward:false};chromeHoldControls=false;chromeAssume={};}
  try{
    syncHeaderBrand();syncNavigationControls();
    $$('nav a[data-route]',shadow).forEach(a=>{if(a.dataset.route===kind)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    const link=routeLink(kind);if(link&&link!==former)slideRouteIndicator(former,link);syncRouteRefreshLabels();
    reportedRoute=kind;native('navigation-state',{action:'route',route:kind});
  }finally{routePreview=null;}
  // The header view has no page of its own to load, so it adopts the destination now; otherwise the next route sync
  // would still read the old address, slide back, and slide forward again once the native host reports the move.
  if(CHROME_VIEW){chromeLocation=url;chromePending={kind,until:Date.now()+8000,previewed:Date.now()};}
}
function beginNavigation(target){previewHeaderRoute(target);const url=new URL(target,location.href);if(videoLoadingKey(url.href)){setLoading(false);beginVideoLoading(url.href);}else{cancelVideoLoading();setLoading(url.hostname==='search.bilibili.com');}}
function finishVideoLoading(){
  const layer=$('#bs-video-loading');if(!layer||layer.classList.contains('leaving'))return;completedVideoKey=layer.dataset.key;clearTimeout(videoWaitTimer);cancelLoadingFrame();clearTimeout(videoLoadTimer);if(!layer.classList.contains('leaving'))recordVideoLoading('exit');layer.classList.add('leaving');layer.style.background='transparent';const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;videoLoadTimer=setTimeout(()=>{layer.remove();recordVideoLoading('removed');},reduced?0:120);
}
function videoInterfaceReady(){return !!$('.video-info-container,#viewbox_report,.video-container-v1,.video-container-v2,.left-container,.bpx-player-container,.bpx-player-video-wrap,#bilibili-player');}
function revealFade(){if(pageKind()!=='video'||$('#bs-video-loading'))return;const layer=document.createElement('div');layer.id='bs-video-loading';layer.dataset.key=videoLoadingKey();layer.setAttribute('aria-hidden','true');layer.innerHTML='<div>'+ICON_TV+'<p>正在打开视频…</p></div>';document.documentElement.append(layer);requestAnimationFrame(()=>requestAnimationFrame(finishVideoLoading));}
function settleVideoLoading(failed=false){
  const layer=$('#bs-video-loading');if(!layer)return;if(failed){toast('页面加载失败，请检查网络后重试。');finishVideoLoading();return;}
  if(layer.dataset.waiting)return;layer.dataset.waiting='true';const start=performance.now();
  const wait=()=>{
    if($('#bs-video-loading')!==layer||layer.classList.contains('leaving'))return;
    const video=playbackVideo(),waitForVideo=PREFS.videoLoadingMode==='video';
    if(layer.dataset.key===videoLoadingKey()&&(waitForVideo?video?.readyState>=2:videoInterfaceReady())){finishVideoLoading();return;}
    if(performance.now()-start>12000){finishVideoLoading();return;}
    $('p',layer).textContent=PREFS.videoLoadingMode==='video'?'正在加载视频画面…':'正在打开视频页面…';videoWaitTimer=setTimeout(wait,50);
  };wait();
}

// The header's search spinner stops as soon as the results are on screen, not when every thumbnail has loaded.
function clearSearchBusy(){if(!CHROME_VIEW||!shadow)return;const form=$('.search',shadow);if(form?.getAttribute('aria-busy')!=='true')return;form.setAttribute('aria-busy','false');$('#search-status',shadow).textContent='';clearTimeout(loadingTimer);}
function watchSearchReady(){if(!CONTENT_VIEW||pageKind()!=='search')return;let sent=false;const ready=()=>{if(sent)return;sent=true;observer.disconnect();native('page-ready');};
  const check=()=>{if(document.querySelector('.video-list .bili-video-card,.search-content .bili-video-card,.search-page .bili-video-card,.video-list-item,.search-nodata-container,.search-no-result'))ready();};
  const observer=new MutationObserver(check);observer.observe(document.documentElement,{childList:true,subtree:true});check();addEventListener('load',ready,{once:true});setTimeout(ready,8000);}
function setLoading(on,failed=false){
  if(!on)updatePagePending(failed);
  if(!on&&pageKind()==='video')settleVideoLoading(failed);else if(pageKind()!=='video')cancelVideoLoading();
  if(!shadow)return;
  const form=$('.search',shadow);form.setAttribute('aria-busy',String(on));
  $('#search-status',shadow).textContent=on?'正在加载搜索结果…':failed?'加载失败，请重试':'';
  clearTimeout(loadingTimer);
  if(on)loadingTimer=setTimeout(()=>setLoading(false,true),20000);
}
const searchSuggestionCache=new Map();
let searchHistory=[],searchSuggestions=[],searchSuggestTimer,searchSuggestRequest,searchSuggestRevision=0,searchActive=-1,searchComposing=false,searchSuggestStatus='',searchHistoryExpanded=false;
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
async function loadOfficialSearchHistory(){try{const records=await readOfficialSearchHistory();officialHistoryStatus='';acceptSearchHistory(records.map(x=>x.value));}catch{officialHistoryStatus='暂时无法获取历史记录';if(shadow&&root?.isConnected&&!$('#search-panel',shadow).hidden)renderSearchPanel();}}
function changeSearchHistory(action,term){const operation=officialHistoryQueue.then(async()=>{let records=await readOfficialSearchHistory();if(action==='add')records=[{value:term,timestamp:Date.now()},...records.filter(x=>x.value!==term)].slice(0,20);else if(action==='delete')records=records.filter(x=>x.value!==term);else records=[];await officialHistoryRequest('COLS_SET',JSON.stringify(records));await officialHistoryRequest('COLS_SET','1','search_history:migrated');officialHistoryStatus='';acceptSearchHistory(records.map(x=>x.value));});officialHistoryQueue=operation.catch(()=>{officialHistoryStatus='暂时无法获取历史记录';toast('无法更新B站搜索历史，请稍后重试。');if(shadow&&root?.isConnected&&!$('#search-panel',shadow).hidden)renderSearchPanel();});return officialHistoryQueue;}

function closeSearchPanel(){if(!shadow)return;const panel=$('#search-panel',shadow);if(!panel.hidden&&panel.dataset.closing!=='true'&&panel.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const visual=getComputedStyle(panel);openSearchPanel.motion?.cancel();panel.dataset.closing='true';const m=openSearchPanel.motion=panel.animate([{opacity:visual.opacity,transform:visual.transform},{opacity:0,transform:'translateY(-4px) scale(.98)'}],{duration:140,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});m.onfinish=()=>{if(openSearchPanel.motion!==m)return;panel.hidden=true;delete panel.dataset.closing;m.cancel();openSearchPanel.motion=null;};}else if(panel.dataset.closing!=='true')panel.hidden=true;$('.search input',shadow).setAttribute('aria-expanded','false');$('.search input',shadow).removeAttribute('aria-activedescendant');clearTimeout(searchSuggestTimer);searchSuggestRequest?.abort();searchSuggestRevision++;searchActive=-1;}
function renderSearchPanel(){
  const panel=$('#search-panel',shadow),input=$('.search input',shadow);panel.replaceChildren();searchActive=-1;input.removeAttribute('aria-activedescendant');
  const heading=(label)=>{const h=document.createElement('h2');h.textContent=label;panel.append(h);return h;};
  const choice=(term,history)=>{const row=document.createElement('div');row.className=history?'search-history-chip':'search-row';const button=document.createElement('button');button.type='button';button.className='search-choice';button.dataset.query=term;button.dataset.searchKind=history?'history':'suggestion';button.textContent=term;button.id='search-option-'+panel.querySelectorAll('[data-query]').length;button.setAttribute('role','option');button.tabIndex=-1;row.append(button);if(history){const remove=document.createElement('button');remove.type='button';remove.className='search-remove';remove.dataset.remove=term;remove.innerHTML='<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5"/></svg>';remove.setAttribute('aria-label','删除搜索历史：'+term);row.append(remove);}(history?$('.search-history-chips',panel):panel).append(row);};
  if(!input.value.length){if(searchHistory.length){const h=heading('搜索历史'),clear=document.createElement('button');clear.type='button';clear.className='search-clear';clear.dataset.clear='true';clear.textContent='清空';clear.setAttribute('aria-label','清空搜索历史');h.append(clear);const chips=document.createElement('div');chips.className='search-history-chips';panel.append(chips);(searchHistoryExpanded?searchHistory:searchHistory.slice(0,6)).forEach(term=>choice(term,true));if(searchHistory.length>6){const more=document.createElement('button');more.type='button';more.className='search-clear';more.dataset.historyMore='true';more.setAttribute('aria-expanded',String(searchHistoryExpanded));more.textContent=searchHistoryExpanded?'收起历史':'更多历史';panel.append(more);}}
  else{heading('搜索历史');const empty=document.createElement('p');empty.textContent=officialHistoryStatus||'暂无搜索历史';panel.append(empty);}
  }else{heading('猜你想搜');searchSuggestions.forEach(term=>choice(term,false));if(!searchSuggestions.length&&searchSuggestStatus){const status=document.createElement('p');status.setAttribute('role','status');status.textContent=searchSuggestStatus||'';panel.append(status);}}
}
function openSearchPanel(){if(!shadow)return;favoritesController?.close();const closing=$('#search-panel',shadow).dataset.closing==='true',wasHidden=$('#search-panel',shadow).hidden||closing;if(closing){delete $('#search-panel',shadow).dataset.closing;openSearchPanel.motion?.cancel();openSearchPanel.motion=null;}if(wasHidden)searchHistoryExpanded=false;$('#search-panel',shadow).hidden=false;if(wasHidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const p=$('#search-panel',shadow);openSearchPanel.motion?.cancel();openSearchPanel.motion=p.animate?.([{opacity:0,transform:'translateY(-4px) scale(.98,.88)',filter:'blur(2px)'},{opacity:1,transform:'translateY(0) scale(1)',filter:'blur(0px)'}],{duration:180,easing:'cubic-bezier(.32,.72,0,1)'});}$('.search input',shadow).setAttribute('aria-expanded','true');renderSearchPanel();if(!$('.search input',shadow).value.length)loadOfficialSearchHistory();queueSearchSuggestions();}
function queueSearchSuggestions(){
  clearTimeout(searchSuggestTimer);searchSuggestRequest?.abort();const revision=++searchSuggestRevision,query=$('.search input',shadow).value;searchSuggestions=[];searchSuggestStatus='';renderSearchPanel();if(!query.trim()){searchSuggestStatus='';renderSearchPanel();return;}
  const cached=searchSuggestionCache.get(query);if(cached&&Date.now()-cached.time<60000){searchSuggestions=cached.items;searchSuggestStatus=searchSuggestions.length?'':'暂无建议';renderSearchPanel();return;}
  searchSuggestTimer=setTimeout(async()=>{const controller=new AbortController();searchSuggestRequest=controller;const timeout=setTimeout(()=>controller.abort(),5000);try{
    const term=query.toWellFormed?query.toWellFormed():Array.from(query).map(c=>c.length===1&&/[\uD800-\uDFFF]/.test(c)?'�':c).join(''),params='highlight=0&term='+encodeURIComponent(term)+'&spmid=333.1007';
    let tags,error;for(const endpoint of ['https://api.bilibili.com/x/web-interface/suggest?','https://s.search.bilibili.com/main/suggest?']){try{const response=await fetch(endpoint+params+'&main_ver=v1',{credentials:'include',signal:controller.signal});if(!response.ok)throw Error('suggestion unavailable');const data=await response.json(),payload=data.data||data;if(data.code!==undefined&&data.code!==0)throw Error('suggestion unavailable');tags=payload.result?.tag??payload.tag??[];if(!Array.isArray(tags))throw Error('invalid suggestions');error=null;break;}catch(e){error=e;if(controller.signal.aborted)throw e;}}if(error)throw error;if(revision!==searchSuggestRevision)return;
    searchSuggestions=sanitizeSearchHistory(tags.map(item=>typeof item==='string'?item:item.value||item.term)).slice(0,8);searchSuggestionCache.set(query,{time:Date.now(),items:searchSuggestions});while(searchSuggestionCache.size>32)searchSuggestionCache.delete(searchSuggestionCache.keys().next().value);searchSuggestStatus=searchSuggestions.length?'':'暂无建议';
  }catch{if(revision!==searchSuggestRevision)return;searchSuggestions=[];searchSuggestStatus='暂时无法获取建议';}finally{clearTimeout(timeout);if(revision===searchSuggestRevision&&!$('#search-panel',shadow).hidden)renderSearchPanel();}},180);
}
function chooseSearch(term){$('.search input',shadow).value=term;submitSearch();}
function installSearchPanel(){
  const form=$('.search',shadow),input=$('input',form),panel=$('#search-panel',shadow);
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls','search-panel');input.setAttribute('aria-expanded','false');
  input.addEventListener('focus',openSearchPanel);input.addEventListener('click',()=>{if(panel.hidden)openSearchPanel();});input.addEventListener('input',e=>{if(e.isComposing||searchComposing){searchSuggestions=[];renderSearchPanel();return;}panel.hidden=false;input.setAttribute('aria-expanded','true');queueSearchSuggestions();});
  input.addEventListener('compositionstart',()=>searchComposing=true);input.addEventListener('compositionend',()=>{searchComposing=false;openSearchPanel();});
  input.addEventListener('keydown',e=>{if(e.isComposing||searchComposing)return;const keyboardChoices=()=>$$('[data-search-kind='+ (input.value.length?'suggestion':'history')+']',panel);const options=keyboardChoices();if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopPropagation();closeSearchPanel();return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();e.stopPropagation();if(panel.hidden)openSearchPanel();const choices=keyboardChoices();if(!choices.length)return;searchActive=searchActive<0?(e.key==='ArrowUp'?choices.length-1:0):(searchActive+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices.forEach((el,i)=>{el.classList.toggle('selected',i===searchActive);el.setAttribute('aria-selected',String(i===searchActive));});input.setAttribute('aria-activedescendant',choices[searchActive].id);choices[searchActive].scrollIntoView?.({block:'nearest'});}else if(e.key==='Enter'&&!panel.hidden&&options[searchActive]){e.preventDefault();e.stopPropagation();chooseSearch(options[searchActive].dataset.query);}});
  panel.addEventListener('pointerdown',e=>e.preventDefault());panel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.historyMore){searchHistoryExpanded=!searchHistoryExpanded;renderSearchPanel();}else if(b.dataset.remove!==undefined){changeSearchHistory('delete',b.dataset.remove);renderSearchPanel();}else if(b.dataset.clear){changeSearchHistory('clear');renderSearchPanel();}else if(b.dataset.query!==undefined)chooseSearch(b.dataset.query);});
  form.addEventListener('focusout',e=>{if(!form.contains(e.relatedTarget))closeSearchPanel();});document.addEventListener('pointerdown',e=>{if(!e.composedPath().includes(form))closeSearchPanel();},{passive:true});
}
async function submitSearch(){
  const input=$('.search input',shadow),query=input.value.trim();
  if(!query||searchComposing)return;
  closeSearchPanel();
  const url='https://search.bilibili.com/all?keyword='+encodeURIComponent(query);
  beginNavigation(url);changeSearchHistory('add',query);native('navigate',{url});
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
  // accountChecked stays 0 until the first status read finishes. Until then the header
  // cannot know whether this is a signed-out visitor or a slow network, so it shows a
  // neutral avatar placeholder instead of flashing "登录 B站" over a real profile.
  const settled=accountChecked!==0;
  const face=profileMediaUrl(profile?.face),pendant=profile?.pendant||{},vip=profile?.vip||{},reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame=profileMediaUrl((reduced&&pendant.image_enhance_frame)||pendant.image_enhance||pendant.image||pendant.image_enhance_frame);
  const vipType=Number(vip.type??vip.vipType),vipStatus=Number(vip.status??vip.vipStatus),isVip=vipType>0&&vipStatus===1;
  const badge=isVip?(profileMediaUrl(vip.avatar_subscript_url||vip.avatar_icon?.icon_resource?.url)||'https://i0.hdslb.com/bfs/seed/jinkela/short/user-avatar/'+(Number(vip.avatar_subscript)===2?'small-vip':'big-vip')+'.svg'):'';
  if(face){delete account.dataset.pending;if(!$('.account-face',account))account.replaceChildren();for(const host of [account,portrait]){setProfileImage(host,'account-face',face,profile.uname||'我的头像');setProfileImage(host,'account-pendant',frame,pendant.name||'头像挂件');setProfileImage(host,'account-vip-badge',badge,'大会员');}}else{portrait.replaceChildren();if(!profile&&settled){account.replaceChildren(document.createTextNode('登录 B站'));account.removeAttribute('title');account.setAttribute('aria-label','登录 B站');delete account.dataset.authenticated;account.href='https://passport.bilibili.com/login?gourl=https%3A%2F%2Fwww.bilibili.com%2F';}else if(!profile){account.dataset.pending='true';account.setAttribute('aria-label','正在读取账号');account.removeAttribute('title');}}
  portrait.hidden=!face;
  const label=$('.account-vip-label',card);label.textContent=isVip?(vip.label?.text||'大会员'):'';label.hidden=!isVip;
  const src=profileMediaUrl((reduced&&profile?.bannerStatic)||profile?.banner);banner.hidden=!src;
  if(!src){$('video',banner)?.pause();banner.replaceChildren();return;}
  const video=/\.(mp4|webm)(?:$|[?#])/i.test(src);let media=banner.firstElementChild;if(!media||media.tagName!==(video?'VIDEO':'IMG')){media=document.createElement(video?'video':'img');media.referrerPolicy='no-referrer';if(video){media.muted=true;media.loop=true;if(profile.bannerStatic&&profile.bannerStatic!==src)media.poster=profile.bannerStatic;media.playsInline=true;media.preload='metadata';media.setAttribute('aria-label','主页动态横幅');media.onerror=()=>{if(profile.bannerStatic&&profile.bannerStatic!==src){profile.banner=profile.bannerStatic;renderAccountDecorations();}else banner.hidden=true;};}else{media.alt='我的主页横幅';media.onerror=()=>banner.hidden=true;}banner.replaceChildren(media);}bindCachedProfileMedia(media,src,()=>{if(video&&!card.hidden&&!reduced)media.play().catch(()=>{});});
  if(video){if(!card.hidden&&!reduced)media.play().catch(()=>{});else media.pause();}
}
let accountProfile=null,accountStatsAt=0,accountStatsRequest=null,accountHideTimer,accountShowTimer,accountMotion;
let messageUnread={feed:{},direct:{}},messageAccount='',messageRequest=null,messageChecked=0;
function unreadNumber(value){return Number.isSafeInteger(value)&&value>0?Math.min(value,999999):0;}
function messageUnreadCounts(){
  const {feed:f,direct:d}=messageUnread;
  const likes=Math.max(unreadNumber(f.recv_like),unreadNumber(f.like)),replies=Math.max(unreadNumber(f.recv_reply),unreadNumber(f.reply)+unreadNumber(f.at));
  return {count:likes+replies+unreadNumber(f.follow??f.follower)+unreadNumber(f.up)+unreadNumber(f.coin)+unreadNumber(f.favorite)+unreadNumber(f.danmu)+unreadNumber(d.follow_unread)+unreadNumber(d.unfollow_unread),
    system:unreadNumber(f.sys_msg)+unreadNumber(d.biz_msg_follow_unread)+unreadNumber(d.biz_msg_unfollow_unread)>0};
}
/* Replies, mentions and likes show their counts; system notices and private messages only show a dot, as on the official site. */
function messageMenuCounts(){const {feed:f,direct:d}=messageUnread;return {reply:unreadNumber(f.reply)||unreadNumber(f.recv_reply),at:unreadNumber(f.at),love:Math.max(unreadNumber(f.recv_like),unreadNumber(f.like)),system:unreadNumber(f.sys_msg)+unreadNumber(d.biz_msg_follow_unread)+unreadNumber(d.biz_msg_unfollow_unread)>0,whisper:unreadNumber(d.follow_unread)+unreadNumber(d.unfollow_unread)>0};}
function renderMessageMenu(){
  const menu=shadow&&$('#messages-menu',shadow);if(!menu)return;const counts=messageMenuCounts();
  for(const item of $$('.messages-item',menu)){const value=counts[item.dataset.kind],badge=$('.messages-count',item),label=$('span',item).textContent;
    if(typeof value==='boolean'){badge.hidden=!value;badge.dataset.kind='dot';badge.textContent='';item.setAttribute('aria-label',value?label+'，有未读':label);}
    else{badge.hidden=!value;badge.dataset.kind='count';badge.textContent=value>99?'99+':String(value);item.setAttribute('aria-label',value?label+'，'+value+' 条未读':label);}}
}
function renderMessageUnread(){
  renderMessageMenu();if(!shadow)return;const link=$('.messages',shadow);if(!link)return;
  let badge=$('.message-unread',link);if(!badge){badge=document.createElement('span');badge.className='message-unread';badge.setAttribute('aria-hidden','true');link.append(badge);}
  const {count,system}=messageUnreadCounts();badge.hidden=!count&&!system;badge.dataset.kind=count?'count':'dot';badge.textContent=count?(count>99?'99+':String(count)):'';
  const label=count?'消息 · '+count+' 条未读互动或私信'+(system?'，另有系统消息':''):system?'消息 · 有未读系统消息':'消息';link.setAttribute('aria-label',label);link.title=label;
}
let messageMenuShowTimer,messageMenuHideTimer,messageMenuMotion;
function placeMessageMenu(menu,link){const r=link.getBoundingClientRect(),width=menu.offsetWidth||168;menu.style.left=Math.round(Math.max(12,Math.min(innerWidth-width-12,r.left+r.width/2-width/2)))+'px';menu.style.top=Math.round(r.bottom+8)+'px';}
function showMessageMenu(){
  clearTimeout(messageMenuHideTimer);const menu=$('#messages-menu',shadow),link=$('.messages',shadow);if(!menu||!link||link.hidden||!PREFS.headerMessages)return;
  if(menu.dataset.open==='true')return;menu.hidden=false;placeMessageMenu(menu,link);renderMessageMenu();menu.dataset.open='true';link.setAttribute('aria-expanded','true');
  if(Date.now()-messageChecked>15000)refreshMessageUnread(true);
  if(menu.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const visual=getComputedStyle(menu),from=messageMenuMotion?{opacity:visual.opacity,transform:visual.transform}:{opacity:0,transform:'translateY(-6px) scale(.97)'};messageMenuMotion?.cancel();const m=messageMenuMotion=menu.animate([from,{opacity:1,offset:.45},{opacity:1,transform:'none'}],{duration:300,easing:'cubic-bezier(.32,.72,0,1)'});m.onfinish=()=>{if(messageMenuMotion===m)messageMenuMotion=null;};}
}
function hideMessageMenu(instant=false){
  clearTimeout(messageMenuShowTimer);const menu=shadow&&$('#messages-menu',shadow);if(!menu||menu.dataset.open!=='true')return;menu.dataset.open='false';$('.messages',shadow)?.setAttribute('aria-expanded','false');
  if(instant||!menu.animate||matchMedia('(prefers-reduced-motion: reduce)').matches){messageMenuMotion?.cancel();messageMenuMotion=null;menu.hidden=true;return;}
  const visual=getComputedStyle(menu),from={opacity:visual.opacity,transform:visual.transform};messageMenuMotion?.cancel();const m=messageMenuMotion=menu.animate([from,{opacity:0,transform:'translateY(-4px) scale(.98)'}],{duration:140,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
  m.onfinish=()=>{if(messageMenuMotion!==m)return;menu.hidden=menu.dataset.open!=='true';m.cancel();messageMenuMotion=null;};
}
const ICON_REFRESH='<svg class="route-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5A8 8 0 1 1 17.7 6"/><path d="M20 4.5V9h-4.5"/></svg>';
function installRouteRefresh(){
  for(const link of $$('.primary-nav a[data-route]',shadow)){if($('.route-text',link))continue;const text=document.createElement('span');text.className='route-text';text.append(...link.childNodes);link.append(text);link.insertAdjacentHTML('beforeend',ICON_REFRESH);
    link.addEventListener('click',e=>{if(link.getAttribute('aria-current')!=='page'||e.button||e.ctrlKey||e.metaKey||e.shiftKey)return;e.preventDefault();e.stopImmediatePropagation();const icon=$('.route-refresh',link);icon.removeAttribute('data-spin');void icon.getBoundingClientRect();icon.dataset.spin='true';if(CHROME_VIEW)icon.addEventListener('animationend',()=>icon.removeAttribute('data-spin'),{once:true});beginNavigation?.((chromeLocation||location).href);setTimeout(()=>CHROME_VIEW?native('window',{action:'reload'}):location.reload(),140);},true);}
  syncRouteRefreshLabels();settleHeader();
}
function syncRouteRefreshLabels(){if(!shadow)return;for(const link of $$('.primary-nav a[data-route]',shadow)){const label=$('.route-text',link)?.textContent||link.textContent;link.removeAttribute('title');if(link.getAttribute('aria-current')==='page')link.setAttribute('aria-label','刷新'+label);else link.removeAttribute('aria-label');}}
function installVideoLinkDrag(){
  const button=$('.video-link',shadow);if(!button)return;let start=null;
  button.addEventListener('mousedown',e=>{if(e.button===0)start={x:e.screenX,y:e.screenY};});
  window.addEventListener('mousemove',e=>{if(!start||!(e.buttons&1))return;if(Math.hypot(e.screenX-start.x,e.screenY-start.y)>4){start=null;button.dataset.dragged='true';native('window',{action:'drag',screenX:e.screenX,screenY:e.screenY});}},true);
  window.addEventListener('mouseup',()=>{start=null;setTimeout(()=>delete button.dataset.dragged,0);},true);
  button.addEventListener('click',e=>{if(button.dataset.dragged==='true'){e.preventDefault();e.stopImmediatePropagation();delete button.dataset.dragged;}},true);
}
// While the pointer rests on an empty search box, its placeholder gives way to a random line from search-quips.txt.
// Lines are drawn from a shuffled deck, and two lines of the same kind (same opening) never come back to back.
let categoryEggForced=false,searchQuips=null,searchQuipDeck=[],searchQuipLast='';
const SEARCH_QUIPS_FALLBACK=['今天也要好好吃饭哦','三连不迷路，搜索不迷茫','搜索框：我准备好了','据说按回车会有好事发生','猫猫视频包治百病'];
function localAsset(path){return (typeof RUNTIME!=='undefined'&&['macos','linux'].includes(RUNTIME.platform)?'bili-space://assets/':'https://bili-space.local/')+path;}
// Languages: the client's own UI (the shell's shadow root and the few elements it adds to pages) is written in Simplified
// Chinese and translated as it renders, from assets/i18n/<lang>.json (source text → translation; scripts/i18n_build.py).
// A text is only replaced when known phrases cover every Chinese character in it, so Bilibili's own content
// (titles, names, comments) that passes through the shell is never half-translated.
const LANGUAGES=[['zh-CN','简体中文'],['zh-TW','繁體中文（台灣）'],['zh-HK','繁體中文（香港）'],['yue','粵語'],['en','English'],['ja','日本語'],['ko','한국어'],['es','Español'],['fr','Français'],['de','Deutsch'],['ru','Русский'],['pt-BR','Português (Brasil)'],['lolcat','萌猫语 喵']];
const LANG_TAGS={'zh-CN':'zh-Hans-CN','zh-TW':'zh-Hant-TW','zh-HK':'zh-Hant-HK',yue:'yue-Hant-HK',lolcat:'zh-Hans-CN'};
function uiLanguage(){return LANGUAGES.some(x=>x[0]===PREFS.language)?PREFS.language:'zh-CN';}
function suggestedLanguage(){
  for(const raw of navigator.languages||[navigator.language||'']){const l=String(raw).toLowerCase();
    if(/^zh-(tw|hant-tw)/.test(l))return 'zh-TW';if(/^yue/.test(l))return 'yue';if(/^zh-(hk|mo|hant)/.test(l))return 'zh-HK';if(/^zh/.test(l))return 'zh-CN';if(/^pt/.test(l))return 'pt-BR';
    const hit=LANGUAGES.find(([k])=>k===l.split('-')[0]);if(hit)return hit[0];}
  return 'zh-CN';
}
let i18nLang='zh-CN',i18nDict=null,i18nRe=null,i18nLoading=null,i18nPageTimer=0;
const i18nTexts=new WeakMap(),i18nAttrs=new WeakMap(),I18N_ATTRS=['title','aria-label','placeholder','alt'];
const cjkCount=s=>(String(s).match(/[㐀-鿿豈-﫿]/g)||[]).length;
function translateText(src){
  if(!i18nDict||!src||!cjkCount(src))return src;
  const key=src.trim();if(Object.prototype.hasOwnProperty.call(i18nDict,key))return src.replace(key,i18nDict[key]);
  let covered=0;const out=src.replace(i18nRe,m=>{covered+=cjkCount(m);return i18nDict[m];});
  return covered===cjkCount(src)?out:src;
}
function i18nSkip(el){return !!el.closest?.('[data-i18n-skip],textarea,[contenteditable=true],style,script');}
function translateTextNode(n){
  const rec=i18nTexts.get(n),cur=n.data,src=rec&&cur===rec.out?rec.src:cur,out=translateText(src);
  if(out!==cur)n.data=out;i18nTexts.set(n,{src,out});
}
function translateAttrs(el){
  let map=i18nAttrs.get(el);
  for(const a of I18N_ATTRS){if(!el.hasAttribute(a))continue;const cur=el.getAttribute(a),rec=map?.[a],src=rec&&cur===rec.out?rec.src:cur,out=translateText(src);
    if(out!==cur)el.setAttribute(a,out);(map||(map={}))[a]={src,out};}
  if(map)i18nAttrs.set(el,map);
}
function translateTree(node){
  if(!node)return;
  if(node.nodeType===3){if(node.parentElement&&!i18nSkip(node.parentElement))translateTextNode(node);return;}
  if(node.nodeType!==1&&node.nodeType!==11)return;
  if(node.nodeType===1){if(i18nSkip(node))return;translateAttrs(node);}
  const walk=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeType===1&&n.matches('[data-i18n-skip],style,script,textarea')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  for(let n=walk.nextNode();n;n=walk.nextNode()){if(n.nodeType===3)translateTextNode(n);else translateAttrs(n);}
}
const i18nObserver=new MutationObserver(records=>{for(const r of records){
  if(r.type==='characterData'){if(r.target.parentElement&&!i18nSkip(r.target.parentElement))translateTextNode(r.target);}
  else if(r.type==='attributes'){if(!i18nSkip(r.target))translateAttrs(r.target);}
  else r.addedNodes.forEach(translateTree);}});
const i18nWatched=new WeakSet();
function watchI18n(node){if(!node||i18nWatched.has(node))return;i18nWatched.add(node);translateTree(node);i18nObserver.observe(node,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:I18N_ATTRS});}
// Elements the client adds to Bilibili's pages; the page itself is never observed (danmaku would make that costly).
function watchPageI18n(again=false){for(const el of document.querySelectorAll('[id^="bili-space-"]:not(#bili-space-root),[class^="bs-"]:not([class^="bs-"] *)')){if(again&&i18nWatched.has(el))translateTree(el);else watchI18n(el);}}
function loadDictionary(lang){
  return fetch(localAsset('i18n/'+lang+'.json')).then(r=>r.ok?r.json():null).catch(()=>null).then(dict=>{
    if(!dict)return null;const keys=Object.keys(dict).filter(k=>dict[k]!==null&&dict[k]!==k).sort((a,b)=>b.length-a.length);
    return {dict,re:new RegExp(keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g')};});
}
function setLanguage(lang){
  if(!LANGUAGES.some(x=>x[0]===lang))lang='zh-CN';
  const tag=LANG_TAGS[lang]||lang;if(root)root.setAttribute('lang',tag);if(CHROME_VIEW)document.documentElement.lang=tag;
  searchQuips=null;searchQuipDeck=[];
  // Pages are only rescanned for the client's own elements while a translation is active (Simplified Chinese needs none).
  clearInterval(i18nPageTimer);i18nPageTimer=0;if(CONTENT_VIEW&&lang!=='zh-CN')i18nPageTimer=setInterval(watchPageI18n,1500);
  const apply=()=>{if(shadow)translateTree(shadow);if(CONTENT_VIEW)watchPageI18n(true);};
  if(lang==='zh-CN'){i18nLang=lang;i18nDict=null;i18nRe=null;apply();return Promise.resolve();}
  const ticket=i18nLoading=loadDictionary(lang).then(d=>{if(i18nLoading!==ticket)return;i18nLang=lang;i18nDict=d?.dict||null;i18nRe=d?.re||null;apply();});
  return ticket;
}
function startI18n(){
  if(!shadow)return;watchI18n(shadow);
  const lang=uiLanguage();if(lang!=='zh-CN'){root.style.visibility='hidden';const show=()=>{root.style.visibility='';};setLanguage(lang).then(show,show);setTimeout(show,700);}
  else setLanguage(lang);
}
// Once per install and after updating to a version that brings languages: pick one (the system language is preselected).
let languageTimer=0;
function scheduleLanguagePicker(delay=800){
  if(PREFS.languageChosen||CONTENT_VIEW||typeof RUNTIME==='undefined')return;
  clearTimeout(languageTimer);languageTimer=setTimeout(()=>{
    if(PREFS.languageChosen||!shadow||$('#language-pick',shadow))return;
    const page=String((CHROME_VIEW?chromeLocation:location.href)||'');
    if(document.visibilityState!=='visible'||!/^https:\/\/[^/]*bilibili\.com\//.test(page)||$('#settings:not([hidden])',shadow)){scheduleLanguagePicker(1000);return;}
    showLanguagePicker();
  },delay);
}
function showLanguagePicker(){
  if(!shadow||$('#language-pick',shadow))return;
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches,previous=shadow.activeElement;let choice=PREFS.language&&LANGUAGES.some(x=>x[0]===PREFS.language)?PREFS.language:suggestedLanguage();
  const layer=document.createElement('div');layer.id='language-pick';layer.className='wn-layer';layer.dataset.i18nSkip='';
  layer.innerHTML=`<section class="wn-card lang-card" role="dialog" aria-modal="true" aria-labelledby="lang-title">
<header><div><p class="wn-eyebrow">Bili-Space</p><h2 id="lang-title">选择语言 · Language</h2></div></header>
<div class="lang-grid" role="radiogroup" aria-label="Language">${LANGUAGES.map(([k,n])=>`<button type="button" role="radio" data-lang="${k}" aria-checked="${k===choice}">${escapeHtml(n)}</button>`).join('')}</div>
<footer><span class="wn-gap"></span><button type="button" class="wn-primary" data-lang-ok>OK</button></footer></section>`;
  shadow.append(layer);reportChromeLayout();
  const card=$('.wn-card',layer);
  const pick=k=>{choice=k;$$('[data-lang]',layer).forEach(b=>b.setAttribute('aria-checked',String(b.dataset.lang===k)));};
  const close=()=>{update({language:choice,languageChosen:true});const done=()=>{layer.remove();reportChromeLayout();previous?.focus?.();scheduleOnboarding();scheduleWhatsNew();};
    if(still)done();else{card.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px) scale(.97)'}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});layer.animate([{opacity:1},{opacity:0}],{duration:260,easing:'ease-in',fill:'forwards'}).onfinish=done;}};
  layer.addEventListener('click',e=>{const b=e.target.closest('[data-lang]');if(b){pick(b.dataset.lang);return;}if(e.target.closest('[data-lang-ok]'))close();});
  layer.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();close();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const i=LANGUAGES.findIndex(x=>x[0]===choice),step={ArrowRight:1,ArrowLeft:-1,ArrowDown:2,ArrowUp:-2}[e.key];pick(LANGUAGES[(i+step+LANGUAGES.length)%LANGUAGES.length][0]);$(`[data-lang="${choice}"]`,layer).focus();}});
  if(!still){layer.animate([{opacity:0},{opacity:1}],{duration:240,easing:'ease-out'});card.animate([{opacity:0,transform:'translateY(14px) scale(.97)'},{opacity:1,transform:'none'}],{duration:440,easing:'cubic-bezier(.32,.72,0,1)'});}
  requestAnimationFrame(()=>$(`[data-lang="${choice}"]`,layer)?.focus({preventScroll:true}));
}
function loadSearchQuips(){
  if(searchQuips)return searchQuips;
  const lang=uiLanguage(),file={'zh-CN':'search-quips.txt','zh-TW':'search-quips.zh-TW.txt','zh-HK':'search-quips.zh-HK.txt',yue:'search-quips.zh-HK.txt',lolcat:'search-quips.lolcat.txt'}[lang];
  if(!file)return searchQuips=Promise.resolve(SEARCH_QUIPS_FALLBACK);
  searchQuips=fetch(localAsset(file)).then(r=>r.ok?r.text():'').then(text=>{const list=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);return list.length?list:SEARCH_QUIPS_FALLBACK;}).catch(()=>SEARCH_QUIPS_FALLBACK);
  return searchQuips;
}
function nextSearchQuip(list){
  for(let tries=0;tries<6;tries++){
    if(!searchQuipDeck.length){searchQuipDeck=list.slice();for(let i=searchQuipDeck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[searchQuipDeck[i],searchQuipDeck[j]]=[searchQuipDeck[j],searchQuipDeck[i]];}}
    const line=searchQuipDeck.pop();if(tries<5&&searchQuipLast&&line.slice(0,3)===searchQuipLast.slice(0,3))continue;searchQuipLast=line;return line;
  }
  return searchQuipDeck.pop()||list[0];
}
function installSearchQuips(){
  const form=$('.search',shadow),input=$('.search input',shadow);if(!form||!input||$('.search-quip',form))return;
  const placeholder=input.getAttribute('placeholder')||'';
  const layer=document.createElement('span');layer.className='search-quip';layer.setAttribute('aria-hidden','true');
  const plain=document.createElement('span'),quip=document.createElement('span');plain.className='sq-plain';quip.className='sq-line';plain.textContent=placeholder;
  // Three fading copies trail the line as it sweeps in: a left-to-right motion blur that closes up as the line slows.
  const trails=[0,1,2].map(()=>{const t=document.createElement('span');t.className='sq-trail';return t;});
  layer.append(plain,...trails,quip);form.insertBefore(layer,input.nextSibling);
  const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  // One rule decides what shows: a line while the pointer is on the box and it is empty, the placeholder otherwise.
  let hovering=false,shown=false,motions=[],list=null;
  const stop=()=>{motions.forEach(m=>m.cancel());motions=[];};
  const play=(el,frames,options)=>{const m=el.animate(frames,{fill:'both',...options,duration:still()?1:options.duration,delay:still()?0:(options.delay||0)});motions.push(m);return m;};
  const SWEEP='cubic-bezier(.16,1,.3,1)';
  const sync=(instant=false)=>{
    const want=hovering&&!input.value&&!!list;
    if(want===shown)return;shown=want;stop();
    if(want){
      const line=nextSearchQuip(list);quip.textContent=line;trails.forEach(t=>t.textContent=line);quip.style.fontSize='';
      input.setAttribute('placeholder','');layer.dataset.on='true';
      // A long line shrinks to fit the box (down to 10.5px) before it is cut with an ellipsis.
      const room=layer.clientWidth,need=quip.scrollWidth;const size=room&&need>room?Math.max(10.5,12*room/need).toFixed(2)+'px':'';quip.style.fontSize=size;trails.forEach(t=>t.style.fontSize=size);
      // The placeholder fades away gradually from its left end, the same way the new line arrives.
      play(plain,[{maskPosition:'100% 0',webkitMaskPosition:'100% 0',transform:'none',filter:'blur(0)'},{maskPosition:'0% 0',webkitMaskPosition:'0% 0',transform:'translateX(10px)',filter:'blur(1.5px)'}],{duration:300,easing:'cubic-bezier(.32,.72,0,1)'});
      play(quip,[{clipPath:'inset(0 100% 0 0)',transform:'translateX(-22px)',filter:'blur(3px)',opacity:.4},{clipPath:'inset(0 0 0 0)',transform:'none',filter:'blur(0)',opacity:1}],{duration:560,delay:150,easing:SWEEP});
      // The trails are revealed by the same wipe, so the streak only ever lies behind the leading edge.
      trails.forEach((t,k)=>play(t,[{clipPath:'inset(0 100% 0 0)',transform:`translateX(${-(30+k*16)}px)`,opacity:0,filter:`blur(${2+k}px)`},{offset:.22,opacity:.3-k*.08},{clipPath:'inset(0 0 0 0)',transform:'translateX(0)',opacity:0,filter:'blur(0)'}],{duration:440+k*70,delay:150,easing:SWEEP}));
      return;
    }
    const done=()=>{if(shown)return;stop();delete layer.dataset.on;input.setAttribute('placeholder',placeholder);};
    if(instant||input.value){done();return;}
    // On the way out the line draws back into its left edge, then the placeholder settles in again.
    play(quip,[{clipPath:'inset(0 0 0 0)',transform:'none',opacity:1},{clipPath:'inset(0 100% 0 0)',transform:'translateX(-10px)',opacity:.3}],{duration:270,easing:'cubic-bezier(.45,0,.75,.35)'});
    play(plain,[{opacity:0,transform:'translateX(-8px)',filter:'blur(2px)'},{opacity:1,transform:'none',filter:'blur(0)'}],{duration:320,delay:230,easing:'cubic-bezier(.32,.72,0,1)'}).onfinish=done;
  };
  form.addEventListener('pointerenter',e=>{if(e.pointerType&&e.pointerType!=='mouse')return;hovering=true;if(list)sync();else loadSearchQuips().then(l=>{list=l;sync();});});
  form.addEventListener('pointerleave',()=>{hovering=false;sync();});
  input.addEventListener('input',()=>sync(true));
}
// Rest the pointer on the avatar for 10 seconds and it starts to turn, slowly at first and ever faster, smeared by a
// rotational motion blur (fading copies spread behind it by its speed). Leaving lets it brake in the same direction
// and settle upright on a whole turn, the smear closing up as it slows.
function installAvatarSpin(){
  const account=$('.account',shadow);if(!account||account.dataset.spin)return;account.dataset.spin='ready';
  const TRAILS=4,MAX_SPEED=1080,WAIT=10000;
  let hoverAt=0,angle=0,speed=0,frame=0,last=0,brake=null,ghosts=[];
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const face=()=>account.querySelector(':scope>.account-face:not(.account-spin-ghost)');
  // Only the face turns; the pendant and the badge stay put. Each trail is a copy of the face placed just under the
  // pendant, rebuilt whenever the avatar itself is redrawn.
  // The face is centred with a transform of its own; the turn is appended to it so it spins about its visual centre.
  let spinning=null,base='';
  const ensureGhosts=()=>{
    const img=face();if(spinning&&spinning!==img){spinning.style.transform='';spinning.style.filter='';}
    if(img&&spinning!==img){img.style.transform='';const t=getComputedStyle(img).transform;base=t&&t!=='none'?t:'';}spinning=img;
    if(ghosts.length&&ghosts.every(g=>g.isConnected)&&ghosts[0].dataset.src===img?.src)return;
    ghosts.forEach(g=>g.remove());ghosts=[];if(!img)return;
    for(let k=1;k<=TRAILS;k++){const g=img.cloneNode();g.alt='';g.classList.add('account-spin-ghost');g.setAttribute('aria-hidden','true');g.dataset.src=img.src;img.after(g);ghosts.push(g);}
  };
  const paint=()=>{
    ensureGhosts();if(!spinning)return;
    const smear=Math.min(1,speed/MAX_SPEED),turn=angle%360;
    spinning.style.transform=`${base} rotate(${turn.toFixed(2)}deg)`;spinning.style.filter=smear>.02?`blur(${(smear*.9).toFixed(2)}px)`:'';
    ghosts.forEach((g,i)=>{const k=i+1,lag=Math.min(70,speed*.014*k);g.style.transform=`${base} rotate(${(turn-lag).toFixed(2)}deg)`;g.style.opacity=(smear*.42/k).toFixed(3);});
  };
  const reset=()=>{angle=0;speed=0;brake=null;if(spinning){spinning.style.transform='';spinning.style.filter='';}spinning=null;ghosts.forEach(g=>g.remove());ghosts=[];};
  const tick=now=>{
    const dt=Math.min(.05,(now-last)/1000)||0;last=now;
    if(brake){
      const t=Math.min(1,(now-brake.start)/brake.duration),e=1-(1-t)*(1-t);
      angle=brake.from+(brake.to-brake.from)*e;speed=brake.speed*(1-t);
      if(t>=1){reset();frame=0;return;}
    }else if(hoverAt&&now-hoverAt>=WAIT){
      // Ever faster: the speed grows with the square of the time spent spinning, up to three turns a second.
      const spun=(now-hoverAt-WAIT)/1000;speed=Math.min(MAX_SPEED,18+40*spun+32*spun*spun);angle+=speed*dt;
    }
    if(speed||brake)paint();frame=requestAnimationFrame(tick);
  };
  const run=()=>{if(!frame){last=performance.now();frame=requestAnimationFrame(tick);}};
  // The header redraws around the avatar (its card, the hover styles) and can report a leave and a re-entry within a few
  // frames while the pointer has not moved; only a leave that lasts 180ms counts, so the 10 seconds are not reset.
  let leaveTimer=0;
  account.addEventListener('pointerenter',e=>{if(e.pointerType&&e.pointerType!=='mouse')return;if(leaveTimer){clearTimeout(leaveTimer);leaveTimer=0;return;}if(reduced()||brake)return;hoverAt=performance.now();run();});
  account.addEventListener('pointerleave',()=>{clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>{leaveTimer=0;
    hoverAt=0;if(!speed||brake){if(!speed&&!brake){cancelAnimationFrame(frame);frame=0;}return;}
    // Brake in the same direction and land upright: the stop is the next whole turn past about a second of braking.
    const from=angle,to=Math.ceil((from+speed*.6)/360)*360,duration=Math.min(3200,Math.max(450,2000*(to-from)/Math.max(speed,1)));
    brake={from,to,duration,speed,start:performance.now()};run();
  },180);});
}
// 换一换 lives in the client's own layer (like the settings button) on the home page: it stays put while the feed
// scrolls, and asks the visible page to roll its feed. The page's own roll buttons are hidden behind it.
const ICON_ROLL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.6L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.6L20 16"/><path d="M20 20v-4h-4"/></svg>';
function installFeedRoll(){
  if(!CHROME_VIEW||$('#feed-roll',shadow))return;
  const button=document.createElement('button');button.id='feed-roll';button.type='button';button.className='feed-roll';button.hidden=true;button.setAttribute('aria-label','换一换');button.title='换一批推荐';
  button.innerHTML=ICON_ROLL+'<span>换一换</span>';shadow.append(button);
  const top=document.createElement('button');top.id='page-top';top.type='button';top.className='page-top';top.hidden=true;top.setAttribute('aria-label','回到顶部');
  top.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 7.5 18 14H6z"/></svg><span>顶部</span>';shadow.append(top);
  top.addEventListener('click',()=>native('page-top'));
  let turn=0;
  button.addEventListener('click',()=>{native('feed-roll');turn+=360;const icon=$('svg',button);
    if(icon&&!matchMedia('(prefers-reduced-motion: reduce)').matches)icon.animate([{rotate:`${turn-360}deg`},{rotate:`${turn}deg`}],{duration:620,easing:'cubic-bezier(.32,.72,0,1)',fill:'forwards'});});
  syncFeedRoll();
}
let pageScrolled=false;
function syncFeedRoll(){if(!CHROME_VIEW||!shadow)return;const button=$('#feed-roll',shadow),top=$('#page-top',shadow);if(!button||!top)return;const home=pageKind(chromeLocation||location)==='home';
  if(button.hidden===!home&&top.hidden===!(home&&pageScrolled))return;button.hidden=!home;top.hidden=!(home&&pageScrolled);reportChromeLayout();}
function setPageScrolled(on){if(!CHROME_VIEW)return;pageScrolled=!!on;syncFeedRoll();}
// The page tells the client's layer when it has scrolled far enough for 顶部 to be worth showing (and again when it comes to the front).
function watchPageScroll(){if(!CONTENT_VIEW)return;let was=null,frame=0;const check=()=>{frame=0;const past=scrollY>innerHeight*.6;if(past!==was){was=past;native('page-scrolled',{past});}};
  addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(check);},{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden){was=null;check();}});check();}
function scrollPageTop(){if(CONTENT_VIEW)scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
// In the page: roll the feed the way Bilibili's own button does (scrolled down, its floating button also brings the top back).
function rollFeed(){if(!CONTENT_VIEW)return;const inline=document.querySelector('.feed-roll-btn .roll-btn,.feed-roll-btn button')||document.querySelector('.flexible-roll-btn');
  if(scrollY>0)scrollPageTop();inline?.click();}
// The search box's left edge is a grip: drag it to make the box wider or narrower (remembered; double-click resets).
// While it moves the box squashes like jelly with the speed of the drag, and on release it springs back with a wobble.
function installSearchGrip(){
  const form=$('.search',shadow);if(!form||$('.search-grip',form))return;
  const grip=document.createElement('span');grip.className='search-grip';grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label','拖动调整搜索栏宽度');grip.title='拖动调整搜索栏宽度 · 双击恢复';form.prepend(grip);
  const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  // offsetWidth is the box's own width, free of the header's CSS zoom and of the squash; pointer travel is converted
  // with the zoom measured when the drag starts.
  let ratio=1;const measure=()=>form.offsetWidth;
  const apply=w=>{if(!w){form.style.removeProperty('--search-width');form.removeAttribute('data-sized');}else{form.style.setProperty('--search-width',w.toFixed(1)+'px');form.dataset.sized='true';}requestAnimationFrame(layoutHeaderLeading);};
  apply(Number(PREFS.searchWidth)||0);
  // The width chases the pointer at a limited speed (lagging behind is fine); the squash follows how fast the width
  // actually moves, through a damped spring on the height, so it settles with a wobble when the box catches up.
  const MAX_SPEED=900,input=$('input',form);let width=0,goal=0,widthSpeed=0,y=1,vy=0,lean=0,frame=0,last=0,dragging=false,maxWidth=640;
  const step=now=>{const dt=Math.min(.034,(now-last)/1000||.016);last=now;
    if(goal&&width){const want=Math.max(-MAX_SPEED,Math.min(MAX_SPEED,(goal-width)*14));widthSpeed+=(want-widthSpeed)*Math.min(1,dt*18);const move=widthSpeed*dt;
      if(Math.abs(goal-width)<.3&&Math.abs(widthSpeed)<6){width=goal;widthSpeed=0;}else width+=Math.abs(move)>Math.abs(goal-width)?goal-width:move;apply(width);}
    // A soft, lightly damped spring: it overshoots and wobbles like a drop of liquid. Squashed, the corners round off
    // further; moving, the box leans the way it is being pulled.
    const target=1-Math.min(.3,Math.abs(widthSpeed)/MAX_SPEED*.3);vy+=(-150*(y-target)-4.2*vy)*dt;y+=vy*dt;
    lean+=((Math.max(-1,Math.min(1,widthSpeed/MAX_SPEED))*-7)-lean)*Math.min(1,dt*10);
    // Only the box's backing plate deforms; the text, the line and the search icon stay crisp, and the corners keep their radius.
    // Height only: the plate squashes and springs vertically; its width always matches the box.
    const sy=Math.max(.66,Math.min(1.22,y)),sx=1;form.style.setProperty('--jelly',`scaleY(${sy.toFixed(4)})`);
    // The plate stretches from its right edge, so its left edge moves; the grip and the text ride along with that edge.
    form.style.setProperty('--jelly-edge',(-(sx-1)*form.offsetWidth).toFixed(2)+'px');
    const resting=!dragging&&width===goal&&Math.abs(y-1)<.002&&Math.abs(vy)<.01&&Math.abs(lean)<.05;
    if(resting){endJelly();frame=0;y=1;vy=0;lean=0;reportChromeLayout();return;}frame=requestAnimationFrame(step);};
  // The plate copies the field's own look when the motion starts, so it matches every theme and the frosted style.
  const startJelly=()=>{if(form.dataset.jelly||!input)return;const cs=getComputedStyle(input);
    for(const [name,value] of [['--jelly-bg',cs.backgroundColor],['--jelly-border',cs.borderTopWidth+' solid '+cs.borderTopColor],['--jelly-radius',cs.borderTopLeftRadius],['--jelly-shadow',cs.boxShadow]])form.style.setProperty(name,value);form.dataset.jelly='true';};
  const endJelly=()=>{delete form.dataset.jelly;for(const name of ['--jelly','--jelly-edge','--jelly-bg','--jelly-border','--jelly-radius','--jelly-shadow'])form.style.removeProperty(name);};
  const run=()=>{startJelly();if(!frame){last=performance.now();frame=requestAnimationFrame(step);}};
  // The widest the box may get: its left edge stays 24px clear of the rightmost thing on the header's left side.
  const roomLeft=()=>{const left=form.getBoundingClientRect().left;let edge=0;const stripOpen=$('.back',shadow)?.getAttribute('aria-expanded')==='true';for(const el of $$('.header-left :is(a,button,.brand-label)',shadow)){if(el.closest('.search')||(!stripOpen&&el.closest('.category-links')))continue;const r=el.getBoundingClientRect();if(r.width&&r.height&&getComputedStyle(el).visibility!=='hidden'&&r.right<left+4)edge=Math.max(edge,r.right);}
    // The centre column (logo, and the clock / video link docked beside it) has to fit between them as well.
    const brand=$('.brand',shadow),dock=$('.brand-leading',shadow);const clockNode=$('.header-clock',shadow),linkNode=$('.video-link',shadow);const docked=(PREFS.showClock?(clockNode?.scrollWidth||44)+52:0)+(linkNode&&!linkNode.hidden?44:0);const centre=(brand&&!brand.hidden?brand.getBoundingClientRect().width:0)+(docked?(docked+16)*(ratio||1):0);
    return Math.max(140,Math.min(640,measure()+(left-edge-24-centre)/ratio));};
  let startX=0,startW=0;
  grip.addEventListener('pointerdown',e=>{if(e.button)return;e.preventDefault();grip.setPointerCapture(e.pointerId);dragging=true;form.dataset.dragging='true';startX=e.clientX;startW=width=goal=measure();ratio=(form.getBoundingClientRect().width/Math.max(1,startW))||1;widthSpeed=0;maxWidth=roomLeft();if(!still())run();});
  grip.addEventListener('pointermove',e=>{if(!dragging)return;goal=Math.max(140,Math.min(maxWidth,startW+(startX-e.clientX)/ratio));if(still()){width=goal;apply(width);}else run();});
  const end=()=>{if(!dragging)return;dragging=false;delete form.dataset.dragging;update({searchWidth:Math.round(goal)});if(still()){apply(goal);reportChromeLayout();}else{vy+=1.2;run();}};
  grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);
  grip.addEventListener('dblclick',()=>{goal=width=0;apply(0);update({searchWidth:0});if(!still()){vy-=2;run();}reportChromeLayout();});
}
// A quiet easter egg: the 稍后再看 clock tells the real time. The hour hand is drawn pointing at 12 and the minute hand
// at 3; both turn from there, updated every second so the minute hand creeps instead of jumping. Pressing the button
// spins the hands (the face stays still): the minute hand races four quick turns and the hour hand one, both coming
// back to the current time, the minute hand with a little overshoot.
let clockHandsTimer=0;
function clockAngles(){const now=new Date(),m=now.getMinutes()+now.getSeconds()/60+now.getMilliseconds()/60000;return {minute:m*6-90,hour:(now.getHours()%12+m/60)*30};}
function syncClockHands(){
  clearTimeout(clockHandsTimer);if(!CHROME_VIEW||!shadow)return;const link=$('.watchlater',shadow);if(!link)return;
  const {minute,hour}=clockAngles();$('.wl-minute',link)?.style.setProperty('rotate',minute.toFixed(2)+'deg');$('.wl-hour',link)?.style.setProperty('rotate',hour.toFixed(2)+'deg');
  if(!document.hidden&&!link.hidden)clockHandsTimer=setTimeout(syncClockHands,1000-new Date().getMilliseconds()+5);
}
function installWatchlaterSpin(){
  const link=$('.watchlater',shadow);if(!link||link.dataset.spin)return;link.dataset.spin='ready';syncClockHands();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncClockHands();});
  // While pointed at, the minute hand sweeps round (the hour hand creeps); leaving lets them ease home instead of snapping:
  // the minute hand finishes its turn, the hour hand winds back.
  const SWEEP=1400,CREEP=16800;let sweeping=null;
  const angleOf=(anim,period)=>anim?((anim.currentTime||0)%period)/period*360:0;
  link.addEventListener('pointerenter',e=>{if(e.pointerType&&e.pointerType!=='mouse')return;if(matchMedia('(prefers-reduced-motion: reduce)').matches||sweeping)return;const minute=$('.wl-minute',link),hour=$('.wl-hour',link);
    for(const hand of [minute,hour])hand?.getAnimations().forEach(a=>{if(a.id==='wl-home')a.cancel();});
    sweeping={minute:minute?.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:SWEEP,iterations:Infinity}),hour:hour?.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:CREEP,iterations:Infinity})};});
  link.addEventListener('pointerleave',()=>{if(!sweeping)return;const {minute:mAnim,hour:hAnim}=sweeping;sweeping=null;const m=angleOf(mAnim,SWEEP),h=angleOf(hAnim,CREEP);mAnim?.cancel();hAnim?.cancel();
    const home=(hand,from,to,ms)=>{const a=hand?.animate([{transform:`rotate(${from}deg)`},{transform:`rotate(${to}deg)`}],{duration:ms,easing:'cubic-bezier(.22,1,.36,1)'});if(a)a.id='wl-home';};
    home($('.wl-minute',link),m,360,Math.max(260,Math.min(700,(360-m)*2.2)));home($('.wl-hour',link),h,0,420);});
  link.addEventListener('click',()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const minute=$('.wl-minute',link),hour=$('.wl-hour',link),at=clockAngles();
    for(const hand of [minute,hour])hand?.getAnimations().forEach(a=>{if(!(a instanceof CSSAnimation))a.cancel();});
    const m=at.minute,h=at.hour;
    minute?.animate([{rotate:m+'deg'},{rotate:(m+1452)+'deg',offset:.8},{rotate:(m+1432)+'deg',offset:.92},{rotate:(m+1440)+'deg'}],{duration:1150,easing:'cubic-bezier(.16,.84,.3,1)'});
    hour?.animate([{rotate:h+'deg'},{rotate:(h+360)+'deg'}],{duration:1050,easing:'cubic-bezier(.2,.8,.25,1)'});});
}
// Built-in plugin 悬浮设置面板 (off by default): Settings opens as floating, draggable panels in the style of a game
// mod menu, one per settings page. Its modules are read from the settings pages themselves, so they always match:
// left-click switches a toggle (or steps a choice), right-click unfolds a module's details, right-click on a title
// folds the panel. Positions and folds are remembered on this machine. Right Shift opens it too.
const CLICKGUI_LAYOUT_KEY='bs-clickgui-layout';
function clickGuiLayout(){try{return JSON.parse(localStorage.getItem(CLICKGUI_LAYOUT_KEY)||'{}')||{};}catch{return {};}}
function saveClickGuiLayout(layout){try{localStorage.setItem(CLICKGUI_LAYOUT_KEY,JSON.stringify(layout));}catch{}}
function clickGuiModules(){
  const selected=currentTab,pages=[];
  try{for(const [tab,[category]] of Object.entries(tabs)){
    currentTab=tab;const template=document.createElement('template');template.innerHTML=tabContent();const seen=new Set(),modules=[];
    for(const control of $$('input[data-pref],select[data-pref]',template.content)){
      const key=control.dataset.pref;if(!key||seen.has(key))continue;seen.add(key);
      const holder=control.closest('.row,.chip,label')||control.parentElement;const labelNode=($('label,.label,span',holder)||holder).cloneNode(true);
      const hint=$('.hint',labelNode)?.textContent.trim()||'';$$('.hint',labelNode).forEach(n=>n.remove());const name=labelNode.textContent.trim().replace(/\s+/g,' ')||key;
      const kind=control.tagName==='SELECT'?'select':control.type==='checkbox'?'toggle':control.type==='range'?'range':'';if(!kind||control.disabled)continue;
      modules.push({key,name,hint,kind,options:kind==='select'?[...control.options].map(o=>[o.value,o.textContent.trim()]):null,
        min:Number(control.min||0),max:Number(control.max||100),step:Number(control.step||1),unit:holder.querySelector('output')?.textContent.replace(/[\d.\s-]/g,'')||''});
    }
    if(modules.length)pages.push({tab,category,modules});
  }}finally{currentTab=selected;}
  return pages;
}
function clickGuiValue(module){const value=PREFS[module.key];if(module.kind==='toggle')return !!value;if(module.kind==='select'){const v=String(value??'');return module.options.find(([o])=>o===v)?v:module.options[0]?.[0];}return Number(value);}
function setClickGuiValue(module,value){const typed=module.kind==='select'&&module.options.every(([o])=>/^-?\d+$/.test(o))?Number(value):value;update({[module.key]:typed});}
function closeClickGui(){const layer=$('#clickgui',shadow);if(!layer||layer.dataset.closing)return;layer.dataset.closing='true';
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches;const done=()=>{layer.remove();reportChromeLayout();};
  if(still){done();return;}$$('.cg-panel',layer).forEach((p,i)=>p.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-10px) scale(.96)'}],{duration:160,delay:i*18,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}));
  layer.animate([{opacity:1},{opacity:0}],{duration:240,delay:80,easing:'ease-in',fill:'forwards'}).onfinish=done;}
function openClickGui(){
  if(!CHROME_VIEW||!shadow)return;if($('#clickgui',shadow)){closeClickGui();return;}
  closeSettings?.();const pages=clickGuiModules(),layout=clickGuiLayout(),still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer=document.createElement('div');layer.id='clickgui';layer.className='cg-layer';layer.setAttribute('role','dialog');layer.setAttribute('aria-label','悬浮设置面板');
  const stateText=m=>{const v=clickGuiValue(m);if(m.kind==='select')return m.options.find(([o])=>o===v)?.[1]||'';if(m.kind==='range')return v+(m.unit||'');return '';};
  const row=m=>{const on=m.kind==='toggle'&&clickGuiValue(m);return `<div class="cg-mod" data-key="${escapeHtml(m.key)}" data-kind="${m.kind}" data-on="${on}" tabindex="0" role="button"><span class="cg-name">${escapeHtml(m.name)}</span><span class="cg-state">${escapeHtml(stateText(m))}</span></div><div class="cg-detail" hidden></div>`;};
  pages.forEach((page,i)=>{const saved=layout[page.tab]||{};const panel=document.createElement('section');panel.className='cg-panel';panel.dataset.tab=page.tab;
    panel.style.left=(saved.x??(18+(i%6)*206))+'px';panel.style.top=(saved.y??(76+Math.floor(i/6)*330))+'px';if(saved.folded)panel.dataset.folded='true';
    panel.innerHTML=`<header class="cg-title"><span>${escapeHtml(page.category)}</span><small>${page.modules.length}</small></header><div class="cg-body">${page.modules.map(row).join('')}</div>`;layer.append(panel);});
  const hint=document.createElement('p');hint.className='cg-hint';hint.textContent='左键开关 · 右键展开 · 拖动标题移动 · 右键标题折叠 · Esc 关闭';layer.append(hint);
  const classic=document.createElement('button');classic.type='button';classic.className='cg-classic';classic.textContent='经典设置';layer.append(classic);
  shadow.append(layer);reportChromeLayout();
  const find=key=>pages.flatMap(p=>p.modules).find(m=>m.key===key);
  const refresh=el=>{const m=find(el.dataset.key);if(!m)return;el.dataset.on=String(m.kind==='toggle'&&clickGuiValue(m));$('.cg-state',el).textContent=stateText(m);const d=el.nextElementSibling;if(d&&!d.hidden)fillDetail(d,m);};
  const fillDetail=(detail,m)=>{const v=clickGuiValue(m);let html=m.hint?`<p>${escapeHtml(m.hint)}</p>`:'';
    if(m.kind==='select')html+=`<div class="cg-options">${m.options.map(([o,t])=>`<button type="button" data-value="${escapeHtml(o)}" aria-pressed="${o===v}">${escapeHtml(t)}</button>`).join('')}</div>`;
    else if(m.kind==='range')html+=`<label class="cg-range"><input type="range" min="${m.min}" max="${m.max}" step="${m.step}" value="${v}"><output>${v}${escapeHtml(m.unit)}</output></label>`;
    else if(!m.hint)html+='<p>左键切换开关</p>';detail.innerHTML=html;};
  const unfold=el=>{const m=find(el.dataset.key),detail=el.nextElementSibling;if(!m||!detail)return;const open=detail.hidden;
    if(open){fillDetail(detail,m);detail.hidden=false;el.dataset.open='true';if(!still)detail.animate([{opacity:0,clipPath:'inset(0 0 100% 0)'},{opacity:1,clipPath:'inset(0 0 0 0)'}],{duration:220,easing:'cubic-bezier(.32,.72,0,1)'});}
    else{delete el.dataset.open;if(still){detail.hidden=true;return;}detail.animate([{opacity:1,clipPath:'inset(0 0 0 0)'},{opacity:0,clipPath:'inset(0 0 100% 0)'}],{duration:150,easing:'cubic-bezier(.4,0,1,1)'}).onfinish=()=>{detail.hidden=true;};}};
  const press=el=>{const m=find(el.dataset.key);if(!m)return;
    if(m.kind==='toggle')setClickGuiValue(m,!clickGuiValue(m));
    else if(m.kind==='select'){const i=m.options.findIndex(([o])=>o===clickGuiValue(m));setClickGuiValue(m,m.options[(i+1)%m.options.length][0]);}
    else{unfold(el);return;}
    refresh(el);if(!still)el.animate([{scale:.97},{scale:1}],{duration:220,easing:'cubic-bezier(.32,1.6,.5,1)'});};
  layer.addEventListener('click',e=>{if(e.target===layer){closeClickGui();return;}if(e.target===classic){closeClickGui();openSettings(undefined,true,true);return;}
    const option=e.target.closest('.cg-options button');if(option){const el=option.closest('.cg-detail').previousElementSibling,m=find(el.dataset.key);setClickGuiValue(m,option.dataset.value);refresh(el);return;}
    const mod=e.target.closest('.cg-mod');if(mod)press(mod);});
  layer.addEventListener('input',e=>{const input=e.target.closest('.cg-range input');if(!input)return;const el=input.closest('.cg-detail').previousElementSibling,m=find(el.dataset.key);$('output',input.parentElement).textContent=input.value+(m.unit||'');$('.cg-state',el).textContent=input.value+(m.unit||'');});
  layer.addEventListener('change',e=>{const input=e.target.closest('.cg-range input');if(!input)return;const el=input.closest('.cg-detail').previousElementSibling,m=find(el.dataset.key);setClickGuiValue(m,Number(input.value));});
  layer.addEventListener('contextmenu',e=>{e.preventDefault();const title=e.target.closest('.cg-title');if(title){const panel=title.parentElement;panel.toggleAttribute('data-folded');const l=clickGuiLayout();l[panel.dataset.tab]={...l[panel.dataset.tab],folded:panel.hasAttribute('data-folded')};saveClickGuiLayout(l);return;}
    const mod=e.target.closest('.cg-mod');if(mod)unfold(mod);});
  layer.addEventListener('keydown',e=>{if(e.key==='Escape'||e.code==='ShiftRight'){e.preventDefault();e.stopPropagation();closeClickGui();return;}
    const mod=e.target.closest?.('.cg-mod');if(!mod)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();press(mod);}else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();unfold(mod);}});
  // Panels move by their titles; where they end up is remembered.
  layer.addEventListener('pointerdown',e=>{const title=e.target.closest('.cg-title');if(!title||e.button!==0)return;const panel=title.parentElement;e.preventDefault();title.setPointerCapture(e.pointerId);
    const z=Number(getComputedStyle(panel).zIndex)||1;$$('.cg-panel',layer).forEach(p=>p.style.zIndex='1');panel.style.zIndex=String(Math.max(2,z+1));
    const sx=e.clientX,sy=e.clientY,ox=panel.offsetLeft,oy=panel.offsetTop;panel.dataset.dragging='true';
    const move=ev=>{panel.style.left=Math.max(0,Math.min(innerWidth-60,ox+ev.clientX-sx))+'px';panel.style.top=Math.max(0,Math.min(innerHeight-28,oy+ev.clientY-sy))+'px';};
    const up=()=>{title.removeEventListener('pointermove',move);delete panel.dataset.dragging;const l=clickGuiLayout();l[panel.dataset.tab]={...l[panel.dataset.tab],x:panel.offsetLeft,y:panel.offsetTop};saveClickGuiLayout(l);};
    title.addEventListener('pointermove',move);title.addEventListener('pointerup',up,{once:true});title.addEventListener('pointercancel',up,{once:true});});
  if(!still){layer.animate([{opacity:0},{opacity:1}],{duration:200,easing:'ease-out'});$$('.cg-panel',layer).forEach((p,i)=>p.animate([{opacity:0,transform:'translateY(-14px) scale(.94)'},{opacity:1,transform:'none'}],{duration:340,delay:i*35,easing:'cubic-bezier(.32,1.3,.5,1)',fill:'backwards'}));}
  requestAnimationFrame(()=>$('.cg-mod',layer)?.focus({preventScroll:true}));
}
function installMessagesMenu(){
  const link=$('.messages',shadow),menu=$('#messages-menu',shadow);if(!link||!menu)return;shadow.append(menu);link.setAttribute('aria-haspopup','true');link.setAttribute('aria-controls','messages-menu');link.setAttribute('aria-expanded','false');
  const enter=e=>{if(e.pointerType&&e.pointerType!=='mouse')return;clearTimeout(messageMenuHideTimer);clearTimeout(messageMenuShowTimer);messageMenuShowTimer=setTimeout(showMessageMenu,90);};
  const leave=e=>{if(e.pointerType&&e.pointerType!=='mouse')return;clearTimeout(messageMenuShowTimer);clearTimeout(messageMenuHideTimer);messageMenuHideTimer=setTimeout(()=>hideMessageMenu(),200);};
  for(const el of [link,menu]){el.addEventListener('pointerenter',enter);el.addEventListener('pointerleave',leave);el.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.dataset.open==='true'){e.preventDefault();e.stopPropagation();hideMessageMenu(true);link.focus();}});}
  link.addEventListener('focus',()=>{if(link.matches(':focus-visible'))showMessageMenu();});
  for(const el of [link,menu])el.addEventListener('focusout',e=>{if(!link.contains(e.relatedTarget)&&!menu.contains(e.relatedTarget))hideMessageMenu();});
  menu.addEventListener('click',e=>{if(e.target.closest('a'))hideMessageMenu(true);});document.addEventListener('pointerdown',e=>{const path=e.composedPath();if(!path.includes(menu)&&!path.includes(link))hideMessageMenu();},{passive:true});
  window.addEventListener('resize',()=>{if(menu.dataset.open==='true')placeMessageMenu(menu,link);});window.addEventListener('pagehide',()=>hideMessageMenu(true));
}
function resetMessageUnread(){messageRequest?.abort();messageRequest=null;messageAccount='';messageChecked=0;messageUnread={feed:{},direct:{}};renderMessageUnread();}
async function refreshMessageUnread(force=false){
  if(CONTENT_VIEW)return;
  const mid=accountProfile?.mid;if(!mid){resetMessageUnread();return;}
  if(document.hidden||playbackSuspended||!PREFS.headerMessages)return;
  if(messageAccount!==String(mid)){resetMessageUnread();messageAccount=String(mid);}
  if(messageRequest||(!force&&Date.now()-messageChecked<60000))return;
  const account=messageAccount,request=new AbortController();messageRequest=request;messageChecked=Date.now();const timer=setTimeout(()=>request.abort(),6000);
  const read=async(url,key)=>{try{const r=await fetch(url,{credentials:'include',signal:request.signal,cache:'no-store'});if(!r.ok)return;const j=await r.json();
      if(request.signal.aborted||messageAccount!==account)return;
      if(j.code===-101){resetMessageUnread();return;}if(j.code!==0||!j.data||typeof j.data!=='object'||Array.isArray(j.data))return;
      messageUnread[key]=j.data;renderMessageUnread();
    }catch{/* Keep the last confirmed counts during a temporary network failure. */}};
  try{await Promise.all([read('https://api.vc.bilibili.com/x/im/web/msgfeed/unread?build=0&mobi_app=web','feed'),read('https://api.vc.bilibili.com/session_svr/v1/session_svr/single_unread?unread_type=0&build=0&mobi_app=web','direct')]);}
  finally{clearTimeout(timer);if(messageRequest===request)messageRequest=null;}
}
function renderAccountCard(){
  if(!shadow)return;accountsController?.setProfile(accountProfile);const card=$('#account-card',shadow);if(!card)return;
  renderAccountDecorations();
  $('.account-name',card).textContent=accountProfile?.uname||'尚未登录';$('.account-name',card).title=accountProfile?.uname||'';
  $('.account-level',card).textContent=Number.isInteger(accountProfile?.level)?'Lv.'+accountProfile.level:'等级 —';
  for(const key of ['follower','following','likes'])$('[data-stat='+key+']',card).textContent=Number.isFinite(accountProfile?.[key])?new Intl.NumberFormat('zh-CN').format(accountProfile[key]):'—';
  $('.account-status',card).textContent=accountProfile?'':'登录后查看账户信息';
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
  const request=accountRequest,timeout=setTimeout(()=>request.abort(),8000);
  try{
    const response=await fetch('https://api.bilibili.com/x/web-interface/nav',{credentials:'include',signal:accountRequest.signal});
    if(!response.ok)throw Error('account status unavailable');
    const result=await response.json(),data=result.data;if(request.signal.aborted||accountRequest!==request)return;
    if(result.code!==0||!data?.isLogin){if(accountsController?.isAdding())return;accountProfile=null;resetMessageUnread();renderAccountCard();return;}if(accountsController?.isAdding()){accountsController.acceptLoginProfile(data);return;}if(!accountProfile||String(accountProfile.mid)!==String(data.mid)){accountProfile={mid:data.mid,...cachedProfileBanner(data.mid)};accountStatsAt=0;}Object.assign(accountProfile,{uname:String(data.uname||'我的主页'),level:Number.isInteger(data.level_info?.current_level)?data.level_info.current_level:null,face:profileMediaUrl(data.face),wbi:data.wbi_img||accountProfile.wbi,vip:data.vip||{type:data.vipType,status:data.vipStatus,avatar_subscript:data.vip_avatar_subscript},pendant:data.pendant||accountProfile.pendant});renderAccountCard();refreshMessageUnread();
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
  }finally{clearTimeout(timeout);if(accountRequest===request)accountRequest=null;}
}

function applyPreferences() {root?.style.setProperty('--bs-settings-zoom',String(Math.min(160,Math.max(80,Number(PREFS.settingsZoom)||100))/100));
  const html=document.documentElement;
  syncRoute();
  const dark=PREFS.theme==='dark'||(PREFS.theme==='system'&&mediaTheme.matches);
  html.dataset.bsTheme=dark?'dark':'light';html.dataset.bsFrost=String(!!PREFS.experimentalFrost);html.dataset.bsBannerUnderlap='false';
  // The header view only draws the header; its page must stay see-through in either theme or it hides the page below.
  if(CHROME_VIEW){html.style.setProperty('background-color','transparent','important');if(!$('#bs-chrome-clear'))document.head?.append(Object.assign(document.createElement('style'),{id:'bs-chrome-clear',textContent:'html:root:root,html:root:root body{background:transparent!important}'}));}else html.style.setProperty('background-color',dark?'#161618':'#fafafa','important');const early=$('#bs-navigation-surface');if(early)early.textContent=`html,body${location.hostname==='space.bilibili.com'?'':',#app'}{background-color:${dark?'#161618':'#fafafa'}!important}`;native('surface',{dark});applyAudioBoost();watchVideoLoading();
  html.classList.toggle('night-mode',dark);
  html.classList.toggle('bili_dark',dark);
  html.dataset.bsFont=String(PREFS.font);
  html.dataset.bsChannels=String(PREFS.showChannels);
  html.dataset.bsAds=String(PREFS.hideAds);
  html.dataset.bsAlways=String(PREFS.progressAlways);
  html.dataset.bsThumb=String(PREFS.progressThumb);
  html.style.removeProperty('--bs-feed-columns');applyUiScale();
  html.style.setProperty('--bs-accent',PREFS.accent);
  const tint=/^#[0-9a-f]{6}$/i.test(PREFS.accent)?PREFS.accent:'#fb7299',base=dark?35:255,rgb=[1,3,5].map(i=>Math.round(base*.91+parseInt(tint.slice(i,i+2),16)*.09)),glass='rgba('+rgb.join(',')+','+(dark?.56:.68)+')';html.style.setProperty('--bs-glass',glass);root?.style.setProperty('--frost-tint',glass);root?.style.setProperty('--frost-control','rgba('+rgb.join(',')+','+(dark?.3:.45)+')');
  html.style.setProperty('--bs-progress',PREFS.progressColor);
  html.style.setProperty('--bs-progress-height',`${PREFS.progressHeight}px`);
  html.style.setProperty('--bs-progress-radius',`${PREFS.progressRadius}px`);
  if(root){root.dataset.mode=CHROME_VIEW?'chrome':CHROME_HOST?'content':'page';root.dataset.frost=String(!!PREFS.experimentalFrost);root.dataset.bounce=String(!!PREFS.experimentalBounce);root.style.setProperty('--accent',PREFS.accent);root.style.setProperty('--font',PREFS.font?'BiliDouyin,"Microsoft YaHei UI",sans-serif':'"Microsoft YaHei UI",sans-serif');root.dataset.theme=dark?'dark':'light';}
  if(!PREFS.clipboardAutoOpen)shadow?.querySelector('#clipboard-video-prompt')?.remove();
  applyHeaderPreferences();accountsController?.applyTheme();
  if(shadow)renderSettings();
  const launcher=$('#__bilibili_thread_ripper_launcher__');if(launcher)launcher.style.setProperty('display','none','important');
  scheduleScan();
}
function update(patch) {

  const before=PREFS.srMode+PREFS.srScale+PREFS.srModel;
  const langBefore=uiLanguage();Object.assign(PREFS,patch);applyPreferences();native('config',{value:patch,revision:++revision});
  if('language' in patch&&uiLanguage()!==langBefore){setLanguage(uiLanguage());if(!PREFS.languageChosen)update({languageChosen:true});}
  if(before!==PREFS.srMode+PREFS.srScale+PREFS.srModel||'fiMode' in patch)startEnhancer();
  if('downloader' in patch)mountVideoHome();
  if('showClock' in patch)scheduleHeaderClock();
  if('videoLinkButton' in patch||'videoLinkCompact' in patch)syncVideoLink();
  if('headerMessages' in patch){if(patch.headerMessages)refreshMessageUnread(true);else{messageRequest?.abort();messageRequest=null;}}
  if((patch.srMode&&patch.srMode!=='off')||(patch.fiMode&&patch.fiMode!=='off'))toast('警告：超分与补帧是测试功能，可能卡顿、闪烁或抖动；不保证画质提升，异常时请关闭。');
}

function clipboardVideoTarget(value){
  if(typeof value!=='string'||value.length>16384)return null;
  const text=value.trim();if(/^[Bb][Vv][A-Za-z0-9]{10}$/.test(text))return 'https://www.bilibili.com/video/BV'+text.slice(2);
  const match=text.match(/(?:https?:\/\/)?(?:(?:www\.|m\.)?bilibili\.com\/video\/[Bb][Vv][A-Za-z0-9]{10}(?=[/?#\s<>]|$)(?:[/?#][^\s<>]*)?|b23\.tv\/[A-Za-z0-9]+(?=[/?#\s<>]|$)(?:[/?#][^\s<>]*)?)/i);
  if(!match||match.index>0&&/[\w./@-]/.test(text[match.index-1]))return null;
  try{const url=new URL(/^https?:\/\//i.test(match[0])?match[0]:'https://'+match[0]);if(url.username||url.password||url.port)return null;
    if(url.hostname==='b23.tv')return 'https://b23.tv'+url.pathname;
    const id=url.pathname.match(/^\/video\/([Bb][Vv][A-Za-z0-9]{10})\/?$/);if(!id||!['www.bilibili.com','m.bilibili.com','bilibili.com'].includes(url.hostname))return null;
    const out=new URL('https://www.bilibili.com/video/BV'+id[1].slice(2));for(const key of ['p','t']){const v=url.searchParams.get(key);if(v&&/^\d+(\.\d+)?$/.test(v))out.searchParams.set(key,v);}return out.href;
  }catch{return null;}
}
function offerClipboardVideo(value){
  if(!shadow||!PREFS.clipboardAutoOpen)return false;
  const target=clipboardVideoTarget(value);if(!target)return false;
  let el=$('#clipboard-video-prompt',shadow);if(!el){el=document.createElement('section');el.id='clipboard-video-prompt';el.setAttribute('role','region');el.setAttribute('aria-label','剪贴板视频提示');el.innerHTML='<div role="status"><strong>检测到视频链接</strong><p>是否跳转观看？</p><small></small></div><div class="clipboard-actions"><button type="button" data-dismiss>暂不</button><button type="button" data-open>跳转观看</button></div>';shadow.append(el);$('[data-dismiss]',el).onclick=()=>el.remove();$('[data-open]',el).onclick=()=>{const url=el.dataset.url;el.remove();location.assign(url);};el.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();el.remove();}};}
  el.dataset.url=target;$('small',el).textContent=new URL(target).pathname.split('/').filter(Boolean).pop();return true;
}

function toast(text){
  if(!shadow)return;
  const el=$('#toast',shadow);el.textContent=text;el.hidden=false;
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,3800);
}
function diagnostic(text){native('diagnostic',{message:text});}

function markAds(scope=document){
  for(const node of $$('[data-bs-ad=true]',scope))delete node.dataset.bsAd;
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

// IANA root-zone list, bundled snapshot; no per-description DNS/network lookup.
const DESCRIPTION_TLDS=new Set("aaa aarp abb abbott abbvie abc able abogado abudhabi ac academy accenture accountant accountants aco actor ad ads adult ae aeg aero aetna af afl africa ag agakhan agency ai aig airbus airforce airtel akdn al alibaba alipay allfinanz allstate ally alsace alstom am amazon americanexpress americanfamily amex amfam amica amsterdam analytics android anquan anz ao aol apartments app apple aq aquarelle ar arab aramco archi army arpa art arte as asda asia associates at athleta attorney au auction audi audible audio auspost author auto autos aw aws ax axa az azure ba baby baidu banamex band bank bar barcelona barclaycard barclays barefoot bargains baseball basketball bauhaus bayern bb bbc bbt bbva bcg bcn bd be beats beauty beer berlin best bestbuy bet bf bg bh bharti bi bible bid bike bing bingo bio biz bj black blackfriday blockbuster blog bloomberg blue bm bms bmw bn bnpparibas bo boats boehringer bofa bom bond boo book booking bosch bostik boston bot boutique box br bradesco bridgestone broadway broker brother brussels bs bt build builders business buy buzz bv bw by bz bzh ca cab cafe cal call calvinklein cam camera camp canon capetown capital capitalone car caravan cards care career careers cars casa case cash casino cat catering catholic cba cbn cbre cc cd center ceo cern cf cfa cfd cg ch chanel channel charity chase chat cheap chintai christmas chrome church ci cipriani circle cisco citadel citi citic city ck cl claims cleaning click clinic clinique clothing cloud club clubmed cm cn co coach codes coffee college cologne com commbank community company compare computer comsec condos construction consulting contact contractors cooking cool coop corsica country coupon coupons courses cpa cr credit creditcard creditunion cricket crown crs cruise cruises cu cuisinella cv cw cx cy cymru cyou cz dad dance data date dating datsun day dclk dds de deal dealer deals degree delivery dell deloitte delta democrat dental dentist desi design dev dhl diamonds diet digital direct directory discount discover dish diy dj dk dm dnp do docs doctor dog domains dot download drive dtv dubai dupont durban dvag dvr dz earth eat ec eco edeka edu education ee eg email emerck energy engineer engineering enterprises epson equipment er ericsson erni es esq estate et eu eurovision eus events exchange expert exposed express extraspace fage fail fairwinds faith family fan fans farm farmers fashion fast fedex feedback ferrari ferrero fi fidelity fido film final finance financial fire firestone firmdale fish fishing fit fitness fj fk flickr flights flir florist flowers fly fm fo foo food football ford forex forsale forum foundation fox fr free fresenius frl frogans frontier ftr fujitsu fun fund furniture futbol fyi ga gal gallery gallo gallup game games gap garden gay gb gbiz gd gdn ge gea gent genting george gf gg ggee gh gi gift gifts gives giving gl glass gle global globo gm gmail gmbh gmo gmx gn godaddy gold goldpoint golf goodyear goog google gop got gov gp gq gr grainger graphics gratis green gripe grocery group gs gt gu gucci guge guide guitars guru gw gy hair hamburg hangout haus hbo hdfc hdfcbank health healthcare help helsinki here hermes hiphop hisamitsu hitachi hiv hk hkt hm hn hockey holdings holiday homedepot homegoods homes homesense honda horse hospital host hosting hot hotels hotmail house how hr hsbc ht hu hughes hyatt hyundai ibm icbc ice icu id ie ieee ifm ikano il im imamat imdb immo immobilien in inc industries infiniti info ing ink institute insurance insure int international intuit investments io ipiranga iq ir irish is ismaili ist istanbul it itau itv jaguar java jcb je jeep jetzt jewelry jio jll jm jmp jnj jo jobs joburg jot joy jp jpmorgan jprs juegos kaufen kddi ke kerryhotels kerryproperties kfh kg kh ki kia kids kim kindle kitchen kiwi km kn koeln komatsu kosher kp kpmg kpn kr krd kred kuokgroup kw ky kyoto kz la lacaixa lamborghini lamer land landrover lanxess lasalle lat latino latrobe law lawyer lb lc lds lease leclerc lefrak legal lego lexus lgbt li lidl life lifeinsurance lifestyle lighting like lilly limited limo lincoln link live living lk llc llp loan loans locker locus lol london lotte lotto love lpl lplfinancial lr ls lt ltd ltda lu lundbeck luxe luxury lv ly ma madrid maif maison makeup man management mango map market marketing markets marriott marshalls mattel mba mc mckinsey md me med media meet melbourne meme memorial men menu merck merckmsd mg mh miami microsoft mil mini mint mit mitsubishi mk ml mlb mls mm mma mn mo mobi mobile moda moe moi mom monash money monster mormon mortgage moscow moto motorcycles mov movie mp mq mr ms msd mt mtn mtr mu museum music mv mw mx my mz na nab nagoya name navy nba nc ne nec net netbank netflix network neustar new news next nextdirect nexus nf nfl ng ngo nhk ni nico nike nikon ninja nissan nissay nl no nokia norton now nowruz nowtv np nr nra nrw ntt nu nyc nz obi observer office okinawa olayan olayangroup ollo om omega one ong onl online ooo open oracle orange org organic origins osaka otsuka ott ovh pa page panasonic paris pars partners parts party pay pccw pe pet pf pfizer pg ph pharmacy phd philips phone photo photography photos physio pics pictet pictures pid pin ping pink pioneer pizza pk pl place play playstation plumbing plus pm pn pnc pohl poker politie porn post pr praxi press prime pro prod productions prof progressive promo properties property protection pru prudential ps pt pub pw pwc py qa qpon quebec quest racing radio re read realestate realtor realty recipes red redumbrella rehab reise reisen reit reliance ren rent rentals repair report republican rest restaurant review reviews rexroth rich richardli ricoh ril rio rip ro rocks rodeo rogers room rs rsvp ru rugby ruhr run rw rwe ryukyu sa saarland safe safety sakura sale salon samsclub samsung sandvik sandvikcoromant sanofi sap sarl sas save saxo sb sbi sbs sc scb schaeffler schmidt scholarships school schule schwarz science scot sd se search seat secure security seek select sener services seven sew sex sexy sfr sg sh shangrila sharp shell shia shiksha shoes shop shopping shouji show si silk sina singles site sj sk ski skin sky skype sl sling sm smart smile sn sncf so soccer social softbank software sohu solar solutions song sony soy spa space sport spot sr srl ss st stada staples star statebank statefarm stc stcgroup stockholm storage store stream studio study style su sucks supplies supply support surf surgery suzuki sv swatch swiss sx sy sydney systems sz tab taipei talk taobao target tatamotors tatar tattoo tax taxi tc tci td tdk team tech technology tel temasek tennis teva tf tg th thd theater theatre tiaa tickets tienda tips tires tirol tj tjmaxx tjx tk tkmaxx tl tm tmall tn to today tokyo tools top toray toshiba total tours town toyota toys tr trade trading training travel travelers travelersinsurance trust trv tt tube tui tunes tushu tv tvs tw tz ua ubank ubs ug uk unicom university uno uol ups us uy uz va vacations vana vanguard vc ve vegas ventures verisign versicherung vet vg vi viajes video vig viking villas vin vip virgin visa vision viva vivo vlaanderen vn vodka volvo vote voting voto voyage vu wales walmart walter wang wanggou watch watches weather weatherchannel web webcam weber website wed wedding weibo weir wf whoswho wien wiki williamhill win windows wine winners wme woodside work works world wow ws wtc wtf xbox xerox xihuan xin xn--11b4c3d xn--1ck2e1b xn--1qqw23a xn--2scrj9c xn--30rr7y xn--3bst00m xn--3ds443g xn--3e0b707e xn--3hcrj9c xn--3pxu8k xn--42c2d9a xn--45br5cyl xn--45brj9c xn--45q11c xn--4dbrk0ce xn--4gbrim xn--54b7fta0cc xn--55qw42g xn--55qx5d xn--5su34j936bgsg xn--5tzm5g xn--6frz82g xn--6qq986b3xl xn--80adxhks xn--80ao21a xn--80aqecdr1a xn--80asehdb xn--80aswg xn--8y0a063a xn--90a3ac xn--90ae xn--90ais xn--9dbq2a xn--9et52u xn--9krt00a xn--b4w605ferd xn--bck1b9a5dre4c xn--c1avg xn--c2br7g xn--cck2b3b xn--cckwcxetd xn--cg4bki xn--clchc0ea0b2g2a9gcd xn--czr694b xn--czrs0t xn--czru2d xn--d1acj3b xn--d1alf xn--e1a4c xn--eckvdtc9d xn--efvy88h xn--fct429k xn--fhbei xn--fiq228c5hs xn--fiq64b xn--fiqs8s xn--fiqz9s xn--fjq720a xn--flw351e xn--fpcrj9c3d xn--fzc2c9e2c xn--fzys8d69uvgm xn--g2xx48c xn--gckr3f0f xn--gecrj9c xn--gk3at1e xn--h2breg3eve xn--h2brj9c xn--h2brj9c8c xn--hxt814e xn--i1b6b1a6a2e xn--imr513n xn--io0a7i xn--j1aef xn--j1amh xn--j6w193g xn--jlq480n2rg xn--jvr189m xn--kcrx77d1x4a xn--kprw13d xn--kpry57d xn--kput3i xn--l1acc xn--lgbbat1ad8j xn--mgb9awbf xn--mgba3a3ejt xn--mgba3a4f16a xn--mgba7c0bbn0a xn--mgbaam7a8h xn--mgbab2bd xn--mgbah1a3hjkrd xn--mgbai9azgqp6j xn--mgbayh7gpa xn--mgbbh1a xn--mgbbh1a71e xn--mgbc0a9azcg xn--mgbca7dzdo xn--mgbcpq6gpa1a xn--mgberp4a5d4ar xn--mgbgu82a xn--mgbi4ecexp xn--mgbpl2fh xn--mgbt3dhd xn--mgbtx2b xn--mgbx4cd0ab xn--mix891f xn--mk1bu44c xn--mxtq1m xn--ngbc5azd xn--ngbe9e0a xn--ngbrx xn--node xn--nqv7f xn--nqv7fs00ema xn--nyqy26a xn--o3cw4h xn--ogbpf8fl xn--otu796d xn--p1acf xn--p1ai xn--pgbs0dh xn--pssy2u xn--q7ce6a xn--q9jyb4c xn--qcka1pmc xn--qxa6a xn--qxam xn--rhqv96g xn--rovu88b xn--rvc1e0am3e xn--s9brj9c xn--ses554g xn--t60b56a xn--tckwe xn--tiq49xqyj xn--unup4y xn--vermgensberater-ctb xn--vermgensberatung-pwb xn--vhquv xn--vuq861b xn--w4r85el8fhu5dnra xn--w4rs40l xn--wgbh1c xn--wgbl6a xn--xhq521b xn--xkc2al3hye2a xn--xkc2dl3a5ee0h xn--y9a3aq xn--yfro4i67o xn--ygbi2ammx xn--zfr164b xxx xyz yachts yahoo yamaxun yandex ye yodobashi yoga yokohama you youtube yt yun za zappos zara zero zip zm zone zuerich zw".split(' '));
function registeredDescriptionDomain(url){try{const host=new URL(url).hostname.toLowerCase();const labels=host.split('.');return labels.length>1&&labels.every(x=>x.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x))&&DESCRIPTION_TLDS.has(labels.at(-1));}catch{return false;}}
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
      const text=node.nodeValue,pattern=/https?:\/\/[^\s<>"“”]+|(?<![a-z0-9_@.-])(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?|(?:(?![a-z])[\p{L}\p{N}])(?:(?![a-z])[\p{L}\p{N}-]){0,62})\.)+(?:xn--[a-z0-9-]{1,59}|[a-z]{2,63}|vermögensberatung|vermögensberater|சிங்கப்பூர்|موريتانيا|السعودية|католик|الجزائر|العليان|پاکستان|البحرين|كاثوليك|இந்தியா|москва|онлайн|ファッション|भारतम्|ارامكو|امارات|الاردن|المغرب|ابوظبي|مليسيا|இலங்கை|فلسطين|ישראל|বাংলা|భారత్|भारोत|संगठन|ایران|بازار|بھارت|سودان|همراه|سورية|ഭാരതം|嘉里大酒店|ಭಾರತ|ଭାରତ|ভাৰত|ভারত|موقع|香格里拉|сайт|アマゾン|дети|ポイント|ලංකා|電訊盈科|クラウド|ભારત|भारत|عمان|بارت|ڀارت|عراق|شبكة|بيتك|组织机构|تونس|グーグル|ਭਾਰਤ|कॉम|セール|คอม|我爱你|қаз|срб|бел|קום|淡马锡|орг|नेट|ストア|мкд|كوم|中文网|ком|укр|亚马逊|飞利浦|мон|عرب|ไทย|рус|ລາວ|みんな|天主教|مصر|قطر|հայ|新加坡|佛山|慈善|集团|在线|한국|点看|八卦|公益|公司|网站|移动|联通|бг|时尚|微博|삼성|商标|商店|商城|ею|新闻|家電|中信|中国|中國|娱乐|谷歌|购物|通販|网店|餐厅|网络|香港|食品|台湾|台灣|手机|澳門|닷컴|政府|გე|机构|健康|招聘|рф|大拿|ευ|ελ|世界|書籍|网址|닷넷|コム|游戏|企业|信息|嘉里|广东|政务)(?![a-z0-9_@.-])(?:[\/?#][^\s<>"“”，。；;！？、]*)?/giu;let match,last=0,changed=false;const fragment=document.createDocumentFragment();
      while((match=pattern.exec(text))){const bare=!/^https?:\/\//i.test(match[0]),cleaned=cleanDescriptionUrl((bare?'https://':'')+match[0]);if(!cleaned||bare&&!registeredDescriptionDomain(cleaned))continue;const stripped=match[0].replace(/[。。，，；;！!？?、）)\]】》]+$/u,'');fragment.append(document.createTextNode(text.slice(last,match.index)));const a=document.createElement('a');a.href=cleaned;a.textContent=bare?stripped:cleaned;a.dataset.bsDescriptionLink='true';a.style.cssText='color:#00aeec!important;cursor:pointer;text-decoration:underline;overflow-wrap:anywhere';a.rel='noopener noreferrer';fragment.append(a);last=match.index+stripped.length;changed=true;}
      if(changed){fragment.append(document.createTextNode(text.slice(last)));node.replaceWith(fragment);}
    }
    for(const a of $$('a[href]',root)){
      if(a.dataset.bsExternalBound)continue;const cleaned=cleanDescriptionUrl(a.getAttribute('href')||'')||cleanDescriptionUrl(a.textContent.trim());if(!cleaned)continue;
      const labelUrl=cleanDescriptionUrl(a.textContent.trim());if(labelUrl&&a.textContent!==labelUrl)a.textContent=labelUrl;a.dataset.bsExternalBound='true';a.href=cleaned;a.style.setProperty('color','#00aeec','important');a.addEventListener('click',e=>{if(e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();native('open-external',{url:a.href});},true);
    }
  }
}

/* Endless page animations (skeleton shimmers, spinners) keep the page redrawing every frame even where nobody can see
   them, such as the load-more placeholders below the fold; a shimmer that moves a background even restyles on the main
   thread each frame. They are paused while off screen and resume as soon as they come near the viewport, so what is
   visible never changes. */
const loopObserver=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{for(const e of entries)for(const a of e.target.getAnimations?e.target.getAnimations({subtree:true}):[]){if(a.effect?.getTiming?.().iterations!==Infinity)continue;if(e.isIntersecting){if(a.__bsPaused){a.__bsPaused=false;a.play();}}else if(a.playState==='running'){a.__bsPaused=true;a.pause();}}},{rootMargin:'200px'}):null;
const loopTargets=new WeakSet();
function watchLoop(t){
  if(!loopObserver||!t?.getAnimations||!t.isConnected||loopTargets.has(t)||t.closest?.('#bili-space-root'))return;
  // Shimmers usually run on ::before/::after, which an element's own animation list leaves out without subtree.
  if(!t.getAnimations({subtree:true}).some(a=>a.effect?.getTiming?.().iterations===Infinity))return;
  loopTargets.add(t);loopObserver.observe(t);
}
function pauseOffscreenLoops(){
  if(!loopObserver||!document.getAnimations)return;
  for(const a of document.getAnimations())if(a.effect?.getTiming?.().iterations===Infinity)watchLoop(a.effect.target);
}
// Every CSS animation announces its start, including ones that began before this script looked.
document.addEventListener('animationstart',e=>watchLoop(e.target),true);
window.addEventListener('load',()=>setTimeout(pauseOffscreenLoops,500),{once:true});
// Fullscreen motion is drawn by the host. The page tells it where the player sat before the jump (or sits after leaving)
// and when it has drawn at the new size. The request itself goes first, while the click or key still allows it.
let fullTarget=null,fullRect=null,fullRectAt=0,fullStartSent=false;
// The video area only (not the danmaku bar under it), which is what fills the screen in fullscreen.
// Tried in this order (a selector list would return whichever comes first in the page, i.e. the larger wrapper).
const fullArea=el=>{for(const q of ['.bpx-player-video-area','.bilibili-player-video-wrap','.bpx-player-video-wrap','video']){const found=el?.querySelector?.(q);if(found&&found.getBoundingClientRect().width>40)return found;}return el;};
// The video area in device pixels, plus the video's own size so the host can find the picture inside any black bars.
const fullBox=el=>{const r=fullArea(el).getBoundingClientRect(),s=devicePixelRatio||1,v=el?.querySelector?.('video');return [r.left*s,r.top*s,r.width*s,r.height*s,v?.videoWidth||0,v?.videoHeight||0];};
for(const name of ['requestFullscreen','webkitRequestFullscreen']){const original=Element.prototype[name];if(typeof original!=='function'||CHROME_VIEW)continue;
  Element.prototype[name]=function(...args){const result=Reflect.apply(original,this,args);try{if(!document.fullscreenElement){fullTarget=this;fullRect=fullBox(this);fullRectAt=Date.now();fullStartSent=true;native('fullscreen-start',{rect:fullRect});}}catch{}return result;};
}
// Tells the host once the page is really drawn at a given size and zoom (device pixels, device pixel ratio): after the
// matching resize, two frames, and - while a video plays - its next frame. Entering, it also says where the player was.
function fullReadyAt(width,height,ratio,entering){
  const right=()=>Math.abs(innerWidth*devicePixelRatio-width)<=2&&Math.abs(innerHeight*devicePixelRatio-height)<=2&&Math.abs(devicePixelRatio-ratio)<.02;let sent=false;
  const report=()=>{let rect=null;try{rect=entering?fullRect:null;}catch{}native('fullscreen-ready',{rect});};
  const fire=()=>{if(sent)return;sent=true;removeEventListener('resize',check);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{const v=(entering?document.fullscreenElement:fullTarget)?.querySelector?.('video');
      if(!v||v.paused||!v.requestVideoFrameCallback){report();return;}let done=false;const go=()=>{if(!done){done=true;report();}};v.requestVideoFrameCallback(go);setTimeout(go,120);}));};
  const check=()=>{if(right())fire();};if(right())fire();else{addEventListener('resize',check);setTimeout(fire,400);}
}
// Leaving fullscreen, the browser draws the page's normal layout at once - a frame before the host can cover it. The
// player is pinned over the whole window in that same frame (danmaku bar tucked away), so that frame still looks like
// fullscreen; the host releases it once the window is back to its size.
let fullHold=null;
function holdPlayer(on){
  if(!on){if(!fullHold)return;clearTimeout(fullHold.timer);for(const [node,prop,value,priority] of fullHold.saved.reverse()){if(value)node.style.setProperty(prop,value,priority);else node.style.removeProperty(prop);}fullHold=null;return;}
  if(fullHold)return;const c=fullTarget?.isConnected?fullTarget:document.querySelector('.bpx-player-container');if(!c)return;
  const saved=[],keep=(node,prop,value)=>{saved.push([node,prop,node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]);node.style.setProperty(prop,value,'important');};
  for(let a=c.parentElement;a&&a!==document.documentElement;a=a.parentElement){const s=getComputedStyle(a);if(s.position!=='static'&&s.zIndex!=='auto')keep(a,'z-index','2147483000');if(s.transform!=='none')keep(a,'transform','none');}
  for(const [prop,value] of [['position','fixed'],['inset','0'],['width','100vw'],['height','100vh'],['max-width','none'],['max-height','none'],['margin','0'],['z-index','2147483001'],['background','#000']])keep(c,prop,value);
  const bar=c.querySelector('.bpx-player-sending-area');if(bar)keep(bar,'display','none');
  fullHold={saved,timer:setTimeout(()=>holdPlayer(false),1500)};
}
document.addEventListener('fullscreenchange',()=>{
  if(CHROME_VIEW)return;const entering=!!document.fullscreenElement;
  if(!entering&&PREFS.experimentalFullscreenMotion&&!matchMedia('(prefers-reduced-motion: reduce)').matches)holdPlayer(true);
  if(entering&&!fullStartSent&&fullRect&&Date.now()-fullRectAt<3000){fullStartSent=true;native('fullscreen-start',{rect:fullRect});}
  if(!entering)fullStartSent=false;
});
function scheduleScan(){
  if(scanTimer)return;
  scanTimer=setTimeout(()=>{scanTimer=0;pauseOffscreenLoops();syncRoute();markAds();linkifyDescriptions();cacheSpaceBackgrounds();applyAudioBoost();watchVideoLoading();const launcher=$('#__bilibili_thread_ripper_launcher__');if(launcher)launcher.style.setProperty('display','none','important');mountPlayerTools();if(PREFS.fiMode!=='off'&&(!interpolator||interpolator.video!==playbackVideo()))startInterpolation();if(PREFS.srMode!=='off'&&(!gpu||gpu.video!==playbackVideo()))startGpu();},180);
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
html[data-bs-page=home] [data-bs-banner=true] .inner-logo{display:none!important}
html[data-bs-page=home] :is(.bili-header__channel,.channel-container){margin-block:0!important;padding-block:0!important;min-height:0!important}
html[data-bs-page=home] :is(.channel-fixed,.channel-fixed-container){top:var(--bs-header-height,58px)!important;margin-top:0!important}

html[data-bs-page=home][data-bs-theme] :is(.channel-link,.channel-link__right,.channel-items__left>a){border:0!important;box-shadow:0 3px 10px #00000018!important}
html[data-bs-page=home][data-bs-theme] :is(.channel-items__right>a,.channel-link__right){background:transparent!important;box-shadow:none!important;border:0!important}

html[data-bs-frost=true]{--bs-glass:rgba(35,35,40,.78);--bs-glass-shadow:0 7px 24px #0002}html[data-bs-frost=true][data-bs-theme=light]{--bs-glass:rgba(255,255,255,.8);--bs-glass-shadow:0 7px 24px #27273312}
html[data-bs-frost=true] :is(.bili-feed4-layout,.recommended-container_floor-aside) :is(.feed-card,.bili-video-card,.floor-single-card){border-color:transparent!important;border-radius:16px;background:var(--bs-glass)!important;box-shadow:var(--bs-glass-shadow);backdrop-filter:blur(14px) saturate(120%);-webkit-backdrop-filter:blur(14px) saturate(120%)}
html[data-bs-frost=true] :is(.bili-header__channel,.channel-container,.channel-floor,.channel-fixed,.channel-fixed-container,.channel-header){border-color:transparent!important;background:var(--bs-glass)!important;box-shadow:var(--bs-glass-shadow);backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%)}
html[data-bs-frost=true] :is(.bili-header__channel,.channel-container,.channel-floor,.channel-fixed,.channel-fixed-container,.channel-header) :is(a,button){border-color:transparent!important;background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
html[data-bs-frost=true] :is(.bili-header__channel,.channel-container,.channel-floor,.channel-fixed,.channel-fixed-container,.channel-header) :is(a,button):hover{background:#ffffff0d!important}
html[data-bs-frost=true] :is(.bili-feed4-layout,.recommended-container_floor-aside) .feed-card .bili-video-card{background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-radius:0!important}html[data-bs-frost=true] :is(.bili-feed4-layout,.recommended-container_floor-aside) :is(.feed-card,.floor-single-card,.bili-video-card:not(.feed-card .bili-video-card)){padding:6px!important;box-sizing:border-box!important}html[data-bs-frost=true] :is(.bili-feed4-layout,.recommended-container_floor-aside) :is(.bili-video-card__image,.bili-video-card__cover,.bili-video-card__image--wrap){border-radius:10px!important;overflow:hidden!important}html[data-bs-frost=true] :is(.bili-feed4-layout,.recommended-container_floor-aside) .bili-video-card__info{padding:2px 4px 4px!important}
html[data-bs-frost=true] :is(button,.bs-player-tool){border-color:transparent!important;background:var(--bs-glass)!important;box-shadow:var(--bs-glass-shadow);backdrop-filter:blur(14px) saturate(120%);-webkit-backdrop-filter:blur(14px) saturate(120%)}
@media(prefers-reduced-transparency:reduce){html[data-bs-frost=true] :is(button,.bs-player-tool,.feed-card,.bili-video-card,.floor-single-card){backdrop-filter:none;-webkit-backdrop-filter:none}}

@font-face{font-family:BiliDouyin;src:url("https://bili-space.local/fonts/DouyinSansBold.ttf") format("truetype"),local("DouyinSans Bold"),local("DOUYINSANSBOLD-GB"),local("抖音美好体 Bold");font-display:swap}
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
html[data-bs-page=home][data-bs-banner-underlap=true] body{padding-top:0!important}
html[data-bs-page=home][data-bs-banner-underlap=true] [data-bs-banner=true]{height:calc(clamp(100px,8vw,142px) + var(--bs-header-height,58px))!important}
html[data-bs-page=home][data-bs-banner-underlap=true] [data-bs-banner=true] .inner-logo{position:relative!important;top:var(--bs-header-height,58px)!important}
html[data-bs-page=home][data-bs-banner-underlap=true] .bs-banner-brand{top:calc(50% + var(--bs-header-height,58px)/2)!important}
[data-bs-motion=static] .banner-img{transform:translateX(var(--bs-banner-x,0px)) scale(1.025);transition:transform 160ms ease-out;will-change:transform}
.bs-banner-brand{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;z-index:5;font:clamp(26px,2.5vw,38px)/1.2 BiliDouyin,sans-serif!important;letter-spacing:-1px;color:#fff!important;text-shadow:0 2px 12px #082c22,0 1px 3px #0009;text-decoration:none!important;white-space:nowrap;pointer-events:none!important}
.bs-banner-brand b{color:var(--bs-accent)!important;font-weight:400}
html[data-bs-ads=true] [data-bs-ad=true]{display:none!important}
html[data-bs-channels=false] :is(.bili-header__channel,.channel-container,.channel-floor,.channel-fixed,.channel-fixed-container,.channel-header){display:none!important}
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
/* Bilibili fixes the player wrapper's height for its own column width; once the client widens the column (a maximized
   window), the 16:9 player with its danmaku bar outgrows that height and the bar slides over the like/coin row. The
   wrappers take their height from their width instead and still grow to fit. They keep that height while the player
   floats (mini, web fullscreen) so the page does not jump; only the wide mode keeps Bilibili's own size. */
html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) :is(#playerWrap,#bilibili-player,.bpx-docker:not(.bpx-docker-minor)):not(:has(.bpx-player-container[data-screen=wide])){height:auto!important;aspect-ratio:16/9}
html[data-bs-page=video] .video-toolbar-container{flex-wrap:wrap!important;gap:12px!important}
/* Keep each recommendation metric intact; wrap whole metrics, never the unit suffix. */
html[data-bs-page=video] .video-page-card-small .playinfo{display:flex!important;flex-wrap:wrap!important;justify-content:flex-start!important;column-gap:8px!important;row-gap:4px!important;height:auto!important;min-width:0!important;line-height:18px!important}
html[data-bs-page=video] .video-page-card-small .playinfo-item{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;gap:4px!important;padding:0!important;flex:0 0 auto!important;width:auto!important;min-width:max-content!important;max-width:none!important;height:auto!important;margin:0!important;white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important}
html[data-bs-page=video] .video-page-card-small .playinfo-item span{margin:0!important;padding:0!important;width:auto!important;white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important;flex-shrink:0!important}
html[data-bs-page=video] .video-page-card-small .playinfo-item :is(svg,i){margin:0!important;padding:0!important;flex-shrink:0!important}
/* Live cards use svg + anonymous text nodes, not playinfo-item wrappers. */
html[data-bs-page=video] .video-page-card-small .info:has(>.playinfo>svg.play){container:bs-rec-info / inline-size}
html[data-bs-page=video] .video-page-card-small .playinfo:has(>svg.play){display:grid!important;grid-template-columns:18px max-content 22px max-content!important;column-gap:4px!important;row-gap:4px!important;justify-content:start!important;align-items:center!important;white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important}
html[data-bs-page=video] .video-page-card-small .playinfo>svg{margin:0!important;padding:0!important;align-self:center}
html[data-bs-page=video] .video-page-card-small .playinfo>svg.dm{margin-left:4px!important}
@container bs-rec-info (max-width:155px){html[data-bs-page=video] .video-page-card-small .playinfo:has(>svg.play){grid-template-columns:18px max-content!important}html[data-bs-page=video] .video-page-card-small .playinfo>svg.dm{margin-left:0!important}}
/* Opaque theme surface prevents the player's black canvas showing through this toolbar. */
html[data-bs-page=video] .video-toolbar-container{position:relative!important;isolation:isolate;z-index:2;background:var(--bg1,#fafafa)!important;box-shadow:none!important}
html[data-bs-page=video][data-bs-theme=light] :is(.video-toolbar-container,.video-toolbar-left,.video-toolbar-right){background:#fafafa!important;box-shadow:none!important}
html[data-bs-page=video][data-bs-theme=dark] .video-toolbar-container{background:#161618!important;box-shadow:none!important}
html[data-bs-page=video] .video-toolbar-container::before,html[data-bs-page=video] .video-toolbar-container::after{background:none!important;box-shadow:none!important}
html[data-bs-page=video] :is(#bilibili-player,#bilibili-player-wrap,#playerWrap,.bpx-player-container,.bpx-player-sending-bar,.bpx-player-sending-area){box-shadow:none!important;outline:none!important}
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
html[data-bs-theme=dark] :is(.bpx-player-sending-bar,.bilibili-player-video-sendbar):not([data-screen=full] *):not([data-screen=web] *):not(html[data-bs-full=true] *){background:#202023!important;border-color:#303034!important;box-shadow:none!important}
html[data-bs-theme=dark] :is(.bpx-player-dm-wrap,.bpx-player-dm-input,.bilibili-player-video-danmaku-input,.bpx-player-sending-area):not([data-screen=full] *):not([data-screen=web] *):not(html[data-bs-full=true] *){background:#2c2c32!important;color:#eeeef0!important;border-color:#3b3b42!important}html.bs-tour-blur body{filter:blur(26px) saturate(1.15) brightness(.78);transition:filter .45s cubic-bezier(.32,.72,0,1);pointer-events:none}@media (prefers-reduced-motion:reduce){html.bs-tour-blur body{transition:none}}/* The viewer/danmaku count never spills over the danmaku switch, whatever width the player last measured. */.bpx-player-sending-bar .bpx-player-video-info{flex:0 1 auto!important;min-width:0!important;overflow:hidden!important;white-space:nowrap!important}.bpx-player-sending-bar :is(.bpx-player-dm-switch,.bpx-player-dm-setting){flex-shrink:0!important}
html[data-bs-theme=dark] :is(.bpx-player-dm-input input,.bpx-player-dm-input textarea){background:transparent!important;color:#eeeef0!important}
html[data-bs-theme=dark] :is(.roll-btn,.feed-roll-btn,.floor-single-card,.bili-live-card,.living-card,.vui_pagenation--btn,.vui_pagination--btn){background:#26262b!important;color:#d4d4dc!important;border-color:#38383f!important}
/* Original refresh panels retain their size; elevation replaces the outline. */
html[data-bs-theme] :is(.roll-btn,.feed-roll-btn),html[data-bs-theme][data-bs-page] .feed-roll-btn :is(button,.primary-btn,.roll-btn){border-radius:12px!important}html[data-bs-page=home] .feed-roll-btn{margin-top:44px!important}html[data-bs-hosted=true][data-bs-page=home] :is(.feed-roll-btn,.palette-button-wrap){visibility:hidden!important;pointer-events:none!important}.palette-button-wrap .watchlater-pip-button{display:none!important}.bpx-player-top-issue,.bpx-player-top-feedback,.bpx-player-ctrl-feedback,[class*=bpx-player-top-issue]{display:none!important}.bpx-player-top-logo,.bpx-player-video-logo,.bpx-player-top-left-logo{opacity:.35!important}html[data-bs-theme] :is(.roll-btn,.feed-roll-btn){border-color:transparent!important;outline:0!important;box-shadow:0 4px 14px rgba(0,0,0,.12),0 1px 3px rgba(0,0,0,.06)!important}
html[data-bs-theme][data-bs-page] .feed-roll-btn :is(button,.primary-btn,.roll-btn){border-color:transparent!important;outline:0!important;box-shadow:none!important}
html[data-bs-theme=dark] :is(.roll-btn,.feed-roll-btn){box-shadow:0 5px 18px rgba(0,0,0,.3),0 1px 4px rgba(0,0,0,.16)!important}
html[data-bs-page=home] :is(.feedback-btn,.customer-service-btn){display:none!important}

html[data-bs-page=messages] #message-pc-header{display:none!important;height:0!important;min-height:0!important}
html[data-bs-page=messages] .message-layout{width:calc(100% - 48px)!important;max-width:1440px!important;margin:16px auto!important;height:calc(100vh - var(--bs-header-height) - 32px)!important;min-height:0!important;border-radius:12px;overflow:hidden}
html[data-bs-page=messages][data-bs-theme=dark] :is(.message-bg,.message-bgc,#skeleton-bg){background:#161618!important;background-image:none!important}
html[data-bs-page=messages][data-bs-theme=dark] :is(#app,#message-pc-app,.message-main){background:#161618!important;color:var(--text1)!important}
html[data-bs-page=messages][data-bs-theme=dark] .message-aside{background:#202023!important;color:var(--text1)!important}
html[data-bs-page=messages][data-bs-theme=dark] :is(.message-header,.message-box-shadow){background:var(--bg2)!important;color:var(--text1)!important;box-shadow:none!important;border-color:var(--line_regular)!important}
.bs-video-bar{max-width:100%;flex-wrap:wrap;display:flex!important;align-items:center;gap:8px;width:fit-content;margin:0 0 10px;align-self:flex-start}.bs-video-bar{margin:0 0 2px!important}.bs-video-bar+*{margin-top:0!important;padding-top:0!important}/* Edges come from a soft shadow, not an outline. */.bs-video-home,.bs-video-download{border-color:transparent!important;background:var(--bg1,#fff)!important;box-shadow:0 1px 2px rgba(0,0,0,.06),0 3px 10px rgba(0,0,0,.08);transition:color 160ms cubic-bezier(.2,.8,.2,1),box-shadow 160ms cubic-bezier(.2,.8,.2,1),transform 160ms cubic-bezier(.32,.72,0,1)}html[data-bs-theme=dark] :is(.bs-video-home,.bs-video-download){background:#25252a!important;box-shadow:0 1px 2px rgba(0,0,0,.3),0 4px 14px rgba(0,0,0,.32)}.bs-video-home:hover,.bs-video-download:hover{border-color:transparent!important;box-shadow:0 2px 4px rgba(0,0,0,.1),0 6px 18px rgba(0,0,0,.14)}.bs-video-home:active{transform:scale(.97)}.bs-video-download:is([data-state=blocked],[data-state=busy],[data-state=done]){border-color:transparent!important}
.bs-download-progress{font-size:12px;line-height:20px;color:var(--text2,#67676e);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;min-width:0}.bs-download-progress[hidden]{display:none!important}
.bs-video-home,.bs-video-download{display:inline-flex!important;align-items:center;gap:6px;width:fit-content;padding:4px 9px;border:1px solid var(--line_regular,#dedee3);border-radius:7px;color:var(--text2,#67676e)!important;font-size:12px;line-height:20px;text-decoration:none!important;background:var(--bg2,#f1f1f3);font-family:inherit;cursor:pointer;appearance:none;transition:color 160ms cubic-bezier(.2,.8,.2,1),border-color 160ms cubic-bezier(.2,.8,.2,1),opacity 160ms cubic-bezier(.2,.8,.2,1)}
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
@media(prefers-reduced-motion:reduce){.bs-pip-controls,html[data-bs-page=home][data-bs-banner-underlap=true] body{padding-top:0!important}
html[data-bs-page=home][data-bs-banner-underlap=true] [data-bs-banner=true]{height:calc(clamp(100px,8vw,142px) + var(--bs-header-height,58px))!important}
html[data-bs-page=home][data-bs-banner-underlap=true] [data-bs-banner=true] .inner-logo{position:relative!important;top:var(--bs-header-height,58px)!important}
html[data-bs-page=home][data-bs-banner-underlap=true] .bs-banner-brand{top:calc(50% + var(--bs-header-height,58px)/2)!important}
[data-bs-motion=static] .banner-img{transition:none!important;transform:none!important}}

#bs-pip-danmaku[hidden]{display:none!important}#bs-pip-danmaku{position:fixed;z-index:2147483002;overflow:hidden;pointer-events:none;visibility:hidden}html[data-bs-pip=true] #bs-pip-danmaku:not([hidden]),html[data-bs-pip=true] #bs-pip-danmaku:not([hidden]) *{visibility:visible!important}.bs-pip-comment{position:absolute;left:0;white-space:nowrap;font-family:BiliDouyin,"Microsoft YaHei",sans-serif;font-weight:600;line-height:1.35;text-shadow:1px 1px 2px #000,-1px -1px 2px #000;will-change:transform;pointer-events:none}
.bs-pip-controls button{width:36px;height:36px;padding:6px;display:grid;place-items:center}.bs-pip-controls svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.bs-pip-play svg{stroke-width:2.8}.pip-play-glyph{fill:currentColor;stroke:none;transform-origin:center;opacity:0;transform:scale(.75) rotate(-20deg)}.pip-pause-glyph{transform-origin:center;opacity:1;transform:scale(1)}.bs-pip-play[data-paused=true] .pip-play-glyph{opacity:1;transform:scale(1) rotate(0)}.bs-pip-play[data-paused=true] .pip-pause-glyph{opacity:0;transform:scale(.75)}.pip-play-glyph,.pip-pause-glyph{transition:opacity 160ms cubic-bezier(.23,1,.32,1),transform 180ms cubic-bezier(.23,1,.32,1)}
@media(prefers-reduced-motion:reduce){.pip-play-glyph,.pip-pause-glyph{transition:none!important}}
.bpx-player-ctrl-volume[data-bs-max-volume] .bui-track{position:relative;touch-action:none}.bpx-player-ctrl-volume[data-bs-max-volume] .bui-bar-normal{position:absolute!important;bottom:0!important;top:auto!important;transform:none!important;transform-origin:bottom}.bpx-player-ctrl-volume[data-bs-max-volume] .bui-thumb{position:absolute!important;top:auto!important;transform:translateY(50%)!important}.bpx-player-ctrl-volume[data-bs-dragging=true] .bpx-player-ctrl-volume-box{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
`;

const shellCss=`
.search-panel{border:0!important;top:calc(100% + 4px)!important;transform-origin:50% 0;box-shadow:0 16px 40px #0004,0 4px 12px #0002!important}
.settings-group{margin:0 0 12px;padding:0;border:0}.settings-group>summary{display:flex;align-items:center;gap:10px;padding:16px 0;cursor:pointer;color:var(--ink);font-size:15px;font-weight:600;list-style:none}.settings-group>summary::-webkit-details-marker{display:none}.settings-group>summary::after{content:"⌄";margin-left:auto;color:var(--muted);font-size:16px}.settings-group[open]>summary::after{transform:rotate(180deg)}.settings-group>summary small{font-size:11px;font-weight:400;color:var(--muted)}.settings-group .section-label{display:none}.settings-group .row{min-height:54px;padding-block:12px}

:host{--frost-base:rgba(35,35,40,.76);--frost-shadow:0 8px 28px #0003;--frost-tint:color-mix(in srgb,var(--accent) 9%,var(--frost-base));--frost-filter:blur(18px) saturate(125%)}
:host([data-theme=light]){--frost-base:rgba(255,255,255,.78);--frost-shadow:0 8px 28px #29293418}
#clipboard-video-prompt{position:fixed;right:24px;bottom:24px;width:310px;max-width:calc(100vw - 32px);padding:20px;border:0;border-radius:20px;background:var(--frost-base);background:var(--frost-tint);color:var(--ink);box-shadow:var(--frost-shadow);backdrop-filter:var(--frost-filter);-webkit-backdrop-filter:var(--frost-filter);pointer-events:auto;z-index:50}
#clipboard-video-prompt strong{font-size:15px}#clipboard-video-prompt p{margin:7px 0;color:var(--muted)}#clipboard-video-prompt small{color:var(--muted);overflow-wrap:anywhere}.clipboard-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.clipboard-actions button{border:0;border-radius:10px;padding:9px 14px;background:var(--frost-base);box-shadow:0 3px 10px #0001}.clipboard-actions [data-open]{color:var(--accent);font-weight:600}
:host([data-frost=true]) :is(button,.search,.account-card,.favorites-panel,.dialog,.upload,.messages,.favorites-toggle,.account){border-color:transparent!important;background:var(--frost-base)!important;background:var(--frost-tint)!important;background-image:none!important;box-shadow:var(--frost-shadow)!important;backdrop-filter:var(--frost-filter);-webkit-backdrop-filter:var(--frost-filter)}
:host([data-frost=true]) :is(button,.upload,.messages,.favorites,.chip){background:var(--frost-control,var(--frost-tint))!important;background-image:linear-gradient(140deg,#ffffff0a,transparent 70%)!important;border-color:transparent!important;backdrop-filter:var(--frost-filter);-webkit-backdrop-filter:var(--frost-filter)}
:host([data-frost=true]) #chrome .account-card :is(button,.account-switch){background:var(--frost-control,var(--frost-tint))!important;box-shadow:var(--frost-shadow)!important;backdrop-filter:var(--frost-filter)!important;-webkit-backdrop-filter:var(--frost-filter)!important}
:host([data-frost=true]) #chrome :is(.header-left,.header-right) > :is(button,a,input,.search),:host([data-frost=true]) #chrome :is(.nav-lane,.window-actions) :is(button,a),:host([data-frost=true]) #chrome .search input,:host([data-frost=true]) #chrome .account-wrap>.account,:host([data-frost=true]) #chrome .favorites-wrap>.favorites{border-color:transparent!important;background:transparent!important;background-image:none!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
:host([data-frost=true]) .lights .light.close{background:#ff5f57!important}:host([data-frost=true]) .lights .light.min{background:#febc2e!important}:host([data-frost=true]) .lights .light.max{background:#28c840!important}
:host([data-frost=true]) #chrome :is(.primary-nav a,.messages,.watchlater,.favorites,.account){color:var(--ink)}
:host([data-frost=true]) #chrome .search{border-radius:12px;background:#ffffff07!important;box-shadow:0 3px 14px #0000000a!important}
:host([data-frost=true]) #chrome :is(button,a):hover{background:#ffffff0a!important;border-radius:8px}
:host([data-frost=true]) #chrome{position:relative;background:transparent!important;box-shadow:0 8px 22px #00000008!important;isolation:isolate}
:host([data-frost=true]) #chrome::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(to bottom,#ffffff0c,transparent),linear-gradient(to bottom,var(--frost-tint) 0%,var(--frost-tint) 70%,transparent 100%);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:var(--frost-filter);mask-image:linear-gradient(#000 0%,#000e 65%,#000a 85%,transparent 100%);-webkit-mask-image:linear-gradient(#000 0%,#000e 65%,#000a 85%,transparent 100%)}
@media(prefers-reduced-transparency:reduce){:host{--frost-base:var(--panel);--frost-filter:none}}
/* Corner buttons float over the page, so they keep a hairline edge even when frosted. */
:host :is(.upload,#settings-trigger){border:1px solid #ffffff1f!important;box-shadow:0 1px 3px #0000004d,0 6px 18px #00000040!important}
:host([data-theme=light]) :is(.upload,#settings-trigger){border-color:#0000001c!important;box-shadow:0 1px 3px #0000001f,0 6px 18px #0000001a!important}

:host{all:initial;font-family:var(--font,BiliDouyin,"Microsoft YaHei UI",sans-serif);color:#f5f5f7;--accent:#fb7299;--bg:#202023;--panel:#27272b;--ink:#f5f5f7;--muted:#adadb7;--line:#ffffff12;--field:#333338;position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-size:14px}
:host{color-scheme:dark}:host([data-theme=light]){color-scheme:light;--bg:#f8f8fa;--panel:#fff;--ink:#25252a;--muted:#696973;--line:#00000012;--field:#ededf1;color:var(--ink)}
*{scrollbar-width:none!important}*::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}
*{box-sizing:border-box}button,input,select{font:inherit}button,a,input,select{pointer-events:auto}button{cursor:pointer;color:inherit}button:active{transform:scale(.97)}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}[hidden]{display:none!important}
svg{width:20px;height:20px;vertical-align:middle}a{color:inherit;text-decoration:none}
header{height:var(--bs-header-height,58px);display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:16px;padding:0 24px;background:var(--bg);color:var(--ink);border-bottom:1px solid var(--line);pointer-events:auto;user-select:none}
.video-home-top{position:absolute;left:0;top:50%;height:32px;width:64px;display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;font-size:14px;font-weight:600;line-height:20px;white-space:nowrap;opacity:0;transform:translate(-8px,-50%);pointer-events:none;transition:opacity 180ms cubic-bezier(.23,1,.32,1),transform 240ms cubic-bezier(.23,1,.32,1)}.video-home-top[hidden]{display:none}.video-home-top svg{display:block;width:20px;height:20px;flex:0 0 20px;color:var(--accent)}.header-left[data-video=true] .video-home-top{opacity:1;transform:translate(0,-50%);pointer-events:auto}.header-left>.lights,.header-left>.history-controls,.header-left>.back,.header-left>.nav-lane{transition:transform 240ms cubic-bezier(.23,1,.32,1);transform:translateX(0)}/* Everything after the home button moves over together, the back/forward pair included, so the traffic lights never land on it. */.header-left[data-video=true]>.lights,.header-left[data-video=true]>.history-controls,.header-left[data-video=true]>.back,.header-left[data-video=true]>.nav-lane{transform:translateX(80px)}.header-left[data-video=true]{padding-right:80px;--header-home-shift:80px}@media(max-width:800px){.header-left[data-video=true]>.back{display:none}.header-left[data-video=true]{grid-column:1/-1}.header-left[data-video=true]~.brand{visibility:hidden}}@media(prefers-reduced-motion:reduce){.video-home-top,.header-left>.lights,.header-left>.history-controls,.header-left>.back,.header-left>.nav-lane{transition:none!important}}

.header-left nav a{padding:0 10px;border-radius:10px;min-width:48px;display:inline-flex;align-items:center;justify-content:center;height:32px;line-height:20px}.header-left>.lights{height:32px}.header-left[data-controls=windows]>.lights{display:none!important}.header-left[data-controls=windows]>.nav-lane{order:0}.header-left[data-controls=windows]>.back{order:0;margin-left:0}.window-actions{display:flex;gap:3px;align-items:center;margin-left:12px;padding-left:12px;border-left:1px solid var(--line);flex-shrink:0}.window-actions button{width:28px;height:32px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent}.window-actions button:hover{background:var(--field)}.window-actions button:last-child:hover{background:#e55353;color:white}.window-actions svg{width:14px;height:14px;stroke:currentColor;stroke-width:1.5;fill:none;display:block}.header-left[data-controls=windows][data-video=true]>.history-controls,.header-left[data-controls=windows][data-video=true]>.back,.header-left[data-controls=windows][data-video=true]>.nav-lane{transform:translateX(0)}.header-left[data-controls=windows][data-video=true]{padding-right:0;--header-home-shift:0px}.header-left[data-controls=windows] .video-home-top{position:static;width:auto;gap:8px;padding-right:12px;border-right:1px solid var(--line);opacity:1;transform:none;pointer-events:auto}.header-left[data-controls=windows] .video-home-top svg{color:var(--accent)}.header-left[data-controls=windows][data-video=true] .primary-nav a[data-route=home]{display:none}.window-actions[hidden]{display:none!important}
.header-left{position:relative;grid-column:1;grid-row:1;display:flex;align-items:center;gap:16px;min-width:0;max-width:100%;height:100%}.header-right{grid-column:3;grid-row:1;display:flex;align-items:center;justify-content:flex-end;gap:14px;min-width:0;height:100%}
.back{flex-shrink:0}.nav-lane{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center;overflow:hidden}.nav-lane .primary-nav{transition:transform 240ms cubic-bezier(0.23,1,0.32,1);will-change:transform}
.category-links{position:absolute;left:0;top:0;height:100%;width:var(--category-space,0px);display:flex;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 16px),transparent);opacity:0;transform:translateX(-12px);transition:opacity 180ms cubic-bezier(.2,.8,.2,1),transform 240ms cubic-bezier(0.23,1,0.32,1);pointer-events:none}.category-links::-webkit-scrollbar{display:none}
.category-links a{flex-shrink:0;font-size:15px;white-space:nowrap;color:var(--muted);padding:6px 8px}.category-links a:hover,.category-links a:focus-visible{color:var(--accent)}.header-left[data-categories=true] .category-links{opacity:1;transform:translateX(0);pointer-events:auto}.back{transition:transform 180ms cubic-bezier(.2,.8,.2,1)}.header-left[data-categories=true] .back{color:var(--accent);transform:translateX(var(--header-home-shift,0px))}.nav-lane.instant .primary-nav,.nav-lane.instant .category-links{transition:none}
.window-actions button>svg{grid-area:1/1;transform-origin:50% 50%}.window-actions .motion-ghost{pointer-events:none}
.back svg{transform:rotate(0deg);transition:transform 491ms cubic-bezier(.34,1.56,.64,1)}.back[aria-expanded=true] svg{transform:rotate(180deg)}.back[data-instant=true] svg{transition:none}@media(prefers-reduced-motion:reduce){.back svg{transition:none!important}}
.lights{display:flex;align-items:center;flex:0 0 auto;gap:9px;margin-right:0}.lights .light{display:block;flex:0 0 14px;width:14px;height:14px;min-width:14px;border:0;border-radius:50%;padding:0;position:relative;line-height:0;appearance:none}.light.close{background:#ff5f57}.light.min{background:#febc2e}.light.max{background:#28c840}.lights .light svg{display:block;position:absolute;inset:3px;width:8px;height:8px;fill:none;stroke:#111a;stroke-width:1.4;stroke-linecap:round;opacity:1;pointer-events:none;transition:opacity 150ms cubic-bezier(.2,.8,.2,1)}.lights:hover svg,.lights .light:focus-visible svg{opacity:1}
.lights .light:before{content:'';position:absolute;inset:-5px;border-radius:50%}
.video-link{display:inline-flex;align-items:center;gap:6px;flex:0 1 210px;min-width:36px;max-width:210px;height:32px;padding:0 9px;margin-left:auto;overflow:hidden;border:1px solid color-mix(in srgb,var(--muted) 45%,transparent);border-radius:7px;background:transparent;color:var(--muted);text-align:left;cursor:pointer}.video-link svg{width:15px;height:15px;flex:0 0 15px}.video-link-text{font:12px/18px Consolas,"Cascadia Mono",monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.video-link:hover,.video-link[data-copied=true]{border-color:var(--accent);color:var(--accent)}.header-left[data-video=true]>.video-link{transform:translateX(80px)}.header-left[data-controls=windows][data-video=true]>.video-link{transform:none}.header-left:has(.video-link:not([hidden]))>.nav-lane{flex:0 1 auto}.header-left:has(.video-link:not([hidden])) .primary-nav{flex-shrink:0}.video-link:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(max-width:1050px){.video-link{flex-basis:100px;max-width:100px}}@media(max-width:600px){.video-link{flex-basis:36px;max-width:36px}.video-link-text{display:none}}
.header-left[data-categories=true]>.nav-lane{flex:1 1 0!important;min-width:72px}.header-left[data-categories=true]>.video-link{flex:0 0 36px;max-width:36px}.header-left[data-categories=true]>.video-link .video-link-text{display:none}.category-empty{font-size:12px;white-space:nowrap;background:transparent;border:0;padding:6px;color:var(--muted)}
@media(max-width:1050px){.header-left>.nav-lane{transform:none!important}.header-left[data-video=true]{padding-left:80px;padding-right:0}.header-left[data-video=true]>.lights,.header-left[data-video=true]>.history-controls,.header-left[data-video=true]>.back,.header-left[data-video=true]>.nav-lane,.header-left[data-video=true]>.video-link{transform:none}.header-left[data-controls=windows][data-video=true]{padding-left:0}}
.brand{position:relative;display:inline-flex;align-items:center;grid-column:2;grid-row:1;justify-self:center;font-family:BiliDouyin,sans-serif;font-size:16px;white-space:nowrap;letter-spacing:-.5px}.brand-leading{position:absolute;right:calc(100% + 12px);display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:0;width:max-content;overflow:hidden}.brand-leading .video-link{margin:0;flex:0 1 180px;max-width:180px;min-width:32px;transform:none!important}.brand-leading[data-compact=true] .video-link{flex:0 0 32px;max-width:32px;padding-inline:7px}.brand-leading[data-compact=true] .video-link-text{display:none}.video-link[data-mini=true]{flex:0 0 32px;max-width:32px;min-width:32px;padding:0;justify-content:center;border-radius:9px}.video-link[data-mini=true] .video-link-text{display:none}.video-link[data-mini=true] svg{width:16px;height:16px;flex-basis:16px;transition:transform .2s cubic-bezier(.32,.72,0,1)}.video-link[data-mini=true]:hover svg{transform:rotate(-12deg)}.video-link[data-mini=true][data-copied=true] svg{transform:scale(1.12)}.brand-leading[data-clock-hidden=true] .header-clock{display:none}.header-clock{flex:0 0 auto;color:var(--muted);font:13px/32px BiliDouyin,"Microsoft YaHei UI",sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.4px}.brand b{font-weight:400;color:var(--accent)}
nav{display:flex;flex-shrink:0;gap:4px;height:100%;align-items:center}nav a{font-size:14px;color:var(--muted);position:relative}nav a[aria-current=page]{color:var(--ink)}nav a[aria-current=page]:after{content:'';position:absolute;left:25%;right:25%;bottom:-10px;height:2px;border-radius:2px;background:var(--accent)}nav a:hover{color:var(--accent)}
.search{flex:1;margin-left:0;width:0;min-width:60px;max-width:380px;position:relative;transform-origin:100% 50%}.search[data-sized]{flex:0 0 auto;width:min(var(--search-width),40vw);max-width:none}/* A search box made wider than its half of the header takes the room from the left side; the logo moves over a little. */#chrome:has(.search[data-sized]){grid-template-columns:minmax(0,1fr) auto minmax(min-content,1fr)!important}.search-grip{position:absolute;left:-7px;top:0;bottom:0;width:12px;z-index:2;cursor:ew-resize;touch-action:none}.search-grip::after{content:'';position:absolute;left:5px;top:50%;width:3px;height:16px;margin-top:-8px;border-radius:2px;background:var(--muted);opacity:0;transform:scaleY(.6);transition:opacity .18s cubic-bezier(.2,.8,.2,1),transform .24s cubic-bezier(.32,.72,0,1),background .18s}/* The bar shows only on the grip itself and while dragging. */.search-grip:hover::after,.search[data-dragging] .search-grip::after{opacity:1;background:var(--accent);transform:scaleY(1.15)}.search[data-dragging]{cursor:ew-resize;user-select:none}.search[data-jelly]::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;box-sizing:border-box;background:var(--jelly-bg);border:var(--jelly-border);border-radius:var(--jelly-radius);box-shadow:var(--jelly-shadow);transform:var(--jelly,none);transform-origin:100% 50%;will-change:transform}.search[data-jelly] input{position:relative;z-index:1;background:transparent!important;border-color:transparent!important;box-shadow:none!important}.search[data-jelly]>:is(button,.search-quip,.search-grip){z-index:2}.search[data-jelly]>:is(input,.search-quip,.search-grip){translate:var(--jelly-edge,0) 0}.search[data-jelly] input{clip-path:inset(0 0 0 0)}.search-quip{position:absolute;left:14px;right:38px;top:0;bottom:0;display:none;pointer-events:none;overflow:hidden;color:var(--muted);font-size:12px}.search-quip[data-on]{display:block}.search-quip>span{position:absolute;left:0;right:0;top:50%;height:20px;margin-top:-10px;line-height:20px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;will-change:transform,opacity,filter}.search-quip>.sq-trail{opacity:0}.search-quip>.sq-line{opacity:0}.search-quip>.sq-plain{-webkit-mask-image:linear-gradient(90deg,transparent 0 33%,#000 66% 100%);mask-image:linear-gradient(90deg,transparent 0 33%,#000 66% 100%);-webkit-mask-size:300% 100%;mask-size:300% 100%;-webkit-mask-position:100% 0;mask-position:100% 0}.search input{width:100%;border:1px solid var(--line);background:var(--field);color:var(--ink);border-radius:9px;padding:9px 36px 9px 13px;outline-offset:1px;font-size:12px}.search > button{position:absolute;right:7px;top:50%;translate:0 -50%;border:0;background:none;color:var(--muted);padding:4px}
.account-wrap{position:relative;flex:0 0 auto}.account-card{position:absolute;right:0;top:calc(100% + 10px);width:290px;max-width:calc(100vw - 32px);padding:18px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 36px #0003;opacity:0;transform:translateY(-4px) scale(.98);transform-origin:top right;transition:opacity 180ms cubic-bezier(.23,1,.32,1),transform 180ms cubic-bezier(.23,1,.32,1);pointer-events:none}.account-card[data-open=true]{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}.account-card[hidden]{display:none}.account-identity{display:flex;align-items:center;gap:12px}.account-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}.account-banner{height:100px;margin:-18px -18px 14px;overflow:hidden;border-radius:13px 13px 0 0;background:var(--field)}.account-banner[hidden],.account-portrait[hidden],.account-vip-label[hidden]{display:none}.account-banner img,.account-banner video{display:block;width:100%;height:100%;object-fit:cover}.account-portrait{position:relative;width:52px;height:52px;flex-shrink:0}.account-portrait .account-face{width:52px;height:52px;border-radius:50%;object-fit:cover}.account-vip-label{font-size:10px;background:#fb729918;color:#fb7299;border-radius:4px;padding:2px 5px}.account-portrait .account-pendant{position:absolute;inset:-9px;width:70px;height:70px;object-fit:contain;pointer-events:none}.account-portrait .account-vip-badge{position:absolute;right:-1px;bottom:-1px;width:17px;height:17px;object-fit:contain}.account-name{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.account-level{color:var(--accent);font-size:12px;flex-shrink:0}.account-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px;text-align:center}.account-stats b{display:block;font-size:15px;overflow-wrap:anywhere}.account-stats span{font-size:12px;color:var(--muted)}.account-status{font-size:11px;color:var(--muted);line-height:1.5;margin:14px 0 0}@media(prefers-reduced-motion:reduce){.account-card{transition:none!important}}
.account{font-size:12px;color:var(--muted);white-space:nowrap;display:flex;align-items:center;justify-content:center;flex-shrink:0;min-width:30px;height:32px}.account{position:relative;overflow:visible!important}.account .account-face{width:30px;height:30px;display:block;border-radius:50%;object-fit:cover;border:1px solid var(--line)}.account[data-pending=true]{width:30px;min-width:30px;border-radius:50%;background:var(--field);border:1px solid var(--line);animation:bs-account-pending 1.4s ease-in-out infinite}.account[data-pending=true]::after{content:'';width:12px;height:12px;border-radius:50%;background:var(--muted);opacity:.45}@keyframes bs-account-pending{0%,100%{opacity:.55}50%{opacity:.9}}@media(prefers-reduced-motion:reduce){.account[data-pending=true]{animation:none}}.account .account-pendant{position:absolute;inset:-5px;width:40px;height:40px;object-fit:contain;pointer-events:none}.account .account-vip-badge{position:absolute;right:-2px;bottom:-2px;width:12px;height:12px;object-fit:contain;pointer-events:none}.upload{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;height:32px;padding:0 14px;border-radius:8px;background:#fb7299;color:#fff!important;font-size:13px;font-weight:500;line-height:20px}.upload:hover{background:#ff85a7}.upload:active{transform:scale(.97)}:is(.messages,.watchlater){position:relative;overflow:visible;display:flex;align-items:center;justify-content:center;width:32px;height:34px;flex-shrink:0;color:var(--muted);border-radius:8px}.watchlater[hidden]{display:none!important}.watchlater:hover{background:var(--field);color:var(--ink)}.watchlater :is(.wl-hour,.wl-minute){transform-box:view-box;transform-origin:12px 12.5px}@keyframes bs-watchlater-sweep{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.watchlater:hover :is(.wl-hour,.wl-minute){animation:none}}.message-unread{position:absolute;top:-2px;right:-6px;min-width:18px;height:18px;padding:0 4px;border:2px solid var(--bg);border-radius:10px;background:#f04452;color:#fff;font:600 10px/14px "Segoe UI",sans-serif;text-align:center;white-space:nowrap;pointer-events:none}.message-unread[data-kind=dot]{top:2px;right:1px;width:9px;min-width:9px;height:9px;padding:0;border-radius:50%}.messages:hover{background:var(--field);color:var(--ink)}.back{overflow:hidden;background:none;border:0;color:var(--muted);display:grid;place-items:center;width:26px;height:32px;line-height:0;padding:0}.back svg{display:block;width:20px;height:20px}
.search[aria-busy=true] > button svg{opacity:0}.search[aria-busy=true] > button:after{content:'';position:absolute;inset:6px;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:bs-search-spin .7s linear infinite}.search[aria-busy=true]:after{content:'';position:fixed;left:0;right:0;top:calc(var(--bs-header-height,58px) - 1px);height:2px;background:var(--accent);transform-origin:left;animation:bs-search-progress 1.2s ease-in-out infinite}
.search-panel{position:absolute;top:calc(100% + 9px);left:0;right:0;max-height:min(460px,calc(100vh - var(--bs-header-height,58px) - 24px));overflow:auto;overscroll-behavior:contain;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:12px;box-shadow:0 12px 32px #0004;pointer-events:auto;text-align:left}.search-panel[hidden]{display:none}.search-panel h2{position:relative;display:flex;justify-content:space-between;align-items:center;gap:8px;margin:5px 0 9px;font-size:12px;color:var(--muted);font-weight:500}.search-panel p{font-size:12px;color:var(--muted);margin:12px 2px}.search-history-chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}.search-history-chip{display:inline-flex;align-items:center;max-width:100%;min-width:0;background:var(--field);border-radius:6px}.search-history-chip .search-choice{flex:0 1 auto!important;max-width:200px;padding:6px 8px!important;font-size:12px!important}.search-history-chip .search-remove{width:22px!important;height:24px!important;font-size:16px!important}.search-row{display:flex;align-items:center;min-width:0;border-radius:7px}.search-panel button{border:0;background:none;color:var(--ink);font:inherit;cursor:pointer}.search-panel .search-choice{flex:1;min-width:0;text-align:left;padding:9px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;border-radius:7px}.search-choice:hover,.search-choice.selected{background:var(--field);color:var(--accent)}.search-panel .search-remove{flex:none;width:28px;height:28px;color:var(--muted);font-size:19px;border-radius:6px}.search-remove:hover,.search-panel .search-clear:hover{color:var(--accent);background:var(--field)}.search-panel .search-clear{padding:3px 5px;color:var(--muted);font-size:11px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@keyframes bs-search-spin{to{transform:rotate(360deg)}}@keyframes bs-search-progress{0%{transform:scaleX(.1)}70%{transform:scaleX(.85)}100%{transform:scaleX(1);opacity:.35}}
:host([data-web-full]) :is(#settings-trigger,.upload,#feed-roll,#page-top),:host([data-swipe]) :is(#settings-trigger,.upload,#feed-roll,#page-top){opacity:0!important;transform:translateY(8px)!important;pointer-events:none!important}:host([data-swipe]) #chrome{transition:translate .34s cubic-bezier(.23,1,.32,1),opacity .22s ease}:host([data-swipe][data-swipe-tuck]) #chrome{translate:0 calc(-100% - 12px);opacity:0;pointer-events:none}@media (prefers-reduced-motion:reduce){:host([data-swipe]) #chrome{transition:opacity .15s}:host([data-swipe][data-swipe-tuck]) #chrome{translate:none}}:is(#settings-trigger,.upload){transition:opacity .24s cubic-bezier(.32,.72,0,1),transform .24s cubic-bezier(.32,.72,0,1),scale 650ms linear(0,0.053,0.192,0.383,0.597,0.807,0.992,1.139,1.24,1.295,1.309,1.288,1.242,1.181,1.115,1.051,0.995,0.952,0.922,0.907,0.905,0.913,0.928,0.947,0.967,0.987,1.004,1.017,1.025,1.029,1.029,1.026,1.022,1.015,1.009,1.003,0.998,0.994,0.992,0.991,1)}#settings-trigger{position:fixed;bottom:22px;left:20px;width:44px;height:44px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:13px;box-shadow:0 4px 18px #0002}
#settings-trigger svg{width:23px;height:23px}#settings-trigger circle,#settings-trigger path{stroke:currentColor}
.scrim{position:fixed;inset:0;background:#08080c80;display:grid;place-items:center;padding:40px;pointer-events:auto}
.dialog{width:min(940px,100%);height:min(660px,calc(100vh - 80px));min-height:260px;min-width:min(360px,100%);max-width:100%;max-height:100%;resize:both;display:grid;grid-template-columns:calc(210px * var(--bs-settings-zoom,1)) 1fr;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:0 32px 100px #0006;overflow:hidden}#settings .dialog>:is(aside,main){zoom:var(--bs-settings-zoom,1)}
aside{border-right:1px solid var(--line);padding:28px 16px;display:flex;flex-direction:column;background:var(--panel);min-height:0;overflow:hidden}.eyebrow{font:10px/1.5 Consolas,monospace;letter-spacing:2px;color:var(--muted)}h1{font-size:21px;letter-spacing:-.5px;font-weight:400;margin:7px 10px 28px}.eyebrow{margin-left:10px}
.tabs{display:grid;gap:6px;flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;min-height:0;padding-right:4px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}.tabs button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:none;border-radius:9px;padding:11px 12px;color:var(--muted);font-size:13px}.tabs button[aria-selected=true]{background:var(--field);color:var(--ink)}.tabs button[aria-selected=true] svg{color:var(--accent)}.aside-footer{margin-top:auto;padding:10px;color:var(--muted);font-size:11px;line-height:1.8}.aside-footer b{display:block;color:var(--ink);font-weight:400;font-size:12px}
#settings-query{width:100%;min-width:0;box-sizing:border-box;background:var(--field);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:9px 10px;font:inherit;font-size:12px;margin-bottom:8px}#settings-query:focus-visible{outline:2px solid var(--accent);outline-offset:2px}#settings-search-status{margin:0 0 8px;color:var(--muted);font-size:11px;line-height:1.5}#settings-search-status:empty{display:none}.settings-matches{min-height:0;max-height:min(360px,40vh);overflow:auto;display:grid;gap:4px}.settings-egg span{color:var(--accent)}.settings-match{display:flex;flex-direction:column;gap:4px;text-align:left;padding:10px;border:0;border-radius:8px;background:transparent;color:var(--ink);font:inherit;font-size:12px;cursor:pointer;overflow-wrap:anywhere}.settings-match:hover,.settings-match:focus-visible{background:var(--field);outline:2px solid var(--accent);outline-offset:-2px}.settings-match small{color:var(--muted);font-size:10px}
main{padding:34px 36px;overflow:auto;position:relative;scrollbar-width:thin;scrollbar-color:var(--muted) var(--bg)}#dismiss{position:absolute;right:22px;top:22px;background:var(--field);color:var(--muted);border:0;width:28px;height:28px;border-radius:50%;font:20px/1 sans-serif}
h2{font-size:23px;font-weight:400;letter-spacing:-.5px;margin:0 0 6px}p.subtitle{font-size:12px;color:var(--muted);margin:0 0 25px;line-height:1.8;max-width:90%}.section-label{font-size:10px;color:var(--muted);letter-spacing:1px;margin:25px 0 11px}
.themes{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.theme{background:none;border:1px solid var(--line);border-radius:10px;padding:8px 8px 10px;text-align:left;font-size:12px}.theme[aria-pressed=true]{border-color:var(--accent)}.theme span{display:block;padding:9px 3px 0}.mini{height:68px;border-radius:5px;background:#fafafa;display:flex;padding:9px;gap:7px}.mini.dark{background:#151517}.mini.auto{background:linear-gradient(90deg,#fafafa 50%,#151517 50%)}.mini i{width:17%;background:#92929e35;border-radius:3px}.mini em{flex:1;background:#92929e25;border-radius:3px;margin-top:13px;position:relative}.mini em:before{content:'';position:absolute;top:-13px;left:0;width:40%;height:6px;border-radius:3px;background:#92929e35}
.row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:17px 0;border-bottom:1px solid var(--line);min-height:66px}.row label,.row .label{font-size:13px}.hint{display:block;font-size:11px;color:var(--muted);line-height:1.7;margin-top:4px;max-width:370px}.row select{background:var(--field);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:7px 10px;font-size:12px}
input[type=checkbox]{appearance:none;width:34px;height:20px;border-radius:12px;background:#77778070;position:relative;cursor:pointer;flex-shrink:0;margin:0}input[type=checkbox]:before{content:'';width:14px;height:14px;position:absolute;top:3px;left:3px;border-radius:50%;background:#fff;transition:transform 130ms ease-out}input[type=checkbox]:checked{background:var(--accent)}input[type=checkbox]:checked:before{transform:translateX(14px)}input[type=color]{width:34px;height:28px;cursor:pointer;border:1px solid var(--line);border-radius:6px;background:var(--field);padding:3px}
input[type=range]{width:130px;accent-color:var(--accent)}.range{display:flex;align-items:center;gap:10px}.range output{font:11px Consolas,monospace;width:36px;color:var(--muted)}
.preview{height:88px;background:#111113;border-radius:10px;margin-top:18px;position:relative;color:#fff;overflow:hidden}.preview:before{content:'进度条预览';position:absolute;left:18px;top:14px;font-size:11px;color:#c0c0c8}.track{height:var(--height);position:absolute;bottom:20px;left:18px;right:18px;background:#ffffff25;border-radius:var(--radius)}.buffer{position:absolute;inset:0 20% 0 0;background:#ffffff30;border-radius:inherit}.played{position:absolute;inset:0 42% 0 0;background:var(--progress);border-radius:inherit}.thumb{position:absolute;right:0;top:50%;width:10px;height:10px;background:var(--progress);border-radius:50%;transform:translate(50%,-50%)}
.note{padding:12px 15px;background:var(--field);border-radius:8px;color:var(--muted);font-size:11px;line-height:1.9;margin-top:20px}.note strong{color:var(--ink);font-weight:400}.link{background:none;border:0;padding:0;color:var(--accent);font-size:12px}.actions{display:flex;gap:20px;align-items:center;margin-top:22px}
#settings .dialog .compact-tab .row{min-height:46px;padding-block:8px;gap:14px}#settings .dialog .compact-tab .actions{margin:8px 0 4px}#settings .dialog .compact-tab .section-label{margin:16px 0 2px;padding-top:0}#settings .dialog .compact-tab #plugins44-panel .hint{margin:4px 0}.compact-tab h2{margin-bottom:6px}.compact-tab input:disabled{opacity:.55;cursor:not-allowed}#plugins44-panel .hint:empty{display:none}
#plugins44-panel .actions{margin-top:12px;flex-wrap:wrap;gap:14px}#plugins44-panel .primary{border:0;border-radius:9px;padding:8px 14px;background:var(--accent);color:#fff;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 3px 10px color-mix(in srgb,var(--accent) 28%,transparent)}#plugins44-panel .primary:active{scale:.97}#plugins44-panel .plugin-card{margin:12px 0;padding:2px 16px 12px;border-radius:12px;background:var(--field);box-shadow:0 2px 10px #0000000d}#plugins44-panel .plugin-card .row{border-bottom-color:color-mix(in srgb,var(--line) 70%,transparent)}#plugins44-panel .plugin-card .row:last-of-type{border-bottom:0}#plugins44-panel .plugin-setting{min-height:48px;padding-block:10px}#plugins44-panel .plugin-error{color:#e5484d}#plugins44-panel .link.danger{color:#e5484d}.status{font-size:11px;color:var(--muted)}#toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--panel);color:var(--ink);padding:13px 22px;border-radius:10px;border:1px solid var(--line);box-shadow:0 8px 32px #0003;max-width:80vw;font-size:12px;pointer-events:auto}
.chip-actions{display:flex;gap:18px;margin:0 0 16px}.chip-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.chip{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font-size:13px;cursor:pointer;background:var(--panel);pointer-events:auto}.chip input{margin:0;pointer-events:auto}.chip:has(input:checked){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
@media(max-width:1050px){.chip-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:1050px){nav{gap:14px}.header-left,.header-right{gap:12px}header{gap:12px}.dialog{grid-template-columns:calc(170px * var(--bs-settings-zoom,1)) 1fr}main{padding:30px 25px}}
@media(max-width:800px){header{grid-template-rows:58px 44px;column-gap:10px;row-gap:0;padding:0 16px}.header-right{grid-column:1/-1;grid-row:2}.header-left nav{flex-shrink:1;min-width:0;overflow-x:auto;scrollbar-width:none}.header-left nav a{flex-shrink:0}.search{max-width:none;min-width:96px}.lights{margin-right:0}}
@media(max-width:1050px){.nav-lane{overflow:visible}.category-links{position:fixed;top:var(--bs-header-height,58px);left:16px;width:calc(100vw - 32px);height:auto;max-height:220px;overflow:auto;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px 12px;padding:16px 20px;background:var(--bg);border:1px solid var(--line);border-radius:0 0 12px 12px;box-shadow:0 12px 28px #0003;mask-image:none;transform:translateY(-8px)}.header-left[data-categories=true] .category-links{transform:translateY(0)}.nav-lane .primary-nav{transform:none!important}}
@media(max-width:620px){.scrim{padding:12px}.dialog{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);height:calc(100vh - 24px);width:100%;min-height:0}.dialog aside{padding:10px;min-height:0}.dialog aside h1,.dialog aside .eyebrow,.dialog .aside-footer{display:none}.dialog .tabs{display:flex;overflow:auto;gap:4px}.dialog .tabs button{width:auto;white-space:nowrap;padding:10px;font-size:12px}.dialog main{padding:24px 18px}.dialog #dismiss{right:8px;top:4px;width:22px;height:22px}.chip-grid{grid-template-columns:repeat(2,minmax(0,1fr))}header{column-gap:8px;padding:0 12px}.header-left,.header-right{gap:8px}.lights{gap:6px}nav{gap:10px}nav a{font-size:12px}.search{min-width:70px}.account{max-width:38px;overflow:hidden;font-size:10px}}
.dialog[data-compact=true]{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.dialog[data-compact=true] aside{padding:10px;min-height:0}.dialog[data-compact=true] aside h1,.dialog[data-compact=true] aside .eyebrow,.dialog[data-compact=true] .aside-footer{display:none}.dialog[data-compact=true] .settings-matches{max-height:180px}.dialog[data-compact=true] .tabs{display:flex;overflow:auto;gap:4px}.dialog[data-compact=true] .tabs button{width:auto;white-space:nowrap;padding:10px;font-size:12px}.dialog[data-compact=true] main{padding:24px 18px}.dialog[data-compact=true] .chip-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-height:480px){.scrim{padding:12px}.dialog{height:calc(100vh - 24px);min-height:0}.dialog aside{padding:12px}.dialog .aside-footer,.dialog aside h1,.dialog aside .eyebrow{display:none}.dialog main{padding:24px 18px}}
.update-notice-layer{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.24);pointer-events:auto}.update-notice{width:min(460px,100%);padding:28px;border-radius:20px;border:1px solid var(--line);background:var(--bg);color:var(--ink);box-shadow:0 24px 70px #0003}.update-notice h2{font-size:21px;margin:0 0 16px}.update-notice ul{padding-left:20px;max-height:220px;overflow:auto;font-size:13px;line-height:1.8;color:var(--muted)}.update-notice .actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px;flex-wrap:wrap}.update-primary{border:0;border-radius:8px;background:var(--accent);color:white;padding:9px 16px;font-size:13px}.update-notice .link{border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:transparent}.fb-layer{position:fixed;inset:0;z-index:135;display:grid;place-items:center;padding:24px;background:rgba(10,10,14,.36);pointer-events:auto}.fb-card{width:min(520px,100%);max-height:calc(100vh - 48px);overflow:auto;box-sizing:border-box;display:grid;gap:16px;padding:24px 26px 22px;border-radius:20px;border:1px solid var(--line);background:var(--bg);color:var(--ink);box-shadow:0 30px 80px rgba(0,0,0,.28)}.fb-card header{display:flex;align-items:center;justify-content:space-between;padding:0!important;margin:0!important;border:0!important;background:none!important}.fb-card h2{margin:0;font-size:20px;font-weight:600;letter-spacing:-.2px}.fb-close{width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:var(--muted);cursor:pointer}.fb-close:hover{background:var(--field);color:var(--ink)}.fb-close svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}.fb-kinds{display:flex;gap:8px}.fb-kinds button{flex:1;height:36px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--ink);font:inherit;font-size:13px;cursor:pointer;transition:border-color .2s,background .2s,color .2s}.fb-kinds button:hover{background:var(--field)}.fb-kinds [aria-checked=true]{border-color:var(--accent);background:var(--field);color:var(--accent)}.fb-field{display:grid;gap:6px;font-size:13px}.fb-field>span{color:var(--muted)}.fb-field small{color:var(--muted);font-size:12px}.fb-count{justify-self:end}.fb-field textarea,.fb-field input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--field);color:var(--ink);font:inherit;font-size:14px;line-height:1.6;resize:vertical;outline:0;transition:border-color .2s}.fb-field textarea{min-height:120px}.fb-field :is(textarea,input):focus{border-color:var(--accent)}.fb-check{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--muted);cursor:pointer}.fb-check input{accent-color:var(--accent);margin-top:2px}.fb-status{margin:0;min-height:18px;font-size:13px;color:var(--muted)}.fb-status[data-tone=error]{color:#e5484d}.fb-card footer{display:flex;justify-content:flex-end;gap:10px}.fb-card footer button{height:38px;padding:0 18px;border-radius:10px;font:inherit;font-size:14px;cursor:pointer;transition:transform .2s cubic-bezier(.32,.72,0,1),opacity .2s}.fb-ghost{border:1px solid var(--line);background:transparent;color:var(--ink)}.fb-primary{border:0;background:var(--accent);color:#fff;font-weight:500}.fb-primary:disabled{opacity:.6;cursor:default}.fb-card footer button:active{transform:scale(.97)}.fb-card :is(button,input,textarea):focus-visible{outline:2px solid var(--accent);outline-offset:2px}@media (prefers-reduced-motion:reduce){.fb-card *{transition:none!important}}.wn-layer{position:fixed;inset:0;z-index:138;display:grid;place-items:center;padding:24px;background:rgba(10,10,14,.42);pointer-events:auto}.wn-card{width:min(720px,100%);max-height:calc(100vh - 48px);overflow:auto;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr);gap:16px;padding:22px 24px 20px;border-radius:22px;border:1px solid var(--line);background:var(--bg);color:var(--ink);box-shadow:0 30px 80px rgba(0,0,0,.3)}.wn-card header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:0!important;margin:0!important;border:0!important;background:none!important}.wn-eyebrow{margin:0 0 4px;font-size:12px;color:var(--accent);font-weight:600;letter-spacing:.3px}.wn-card h2{margin:0;font-size:22px;font-weight:650;letter-spacing:-.3px}.wn-close{flex:none;width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:var(--muted);cursor:pointer}.wn-close:hover{background:var(--field);color:var(--ink)}.wn-close svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}.wn-stage{display:grid;grid-template-columns:minmax(0,1fr)}.wn-slide{grid-area:1/1;display:grid;grid-template-columns:minmax(0,1fr);min-width:0;gap:10px;align-content:start;visibility:hidden}.wn-slide.wn-show{visibility:visible}.wn-list{aspect-ratio:16/9;box-sizing:border-box;margin:0;padding:22px 26px;list-style:none;display:flex;flex-direction:column;justify-content:center;gap:14px;border-radius:14px;background:var(--field);border:1px solid var(--line)}.wn-list li{position:relative;padding-left:30px;font-size:14px;line-height:1.5;color:var(--ink)}.wn-list li::before{content:'';position:absolute;left:0;top:2px;width:18px;height:18px;border-radius:50%;background:color-mix(in srgb,var(--accent) 18%,transparent)}.wn-list li::after{content:'';position:absolute;left:6px;top:6px;width:6px;height:9px;border:solid var(--accent);border-width:0 2px 2px 0;transform:rotate(45deg)}.wn-media,.wn-list{width:min(100%,calc((100vh - 330px) * 16 / 9));margin-inline:auto}.wn-media{aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:var(--field);border:1px solid var(--line)}.wn-media :is(img,video){width:100%;height:100%;object-fit:cover;display:block}.wn-slide h3{margin:6px 0 0;font-size:16px;font-weight:600}.wn-slide p{margin:0;font-size:13.5px;line-height:1.65;color:var(--muted)}.wn-card footer{display:flex;align-items:center;gap:10px}.wn-gap{flex:1}.wn-dots{display:flex;gap:6px}.wn-dots button{width:7px;height:7px;padding:0;border:0;border-radius:4px;background:var(--line);cursor:pointer;transition:width .3s cubic-bezier(.32,.72,0,1),background .2s}.wn-dots [aria-selected=true]{width:20px;background:var(--accent)}.wn-card footer :is(.wn-ghost,.wn-primary){height:36px;padding:0 18px;border-radius:10px;font:inherit;font-size:14px;cursor:pointer;transition:transform .2s cubic-bezier(.32,.72,0,1)}.wn-ghost{border:1px solid var(--line);background:transparent;color:var(--ink)}.share-card{width:min(520px,100%)}.lang-card{width:min(620px,100%)}.lang-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lang-grid button{height:46px;padding:0 16px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:15px;text-align:left;cursor:pointer;transition:background .18s,border-color .18s}.lang-grid button:hover{background:var(--field)}.lang-grid button[aria-checked=true]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--ink);font-weight:600}.share-lead{margin:0;color:var(--muted);font-size:14px;line-height:1.7}.share-text{margin:0;padding:12px 14px;border-radius:12px;background:var(--field);color:var(--ink);font-size:13px;line-height:1.7;user-select:text;word-break:break-all}.share-card [data-share=copy][data-done]{background:#2bb673}.news-text{white-space:pre-line;color:var(--ink)}.wn-primary{border:0;background:var(--accent);color:#fff;font-weight:500}.wn-card footer button:active{transform:scale(.97)}.wn-card :is(button):focus-visible{outline:2px solid var(--accent);outline-offset:2px}.cg-layer{position:fixed;inset:0;z-index:136;pointer-events:auto;background:rgba(6,6,10,.18);font:12px/1.35 'JetBrains Mono','Cascadia Mono',Consolas,'Microsoft YaHei UI',monospace;color:#e8e8ee}.cg-panel{position:absolute;width:190px;border-radius:6px;overflow:hidden;background:rgba(16,16,22,.9);border:1px solid rgba(255,255,255,.06);box-shadow:0 10px 30px rgba(0,0,0,.45);backdrop-filter:blur(10px)}.cg-title{display:flex;align-items:center;justify-content:space-between;height:26px;padding:0 10px;background:var(--accent);color:#fff;font-weight:700;letter-spacing:.3px;cursor:grab;user-select:none;margin:0!important;border:0!important}.cg-panel[data-dragging] .cg-title{cursor:grabbing}.cg-title small{opacity:.75;font-weight:500}.cg-body{max-height:min(60vh,520px);overflow:auto;scrollbar-width:thin}.cg-panel[data-folded] .cg-body{display:none}.cg-mod{position:relative;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:24px;padding:3px 10px;cursor:pointer;user-select:none;outline:0;transition:background .12s,color .12s}.cg-mod:hover,.cg-mod:focus-visible{background:rgba(255,255,255,.06)}.cg-mod[data-on=true]{color:var(--accent)}.cg-mod[data-on=true]::before{content:'';position:absolute;left:0;top:4px;bottom:4px;width:2px;border-radius:0 2px 2px 0;background:var(--accent)}.cg-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cg-state{flex:none;color:#9a9aa6;font-size:11px}.cg-mod[data-open]::after{content:'';width:5px;height:5px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(45deg);margin:-3px 0 0 2px;opacity:.6}.cg-detail{padding:4px 10px 8px 14px;background:rgba(255,255,255,.03);border-left:2px solid rgba(255,255,255,.08)}.cg-detail p{margin:2px 0 6px;color:#a6a6b2;font-size:11px;white-space:normal}.cg-options{display:flex;flex-wrap:wrap;gap:4px}.cg-options button{padding:2px 7px;border:1px solid rgba(255,255,255,.12);border-radius:4px;background:transparent;color:#d6d6de;font:inherit;font-size:11px;cursor:pointer}.cg-options [aria-pressed=true]{border-color:var(--accent);color:var(--accent)}.cg-range{display:flex;align-items:center;gap:6px}.cg-range input{flex:1;min-width:0;accent-color:var(--accent)}.cg-range output{flex:none;color:#d6d6de;font-size:11px}.cg-hint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);margin:0;padding:4px 10px;border-radius:4px;background:rgba(16,16,22,.85);color:#9a9aa6;font-size:11px;white-space:nowrap;pointer-events:none}.cg-classic{position:absolute;right:16px;bottom:12px;padding:4px 10px;border:1px solid rgba(255,255,255,.14);border-radius:4px;background:rgba(16,16,22,.85);color:#d6d6de;font:inherit;cursor:pointer}.cg-classic:hover{border-color:var(--accent);color:var(--accent)}.ob-layer{position:fixed;inset:0;z-index:140;display:grid;place-items:center;padding:24px;background:rgba(10,10,14,.32);pointer-events:auto}@supports (backdrop-filter:blur(1px)){.ob-layer{backdrop-filter:blur(26px) saturate(1.15)}}.ob-card{position:relative;width:min(940px,100%);height:min(600px,calc(100vh - 48px));display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:20px;padding:28px 32px 24px;border-radius:20px;border:1px solid var(--line);background:var(--bg);color:var(--ink);box-shadow:0 30px 80px rgba(0,0,0,.3);overflow:hidden;will-change:transform}.ob-progress{display:flex;gap:6px}.ob-progress i{height:4px;width:22px;border-radius:2px;background:var(--line);transition:background .36s cubic-bezier(.2,.8,.2,1),width .42s cubic-bezier(.32,.72,0,1)}.ob-progress i.ob-done{background:var(--accent);width:34px}.ob-stage{position:relative;min-height:0}.ob-step{position:absolute;inset:0;display:none;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:40px;align-items:center;outline:0}.ob-step.ob-show{display:grid}.ob-step.ob-final{grid-template-columns:1fr}.ob-copy{min-width:0}.ob-center{text-align:center;justify-self:center;max-width:460px}.ob-eyebrow{margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:.06em;color:var(--accent)}.ob-card h2{margin:0 0 12px;font-size:30px;line-height:1.2;font-weight:700;letter-spacing:-.01em}.ob-body{margin:0;font-size:15px;line-height:1.7;color:var(--muted);max-width:30em}.ob-points{margin:20px 0 0;padding:0;list-style:none;display:grid;gap:10px}.ob-points li{position:relative;padding-left:18px;font-size:14px;line-height:1.5}.ob-points li::before{content:'';position:absolute;left:0;top:.55em;width:7px;height:7px;border-radius:50%;background:var(--accent)}.ob-visual{min-width:0}.ob-gallery{margin:0;display:grid;gap:10px}.ob-frame{position:relative;aspect-ratio:16/10;border-radius:12px;border:1px solid var(--line);overflow:hidden;background:var(--field)}.ob-frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top left;opacity:0;transform:scale(1.03);transition:opacity .7s cubic-bezier(.2,.8,.2,1),transform 5s linear}.ob-frame img.ob-on{opacity:1;transform:none}.ob-gallery figcaption{display:flex;gap:10px;align-items:baseline;font-size:13px;min-height:20px}.ob-gallery figcaption b{font-weight:600}.ob-gallery figcaption span{color:var(--muted)}.ob-dots{display:flex;gap:6px}.ob-dots button{width:8px;height:8px;padding:0;border:0;border-radius:4px;background:var(--line);cursor:pointer;transition:width .36s cubic-bezier(.32,.72,0,1),background .2s}.ob-dots button[aria-selected=true]{width:22px;background:var(--accent)}.ob-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.ob-choices.ob-two{grid-template-columns:repeat(2,minmax(0,1fr))}.ob-card .ob-choice{display:grid;justify-items:center;gap:12px;padding:14px;border:1.5px solid var(--line);border-radius:16px;background:transparent;color:var(--ink);font:inherit;cursor:pointer;scale:none!important;transition:border-color .24s,background .24s,transform .24s cubic-bezier(.32,.72,0,1)}.ob-card .ob-choice:hover{background:var(--field)}.ob-card .ob-choice:active{transform:scale(.98)}.ob-card .ob-choice[aria-pressed=true]{border-color:var(--accent);background:var(--field)}.ob-choice-label{font-size:14px;font-weight:500}.ob-mock{position:relative;display:block;width:100%;aspect-ratio:4/3;border-radius:10px;border:1px solid var(--line);overflow:hidden}.ob-mock b{position:absolute;inset:0 0 auto;height:18%}.ob-mock em{position:absolute;top:28%;width:38%;height:28%;border-radius:4px}.ob-mock em+em{left:auto;right:8%}.ob-mock em:first-of-type{left:8%}.ob-light{background:#f4f5f7}.ob-light b{background:#fff}.ob-light em{background:#e4e6ea}.ob-dark{background:#17171a}.ob-dark b{background:#232327}.ob-dark em{background:#2c2c32}.ob-system{background:linear-gradient(90deg,#f4f5f7 50%,#17171a 50%)}.ob-system b{background:linear-gradient(90deg,#fff 50%,#232327 50%)}.ob-system em:first-of-type{background:#e4e6ea}.ob-system em+em{background:#2c2c32}.ob-accent-stage{display:grid;gap:22px}.ob-accent-preview{display:grid;gap:18px;padding:22px;border-radius:16px;border:1px solid var(--line);background:var(--field)}.ob-tabs{display:flex;gap:22px;font-size:15px;color:var(--muted)}.ob-tab-on{color:var(--ink);font-weight:600;box-shadow:inset 0 -3px 0 var(--accent);padding-bottom:6px;transition:box-shadow .3s}.ob-bar{height:6px;border-radius:3px;background:var(--line);overflow:hidden}.ob-bar i{display:block;width:62%;height:100%;border-radius:3px;background:var(--accent);transition:background .3s}.ob-preview-row{display:flex;align-items:center;justify-content:space-between}.ob-fake-button{padding:8px 18px;border-radius:9px;background:var(--accent);color:#fff;font-size:13px;transition:background .3s}.ob-fake-switch{position:relative;width:44px;height:26px;border-radius:13px;background:var(--accent);transition:background .3s}.ob-fake-switch i{position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:#fff}.ob-swatches{display:flex;gap:12px;flex-wrap:wrap}.ob-card .ob-swatch{width:36px;height:36px;padding:0;border-radius:50%;border:0;background:var(--c);cursor:pointer;scale:none!important;box-shadow:0 0 0 3px var(--bg),0 0 0 3px transparent;transition:box-shadow .24s,transform .24s cubic-bezier(.32,.72,0,1)}.ob-card .ob-swatch:hover{transform:scale(1.08)}.ob-card .ob-swatch[aria-pressed=true]{box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--c)}.ob-sample{display:grid;place-items:center;width:100%;aspect-ratio:4/3;border-radius:10px;background:var(--field);font-style:normal;font-size:26px;line-height:1.35;font-weight:700}.ob-demo{display:grid;place-items:center;width:100%;aspect-ratio:4/3;border-radius:10px;background:var(--field);font-style:normal;font-size:14px}.ob-demo span{padding:9px 22px;border-radius:10px;background:var(--accent);color:#fff;font-size:14px;font-weight:500}.ob-choice:hover .ob-demo-bounce span{animation:ob-bounce .52s cubic-bezier(.3,1.5,.5,1)}@keyframes ob-bounce{0%{transform:scale(1)}40%{transform:scale(1.06)}70%{transform:scale(.98)}100%{transform:scale(1)}}.ob-zoom-stage{display:grid;gap:22px}.ob-zoom-preview{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-radius:16px;border:1px solid var(--line);background:var(--field);zoom:var(--z,1)}.ob-zoom-preview b{display:block;font-size:14px}.ob-zoom-preview small{display:block;margin-top:3px;font-size:12px;color:var(--muted)}.ob-zoom-preview .ob-fake-switch{flex:none}.ob-range{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--muted)}.ob-range input{flex:1;accent-color:var(--accent)}.ob-range output{width:44px;text-align:right;font-variant-numeric:tabular-nums}.ob-chips{display:flex;flex-wrap:wrap;gap:10px;align-content:center}.ob-card .ob-chip{height:40px;padding:0 16px;border-radius:20px;border:1.5px solid var(--line);background:transparent;color:var(--muted);font:inherit;font-size:14px;cursor:pointer;scale:none!important;transition:border-color .24s,background .24s,color .24s}.ob-card .ob-chip[aria-pressed=true]{border-color:var(--accent);color:var(--ink);background:var(--field)}.ob-choices.ob-four{grid-template-columns:repeat(4,minmax(0,1fr))}.ob-grid{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:4px;width:100%;aspect-ratio:4/3;padding:10px;box-sizing:border-box;border-radius:10px;background:var(--field)}.ob-grid b{border-radius:3px;background:var(--line)}.ob-page-preview{display:grid;gap:6px;padding:18px 20px;border-radius:16px;border:1px solid var(--line);background:var(--field);zoom:var(--p,1)}.ob-page-preview b{font-size:15px}.ob-page-preview small{font-size:12px;color:var(--muted)}.ob-icon{display:grid;place-items:center;width:100%;aspect-ratio:4/3;border-radius:10px;background:var(--field);font-style:normal;font-size:34px;color:var(--accent)}.ob-icon.ob-muted{color:var(--muted)}.ob-wave{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;aspect-ratio:4/3;border-radius:10px;background:var(--field)}.ob-wave b{width:10px;border-radius:5px;background:var(--accent)}.ob-wave b:nth-child(1){height:20%}.ob-wave b:nth-child(2){height:70%}.ob-wave b:nth-child(3){height:30%}.ob-wave b:nth-child(4){height:85%}.ob-wave b:nth-child(5){height:15%}.ob-wave.ob-even b{height:42%!important}.ob-check{width:68px;height:68px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;background:var(--accent)}.ob-check svg{width:34px;height:34px;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;stroke-dashoffset:24}.ob-final.ob-show .ob-check svg{animation:ob-draw .6s .3s cubic-bezier(.32,.72,0,1) forwards}@keyframes ob-draw{to{stroke-dashoffset:0}}.ob-foot{display:flex;align-items:center;gap:10px}.ob-gap{flex:1}.ob-card .ob-primary,.ob-card .ob-ghost{height:40px;padding:0 20px;border-radius:10px;font:inherit;font-size:14px;font-weight:500;cursor:pointer;scale:none!important;transition:background .2s,transform .16s cubic-bezier(.2,.8,.2,1)}.ob-card .ob-primary{border:0;background:var(--accent);color:#fff}.ob-card .ob-ghost{border:1px solid var(--line);background:transparent;color:var(--ink)}.ob-card .ob-primary:active,.ob-card .ob-ghost:active{transform:scale(.97)}.ob-card :is(button,input):focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media (max-width:760px){.ob-card{padding:22px 20px 18px;height:calc(100vh - 32px)}.ob-step{grid-template-columns:1fr;align-content:start;overflow:auto;gap:20px}.ob-card h2{font-size:24px}.ob-choices{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (prefers-reduced-motion:reduce){.ob-frame img,.ob-progress i,.ob-dots button,.ob-choice,.ob-swatch{transition:none}.ob-check svg{animation:none!important;stroke-dashoffset:0}.ob-choice:hover .ob-demo-bounce span{animation:none}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
.dialog main{--settings-close-top:34px;--settings-close-right:36px}.dialog #dismiss{top:calc(var(--settings-close-top) + .8px);right:var(--settings-close-right);width:28px;height:28px;padding:0;display:grid;place-items:center;line-height:0}.dialog #dismiss svg{display:block;width:16px;height:16px}
@media(max-width:1050px){.dialog main{--settings-close-top:30px;--settings-close-right:25px}}@media(max-width:620px),(max-height:480px){.dialog main{--settings-close-top:24px;--settings-close-right:18px}}.dialog[data-compact=true] main{--settings-close-top:24px;--settings-close-right:18px}
/* Compact, aligned header actions; account management uses an unboxed symbol. */
.header-right{gap:10px}.header-right :is(.favorites-wrap,.account-wrap){height:36px;display:flex;align-items:center;flex:0 0 36px}.header-right :is(.favorites,.messages,.watchlater,.account){width:36px;height:36px;min-width:36px;display:grid;place-items:center}.header-right :is(.favorites,.messages,.watchlater){padding:0;line-height:0}.header-right :is(.favorites,.messages,.watchlater)>svg{display:block;width:22px;height:22px;flex:none}.header-right .account .account-face{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:30px;height:30px}.header-right .account .account-pendant{inset:auto;left:50%;top:50%;transform:translate(-50%,-50%);width:40px;height:40px}.header-right .account .account-vip-badge{right:0;bottom:0}
:host([data-frost]) #chrome #account-card .account-switch{background:transparent!important;background-image:none!important;box-shadow:none!important;border:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;color:var(--muted)}:host([data-frost]) #chrome #account-card .account-switch:hover{color:var(--accent)}
/* Soft, borderless surfaces; transparent borders retain the existing control geometry. */
:host{--elevation-control:0 3px 10px #0003,0 0 9px #ffffff06;--elevation-panel:0 18px 48px #0005,0 0 22px #ffffff04;--surface-sheen:linear-gradient(#ffffff03,#ffffff03)}
:host([data-theme=light]){--elevation-control:0 3px 12px #2020270c,0 0 8px #ffffff80;--elevation-panel:0 18px 48px #20202720,0 0 20px #ffffff70;--surface-sheen:linear-gradient(#ffffff04,#ffffff04)}
:is(.dialog,.account-card,.favorites-panel,.search-panel,.account-manager){border-color:transparent!important}
:is(.dialog,.account-card,.favorites-panel,.search-panel){box-shadow:var(--elevation-panel)!important;background-image:var(--surface-sheen)}
:is(#settings-trigger,.upload,.account-switch,.account-manager-actions button,.video-link,.chip,.theme,.search input,#settings-query,.dialog select,.favorites-retry,.favorites-more){border-color:transparent!important;box-shadow:var(--elevation-control)!important;background-image:var(--surface-sheen)}
:is(.dialog aside,.favorites-folders,.favorites-heading,.account-manager,.dialog .row,.dialog .section-label,.window-actions){border-color:transparent!important}
.theme[aria-pressed=true] span{color:var(--accent);font-weight:600}
#chrome{border-bottom-color:transparent!important;box-shadow:0 5px 16px #00000010}

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
// Text from outside the client (proxy node names and messages from a subscription) must never become markup.
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
    const option=document.createElement('option');option.value='';option.textContent='暂无节点';select.append(option);
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
const tabs={downloads:['下载任务','plugins'],blocklist:['拉黑管理','plugins'],community:['观看记录','sparkles'],categories:['分区选择','progress'],network:['客户端代理','plugins'],appearance:['个性化','appearance'],clean:['页面净化','clean'],play:['播放与画质','sparkles'],plugins:['扩展插件','plugins'],feedback:['反馈','sparkles'],about:['关于与更新','plugins']};
if(NATIVE_PLATFORM!=='windows'){for(const tab of ['downloads','network','plugins'])delete tabs[tab];}

const toggle=(key,title,hint)=>`<div class="row"><label for="pref-${key}">${title}${hint?`<span class="hint">${hint}</span>`:''}</label><input id="pref-${key}" data-pref="${key}" type="checkbox" ${PREFS[key]?'checked':''}></div>`;
const range=(key,title,min,max,unit)=>`<div class="row"><label for="pref-${key}">${title}</label><div class="range"><input id="pref-${key}" type="range" data-pref="${key}" min="${min}" max="${max}" value="${PREFS[key]}"><output>${PREFS[key]}${unit}</output></div></div>`;
let clientUpdate={status:'idle',message:'尚未检查更新'};
let updateNoticeVersion='';
function confirmFullscreenMotion(input){
  if(!shadow||$('#motion-confirm',shadow))return;
  const previous=input||shadow.activeElement,layer=document.createElement('div');layer.id='motion-confirm';layer.className='update-notice-layer';
  layer.innerHTML='<section class="update-notice" role="alertdialog" aria-modal="true" aria-labelledby="motion-confirm-title" aria-describedby="motion-confirm-description"><h2 id="motion-confirm-title">开启实验性全屏动画？</h2><p id="motion-confirm-description">进出全屏时，视频会从原来的位置放大到全屏、退出时缩回原位。这个功能仍在测试：在部分电脑上或快速切换时，可能出现闪烁、画面跳动或动画不触发。随时可以在这里关闭。</p><div class="actions"><button type="button" id="motion-confirm-cancel" class="link">取消</button><button type="button" id="motion-confirm-apply" class="update-primary">仍然开启</button></div></section>';
  const close=()=>{layer.remove();previous?.focus?.();};
  $('#motion-confirm-cancel',layer).onclick=close;
  $('#motion-confirm-apply',layer).onclick=()=>{if(!layer.isConnected)return;close();update({experimentalFullscreenMotion:true});if(input)input.checked=true;};
  layer.addEventListener('click',event=>{if(event.target===layer)close();});
  layer.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    if(event.key==='Tab'){event.preventDefault();event.stopPropagation();const buttons=$$('button',layer),i=buttons.indexOf(shadow.activeElement);buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}
  });
  shadow.append(layer);$('#motion-confirm-cancel',layer).focus();
}
function showResetConfirmation(){
  if(!shadow||$('#reset-confirm',shadow))return;
  const previous=$('#reset',shadow)||shadow.activeElement,layer=document.createElement('div');layer.id='reset-confirm';layer.className='update-notice-layer';
  layer.innerHTML='<section class="update-notice" role="alertdialog" aria-modal="true" aria-labelledby="reset-confirm-title" aria-describedby="reset-confirm-description"><h2 id="reset-confirm-title">恢复默认设置？</h2><p id="reset-confirm-description">将重置主题、布局与播放偏好。</p><div class="actions"><button type="button" id="reset-confirm-cancel" class="link">取消</button><button type="button" id="reset-confirm-apply" class="update-primary">恢复默认</button></div></section>';
  const close=()=>{layer.remove();previous?.focus?.();};
  $('#reset-confirm-cancel',layer).onclick=close;
  $('#reset-confirm-apply',layer).onclick=()=>{if(!layer.isConnected)return;close();update({...DEFAULTS,categorySelection:DEFAULTS.categorySelection.slice(),onboardingSeen:true,whatsNewSeen:PREFS.whatsNewSeen});window.BiliCommunity44?.resetSettings();toast('已恢复默认设置');};
  layer.addEventListener('click',event=>{if(event.target===layer)close();});
  layer.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    if(event.key==='Tab'){event.preventDefault();event.stopPropagation();const buttons=$$('button',layer),i=buttons.indexOf(shadow.activeElement);buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}
  });
  shadow.append(layer);$('#reset-confirm-cancel',layer).focus();
}
function showUpdateNotice(value){
  // Under the header layer the notice opens there, once; the page's hidden copy of the client stays quiet.
  if(CONTENT_VIEW||!shadow||!value.prompt||!value.available||value.ignored||value.required||value.version===updateNoticeVersion||$('#update-notice',shadow))return;
  updateNoticeVersion=value.version;const previous=shadow.activeElement,layer=document.createElement('div');layer.className='update-notice-layer';layer.id='update-notice';
  const dialog=document.createElement('section');dialog.className='update-notice';dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','update-notice-title');
  const title=document.createElement('h2');title.id='update-notice-title';title.textContent='发现新版本 '+String(value.version||'');
  const notes=document.createElement('ul');for(const line of value.changelog||[]){const li=document.createElement('li');li.textContent=String(line);notes.append(li);}
  const actions=document.createElement('div');actions.className='actions';const close=()=>{layer.remove();previous?.focus?.();};
  const action=(label,kind,run)=>{const b=document.createElement('button');b.type='button';b.className=kind;b.textContent=label;b.onclick=run;actions.append(b);return b;};
  action('稍后','link',close);action('忽略此版本','link',()=>{native('updates',{action:'ignore'});close();});
  const primary=action(value.ready?'安装并重启':'下载更新','update-primary',()=>{close();currentTab='about';openSettings();native('updates',{action:value.ready?'install':'download'});});
  dialog.append(title,notes,actions);layer.append(dialog);shadow.append(layer);primary.focus();
  layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if(e.key==='Tab'){const buttons=$$('button',layer),i=buttons.indexOf(shadow.activeElement),next=(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length;e.preventDefault();buttons[next].focus();}});
  native('updates',{action:'notice-shown',version:value.version});
}
// ---- Welcome tour: a showcase, then one setting per page with a live preview, then the way into Personalization.
// Shown once: a first install gets "欢迎", an update from an older version gets "大翻新" (and may keep everything as it is).
const ONBOARDING_SHOTS=[
  ['current-home.webp','全新的首页','顶栏、分区和推荐流重新设计，切换和展开都更跟手'],
  ['player.webp','专注的视频页','播放器、弹幕和推荐排得更清楚，看视频不被打扰'],
  ['pip.webp','画中画','缩成小窗边看边做别的事，弹幕也一起跟着'],
  ['customize.webp','可以自己定的外观','主题、强调色、字号、顶栏项目，都能按你的习惯来']
];
const ONBOARDING_ACCENTS=[['#fb7299','B站粉'],['#00aeec','天蓝'],['#20b486','青绿'],['#8b6cf5','藕紫'],['#ff8a3d','橘橙'],['#e5484d','朱红']];
let onboardingTimer,onboardingTries=0;
function onboardingAsset(name){return (typeof RUNTIME!=='undefined'&&['macos','linux'].includes(RUNTIME.platform)?'bili-space://assets/':'https://bili-space.local/')+'onboarding/'+name;}
// While the welcome tour is open the page behind it is blurred and dimmed (the tour lives in the header view, which
// cannot blur another view); closing it lets the blur go slowly so the configured client comes into view.
function tourBackdrop(on){if(CHROME_VIEW)return;const html=document.documentElement;if(on){html.classList.add('bs-tour-blur');return;}
  if(!html.classList.contains('bs-tour-blur'))return;html.classList.remove('bs-tour-blur');
  // An explicit animation, so the blur always runs down rather than snapping off.
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&document.body)document.body.animate([{filter:'blur(26px) saturate(1.15) brightness(.78)'},{filter:'blur(0px) saturate(1) brightness(1)'}],{duration:1100,easing:'cubic-bezier(.32,.72,0,1)'});}
function scheduleOnboarding(delay=900){
  if(PREFS.onboardingSeen||CONTENT_VIEW||typeof RUNTIME==='undefined')return;
  clearTimeout(onboardingTimer);onboardingTimer=setTimeout(()=>{
    if(PREFS.onboardingSeen||!shadow||$('#onboarding',shadow))return;
    const page=String((CHROME_VIEW?chromeLocation:location.href)||'');
    const busy=!PREFS.languageChosen||$('#language-pick',shadow)||document.visibilityState!=='visible'||!/^https:\/\/[^/]*bilibili\.com\//.test(page)||$('#update-notice',shadow)||$('#settings:not([hidden])',shadow);
    if(busy){if(++onboardingTries<300)scheduleOnboarding(1000);return;}
    showOnboarding();
  },delay);
}
// Feedback: opened from the tray menu or Settings → About. The note goes to the project site, which mails it to the
// developer; an address is optional and only there so the developer can answer.
const FEEDBACK_KINDS=[['bug','遇到问题'],['idea','功能建议'],['other','其他']];
let feedbackBusy=false;
function openFeedback(){
  if(!CHROME_VIEW||!shadow)return;if($('#feedback',shadow)){$('#feedback textarea',shadow)?.focus();return;}
  closeSettings();const previous=shadow.activeElement,layer=document.createElement('div');layer.id='feedback';layer.className='fb-layer';
  let draft={};try{draft=JSON.parse(localStorage.getItem('bs-feedback-draft')||'{}');}catch{}
  layer.innerHTML=`<form class="fb-card" role="dialog" aria-modal="true" aria-labelledby="fb-title" novalidate>
<header><h2 id="fb-title">反馈</h2><button type="button" class="fb-close" data-fb="close" aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
<div class="fb-kinds" role="radiogroup" aria-label="类型">${FEEDBACK_KINDS.map(([v,t])=>`<button type="button" role="radio" data-kind="${v}" aria-checked="${(draft.kind||'bug')===v}">${t}</button>`).join('')}</div>
<label class="fb-field"><span>想说的话</span><textarea name="text" rows="6" maxlength="4000" required placeholder="遇到了什么、在哪个页面、怎么操作会出现……写得越具体越好">${escapeHtml(draft.text||'')}</textarea><small class="fb-count"></small></label>
<label class="fb-field"><span>邮箱（可选）</span><input name="email" type="email" maxlength="254" autocomplete="email" placeholder="name@example.com" value="${escapeHtml(draft.email||'')}"><small>不填也能提交，但开发者就没法回复你。</small></label>
<label class="fb-check"><input type="checkbox" name="diag" checked><span>附带版本号和系统信息（不含账号、Cookie 和浏览记录）</span></label>
<p class="fb-status" role="status" aria-live="polite"></p>
<footer><button type="button" class="fb-ghost" data-fb="close">取消</button><button type="submit" class="fb-primary">提交反馈</button></footer></form>`;
  shadow.append(layer);reportChromeLayout();
  const form=$('form',layer),text=$('textarea',form),email=$('input[name=email]',form),diag=$('input[name=diag]',form),count=$('.fb-count',form),status=$('.fb-status',form),send=$('.fb-primary',form);
  const kind=()=>$('[aria-checked=true]',form)?.dataset.kind||'other';
  const save=()=>{try{localStorage.setItem('bs-feedback-draft',JSON.stringify({kind:kind(),text:text.value,email:email.value}));}catch{}};
  const counted=()=>{count.textContent=`${text.value.length} / 4000`;};counted();
  const say=(message,tone='')=>{status.dataset.tone=tone;status.textContent=message;};
  // Both addresses unreachable: the note can still leave by hand.
  const offerCopy=()=>{if($('.fb-copy',form))return;const b=document.createElement('button');b.type='button';b.className='fb-ghost fb-copy';b.textContent='复制反馈内容';
    b.onclick=()=>{const kindLabel=FEEDBACK_KINDS.find(([v])=>v===kind())?.[1]||'';const textOut=['【Bili-Space 反馈 · '+kindLabel+' · v'+APP_META.version+'】',text.value.trim(),email.value.trim()?'邮箱：'+email.value.trim():''].filter(Boolean).join('\n');
      navigator.clipboard.writeText(textOut).then(()=>toast('已复制，可以粘贴发给开发者'),()=>toast('复制失败，请手动选中文字复制'));};
    $('footer',form).prepend(b);};
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!still){layer.animate([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'});form.animate([{opacity:0,transform:'translateY(12px) scale(.98)'},{opacity:1,transform:'none'}],{duration:360,easing:'cubic-bezier(.32,.72,0,1)'});}
  const close=()=>{if(!layer.isConnected||layer.dataset.closing)return;layer.dataset.closing='1';const done=()=>{layer.remove();reportChromeLayout();previous?.focus?.();};
    if(still)done();else{form.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px) scale(.98)'}],{duration:200,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});layer.animate([{opacity:1},{opacity:0}],{duration:240,easing:'ease-in',fill:'forwards'}).onfinish=done;}};
  layer.addEventListener('click',e=>{if(e.target===layer||e.target.closest('[data-fb=close]')){close();return;}const k=e.target.closest('[data-kind]');if(k){$$('[data-kind]',form).forEach(b=>b.setAttribute('aria-checked',String(b===k)));save();}});
  layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
  form.addEventListener('input',()=>{counted();save();say('');});
  form.addEventListener('submit',e=>{e.preventDefault();if(feedbackBusy)return;
    const note=text.value.trim(),mail=email.value.trim();
    if(note.length<4){say('再多写几个字吧。','error');text.focus();return;}
    if(mail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)){say('邮箱格式好像不对，也可以留空。','error');email.focus();return;}
    feedbackBusy=true;send.disabled=true;send.textContent='正在发送…';say('');
    feedbackDone=result=>{feedbackBusy=false;send.disabled=false;send.textContent='提交反馈';
      if(result?.ok){try{localStorage.removeItem('bs-feedback-draft');}catch{}close();toast(mail?'已收到，开发者会通过邮箱回复你':'已收到，谢谢你的反馈');}
      else if(result?.message==='offline'){say('连不上反馈服务器。可以复制内容，换个方式发给开发者。','error');offerCopy();}
      else say(result?.message||'发送失败，请稍后再试。内容已保留。','error');};
    native('feedback',{kind:kind(),text:note,email:mail,diag:diag.checked,page:diag.checked?pageKind(chromeLocation||location):''});});
  requestAnimationFrame(()=>text.focus());
}
let feedbackDone=null;
function feedbackResult(result){if(!CHROME_VIEW)return;const done=feedbackDone;feedbackDone=null;done?.(result);}
// What's new: each release ships assets/whats-new/whats-new.json (and its pictures or clips) for its own version. The
// first launch of that version shows it once, after the welcome tour if that is still to come; Settings → About can
// show it again. Pages turn with the buttons, the dots or ←/→; × and Esc close it.
let whatsNewTimer=0,whatsNewTries=0;
function loadWhatsNew(){return fetch(localAsset('whats-new/whats-new.json')).then(r=>r.ok?r.json():null).catch(()=>null);}
function scheduleWhatsNew(delay=1200){
  if(CONTENT_VIEW||typeof RUNTIME==='undefined'||PREFS.whatsNewSeen===APP_META.version)return;
  clearTimeout(whatsNewTimer);whatsNewTimer=setTimeout(async()=>{
    if(PREFS.whatsNewSeen===APP_META.version||!shadow||$('#whats-new',shadow))return;
    const page=String((CHROME_VIEW?chromeLocation:location.href)||'');
    const busy=!PREFS.languageChosen||$('#language-pick',shadow)||!PREFS.onboardingSeen||$('#onboarding',shadow)||document.visibilityState!=='visible'||!/^https:\/\/[^/]*bilibili\.com\//.test(page)||$('#update-notice',shadow)||$('#settings:not([hidden])',shadow)||$('#feedback',shadow);
    if(busy){if(++whatsNewTries<300)scheduleWhatsNew(1000);return;}
    const data=await loadWhatsNew();if(!data||data.version!==APP_META.version||!Array.isArray(data.slides)||!data.slides.length){update({whatsNewSeen:APP_META.version});scheduleShare();return;}
    showWhatsNew(data);
  },delay);
}
async function openWhatsNew(){const data=await loadWhatsNew();if(data?.slides?.length)showWhatsNew(data);else toast('这个版本没有更新公告');}
function showWhatsNew(data){
  if(!CHROME_VIEW||!shadow||$('#whats-new',shadow))return;
  const slides=data.slides.slice(0,12),last=slides.length-1,still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const media=item=>{const src=item.media?localAsset('whats-new/'+String(item.media).replace(/[^\w.-]/g,'')):'';if(!src)return '';
    return /\.(mp4|webm)$/i.test(src)?`<video src="${src}" muted loop playsinline preload="auto" aria-hidden="true"></video>`:`<img src="${src}" alt="" draggable="false">`;};
  const layer=document.createElement('div');layer.id='whats-new';layer.className='wn-layer';const previous=shadow.activeElement;
  layer.innerHTML=`<section class="wn-card" role="dialog" aria-modal="true" aria-labelledby="wn-title">
<header><div><p class="wn-eyebrow">${escapeHtml(data.eyebrow||('Bili-Space '+APP_META.version))}</p><h2 id="wn-title">${escapeHtml(data.title||'更新了什么')}</h2></div><button type="button" class="wn-close" data-wn="close" aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
<div class="wn-stage">${slides.map((item,i)=>`<article class="wn-slide${i?'':' wn-show'}" data-slide="${i}" aria-hidden="${i?'true':'false'}">${media(item)?`<div class="wn-media">${media(item)}</div>`:Array.isArray(item.items)?`<ul class="wn-list">${item.items.slice(0,8).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:''}<h3>${escapeHtml(item.title||'')}</h3>${item.text?`<p>${escapeHtml(item.text)}</p>`:''}</article>`).join('')}</div>
<footer><div class="wn-dots" role="tablist" aria-label="页面">${slides.map((_,i)=>`<button type="button" role="tab" data-wn-dot="${i}" aria-label="第 ${i+1} 页" aria-selected="${!i}"></button>`).join('')}</div><span class="wn-gap"></span><button type="button" class="wn-ghost" data-wn="back" hidden>上一页</button><button type="button" class="wn-primary" data-wn="next">${last?'下一页':'知道了'}</button></footer></section>`;
  shadow.append(layer);reportChromeLayout();
  const card=$('.wn-card',layer),items=$$('.wn-slide',layer),dots=$$('[data-wn-dot]',layer),back=$('[data-wn=back]',layer),next=$('[data-wn=next]',layer);
  let step=0,motions=[];
  const playMedia=()=>items.forEach((el,i)=>{const v=$('video',el);if(!v)return;if(i===step){v.currentTime=0;v.play().catch(()=>{});}else v.pause();});
  const render=()=>{dots.forEach((d,i)=>d.setAttribute('aria-selected',String(i===step)));back.hidden=step===0;next.textContent=step===last?'知道了':'下一页';items.forEach((el,i)=>el.setAttribute('aria-hidden',String(i!==step)));playMedia();};
  const go=to=>{
    if(to===step||to<0||to>last)return;const from=items[step],into=items[to],dir=to>step?1:-1;
    motions.forEach(m=>m.finish());motions=[];into.getAnimations({subtree:true}).forEach(m=>{if(!(m instanceof CSSAnimation))m.cancel();});
    step=to;into.classList.add('wn-show');render();
    if(still){from.classList.remove('wn-show');return;}
    const out=from.animate([{opacity:1,transform:'none'},{opacity:0,transform:`translateX(${-28*dir}px)`}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
    out.finished.then(()=>{if(items[step]!==from)from.classList.remove('wn-show');out.cancel();},()=>{});motions.push(out);
    [...into.children].forEach((part,k)=>motions.push(part.animate([{opacity:0,transform:`translateX(${36*dir}px)`},{opacity:1,transform:'none'}],{duration:440,delay:70+k*50,easing:'cubic-bezier(.32,.72,0,1)',fill:'backwards'})));
  };
  let closed=false;
  const close=()=>{if(closed)return;closed=true;update({whatsNewSeen:APP_META.version});scheduleShare();items.forEach(el=>$('video',el)?.pause());
    const done=()=>{layer.remove();reportChromeLayout();previous?.focus?.();};
    if(still)done();else{card.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px) scale(.97)'}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});layer.animate([{opacity:1},{opacity:0}],{duration:280,easing:'ease-in',fill:'forwards'}).onfinish=done;}};
  layer.addEventListener('click',e=>{if(e.target===layer){close();return;}const a=e.target.closest('[data-wn]')?.dataset.wn;
    if(a==='close')close();else if(a==='back')go(step-1);else if(a==='next'){if(step<last)go(step+1);else close();}
    const dot=e.target.closest('[data-wn-dot]');if(dot)go(Number(dot.dataset.wnDot));});
  layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(e.key==='ArrowRight'){e.preventDefault();go(step+1);}else if(e.key==='ArrowLeft'){e.preventDefault();go(step-1);}
    else if(e.key==='Tab'){const f=$$('button:not([hidden])',card);const i=f.indexOf(shadow.activeElement);e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length]?.focus();}});
  if(!still){layer.animate([{opacity:0},{opacity:1}],{duration:240,easing:'ease-out'});card.animate([{opacity:0,transform:'translateY(14px) scale(.97)'},{opacity:1,transform:'none'}],{duration:440,easing:'cubic-bezier(.32,.72,0,1)'});}
  render();requestAnimationFrame(()=>next.focus({preventScroll:true}));
}
// Share: on a fresh install and on each new version, after the what's-new, one card asks to pass Bili-Space on to a
// friend (the copied text carries the download link). Shown once per version; Settings → About opens it any time.
const SHARE_TEXT='推荐一个 B 站电脑客户端 Bili-Space：保留官方播放器和弹幕，界面更清爽，还有内置下载、无边框画中画、200% 音量和一大堆自定义。免费下载：https://bili.gvqi.top';
let shareTimer=0;
function scheduleShare(delay=700){
  if(!CHROME_VIEW||PREFS.shareSeen===APP_META.version)return;
  clearTimeout(shareTimer);shareTimer=setTimeout(()=>{
    if(PREFS.shareSeen===APP_META.version||!shadow)return;
    if($('#language-pick',shadow)||$('#whats-new',shadow)||$('#onboarding',shadow)||$('#settings:not([hidden])',shadow)||$('#feedback',shadow)||document.visibilityState!=='visible'){scheduleShare(1500);return;}
    showShare();
  },delay);
}
// The client copies the text (the same SHARE_TEXT, kept in main.cpp) and answers through shareCopied.
function shareCopied(ok){const b=shadow&&$('#share-card [data-share=copy]',shadow);if(!b)return;b.textContent=ok?'已复制，去发给好友吧':'复制失败，请手动选中上面的文字';if(ok)b.dataset.done='true';}
function showShare(){
  if(!CHROME_VIEW||!shadow||$('#share-card',shadow))return;
  update({shareSeen:APP_META.version});
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches,previous=shadow.activeElement;
  const layer=document.createElement('div');layer.id='share-card';layer.className='wn-layer';
  layer.innerHTML=`<section class="wn-card share-card" role="dialog" aria-modal="true" aria-labelledby="share-title">
<header><div><p class="wn-eyebrow">喜欢 Bili-Space 吗</p><h2 id="share-title">分享给一个朋友吧</h2></div><button type="button" class="wn-close" data-share="close" aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
<p class="share-lead">Bili-Space 是作者一个人在业余时间做的，没有广告，也不收费。你的一次分享，就是继续更新下去的最大动力。</p>
<blockquote class="share-text">${escapeHtml(SHARE_TEXT)}</blockquote>
<footer><button type="button" class="wn-ghost" data-share="star">去 GitHub 点个星</button><span class="wn-gap"></span><button type="button" class="wn-ghost" data-share="close">以后再说</button><button type="button" class="wn-primary" data-share="copy">复制分享文案</button></footer></section>`;
  shadow.append(layer);reportChromeLayout();
  const card=$('.wn-card',layer),copy=$('[data-share=copy]',layer);let closed=false;
  const close=()=>{if(closed)return;closed=true;const done=()=>{layer.remove();reportChromeLayout();previous?.focus?.();};
    if(still)done();else{card.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px) scale(.97)'}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});layer.animate([{opacity:1},{opacity:0}],{duration:260,easing:'ease-in',fill:'forwards'}).onfinish=done;}};
  layer.addEventListener('click',e=>{if(e.target===layer){close();return;}const a=e.target.closest('[data-share]')?.dataset.share;
    if(a==='close')close();
    else if(a==='star')native('open-external',{url:'https://github.com/GuqiGG/Bili-Space'});
    else if(a==='copy')native('copy-share');});
  layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(e.key==='Tab'){const f=$$('button',card);const i=f.indexOf(shadow.activeElement);e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length]?.focus();}});
  if(!still){layer.animate([{opacity:0},{opacity:1}],{duration:240,easing:'ease-out'});card.animate([{opacity:0,transform:'translateY(14px) scale(.97)'},{opacity:1,transform:'none'}],{duration:440,easing:'cubic-bezier(.32,.72,0,1)'});}
  requestAnimationFrame(()=>copy.focus({preventScroll:true}));
}
// Announcements from bili.gvqi.top/news (fetched by the client): each unseen item that fits this version, platform and
// date shows once, when nothing else is on screen. Text is escaped; links open in the default browser.
let newsItems=[],newsTimer=0;
function newerOrSame(a,b){const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const p=x[i]||0,q=y[i]||0;if(p!==q)return p>q;}return true;}
function acceptNews(items){if(!CHROME_VIEW||!Array.isArray(items))return;newsItems=items;scheduleNews(400);}
function pendingNews(){const seen=new Set(Array.isArray(PREFS.newsSeen)?PREFS.newsSeen:[]),today=new Date().toISOString().slice(0,10),platform=NATIVE_PLATFORM||'windows';
  return newsItems.find(n=>n&&!seen.has(n.id)&&(!n.minVersion||newerOrSame(APP_META.version,n.minVersion))&&(!n.maxVersion||newerOrSame(n.maxVersion,APP_META.version))&&(!n.until||today<=n.until)&&(!Array.isArray(n.platforms)||!n.platforms.length||n.platforms.includes(platform)));}
function scheduleNews(delay=1500){
  clearTimeout(newsTimer);newsTimer=setTimeout(()=>{
    const item=pendingNews();if(!item||!shadow||$('#news-card',shadow))return;
    if(!PREFS.languageChosen||$('#language-pick',shadow)||!PREFS.onboardingSeen||$('#onboarding',shadow)||$('#whats-new',shadow)||$('#share-card',shadow)||$('#settings:not([hidden])',shadow)||$('#feedback',shadow)||document.visibilityState!=='visible'){scheduleNews(3000);return;}
    showNews(item);
  },delay);
}
function showNews(item){
  update({newsSeen:[...(Array.isArray(PREFS.newsSeen)?PREFS.newsSeen:[]),item.id].slice(-100)});
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches,previous=shadow.activeElement;
  const layer=document.createElement('div');layer.id='news-card';layer.className='wn-layer';
  const link=item.link&&/^https:\/\//.test(item.link.url)?item.link:null;
  layer.innerHTML=`<section class="wn-card share-card" role="dialog" aria-modal="true" aria-labelledby="news-title">
<header><div><p class="wn-eyebrow">Bili-Space 公告</p><h2 id="news-title">${escapeHtml(item.title)}</h2></div><button type="button" class="wn-close" data-news="close" aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
${item.text?`<p class="share-lead news-text">${escapeHtml(item.text)}</p>`:''}
<footer><span class="wn-gap"></span>${link?`<button type="button" class="wn-ghost" data-news="link">${escapeHtml(link.label||'查看详情')}</button>`:''}<button type="button" class="wn-primary" data-news="close">知道了</button></footer></section>`;
  shadow.append(layer);reportChromeLayout();
  const card=$('.wn-card',layer);let closed=false;
  const close=()=>{if(closed)return;closed=true;const done=()=>{layer.remove();reportChromeLayout();previous?.focus?.();scheduleNews();};
    if(still)done();else{card.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px) scale(.97)'}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});layer.animate([{opacity:1},{opacity:0}],{duration:260,easing:'ease-in',fill:'forwards'}).onfinish=done;}};
  layer.addEventListener('click',e=>{if(e.target===layer){close();return;}const a=e.target.closest('[data-news]')?.dataset.news;
    if(a==='close')close();else if(a==='link'){native('open-external',{url:link.url});close();}});
  layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(e.key==='Tab'){const f=$$('button',card);const i=f.indexOf(shadow.activeElement);e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length]?.focus();}});
  if(!still){layer.animate([{opacity:0},{opacity:1}],{duration:240,easing:'ease-out'});card.animate([{opacity:0,transform:'translateY(14px) scale(.97)'},{opacity:1,transform:'none'}],{duration:440,easing:'cubic-bezier(.32,.72,0,1)'});}
  requestAnimationFrame(()=>$('.wn-primary',card)?.focus({preventScroll:true}));
}
function startNews(){if(!CHROME_VIEW)return;setTimeout(()=>native('news'),5000);setInterval(()=>native('news'),3*3600*1000);}
// 精选: recommended videos one at a time over the home page, switched with the wheel, ↑/↓ or the side arrows, like the
// official desktop client's 精选. Each video is the real video page in a same-origin frame, reduced to its player, so
// quality, danmaku (sending included) and the account all behave as usual; the neighbours are preloaded and kept paused.
let swipe=null;
const SWIPE_EASE='cubic-bezier(.32,.72,0,1)';
const swipeCookie=name=>(document.cookie.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'))||[])[1]||'';
const swipeCount=n=>{n=Number(n)||0;const lang=uiLanguage();if(!/^(zh|yue|lolcat)/.test(lang))try{return new Intl.NumberFormat(lang==='pt-BR'?'pt-BR':lang,{notation:'compact',maximumFractionDigits:1}).format(n);}catch{}return n>=1e8?(n/1e8).toFixed(1).replace(/\.0$/,'')+'亿':n>=1e4?(n/1e4).toFixed(1).replace(/\.0$/,'')+'万':String(n);};
async function swipeApi(url,body){
  const opt={credentials:'include'};
  if(body){opt.method='POST';opt.headers={'Content-Type':'application/x-www-form-urlencoded'};opt.body=new URLSearchParams({...body,csrf:swipeCookie('bili_jct')});}
  try{return await (await fetch(url,opt)).json();}catch{return null;}
}
async function swipeMore(){
  if(!swipe||swipe.loading)return;swipe.loading=true;swipe.page++;
  const j=await swipeApi(`https://api.bilibili.com/x/web-interface/index/top/feed/rcmd?ps=12&fresh_type=4&fresh_idx=${swipe.page}&fresh_idx_1h=${swipe.page}&brush=${swipe.page}`);
  for(const it of j?.data?.item||[]){if(it.goto!=='av'||!it.bvid||it.business_info||swipe.seen.has(it.bvid))continue;swipe.seen.add(it.bvid);swipe.list.push({bvid:it.bvid,aid:it.id,title:it.title,pic:it.pic,owner:it.owner||{},stat:it.stat||{}});}
  swipe.loading=false;
}
// Bilibili's own toolbar icons (the video page's like, coin, favourite and share), and a reply bubble drawn to match.
const SWIPE_ACTIONS=[
  ['like','点赞（长按一键三连）',36,'M9.77234 30.8573V11.7471H7.54573C5.50932 11.7471 3.85742 13.3931 3.85742 15.425V27.1794C3.85742 29.2112 5.50932 30.8573 7.54573 30.8573H9.77234ZM11.9902 30.8573V11.7054C14.9897 10.627 16.6942 7.8853 17.1055 3.33591C17.2666 1.55463 18.9633 0.814421 20.5803 1.59505C22.1847 2.36964 23.243 4.32583 23.243 6.93947C23.243 8.50265 23.0478 10.1054 22.6582 11.7471H29.7324C31.7739 11.7471 33.4289 13.402 33.4289 15.4435C33.4289 15.7416 33.3928 16.0386 33.3215 16.328L30.9883 25.7957C30.2558 28.7683 27.5894 30.8573 24.528 30.8573H11.9911H11.9902Z'],
  ['coin','投币',28,'M14.045 25.5454C7.69377 25.5454 2.54504 20.3967 2.54504 14.0454C2.54504 7.69413 7.69377 2.54541 14.045 2.54541C20.3963 2.54541 25.545 7.69413 25.545 14.0454C25.545 17.0954 24.3334 20.0205 22.1768 22.1771C20.0201 24.3338 17.095 25.5454 14.045 25.5454ZM9.66202 6.81624H18.2761C18.825 6.81624 19.27 7.22183 19.27 7.72216C19.27 8.22248 18.825 8.62807 18.2761 8.62807H14.95V10.2903C17.989 10.4444 20.3766 12.9487 20.3855 15.9916V17.1995C20.3854 17.6997 19.9799 18.1052 19.4796 18.1052C18.9793 18.1052 18.5738 17.6997 18.5737 17.1995V15.9916C18.5667 13.9478 16.9882 12.2535 14.95 12.1022V20.5574C14.95 21.0577 14.5444 21.4633 14.0441 21.4633C13.5437 21.4633 13.1382 21.0577 13.1382 20.5574V12.1022C11.1 12.2535 9.52148 13.9478 9.51448 15.9916V17.1995C9.5144 17.6997 9.10883 18.1052 8.60856 18.1052C8.1083 18.1052 7.70273 17.6997 7.70265 17.1995V15.9916C7.71158 12.9487 10.0992 10.4444 13.1382 10.2903V8.62807H9.66202C9.11309 8.62807 8.66809 8.22248 8.66809 7.72216C8.66809 7.22183 9.11309 6.81624 9.66202 6.81624Z'],
  ['fav','收藏',28,'M19.8071 9.26152C18.7438 9.09915 17.7624 8.36846 17.3534 7.39421L15.4723 3.4972C14.8998 2.1982 13.1004 2.1982 12.4461 3.4972L10.6468 7.39421C10.1561 8.36846 9.25639 9.09915 8.19315 9.26152L3.94016 9.91102C2.63155 10.0734 2.05904 11.6972 3.04049 12.6714L6.23023 15.9189C6.96632 16.6496 7.29348 17.705 7.1299 18.7605L6.39381 23.307C6.14844 24.6872 7.62063 25.6614 8.84745 25.0119L12.4461 23.0634C13.4276 22.4951 14.6544 22.4951 15.6359 23.0634L19.2345 25.0119C20.4614 25.6614 21.8518 24.6872 21.6882 23.307L20.8703 18.7605C20.7051 17.705 21.0339 16.6496 21.77 15.9189L24.9597 12.6714C25.9412 11.6972 25.3687 10.0734 24.06 9.91102L19.8071 9.26152Z'],
  ['share','分享',28,'M12.6058 10.3326V5.44359C12.6058 4.64632 13.2718 4 14.0934 4C14.4423 4 14.78 4.11895 15.0476 4.33606L25.3847 12.7221C26.112 13.3121 26.2087 14.3626 25.6007 15.0684C25.5352 15.1443 25.463 15.2144 25.3847 15.2779L15.0476 23.6639C14.4173 24.1753 13.4791 24.094 12.9521 23.4823C12.7283 23.2226 12.6058 22.8949 12.6058 22.5564V18.053C7.59502 18.053 5.37116 19.9116 2.57197 23.5251C2.47607 23.6489 2.00031 23.7769 2.00031 23.2122C2.00031 16.2165 3.90102 10.3326 12.6058 10.3326Z'],
  ['reply','评论',28,'M6 3.5h16a3.5 3.5 0 0 1 3.5 3.5v10.5a3.5 3.5 0 0 1-3.5 3.5h-9.2l-5.6 4.1c-.66.48-1.6.01-1.6-.81V21A3.5 3.5 0 0 1 2.5 17.5V7A3.5 3.5 0 0 1 6 3.5Z']];
// The video page's own celebration animations (SVGA files) play over the buttons, with the page's own SVGA player
// (which only accepts a container made by its own document; it sizes and centres its canvas itself).
const SWIPE_SVGA_URLS={heart:'https://s1.hdslb.com/bfs/seed/jinkela/short/config/like_heart.svga',thumb:'https://s1.hdslb.com/bfs/seed/jinkela/short/config/like_thumb.svga',fireworks:'https://i0.hdslb.com/bfs/activity-plat/static/20210531/d10a0e2254670a43c49fc027b914ec9e/firework.svga'};
let swipeSvgaFiles=null;
function swipeSvgaKit(){
  const slot=swipe?.slots.get(swipe.index);let w,d;try{w=slot?.frame.contentWindow;d=slot?.frame.contentDocument;}catch{return null;}
  if(!w?.SVGA)return null;
  // The base like, coin and favourite animations ship inside the page's toolbar component.
  if(!swipeSvgaFiles&&d){let el=d.querySelector('.video-toolbar-left');while(el&&!el.__vue__)el=el.parentElement;
    for(let vm=el?.__vue__,k=0;vm&&k<8;vm=vm.$parent,k++){const x=vm.$data;if(x?.likeBase&&x.coinBase&&x.favBase){swipeSvgaFiles={like:x.likeBase,coin:x.coinBase,fav:x.favBase};break;}}}
  return {SVGA:w.SVGA,doc:d,files:{...SWIPE_SVGA_URLS,...swipeSvgaFiles}};
}
function swipeSvga(button,name,place='center'){
  if(swipeStill())return;const kit=swipeSvgaKit(),src=kit?.files[name];if(!src)return;
  const box=kit.doc.createElement('div');box.className='bs-swipe-svga '+place;$('.bs-swipe-icon',button).append(box);
  try{const player=new kit.SVGA.Player(box);player.loops=1;player.clearsAfterStop=true;player.onFinished(()=>box.remove());
    new kit.SVGA.Parser(box).load(src,item=>{if(!box.isConnected)return;player.setVideoItem(item);player.startAnimation();},()=>box.remove());}catch{box.remove();}
  setTimeout(()=>box.remove(),5000);
}
function swipePop(button){if(swipeStill())return;$('.bs-swipe-icon>svg:last-of-type',button)?.animate([{transform:'scale(1)'},{transform:'scale(.78)',offset:.3},{transform:'scale(1.18)',offset:.7},{transform:'scale(1)'}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});}
// Holding the like button fills a ring round like, coin and favourite, then sends 一键三连 like the video page does.
function swipeHold(e){
  const b=e.target.closest?.('[data-swipe=like]');if(!b||e.button!==0||!swipe)return;
  const actions=$('.bs-swipe-actions',swipe.ui);clearTimeout(swipe.holdTimer);
  swipe.holdTimer=setTimeout(()=>{actions.classList.add('charging');swipe.holdTimer=setTimeout(()=>{actions.classList.remove('charging');swipe.suppressClick=true;swipeTriple();},1300);},220);
  const stop=()=>{clearTimeout(swipe?.holdTimer);actions.classList.remove('charging');removeEventListener('pointerup',stop,true);b.removeEventListener('pointerleave',stop);};
  addEventListener('pointerup',stop,true);b.addEventListener('pointerleave',stop);
}
async function swipeTriple(){
  const item=swipe?.list[swipe.index];if(!item)return;if(!swipeCookie('DedeUserID')){toast('请先登录 B站');return;}
  const j=await swipeApi('https://api.bilibili.com/x/web-interface/archive/like/triple',{aid:item.aid});if(!swipe)return;
  if(j?.code!==0){toast(j?.message||'三连失败');return;}
  const d=j.data||{},ui=swipe.ui;
  for(const [k,ok] of [['like',d.like],['coin',d.coin],['fav',d.fav]]){if(!ok)continue;const b=$(`[data-swipe=${k}]`,ui);swipeMark(item,k,true);swipePop(b);swipeSvga(b,k);}
  if(d.like&&d.coin&&d.fav)swipeSvga($('[data-swipe=coin]',ui),'fireworks','top');
}
const SWIPE_FRAME_CSS=`html,body{overflow:hidden!important;background:#000!important}body *{visibility:hidden!important}
#bilibili-player,#bilibili-player *{visibility:visible!important}
#bilibili-player{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;margin:0!important;z-index:2147483646!important}
#bilibili-player .bpx-player-container,#bilibili-player .bpx-player-primary-area{width:100%!important;height:100%!important}
#bilibili-player .bpx-player-container{box-shadow:none!important}
.bpx-player-ending-panel,.bpx-player-ending-wrap,.bpx-player-toast-auto{display:none!important}
.bpx-player-sending-area,.bpx-player-control-wrap,.bpx-player-shadow-progress-area,.bpx-player-top-wrap,.bpx-player-dialog-wrap{display:none!important}
#bilibili-player .bpx-player-video-area{height:100%!important}
#bilibili-player{transform-origin:0 50%;transition:transform .46s cubic-bezier(.32,.72,0,1)}
html.bs-swipe-comments #bilibili-player{transform:scale(var(--bs-ck,.7))}
#commentapp,#commentapp *{visibility:visible!important}
#commentapp{position:fixed!important;top:0!important;right:0!important;bottom:0!important;left:auto!important;width:var(--bs-cw,400px)!important;max-width:none!important;margin:0!important;padding:16px 20px 24px 20px!important;box-sizing:border-box!important;overflow-y:auto!important;overscroll-behavior:contain;background:var(--bg1,#fff)!important;z-index:2147483647!important;transform:translateX(100%);transition:transform .46s cubic-bezier(.32,.72,0,1);scrollbar-width:thin}
html.bs-swipe-comments #commentapp{transform:none}
#commentapp{font-family:var(--bs-cfont)!important}
.bpx-player-state-wrap{left:50%!important;top:50%!important;right:auto!important;bottom:auto!important;transform:translate(-50%,-50%) scale(1.25)!important;pointer-events:none!important}`;
function swipeVideo(slot){try{return slot.frame.contentDocument?.querySelector('#bilibili-player video,video');}catch{return null;}}
function swipeSlot(i){
  const item=swipe.list[i],el=document.createElement('div');el.className='bs-swipe-slot';
  el.innerHTML=`<img class="bs-swipe-cover" alt="" referrerpolicy="no-referrer" src="${escapeHtml((item.pic||'').replace(/^http:/,'https:'))}@1280w_720h_1c.webp"><div class="bs-swipe-wait">${ICON_TV}<p>你感兴趣的视频都在 B 站</p></div>`;
  const frame=document.createElement('iframe');frame.allow='autoplay; fullscreen; picture-in-picture; clipboard-write';frame.setAttribute('allowfullscreen','');
  frame.src=`https://www.bilibili.com/video/${item.bvid}/`;el.append(frame);
  const slot={i,el,frame,ready:false,styled:false,wired:false};
  // Until the page is reduced to its player and showing a picture, the cover stands in.
  slot.timer=setInterval(()=>{
    let doc;try{doc=frame.contentDocument;}catch{return;}if(!doc||!doc.documentElement)return;
    // The frame starts on a blank document; only the video page's own document counts.
    if(doc.location.href==='about:blank')return;if(slot.doc!==doc){slot.doc=doc;slot.styled=false;slot.wired=false;
      // A preloading page's own autoplay is held back (no sound, no head start); play() works again once it is the current one.
      try{const proto=frame.contentWindow.HTMLMediaElement.prototype,play=proto.play;proto.play=function(){return swipe&&swipe.slots.get(swipe.index)!==slot?Promise.resolve():play.call(this);};}catch{}}
    if(!slot.styled&&doc.head){const s=doc.createElement('style');s.id='bs-swipe-frame';s.textContent=SWIPE_FRAME_CSS;doc.head.append(s);slot.styled=true;}
    else if(slot.styled&&!doc.getElementById('bs-swipe-frame')&&doc.head){const s=doc.createElement('style');s.id='bs-swipe-frame';s.textContent=SWIPE_FRAME_CSS;doc.head.append(s);}
    if(!slot.wired&&doc.body){slot.wired=true;swipeWireFrame(slot,frame.contentWindow,doc);}
    const v=swipeVideo(slot);if(!v)return;
    if(!v.dataset.bsSwipe){v.dataset.bsSwipe='1';v.addEventListener('ended',()=>{if(swipe&&swipe.slots.get(swipe.index)===slot)swipeGo(1);});v.addEventListener('play',()=>{if(swipe&&swipe.slots.get(swipe.index)!==slot)v.pause();});}
    if(swipe.slots.get(swipe.index)===slot){swipeProgress();swipeSyncDanmakuToggle();if(swipe.comments&&(slot.tick=(slot.tick||0)+1)%4===0)swipeStyleComments(doc);}
    if(swipe.slots.get(swipe.index)!==slot){if(!v.paused)v.pause();slot.preloaded=true;}
    else if(!slot.started&&v.readyState>=2){slot.started=true;if(slot.preloaded&&v.currentTime<3)v.currentTime=0;v.play().catch(()=>{});}
    if(!slot.ready&&v.readyState>=2&&slot.styled){slot.ready=true;el.classList.add('ready');if(swipe.slots.get(swipe.index)===slot)swipeEnsure();}
  },120);
  return slot;
}
// Wheel, ↑/↓ and Esc reach the frame first; they switch videos instead of scrolling the hidden page or changing volume.
function swipeWireFrame(slot,win,doc){
  const inPanel=e=>!!swipe?.comments&&e.composedPath().some(n=>n.id==='commentapp');
  const typing=e=>e.composedPath().some(n=>n.nodeType===1&&(n.matches('input,textarea')||n.isContentEditable));
  for(const t of ['pointermove','pointerdown','keydown'])doc.addEventListener(t,()=>{if(swipe?.slots.get(swipe.index)===slot)swipeWake();},{passive:true,capture:true});
  doc.addEventListener('click',e=>{if(e.button!==0||swipe?.slots.get(swipe.index)!==slot||!e.target?.closest?.('.bpx-player-video-area')||inPanel(e))return;e.preventDefault();e.stopImmediatePropagation();swipeTogglePlay();},true);
  win.addEventListener('wheel',e=>{if(inPanel(e))return;e.preventDefault();swipeWheel(e);},{passive:false,capture:true});
  doc.addEventListener('keydown',e=>{if(typing(e))return;if(e.key===' '&&!inPanel(e)){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)swipeTogglePlay();return;}if(e.key==='Escape'&&swipe?.comments){e.preventDefault();e.stopImmediatePropagation();swipeComments(false);return;}if(inPanel(e)&&(e.key==='ArrowDown'||e.key==='ArrowUp'))return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();swipeGo(e.key==='ArrowDown'?1:-1);}
    else if(e.key==='Escape'&&!doc.fullscreenElement){e.preventDefault();closeSwipe();}},true);
}
function swipeWheel(e){if(!swipe||Math.abs(e.deltaY)<20)return;const now=performance.now();if(now-swipe.wheelAt<480)return;swipe.wheelAt=now;swipeGo(e.deltaY>0?1:-1);}
function swipePlace(animate){
  for(const [i,slot] of swipe.slots){const y=(i-swipe.index)*100;slot.el.style.transition=animate?`transform .46s ${SWIPE_EASE}`:'none';slot.el.style.transform=`translate3d(0,${y}%,0)`;}
}
async function swipeGo(step){
  if(!swipe||swipe.moving)return;const to=swipe.index+step;if(to<0)return;
  if(to>=swipe.list.length-4)swipeMore();
  if(to>=swipe.list.length){await swipeMore();if(to>=swipe.list.length)return;}
  if(swipe.comments)swipeComments(false);
  swipe.moving=true;const old=swipe.slots.get(swipe.index);const ov=old&&swipeVideo(old);if(ov&&!ov.paused)ov.pause();
  swipe.index=to;swipe.arrivedAt=performance.now();swipeEnsure();swipeRenderInfo();
  requestAnimationFrame(()=>{swipePlace(true);setTimeout(()=>{if(!swipe)return;swipe.moving=false;swipePrune();const cur=swipe.slots.get(swipe.index),v=cur&&swipeVideo(cur);if(v&&cur.ready)v.play().catch(()=>{});},470);});
}
// The current video, the one before it and the next two exist; anything further away is dropped (frames are whole
// pages). The second one down starts once the current one shows a picture, or 600ms after arriving, whichever is first,
// so quick swiping still finds the next two loaded.
function swipeEnsure(){
  const cur=swipe.slots.get(swipe.index),ahead=cur?.ready||performance.now()-swipe.arrivedAt>=600?[swipe.index+2]:[];
  clearTimeout(swipe.aheadTimer);if(!ahead.length)swipe.aheadTimer=setTimeout(()=>swipe&&swipeEnsure(),620);
  for(const i of [swipe.index,swipe.index+1,swipe.index-1,...ahead]){if(i<0||i>=swipe.list.length||swipe.slots.has(i))continue;const s=swipeSlot(i);s.el.style.transform=`translate3d(0,${(i-swipe.index)*100}%,0)`;swipe.track.append(s.el);swipe.slots.set(i,s);}
}
function swipePrune(){for(const [i,slot] of swipe.slots)if(i<swipe.index-1||i>swipe.index+2){clearInterval(slot.timer);slot.frame.src='about:blank';slot.el.remove();swipe.slots.delete(i);}}
async function swipeRenderInfo(){
  const item=swipe.list[swipe.index];if(!item)return;const ui=swipe.ui,token=item.bvid;ui.dataset.bvid=token;
  const o=item.owner,s=item.stat;
  $('.bs-swipe-owner',ui).innerHTML=`<img alt="" referrerpolicy="no-referrer" src="${escapeHtml((o.face||'').replace(/^http:/,'https:'))}@80w_80h_1c.webp"><div><p><b>${escapeHtml(o.name||'')}</b><button type="button" data-swipe="follow" class="bs-swipe-follow">+ 关注</button></p><small class="bs-swipe-fans"></small></div>`;
  $('.bs-swipe-title',ui).innerHTML=`<span>${escapeHtml(item.title||'')}</span><button type="button" data-swipe="more" aria-label="展开简介"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>`;
  $('.bs-swipe-desc',ui).textContent='';ui.classList.remove('expanded');$('.bs-swipe-season',ui).hidden=true;
  item.counts||={like:s.like,coin:s.coin,fav:s.favorite,share:s.share,reply:s.reply??s.danmaku};
  for(const k of Object.keys(item.counts)){const b=$(`[data-swipe=${k}]`,ui);b.classList.toggle('on',!!item.on?.[k]);swipeShowCount(item,k);}
  $('.bs-swipe-follow',ui).hidden=!!item.following;
  const [view,rel]=await Promise.all([swipeApi('https://api.bilibili.com/x/web-interface/view?bvid='+token),swipeApi('https://api.bilibili.com/x/web-interface/archive/relation?bvid='+token)]);
  if(!swipe||ui.dataset.bvid!==token)return;
  const d=view?.data;if(d){item.aid=d.aid;item.mid=d.owner?.mid;const st=d.stat||{};item.likes=st.like;
    if(!item.touched)item.counts={like:st.like,coin:st.coin,fav:st.favorite,share:st.share,reply:st.reply};for(const k of Object.keys(item.counts))swipeShowCount(item,k);
    $('.bs-swipe-desc',ui).textContent=d.desc||'';
    if(d.ugc_season){const sea=$('.bs-swipe-season',ui);sea.hidden=false;sea.textContent=`合集 · ${d.ugc_season.title} · ${d.ugc_season.ep_count||''} 个视频 ›`;}
    const card=await swipeApi('https://api.bilibili.com/x/web-interface/card?mid='+d.owner.mid);
    if(swipe&&ui.dataset.bvid===token&&card?.data){$('.bs-swipe-fans',ui).textContent=`${swipeCount(card.data.follower)}粉丝 · ${swipeCount(card.data.like_num)}点赞`;if(card.data.following&&!item.touched){item.following=true;$('.bs-swipe-follow',ui).hidden=true;}}}
  const r=rel?.data;if(r&&!item.touched){item.on={like:!!r.like,coin:!!r.coin,fav:!!r.favorite};for(const k of ['like','coin','fav'])$(`[data-swipe=${k}]`,ui).classList.toggle('on',item.on[k]);if(r.attention){item.following=true;$('.bs-swipe-follow',ui).hidden=true;}}
}
function swipeShowCount(item,k){const b=swipe&&$(`[data-swipe=${k}] small`,swipe.ui);if(b&&swipe.list[swipe.index]===item){const v=item.counts?.[k];b.textContent=v!=null?swipeCount(v):'';}}
function swipeMark(item,k,on){item.touched=true;item.on||={};if(!!item.on[k]===on)return;item.on[k]=on;if(item.counts?.[k]!=null)item.counts[k]+=on?1:-1;
  if(swipe?.list[swipe.index]===item){const b=$(`[data-swipe=${k}]`,swipe.ui);b.classList.toggle('on',on);swipeShowCount(item,k);}}
async function swipeAction(kind,button){
  const item=swipe?.list[swipe.index];if(!item)return;
  if(kind==='reply'||kind==='comments-close'){swipeComments(kind==='reply'?undefined:false);return;}
  if(kind==='detail'||kind==='season'){const v=swipeVideo(swipe.slots.get(swipe.index));if(v)v.pause();location.href=`https://www.bilibili.com/video/${item.bvid}/`;return;}
  if(kind==='share'){native('copy-video-link',{url:`https://www.bilibili.com/video/${item.bvid}`});swipePop(button);toast('已复制视频链接');return;}
  if(kind==='more'){swipeToggleMore();return;}
  if(kind==='dm-toggle'){swipeDanmakuToggle(button);return;}
  if(kind==='clean'){const on=!swipe.layer.classList.contains('clean');swipe.layer.classList.toggle('clean',on);button.setAttribute('aria-pressed',String(on));swipePop(button);swipeWake();return;}
  if(!swipeCookie('DedeUserID')){toast('请先登录 B站');return;}
  const aid=item.aid,fail=j=>{toast(j?.message||'操作失败，请稍后再试');};let j;
  if(kind==='like'){const on=!item.on?.like;swipeMark(item,'like',on);swipePop(button);if(on){const n=item.counts?.like??0;swipeSvga(button,n>=1e3?'thumb':n>=100?'heart':'like',n>=100?'top':'center');}
    j=await swipeApi('https://api.bilibili.com/x/web-interface/archive/like',{aid,like:on?1:2});if(j?.code!==0){swipeMark(item,'like',!on);fail(j);}}
  else if(kind==='coin'){if(item.on?.coin){toast('这个视频已经投过币了');return;}swipeMark(item,'coin',true);swipePop(button);swipeSvga(button,'coin');
    j=await swipeApi('https://api.bilibili.com/x/web-interface/coin/add',{aid,multiply:1,select_like:0});if(j?.code!==0){swipeMark(item,'coin',false);fail(j);}}
  else if(kind==='fav'){const on=!item.on?.fav;swipeMark(item,'fav',on);swipePop(button);if(on)swipeSvga(button,'fav');
    const list=await swipeApi(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?type=2&rid=${aid}&up_mid=${swipeCookie('DedeUserID')}`);const folders=list?.data?.list||[];
    if(!folders.length){swipeMark(item,'fav',!on);toast('没有找到收藏夹');return;}
    const ids=on?[folders[0].id]:folders.filter(f=>f.fav_state).map(f=>f.id);
    j=await swipeApi('https://api.bilibili.com/x/v3/fav/resource/deal',{rid:aid,type:2,[on?'add_media_ids':'del_media_ids']:ids.join(',')});if(j?.code!==0){swipeMark(item,'fav',!on);fail(j);}}
  else if(kind==='follow'){if(!item.mid)return;item.touched=true;item.following=true;button.hidden=true;
    j=await swipeApi('https://api.bilibili.com/x/relation/modify',{fid:item.mid,act:1,re_src:11});if(j?.code!==0){item.following=false;if(swipe?.list[swipe.index]===item)button.hidden=false;fail(j);}}
}
async function openSwipe(){
  if(swipe||!CONTENT_VIEW||pageKind()!=='home')return;
  const layer=document.createElement('div');layer.id='bs-swipe';layer.setAttribute('role','region');layer.setAttribute('aria-label','精选');
  layer.innerHTML=`<div class="bs-swipe-track"></div>
<div class="bs-swipe-chead"><button type="button" data-swipe="comments-close" aria-label="关闭评论"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
<div class="bs-swipe-ui">
 <div class="bs-swipe-edge"></div><div class="bs-swipe-peek"><i></i></div>
 <button type="button" class="bs-swipe-detail" data-swipe="detail">详情页 ›</button>
 <div class="bs-swipe-shade"></div><div class="bs-swipe-nav"><button type="button" data-swipe="prev" aria-label="上一个"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button><button type="button" data-swipe="next" aria-label="下一个"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>
 <form class="bs-swipe-dm" autocomplete="off"><button type="button" data-swipe="dm-toggle" class="bs-swipe-dm-toggle" aria-pressed="true" aria-label="弹幕开关">弹</button><input maxlength="100" placeholder="发个友善的弹幕见证当下" aria-label="发弹幕"><button type="submit" class="bs-swipe-dm-send">发送</button></form>
 <div class="bs-swipe-progress" role="slider" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" tabindex="-1"><i></i><b></b><span></span></div>
 <div class="bs-swipe-info"><div class="bs-swipe-owner"></div><p class="bs-swipe-title"></p><p class="bs-swipe-desc"></p><button type="button" class="bs-swipe-season" data-swipe="season" hidden></button></div>
 <div class="bs-swipe-actions">${SWIPE_ACTIONS.map(([k,l,box,d])=>`<button type="button" data-swipe="${k}" aria-label="${l}"><span class="bs-swipe-icon">${k==='like'||k==='coin'||k==='fav'?'<svg class="bs-swipe-ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22"/></svg>':''}<svg viewBox="0 0 ${box} ${box}" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="${d}"/></svg></span><small></small></button>`).join('')}<button type="button" data-swipe="clean" class="bs-swipe-clean" aria-pressed="false" aria-label="清屏"><span class="bs-swipe-icon"><svg class="bs-swipe-eye" viewBox="0 0 24 24" aria-hidden="true"><path class="bs-eye-open" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5ZM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5Zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3Z"/><path class="bs-eye-shut" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7ZM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27ZM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2Zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01Z"/></svg></span><small>清屏</small></button></div>
</div>`;
  if(!document.getElementById('bs-swipe-style')){const st=document.createElement('style');st.id='bs-swipe-style';st.textContent=SWIPE_CSS;(document.head||document.documentElement).append(st);}
  document.documentElement.append(layer);document.documentElement.dataset.bsSwipe='true';
  swipe={layer,track:$('.bs-swipe-track',layer),ui:$('.bs-swipe-ui',layer),list:[],seen:new Set(),page:0,index:0,slots:new Map(),wheelAt:0,moving:false,loading:false,arrivedAt:performance.now()};
  native('swipe-state',{on:true});
  layer.addEventListener('wheel',e=>{e.preventDefault();swipeWheel(e);},{passive:false});
  layer.addEventListener('pointerdown',swipeHold);
  layer.addEventListener('mousedown',e=>{if(e.target.closest?.('button'))e.preventDefault();});
  for(const t of ['pointermove','pointerdown','wheel','keydown'])layer.addEventListener(t,swipeWake,{passive:true});swipeWake();
  $('.bs-swipe-dm',layer).addEventListener('submit',swipeDanmakuSend);$('.bs-swipe-dm input',layer).addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.target.blur();}});
  swipeWireProgress($('.bs-swipe-progress',layer));
  for(const z of layer.querySelectorAll('.bs-swipe-edge,.bs-swipe-peek'))z.addEventListener('pointerenter',()=>native('swipe-header',{show:true}));
  layer.addEventListener('click',e=>{const b=e.target.closest('[data-swipe]');if(!b)return;if(swipe.suppressClick){swipe.suppressClick=false;return;}const k=b.dataset.swipe;if(k==='prev')swipeGo(-1);else if(k==='next')swipeGo(1);else swipeAction(k,b);});
  if(!swipeStill())layer.animate([{opacity:0},{opacity:1}],{duration:260,easing:'ease-out'});
  await swipeMore();if(!swipe)return;
  if(!swipe.list.length){toast('暂时拿不到推荐，请稍后再试');closeSwipe();return;}
  swipeEnsure();swipePlace(false);swipeRenderInfo();
}
function swipeStill(){return matchMedia('(prefers-reduced-motion: reduce)').matches;}
function swipeTogglePlay(){const v=swipe&&swipeVideo(swipe.slots.get(swipe.index));if(!v)return;if(v.paused)v.play().catch(()=>{});else v.pause();}
function swipeToggleMore(){
  const ui=swipe.ui,info=$('.bs-swipe-info',ui),desc=$('.bs-swipe-desc',ui),open=!ui.classList.contains('expanded');
  info.getAnimations().forEach(a=>a.cancel());desc.getAnimations().forEach(a=>a.cancel());
  if(swipeStill()){ui.classList.toggle('expanded',open);return;}
  const from=info.offsetHeight;ui.classList.toggle('expanded',open);const to=info.offsetHeight;
  const chevron=$('.bs-swipe-title button',ui);if(!open){ui.classList.add('expanded');if(chevron)chevron.style.transform='none';}
  info.style.overflow='hidden';
  const grow=info.animate([{height:from+'px'},{height:to+'px'}],{duration:open?420:340,easing:SWIPE_EASE});
  if(open)desc.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:360,delay:90,easing:'cubic-bezier(.23,1,.32,1)',fill:'backwards'});
  else desc.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(6px)'}],{duration:200,easing:'ease-in',fill:'forwards'});
  grow.onfinish=grow.oncancel=()=>{info.style.overflow='';if(chevron)chevron.style.transform='';if(!open){ui.classList.remove('expanded');desc.getAnimations().forEach(a=>a.cancel());}};
}
// Everything over the video fades after 3 s without the pointer moving (not while it rests on a control, the danmaku box
// has focus, comments are open or a long press is charging); 清屏 keeps it hidden, apart from its own button, until pressed again.
function swipeWake(){if(!swipe)return;swipe.layer.classList.remove('idle');clearTimeout(swipe.idleTimer);swipe.idleTimer=setTimeout(swipeIdle,3000);}
function swipeIdle(){
  if(!swipe)return;const l=swipe.layer;
  if(swipe.comments||l.querySelector('.bs-swipe-ui :is(button,form,.bs-swipe-progress,.bs-swipe-info):hover,.bs-swipe-dm:focus-within,.charging')){swipe.idleTimer=setTimeout(swipeIdle,1000);return;}
  l.classList.add('idle');
}
// The comment section is built from nested shadow roots; one sheet is adopted into each of them as they appear.
const SWIPE_COMMENT_CSS=`*{font-family:var(--bs-cfont)!important}
#navbar{display:none!important}
:host(bili-comments-header-renderer) #commentbox{margin:0 46px 0 0!important}
:host(bili-comment-action-buttons-renderer) :is(#pubdate,#reply){white-space:nowrap!important}
:host(bili-comment-renderer) #body{padding-left:56px!important}
:host(bili-comment-renderer) #user-avatar{left:0!important}
:host(bili-comment-renderer) #content{font-size:16px!important;line-height:1.6!important}
:host(bili-comment-thread-renderer) #div{margin-left:56px!important}
:host(bili-comment-box) #user-avatar{width:auto!important;margin-right:14px!important;justify-content:flex-start!important}
:host(bili-comment-box) .tool-btn{width:34px!important;height:30px!important}
:host(bili-comment-box) #pub button{height:34px!important;min-width:72px!important;font-size:16px!important;border-radius:8px!important}
:host(bili-comment-box) #optional{font-size:13px!important}
:host(bili-comment-rich-textarea) #input{font-size:15px!important;line-height:1.6!important}`;
function swipeCommentFont(d){
  if(PREFS.font&&!d.getElementById('bs-swipe-font')){const st=d.createElement('style');st.id='bs-swipe-font';st.textContent='@font-face{font-family:BiliDouyin;src:url("https://bili-space.local/fonts/DouyinSansBold.ttf") format("truetype")}';d.head?.append(st);}
  d.querySelector('#commentapp')?.style.setProperty('--bs-cfont',PREFS.font?'BiliDouyin,"Microsoft YaHei UI",sans-serif':'"Microsoft YaHei UI","PingFang SC",sans-serif');
}
function swipeStyleComments(d){
  const w=d.defaultView,root=d.querySelector('#commentapp bili-comments');if(!w||!root)return;
  let sheet=d.bsSwipeCommentSheet;if(!sheet){try{sheet=new w.CSSStyleSheet();sheet.replaceSync(SWIPE_COMMENT_CSS);d.bsSwipeCommentSheet=sheet;}catch{return;}}
  const walk=host=>{const sr=host.shadowRoot;if(!sr)return;if(!sr.adoptedStyleSheets.includes(sheet))sr.adoptedStyleSheets=[...sr.adoptedStyleSheets,sheet];for(const el of sr.querySelectorAll('*'))if(el.shadowRoot)walk(el);};
  walk(root);
}
// 评论 opens the video page's own comment section as a panel from the right; the video scales down to the space left.
function swipeComments(open){
  if(!swipe)return;open=open??!swipe.comments;const item=swipe.list[swipe.index],d=swipeFrameDoc();
  if(open&&!d?.querySelector('#commentapp')){location.href=`https://www.bilibili.com/video/${item.bvid}/#comment`;return;}
  swipe.comments=open;const width=Math.round(Math.min(580,Math.max(420,innerWidth*.4)));
  swipe.layer.style.setProperty('--bs-cw',width+'px');swipe.layer.classList.toggle('comments',open);
  if(d){const root=d.documentElement,look=d.defaultView.getComputedStyle(root);root.style.setProperty('--bs-cw',width+'px');root.style.setProperty('--bs-ck',String((innerWidth-width)/innerWidth));root.classList.toggle('bs-swipe-comments',open);
    swipeCommentFont(d);if(open)swipeStyleComments(d);
    swipe.layer.style.setProperty('--bs-ctext',look.getPropertyValue('--text1').trim()||'#18191c');swipe.layer.style.setProperty('--bs-cbg',look.getPropertyValue('--bg1').trim()||'#fff');}
  $('[data-swipe=reply]',swipe.ui)?.classList.toggle('on',open);
}
// The page's own sending box stays hidden; ours fills it and presses its send button, so the danmaku appears at once.
function swipeFrameDoc(){try{return swipe?.slots.get(swipe.index)?.frame.contentDocument||null;}catch{return null;}}
function swipeDanmakuSend(e){
  e.preventDefault();const input=$('input',e.currentTarget),text=input.value.trim();if(!text)return;
  if(!swipeCookie('DedeUserID')){toast('请先登录 B站');return;}
  const d=swipeFrameDoc(),box=d?.querySelector('.bpx-player-dm-input'),send=d?.querySelector('.bpx-player-dm-btn-send');if(!box||!send){toast('操作失败，请稍后再试');return;}
  const w=d.defaultView;w.Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(box,text);box.dispatchEvent(new w.Event('input',{bubbles:true}));
  send.click();input.value='';
}
function swipeDanmakuToggle(button){const sw=swipeFrameDoc()?.querySelector('.bpx-player-dm-switch input');if(!sw)return;sw.click();setTimeout(()=>button.setAttribute('aria-pressed',String(!!sw.checked)),60);}
function swipeSyncDanmakuToggle(){const sw=swipeFrameDoc()?.querySelector('.bpx-player-dm-switch input'),b=swipe&&$('.bs-swipe-dm-toggle',swipe.ui);if(sw&&b)b.setAttribute('aria-pressed',String(!!sw.checked));}
function swipeProgress(){
  if(!swipe)return;const bar=$('.bs-swipe-progress',swipe.ui),v=swipeVideo(swipe.slots.get(swipe.index));if(!bar)return;
  const d=v&&isFinite(v.duration)?v.duration:0,t=swipe.seeking??(v?.currentTime||0),r=d?Math.min(1,t/d):0;
  bar.style.setProperty('--p',r);bar.setAttribute('aria-valuenow',String(Math.round(r*100)));
  const fmt=x=>{x=Math.max(0,Math.floor(x));const h=Math.floor(x/3600),m=Math.floor(x%3600/60),sec=String(x%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${sec}`:`${m}:${sec}`;};
  $('span',bar).textContent=d?`${fmt(t)} / ${fmt(d)}`:'';
}
function swipeWireProgress(bar){
  const at=e=>{const r=bar.getBoundingClientRect();return Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));};
  bar.addEventListener('pointerdown',e=>{const v=swipeVideo(swipe.slots.get(swipe.index));if(!v||!isFinite(v.duration))return;e.preventDefault();bar.setPointerCapture(e.pointerId);bar.classList.add('dragging');swipe.seeking=at(e)*v.duration;swipeProgress();
    const move=ev=>{swipe.seeking=at(ev)*v.duration;swipeProgress();};
    const up=ev=>{bar.removeEventListener('pointermove',move);bar.removeEventListener('pointerup',up);bar.removeEventListener('pointercancel',up);bar.classList.remove('dragging');if(swipe){v.currentTime=at(ev)*v.duration;swipe.seeking=null;swipeProgress();}};
    bar.addEventListener('pointermove',move);bar.addEventListener('pointerup',up);bar.addEventListener('pointercancel',up);});
}
function closeSwipe(){
  if(!swipe)return;const s=swipe;swipe=null;clearTimeout(s.idleTimer);for(const slot of s.slots.values()){clearInterval(slot.timer);slot.frame.src='about:blank';}
  delete document.documentElement.dataset.bsSwipe;native('swipe-state',{on:false});
  if(location.hash==='#swipe')history.replaceState(history.state,'',location.pathname+location.search);
  const done=()=>s.layer.remove();if(swipeStill())done();else s.layer.animate([{opacity:1},{opacity:0}],{duration:200,easing:'ease-in',fill:'forwards'}).onfinish=done;
}
function syncSwipeHash(){if(!CONTENT_VIEW)return;if(location.hash==='#swipe'&&pageKind()==='home')openSwipe();else if(swipe&&location.hash!=='#swipe')closeSwipe();}
document.addEventListener('keydown',e=>{if(!swipe||e.target?.closest?.('input,textarea,[contenteditable=true]'))return;
  if(e.key===' '){e.preventDefault();if(!e.repeat)swipeTogglePlay();}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();swipeGo(e.key==='ArrowDown'?1:-1);}else if(e.key==='Escape'&&swipe.comments){e.preventDefault();swipeComments(false);}else if(e.key==='Escape'&&!document.fullscreenElement){e.preventDefault();closeSwipe();}},true);
// The header's 精选 link takes the route indicator while the feed is open.
// While the feed is open the header tucks away; the grip at the top (or the very top edge) brings it back, and it
// tucks again once the pointer leaves it with nothing of its own open.
var swipeOn=false,swipeTucked=false,swipeTuckTimer=0;
function setSwipeActive(on){if(!CHROME_VIEW||!shadow)return;swipeOn=!!on;shadow.host.toggleAttribute('data-swipe',swipeOn);
  const c=$('#chrome',shadow);if(c&&!c.dataset.swipeWired){c.dataset.swipeWired='1';c.addEventListener('pointerenter',()=>clearTimeout(swipeTuckTimer));c.addEventListener('pointerleave',()=>swipeTuckSoon(450));}
  swipeTuck(swipeOn);}
function swipeTuck(on){clearTimeout(swipeTuckTimer);swipeTucked=on;shadow.host.toggleAttribute('data-swipe-tuck',on);reportChromeLayout();}
function swipeHeaderBusy(){const open=q=>{const el=$(q,shadow);if(!el||el.hidden)return false;const look=getComputedStyle(el);return look.display!=='none'&&look.visibility!=='hidden'&&Number(look.opacity)>0&&look.pointerEvents!=='none';};
  return ['#search-panel','#favorites-panel','#account-card','#messages-menu','#header-categories','.account-manager'].some(open)||!!shadow.activeElement?.closest?.('#chrome input')||$('#chrome',shadow)?.matches(':hover');}
function swipeTuckSoon(ms){clearTimeout(swipeTuckTimer);swipeTuckTimer=setTimeout(()=>{if(!swipeOn)return;if(swipeHeaderBusy())swipeTuckSoon(600);else swipeTuck(true);},ms);}
function revealSwipeHeader(){if(!CHROME_VIEW||!swipeOn)return;if(swipeTucked)swipeTuck(false);swipeTuckSoon(1600);}
const SWIPE_CSS=`#bs-swipe{position:fixed;inset:0;z-index:2147483000;background:#000;overflow:clip;color:#fff;font-family:inherit}
#bs-swipe .bs-swipe-track{position:absolute;inset:0}
#bs-swipe .bs-swipe-slot{position:absolute;inset:0;background:#000;will-change:transform}
#bs-swipe .bs-swipe-cover{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;filter:blur(18px) brightness(.55);transform:scale(1.08)}
#bs-swipe .bs-swipe-wait{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:10px;color:rgba(255,255,255,.75);font-size:13px}
#bs-swipe .bs-swipe-wait svg{width:44px;height:44px}
#bs-swipe iframe{position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;transition:opacity .25s ease}
#bs-swipe .bs-swipe-slot.ready iframe{opacity:1}#bs-swipe .bs-swipe-slot.ready .bs-swipe-wait{display:none}
#bs-swipe .bs-swipe-ui{position:absolute;inset:0;pointer-events:none;transition:right .46s cubic-bezier(.32,.72,0,1)}
#bs-swipe.comments .bs-swipe-ui{right:var(--bs-cw,400px)}
#bs-swipe .bs-swipe-chead{position:absolute;top:12px;right:14px;z-index:1;color:var(--bs-ctext,#18191c);transform:translateX(calc(var(--bs-cw,400px) + 14px));transition:transform .46s cubic-bezier(.32,.72,0,1)}
#bs-swipe.comments .bs-swipe-chead{transform:none}
#bs-swipe .bs-swipe-chead button{width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:8px;background:rgba(128,128,128,.12);color:inherit;cursor:pointer;transition:background-color .15s}
#bs-swipe .bs-swipe-chead button:hover{background:rgba(128,128,128,.24)}
#bs-swipe .bs-swipe-chead svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}
#bs-swipe .bs-swipe-ui button{pointer-events:auto;font:inherit;color:#fff;cursor:pointer}
#bs-swipe .bs-swipe-edge{position:absolute;top:0;left:0;right:0;height:6px;pointer-events:auto}
#bs-swipe .bs-swipe-peek{position:absolute;top:0;left:50%;width:min(360px,40%);height:26px;transform:translateX(-50%);display:flex;justify-content:center;pointer-events:auto}
#bs-swipe .bs-swipe-peek i{margin-top:8px;width:40px;height:5px;border-radius:3px;background:rgba(255,255,255,.4);box-shadow:0 1px 4px rgba(0,0,0,.35);transition:width .28s cubic-bezier(.23,1,.32,1),background-color .2s,transform .28s cubic-bezier(.23,1,.32,1)}
#bs-swipe .bs-swipe-peek:hover i{width:64px;background:rgba(255,255,255,.85);transform:translateY(2px)}
#bs-swipe .bs-swipe-detail{position:absolute;top:18px;right:16px;padding:6px 12px;border:0;border-radius:999px;background:rgba(0,0,0,.45);font-size:13px;backdrop-filter:blur(8px)}
#bs-swipe .bs-swipe-nav{position:absolute;right:18px;top:42%;transform:translateY(-50%);display:grid;gap:8px}
#bs-swipe .bs-swipe-nav button{width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:50%;background:rgba(0,0,0,.4);transition:background .18s,transform .18s}#bs-swipe .bs-swipe-nav svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
#bs-swipe .bs-swipe-shade{position:absolute;left:0;right:0;bottom:0;height:260px;background:linear-gradient(to top,rgba(0,0,0,.62),rgba(0,0,0,0))}
#bs-swipe .bs-swipe-dm{position:absolute;left:50%;bottom:30px;width:clamp(240px,28vw,440px);height:32px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:0 3px 0 4px;border-radius:8px;background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);backdrop-filter:blur(14px) saturate(140%);pointer-events:auto;transition:background-color .2s,box-shadow .2s,opacity .3s ease,visibility 0s}
#bs-swipe .bs-swipe-dm:focus-within{background:rgba(0,0,0,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
#bs-swipe .bs-swipe-dm input{flex:1;min-width:0;height:100%;border:0;outline:0;background:none;color:#fff;font:inherit;font-size:13px}#bs-swipe .bs-swipe-dm input::placeholder{color:rgba(255,255,255,.62)}
#bs-swipe .bs-swipe-dm-toggle{flex:none;width:24px;height:24px;display:grid;place-items:center;border:0;border-radius:6px;background:rgba(255,255,255,.18);font-size:13px!important;font-weight:600;transition:background-color .2s,opacity .2s}
#bs-swipe .bs-swipe-dm-toggle[aria-pressed=true]{background:#00aeec}#bs-swipe .bs-swipe-dm-toggle[aria-pressed=false]{opacity:.6}
#bs-swipe .bs-swipe-dm-send{flex:none;height:26px;padding:0 12px;border:0;border-radius:6px;background:#00aeec;font-size:13px!important;transition:filter .15s,transform .15s}#bs-swipe .bs-swipe-dm-send:hover{filter:brightness(1.1)}#bs-swipe .bs-swipe-dm-send:active{transform:scale(.95)}
#bs-swipe .bs-swipe-progress{--p:0;position:absolute;left:0;right:0;bottom:0;height:14px;pointer-events:auto;cursor:pointer;touch-action:none}
#bs-swipe .bs-swipe-progress::before,#bs-swipe .bs-swipe-progress i{content:'';position:absolute;left:0;bottom:0;height:3px;transition:height .18s cubic-bezier(.23,1,.32,1)}
#bs-swipe .bs-swipe-progress::before{right:0;background:rgba(255,255,255,.22)}#bs-swipe .bs-swipe-progress i{width:calc(var(--p)*100%);background:#00aeec}
#bs-swipe .bs-swipe-progress b{position:absolute;bottom:-3.5px;left:calc(var(--p)*100%);width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4);transform:scale(0);transition:transform .18s cubic-bezier(.23,1,.32,1)}
#bs-swipe .bs-swipe-progress span{position:absolute;right:16px;bottom:12px;font-size:12px;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.6);opacity:0;transition:opacity .18s}
#bs-swipe .bs-swipe-progress:is(:hover,.dragging)::before,#bs-swipe .bs-swipe-progress:is(:hover,.dragging) i{height:6px}#bs-swipe .bs-swipe-progress:is(:hover,.dragging) b{transform:scale(1)}#bs-swipe .bs-swipe-progress:is(:hover,.dragging) span{opacity:1}
#bs-swipe .bs-swipe-nav button:hover{background:rgba(0,0,0,.65)}#bs-swipe .bs-swipe-nav button:active{transform:scale(.92)}
#bs-swipe .bs-swipe-info{position:absolute;left:20px;bottom:24px;max-width:min(520px,calc(50% - 14vw - 40px));text-shadow:0 1px 3px rgba(0,0,0,.6)}
#bs-swipe .bs-swipe-owner{display:flex;align-items:center;gap:10px;margin-bottom:8px}
#bs-swipe .bs-swipe-owner img{width:40px;height:40px;border-radius:50%;object-fit:cover}
#bs-swipe .bs-swipe-owner p{margin:0;display:flex;align-items:center;gap:8px;font-size:15px}
#bs-swipe .bs-swipe-owner small{font-size:12px;color:rgba(255,255,255,.8)}
#bs-swipe .bs-swipe-follow{padding:3px 10px;border:0;border-radius:6px;background:#fb7299;font-size:12px;text-shadow:none}
#bs-swipe .bs-swipe-title{margin:0;display:flex;gap:6px;align-items:flex-start;font-size:15px;font-weight:600;line-height:1.45}
#bs-swipe .bs-swipe-title span{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
#bs-swipe .bs-swipe-title button{flex:none;width:22px;height:22px;margin-top:-.5px;display:grid;place-items:center;border:0;border-radius:50%;padding:0;background:rgba(255,255,255,.18);transition:transform .42s cubic-bezier(.32,.72,0,1),background-color .15s}
#bs-swipe .bs-swipe-title button:hover{background:rgba(255,255,255,.3)}
#bs-swipe .bs-swipe-title svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
#bs-swipe .bs-swipe-desc{display:none;margin:6px 0 0;font-size:13px;line-height:1.55;color:rgba(255,255,255,.85);max-height:9em;overflow:auto;white-space:pre-wrap;pointer-events:auto}
#bs-swipe .expanded .bs-swipe-title span{-webkit-line-clamp:4}#bs-swipe .expanded .bs-swipe-desc{display:block}#bs-swipe .expanded .bs-swipe-title button{transform:rotate(180deg)}
#bs-swipe .bs-swipe-season{margin-top:8px;padding:4px 10px;border:0;border-radius:6px;background:rgba(255,255,255,.14);font-size:12px}
#bs-swipe .bs-swipe-actions{position:absolute;right:24px;bottom:24px;display:flex;gap:22px}
#bs-swipe.comments .bs-swipe-dm{left:auto;right:24px;bottom:96px;transform:none;width:min(300px,calc(100% - 48px))}#bs-swipe.comments .bs-swipe-info{max-width:calc(100% - 380px)}#bs-swipe.comments .bs-swipe-actions{gap:14px}
@media (max-width:1000px){#bs-swipe .bs-swipe-dm{left:auto;right:24px;bottom:96px;transform:none;width:300px}#bs-swipe .bs-swipe-info{max-width:calc(100% - 380px)}#bs-swipe .bs-swipe-actions{gap:14px}}
#bs-swipe .bs-swipe-actions button{display:grid;justify-items:center;gap:3px;min-width:40px;border:0;background:none;padding:0;user-select:none;-webkit-user-select:none;touch-action:none}
#bs-swipe .bs-swipe-icon{position:relative;display:grid;place-items:center;width:40px;height:40px;transition:transform .16s cubic-bezier(.23,1,.32,1)}
#bs-swipe .bs-swipe-actions button:hover .bs-swipe-icon{transform:scale(1.08)}#bs-swipe .bs-swipe-actions button:active .bs-swipe-icon{transform:scale(.9)}
#bs-swipe .bs-swipe-icon>svg:last-of-type{width:32px;height:32px;fill:#fff;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));transition:fill .2s}
#bs-swipe .bs-swipe-actions button.on .bs-swipe-icon>svg:last-of-type{fill:#00aeec}
#bs-swipe .bs-swipe-actions small{font-size:13px;font-weight:600;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.6);font-variant-numeric:tabular-nums}
#bs-swipe .bs-swipe-ring{position:absolute;inset:-4px;width:48px;height:48px;transform:rotate(-90deg);opacity:0;pointer-events:none;fill:none;stroke:#00aeec;stroke-width:3;stroke-linecap:round;stroke-dasharray:138.3;stroke-dashoffset:138.3;transition:opacity .15s}
#bs-swipe .charging .bs-swipe-ring{opacity:1;animation:bs-swipe-ring 1.3s linear forwards}
#bs-swipe .charging :is([data-swipe=like],[data-swipe=coin],[data-swipe=fav]) .bs-swipe-icon>svg:last-of-type{fill:#00aeec;animation:bs-swipe-shake .5s ease-in-out infinite}
@keyframes bs-swipe-ring{to{stroke-dashoffset:0}}
@keyframes bs-swipe-shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
#bs-swipe .bs-swipe-svga{position:absolute;z-index:2;pointer-events:none}
#bs-swipe .bs-swipe-svga.center{width:92px;height:92px;left:calc(50% - 46px);top:calc(50% - 46px)}
#bs-swipe .bs-swipe-svga.top{width:120px;height:120px;left:calc(50% - 60px);bottom:calc(50% - 6px)}
#bs-swipe .bs-swipe-ui>:is(.bs-swipe-detail,.bs-swipe-nav,.bs-swipe-shade,.bs-swipe-info,.bs-swipe-progress,.bs-swipe-actions),#bs-swipe .bs-swipe-actions>button{transition:opacity .3s ease,visibility 0s}
#bs-swipe.idle .bs-swipe-ui>:is(.bs-swipe-detail,.bs-swipe-nav,.bs-swipe-shade,.bs-swipe-info,.bs-swipe-progress,.bs-swipe-actions,.bs-swipe-dm),
#bs-swipe.clean .bs-swipe-ui>:is(.bs-swipe-detail,.bs-swipe-nav,.bs-swipe-shade,.bs-swipe-info,.bs-swipe-progress,.bs-swipe-dm),
#bs-swipe.clean .bs-swipe-actions>button:not(.bs-swipe-clean){opacity:0!important;visibility:hidden!important;transition:opacity .3s ease,visibility 0s .3s!important}
#bs-swipe.idle .bs-swipe-peek i{opacity:0}
#bs-swipe .bs-swipe-clean .bs-eye-shut,#bs-swipe .bs-swipe-clean[aria-pressed=true] .bs-eye-open{display:none}#bs-swipe .bs-swipe-clean[aria-pressed=true] .bs-eye-shut{display:inline}
@media (prefers-reduced-motion:reduce){#bs-swipe :is(.bs-swipe-ui,.bs-swipe-chead){transition:none}#bs-swipe .charging .bs-swipe-icon>svg{animation:none!important}#bs-swipe .bs-swipe-peek i{transition:none}}
@media (prefers-reduced-motion:reduce){#bs-swipe .bs-swipe-slot{transition:none!important}}`;
function showOnboarding(){
  const renewed=!(typeof RUNTIME!=='undefined'&&RUNTIME.firstRun);
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches,EASE='cubic-bezier(.32,.72,0,1)';
  const previous=shadow.activeElement,layer=document.createElement('div');layer.id='onboarding';layer.className='ob-layer';
  const card=document.createElement('section');card.className='ob-card';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');
  const zoom=Number(PREFS.settingsZoom)||100;
  const choice=(attr,value,pressed,inner,label)=>`<button type="button" class="ob-choice" ${attr}="${value}" aria-pressed="${pressed}">${inner}<span class="ob-choice-label">${label}</span></button>`;
  const copy=(eyebrow,title,body,extra='')=>`<div class="ob-copy"><p class="ob-eyebrow">${eyebrow}</p><h2>${title}</h2><p class="ob-body">${body}</p>${extra}</div>`;
  const pages=[
    copy(renewed?APP_META.version+' · 大翻新':'欢迎',renewed?'Bili-Space 大翻新':'欢迎使用 Bili-Space',
      renewed?'顶栏、动画和设置都重新做了一遍。先看看有哪些变化，再一项一项把常用的设好。':'一个更安静、更顺手的 B 站桌面客户端。花半分钟，把它调成你喜欢的样子。',
      renewed?`<ul class="ob-points"><li>重做的顶栏和更跟手的动画</li><li>设置界面字号可以随意拖动</li><li>插件可以加按钮、面板，甚至接入 AI</li></ul>`:'')+
    `<figure class="ob-gallery ob-visual"><div class="ob-frame">${ONBOARDING_SHOTS.map(([f,t],i)=>`<img src="${onboardingAsset(f)}" alt="${t}" decoding="async" class="${i?'':'ob-on'}">`).join('')}</div>
     <figcaption><b>${ONBOARDING_SHOTS[0][1]}</b><span>${ONBOARDING_SHOTS[0][2]}</span></figcaption>
     <div class="ob-dots" role="tablist" aria-label="界面展示">${ONBOARDING_SHOTS.map(([,t],i)=>`<button type="button" role="tab" aria-label="${t}" aria-selected="${!i}" data-shot="${i}"></button>`).join('')}</div></figure>`,
    copy('主题','选一个主题','深色看久了不累眼，浅色更清爽。跟随系统会随 Windows 的设置自动切换。')+
    `<div class="ob-visual ob-choices">${[['light','浅色'],['dark','深色'],['system','跟随系统']].map(([id,t])=>choice('data-theme-choice',id,PREFS.theme===id,`<i class="ob-mock ob-${id}"><b></b><em></em><em></em></i>`,t)).join('')}</div>`,
    copy('强调色','挑一个强调色','按钮、进度条、选中的标签和开关都会用它。')+
    `<div class="ob-visual ob-accent-stage"><div class="ob-accent-preview" aria-hidden="true"><div class="ob-tabs"><span class="ob-tab-on">首页</span><span>动态</span><span>历史</span></div><div class="ob-bar"><i></i></div><div class="ob-preview-row"><span class="ob-fake-button">关注</span><span class="ob-fake-switch"><i></i></span></div></div>
     <div class="ob-swatches">${ONBOARDING_ACCENTS.map(([c,n])=>`<button type="button" class="ob-swatch" data-accent="${c}" style="--c:${c}" aria-label="${n}" title="${n}" aria-pressed="${PREFS.accent===c}"></button>`).join('')}</div></div>`,
    copy('字体','选一种字体','抖音美好体更圆润耐看，系统字体更紧凑。只影响客户端自己的界面。')+
    `<div class="ob-visual ob-choices ob-two">${choice('data-font-choice','true',!!PREFS.font,'<i class="ob-sample" style="font-family:BiliDouyin,sans-serif">看视频<br>更舒服</i>','抖音美好体')}${choice('data-font-choice','false',!PREFS.font,'<i class="ob-sample" style="font-family:\'Microsoft YaHei UI\',sans-serif">看视频<br>更舒服</i>','系统字体')}</div>`,
    copy('动效','按钮要不要弹一下','弹性按钮会在鼠标移上去时轻轻弹一下。把鼠标放到左边的按钮上试试。')+
    `<div class="ob-visual ob-choices ob-two">${choice('data-bounce-choice','true',!!PREFS.experimentalBounce,'<i class="ob-demo ob-demo-bounce"><span>移上来</span></i>','弹性')}${choice('data-bounce-choice','false',!PREFS.experimentalBounce,'<i class="ob-demo"><span>移上来</span></i>','安静')}</div>`,
    copy('顶栏','顶栏放哪些按钮','点一下切换显示或隐藏，以后在「个性化 → 顶栏」里还能调顺序以外的更多细节。')+
    `<div class="ob-visual ob-chips">${HEADER_ITEMS.map(([key,label])=>`<button type="button" class="ob-chip" data-pref-toggle="${key}" aria-pressed="${PREFS[key]!==false}">${label}</button>`).join('')}</div>`,
    copy('首页','首页每行放几个视频','自动会随窗口宽度变化；固定数量时，窗口变宽也至少放这么多。')+
    `<div class="ob-visual ob-choices ob-four">${[[0,'自动'],[4,'4 个'],[5,'5 个'],[6,'6 个']].map(([n,t])=>choice('data-pref-choice',`feedColumns:${n}`,Number(PREFS.feedColumns)===n,`<i class="ob-grid" style="--n:${n||4}">${'<b></b>'.repeat((n||4)*2)}</i>`,t)).join('')}</div>`,
    copy('页面缩放','页面里的字大一点','B 站页面整体放大或缩小。最大化和全屏时客户端还会自动放大，这里调的是基础大小。')+
    `<div class="ob-visual ob-zoom-stage"><div class="ob-page-preview" style="--p:${(Number(PREFS.zoom)||100)/100}" aria-hidden="true"><b>【4K】城市夜景延时摄影</b><small>UP 主 · 3.2 万播放 · 2 小时前</small></div>
     <div class="ob-range"><span>小</span><input type="range" min="75" max="150" step="5" value="${Number(PREFS.zoom)||100}" data-ob-page-zoom aria-label="页面缩放"><span>大</span><output>${Number(PREFS.zoom)||100}%</output></div></div>`,
    copy('字号','设置界面的字号','觉得设置里的字太小就拉大一点，只影响设置窗口。')+
    `<div class="ob-visual ob-zoom-stage"><div class="ob-zoom-preview" style="--z:${zoom/100}" aria-hidden="true"><div><b>弹性按钮</b><small>鼠标移到客户端按钮上时轻轻弹一下</small></div><span class="ob-fake-switch ob-on"><i></i></span></div>
     <div class="ob-range"><span>小</span><input type="range" min="80" max="160" step="5" value="${zoom}" data-ob-zoom aria-label="设置界面字号"><span>大</span><output>${zoom}%</output></div></div>`,
    copy('页面净化','要不要屏蔽广告','屏蔽首页和视频页里的推广卡片、广告位，推荐流更干净。')+
    `<div class="ob-visual ob-choices ob-two">${choice('data-pref-choice','hideAds:true',PREFS.hideAds!==false,'<i class="ob-icon">✓</i>','屏蔽广告')}${choice('data-pref-choice','hideAds:false',PREFS.hideAds===false,'<i class="ob-icon ob-muted">—</i>','保留原样')}</div>`,
    copy('声音','让每个视频音量差不多','声音平衡会把特别响和特别小声的视频拉到接近的音量，切换视频不用再调音量。')+
    `<div class="ob-visual ob-choices ob-two">${choice('data-pref-choice','soundBalance:true',PREFS.soundBalance!==false,'<i class="ob-wave ob-even"><b></b><b></b><b></b><b></b><b></b></i>','开启平衡')}${choice('data-pref-choice','soundBalance:false',PREFS.soundBalance===false,'<i class="ob-wave"><b></b><b></b><b></b><b></b><b></b></i>','保持原声')}</div>`,
    copy('关闭窗口','点关闭按钮时','最小化到托盘可以继续在后台收到消息和更新；直接退出会完全关掉客户端。')+
    `<div class="ob-visual ob-choices ob-two">${choice('data-pref-choice','closeAction:=tray',PREFS.closeAction!=='exit','<i class="ob-icon">⌄</i>','最小化到托盘')}${choice('data-pref-choice','closeAction:=exit',PREFS.closeAction==='exit','<i class="ob-icon">×</i>','直接退出')}</div>`,
    `<div class="ob-copy ob-center"><div class="ob-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><p class="ob-eyebrow">完成</p><h2>一切就绪</h2>
     <p class="ob-body">更多外观、顶栏、首页和播放的选项，都在「个性化」里等你慢慢调。</p></div>`
  ];
  const last=pages.length-1;
  card.innerHTML=`<div class="ob-progress" aria-hidden="true">${pages.map(()=>'<i></i>').join('')}</div>
<div class="ob-stage">${pages.map((html,i)=>`<div class="ob-step${i?'':' ob-show'}${i===last?' ob-final':''}" data-step="${i}" tabindex="-1">${html}</div>`).join('')}</div>
<footer class="ob-foot"><button type="button" class="ob-ghost" data-ob="skip">${renewed?'还是现在好':'跳过'}</button><span class="ob-gap"></span><button type="button" class="ob-ghost" data-ob="back" hidden>上一步</button><button type="button" class="ob-ghost" data-ob="finish" hidden>开始使用</button><button type="button" class="ob-primary" data-ob="next">开始设置</button></footer>`;
  layer.append(card);shadow.append(layer);native('tour-backdrop',{on:true});
  const steps=$$('.ob-step',card),bars=$$('.ob-progress i',card),next=$('[data-ob=next]',card),back=$('[data-ob=back]',card),skip=$('[data-ob=skip]',card),finish=$('[data-ob=finish]',card);
  let step=0,motions=[];
  // Gallery: crossfades every 4.5 s, pauses while the pointer is on it; the dots pick a shot.
  const shots=$$('.ob-frame img',card),dots=$$('.ob-dots button',card),caption=$('figcaption',card);let shot=0,cycle=0;
  const showShot=i=>{shot=(i+shots.length)%shots.length;shots.forEach((im,k)=>im.classList.toggle('ob-on',k===shot));dots.forEach((d,k)=>d.setAttribute('aria-selected',String(k===shot)));caption.firstChild.textContent=ONBOARDING_SHOTS[shot][1];caption.lastChild.textContent=ONBOARDING_SHOTS[shot][2];};
  const play=()=>{clearInterval(cycle);if(!still&&step===0)cycle=setInterval(()=>showShot(shot+1),4500);};
  dots.forEach(d=>d.addEventListener('click',()=>{showShot(Number(d.dataset.shot));play();}));
  const gallery=$('.ob-gallery',card);gallery.addEventListener('pointerenter',()=>clearInterval(cycle));gallery.addEventListener('pointerleave',play);play();
  const render=()=>{bars.forEach((b,i)=>b.classList.toggle('ob-done',i<=step));back.hidden=step===0;skip.hidden=step===last;finish.hidden=step!==last;
    next.textContent=step===0?'开始设置':step===last?'打开个性化':'下一步';card.setAttribute('aria-label',$('h2',steps[step])?.textContent||'');};
  // One page out, the next in: they slide a little in the reading direction and cross-fade; the new page's copy and
  // visual arrive a beat apart. Only transform and opacity move. A new turn finishes the previous one at once.
  const go=to=>{
    if(to===step||to<0||to>last)return;const from=steps[step],into=steps[to],dir=to>step?1:-1;
    motions.forEach(m=>m.finish());motions=[];steps.forEach(x=>{if(x!==from)x.classList.remove('ob-show');});
    // A page that left earlier may still hold its exit pose; clear the script motions (CSS ones restart on display).
    into.getAnimations({subtree:true}).forEach(m=>{if(!(m instanceof CSSAnimation))m.cancel();});
    step=to;render();play();into.classList.add('ob-show');
    if(still){from.classList.remove('ob-show');}
    else{
      const out=from.animate([{opacity:1,transform:'none'},{opacity:0,transform:`translateX(${-36*dir}px)`}],{duration:240,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
      out.finished.then(()=>{if(steps[step]!==from)from.classList.remove('ob-show');out.cancel();},()=>{});motions.push(out);
      for(const [k,part] of [...into.children].entries())motions.push(part.animate([{opacity:0,transform:`translateX(${44*dir}px)`},{opacity:1,transform:'none'}],{duration:420,delay:90+k*60,easing:EASE,fill:'backwards'}));
    }
    into.focus({preventScroll:true});
  };
  let closed=false;
  const close=openPersonal=>{if(closed)return;closed=true;clearInterval(cycle);update({onboardingSeen:true});scheduleWhatsNew(1600);native('tour-backdrop',{on:false});
    const done=()=>{layer.remove();if(openPersonal){currentTab='appearance';openSettings();}else previous?.focus?.();};
    // The card leaves first; the veil over the client then lifts slowly while the page behind un-blurs.
    if(still)done();else{card.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px) scale(.96)'}],{duration:260,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});layer.animate([{opacity:1},{opacity:0}],{duration:900,delay:120,easing:'cubic-bezier(.32,.72,0,1)',fill:'forwards'}).onfinish=done;}};
  const press=(selector,chosen)=>$$(selector,card).forEach(b=>b.setAttribute('aria-pressed',String(b===chosen)));
  card.addEventListener('click',e=>{const action=e.target.closest('[data-ob]')?.dataset.ob;
    if(action==='next'){if(step<last)go(step+1);else close(true);}
    else if(action==='back')go(step-1);
    else if(action==='skip'||action==='finish'){close(false);if(action==='skip'&&renewed)toast('已保留你现在的设置');}
    const theme=e.target.closest('[data-theme-choice]');if(theme){update({theme:theme.dataset.themeChoice});press('[data-theme-choice]',theme);}
    const swatch=e.target.closest('[data-accent]');if(swatch){update({accent:swatch.dataset.accent,progressColor:swatch.dataset.accent});press('[data-accent]',swatch);}
    const font=e.target.closest('[data-font-choice]');if(font){update({font:font.dataset.fontChoice==='true'});press('[data-font-choice]',font);}
    const bounce=e.target.closest('[data-bounce-choice]');if(bounce){update({experimentalBounce:bounce.dataset.bounceChoice==='true'});press('[data-bounce-choice]',bounce);}
    const pick=e.target.closest('[data-pref-choice]');if(pick){const [key,raw]=pick.dataset.prefChoice.split(/:(.*)/s);update({[key]:raw.startsWith('=')?raw.slice(1):JSON.parse(raw)});$$('[data-pref-choice]',card).filter(b=>b.dataset.prefChoice.startsWith(key+':')).forEach(b=>b.setAttribute('aria-pressed',String(b===pick)));}
    const toggle=e.target.closest('[data-pref-toggle]');if(toggle){const on=toggle.getAttribute('aria-pressed')!=='true';toggle.setAttribute('aria-pressed',String(on));update({[toggle.dataset.prefToggle]:on});}});
  card.addEventListener('input',e=>{if(e.target.matches('[data-ob-page-zoom]')){const v=Number(e.target.value);e.target.parentElement.querySelector('output').textContent=v+'%';$('.ob-page-preview',card).style.setProperty('--p',String(v/100));return;}if(!e.target.matches('[data-ob-zoom]'))return;const v=Number(e.target.value);e.target.parentElement.querySelector('output').textContent=v+'%';$('.ob-zoom-preview',card).style.setProperty('--z',String(v/100));});
  card.addEventListener('change',e=>{if(e.target.matches('[data-ob-zoom]'))update({settingsZoom:Number(e.target.value)});if(e.target.matches('[data-ob-page-zoom]'))update({zoom:Number(e.target.value)});});
  layer.addEventListener('keydown',e=>{if(e.isComposing)return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(false);}
    else if((e.key==='ArrowRight'||e.key==='ArrowLeft')&&!e.target.matches?.('input')){e.preventDefault();go(step+(e.key==='ArrowRight'?1:-1));}
    else if(e.key==='Tab'){const items=$$('button:not([hidden]),input',steps[step]).concat($$('.ob-foot button:not([hidden])',card));e.preventDefault();e.stopPropagation();if(!items.length)return;const i=items.indexOf(shadow.activeElement);items[(i+(e.shiftKey?-1:1)+items.length)%items.length].focus();}});
  render();
  if(!still){layer.animate([{opacity:0},{opacity:1}],{duration:260,easing:'ease-out'});card.animate([{opacity:0,transform:'translateY(16px) scale(.97)'},{opacity:1,transform:'none'}],{duration:440,easing:EASE});
    [...steps[0].children].forEach((part,k)=>part.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:440,delay:120+k*80,easing:EASE,fill:'backwards'}));}
  steps[0].focus({preventScroll:true});
}
function renderUpdatePanel(){
  if(!shadow)return;const line=$('#client-update-status',shadow);if(!line)return;
  $('#app-version',shadow).textContent=APP_META.version;$('#app-author',shadow).textContent=APP_META.author;
  line.textContent=clientUpdate.message||'';$('#update-version',shadow).textContent=clientUpdate.available?'新版本 '+clientUpdate.version:'';
  const list=$('#update-notes',shadow);list.replaceChildren(...(clientUpdate.changelog||[]).map(text=>{const li=document.createElement('li');li.textContent=String(text);return li;}));
  $$('[data-update=check],[data-update=download],[data-update=install]',shadow).forEach(b=>b.disabled=!!clientUpdate.busy);
  $('[data-update=download]',shadow).hidden=!clientUpdate.available||!!clientUpdate.ready;
  $('[data-update=ignore]',shadow).hidden=!clientUpdate.available||!!clientUpdate.required||!!clientUpdate.ignored;
  $('[data-update=install]',shadow).hidden=!clientUpdate.ready;
}
function acceptUpdateStatus(value){
  clientUpdate={...value};renderUpdatePanel();showUpdateNotice(value);
  const trigger=$('#settings-trigger',shadow);if(trigger){trigger.dataset.updateAvailable=String(!!value.available&&!value.ignored);trigger.title=value.available&&!value.ignored?'发现新版本 · 客户端设置':'客户端设置 · Ctrl+,';}
}
// Super-resolution and frame interpolation need WebGPU on Windows 10/11; elsewhere they are forced off, so their rows are left out.
function withoutVideoAi(html){if(NATIVE_PLATFORM==='windows'&&!(typeof RUNTIME!=='undefined'&&RUNTIME.legacyWin7))return html;
  const t=document.createElement('template');t.innerHTML=html;t.content.querySelector('.note[role=note]')?.remove();
  for(const id of ['srMode','srModel','srScale','fiMode','fiFps'])t.content.querySelector('#pref-'+id)?.closest('.row')?.remove();
  t.content.querySelector('#fi-status')?.remove();
  const box=document.createElement('div');box.append(t.content);return box.innerHTML;}
function tabContent(tab=currentTab){
  if(tab==='downloads')return '<h2>下载任务</h2><div class="row"><label for="pref-downloadConnections">下载连接数</label><select id="pref-downloadConnections" data-pref="downloadConnections"><option value="1">1 · 单连接</option><option value="4">4</option><option value="8">8</option><option value="16">16</option><option value="32">32</option><option value="64">64</option><option value="128">128</option><option value="256">256 · 默认</option><option value="512">512 · 极限</option></select></div><div id="downloads44-panel" tabindex="-1" data-setting-keywords="下载 任务队列 多P 合集 暂停 继续 断点续传"></div>';
  if(tab==='blocklist')return '<h2>拉黑管理</h2><div id="blacklist44-panel" tabindex="-1" data-setting-keywords="拉黑 黑名单 取消拉黑 UP主"></div>';
  if(tab==='community')return '<h2>观看记录</h2><div id="community44-panel" tabindex="-1" data-setting-keywords="观看统计 周报 订阅提醒"></div>';
  if(tab==='feedback')return `<h2>反馈</h2><p class="subtitle">遇到问题、想要新功能，都可以直接告诉开发者。</p><div class="row"><label>写一条反馈<span class="hint">邮箱可选，不填开发者就没法回复你；不会附带账号、Cookie 和浏览记录</span></label><button id="feedback-open" class="link" type="button">写反馈</button></div><div class="note">也可以在托盘图标的右键菜单里选「反馈问题…」。</div>`;
  if(tab==='about')return `<h2>Bili-Space</h2><div class="row"><span>版本号</span><strong id="app-version"></strong></div><div class="row"><span>作者</span><strong id="app-author"></strong></div><p class="subtitle">更新源 · bili.gvqi.top</p><div class="section-label">更新 / UPDATES</div><p id="client-update-status" role="status" aria-live="polite"></p><strong id="update-version"></strong><ul id="update-notes"></ul><div class="actions"><button class="link" data-update="check">检查更新</button><button class="link" data-update="download" hidden>下载更新</button><button class="link" data-update="ignore" hidden>忽略此版本</button><button class="link" data-update="install" hidden>安装并重启</button><button class="link" data-update="log">查看检查日志</button><button class="link" id="whats-new-open">查看更新公告</button><button class="link" id="share-open">分享 Bili-Space</button></div><div class="note">下载完成后可在此安装并重启，保留登录和设置。</div>`;

  if(tab==='categories'){
    const total=CATEGORIES.length,chosen=PREFS.categorySelection.length;
    return `<h2>分区</h2><p class="subtitle">已选 ${chosen} / ${total}</p><div class="chip-actions"><button class="link" id="category-default">推荐 8 个</button><button class="link" id="category-all">全选</button><button class="link" id="category-none">全不选</button></div><div class="chip-grid">${CATEGORIES.map(([label],i)=>`<label class="chip"><input id="category-${i}" type="checkbox" data-category="${i}" ${PREFS.categorySelection.includes(i)?'checked':''}><span>${label}</span></label>`).join('')}</div>`;
  }
  if(tab==='network'){
    const on=Boolean(proxyInfo.running||PREFS.proxy);
    return `<h2>网络代理</h2><p class="subtitle">Mihomo · 仅代理客户端</p><div class="row"><label for="proxy-switch">代理开关<span class="hint">更改后重启客户端</span></label><input id="proxy-switch" type="checkbox" data-action="proxy-toggle" ${on?'checked':''}></div><div class="note" id="proxy-status">${escapeHtml(proxyLine())}</div><div class="row"><label for="proxy-node">当前节点</label><select id="proxy-node" aria-label="代理节点"></select></div>${toggle('proxyAll','全局代理','所有客户端流量通过代理')}<div class="actions"><button class="link" id="proxy-free">用内置免费节点</button><button class="link" id="proxy-import">导入 Clash 配置…</button><button class="link" id="proxy-check">检测出口地区</button></div><div class="note" id="proxy-region">尚未检测</div><div class="note">节点出口需符合番剧授权地区。免费节点来源不受信任，请勿用于敏感账户。</div>`;
  }
  if(tab==='header')return `<h2>顶部栏</h2>${HEADER_ITEMS.map(([key,label])=>toggle(key,label,'')).join('')}<div class="actions"><button id="header-reset" class="link">恢复顶部默认布局</button></div>`;
  if(tab==='appearance')return `<h2>个性化</h2><div class="row"><label for="pref-language">语言 · Language</label><select id="pref-language" data-pref="language" data-i18n-skip>${LANGUAGES.map(([k,n])=>`<option value="${k}">${escapeHtml(n)}</option>`).join('')}</select></div><div class="section-label">顶部栏与投稿</div>${HEADER_ITEMS.map(([key,label])=>toggle(key,label,'')).join('')}<div class="actions"><button id="header-reset" class="link">恢复顶部默认布局</button></div>${toggle('showChannels','显示网页分区导航栏','网页原有的动态、热门、番剧等分区；开启磨砂后同步适配')}${toggle('logoAutoHide','自动隐藏 Logo','只在首页显示')}<div class="row"><label for="pref-feedColumns">首页每行最少视频数<span class="hint">窗口变宽时仍会自动增加</span></label><select id="pref-feedColumns" data-pref="feedColumns"><option value="0">自动适应窗口</option>${[2,3,4,5,6,7,8].map(n=>`<option value="${n}">至少 ${n} 个</option>`).join('')}</select></div>${toggle('trafficLights','使用红绿灯窗口按钮','')}${toggle('showClock','显示时间','Logo 左侧')}${toggle('videoLinkButton','视频页显示复制链接','顶栏 Logo 左侧，点击复制当前视频链接')}${toggle('videoLinkCompact','复制链接变小','只显示圆角链接图标，不显示网址')}<div class="row"><label for="pref-watchlaterOpen">稍后再看的视频<span class="hint">从稍后再看里打开视频时</span></label><select id="pref-watchlaterOpen" data-pref="watchlaterOpen"><option value="list">保留稍后再看列表</option><option value="video">跳转到普通视频页</option></select></div>${NATIVE_PLATFORM==='windows'?toggle('officialVideoStyle','官方视频播放样式','不显示右侧视频栏，点开视频直接在当前页面播放，返回键回到上一页'):''}${toggle('pipDanmaku','画中画弹幕','')}${range('pipDanmakuMinWidth','弹幕显示最小宽度',320,1200,'px')}<div class="row"><label for="pref-closeAction">关闭窗口 / Ctrl+W</label><select id="pref-closeAction" data-pref="closeAction"><option value="tray">隐藏到托盘</option><option value="exit">直接退出</option></select></div><div class="row"><label for="pref-videoLoadingMode">加载动画结束时机</label><select id="pref-videoLoadingMode" data-pref="videoLoadingMode"><option value="page">页面就绪</option><option value="video">视频画面就绪</option></select></div>${toggle('clipboardAutoOpen','剪贴板视频提示','检测新复制的 BV 号或视频链接，确认后跳转')}${toggle('experimentalFrost','测试版磨砂','按钮与主页卡片使用跟随主题和强调色的磨砂材质')}${toggle('experimentalBounce','弹性按钮','鼠标移到客户端按钮上时轻轻弹一下')}${toggle('experimentalFullscreenMotion','全屏动画（实验性）','进出全屏时视频从原位放大、缩回；仍可能闪烁')}<div class="section-label">主题 / APPEARANCE</div><div class="themes">${[['light','浅色'],['dark','深色'],['system','跟随系统']].map(([id,title])=>`<button class="theme" data-theme-choice="${id}" aria-pressed="${PREFS.theme===id}"><div class="mini ${id==='system'?'auto':id}"><i></i><em></em></div><span>${title}</span></button>`).join('')}</div><div class="row"><label for="pref-accent">强调色</label><input id="pref-accent" data-pref="accent" type="color" value="${PREFS.accent}"></div>${toggle('font','抖音美好体','')}${range('settingsZoom','设置界面字号',80,160,'%')}${range('zoom','窗口缩放',75,200,'%')}${toggle('autoZoom','最大化 / 全屏时自动放大','')}<div class="row"><label for="pref-autoZoomTarget">全屏放大档位<span class="hint">数值越小，界面越大</span></label><select id="pref-autoZoomTarget" data-pref="autoZoomTarget"><option value="1100">超大 · 1100</option><option value="1280">舒适 · 1280</option><option value="1440">标准 · 1440</option><option value="1600">紧凑 · 1600</option></select></div>${tabContent('progress')}`;
  if(tab==='progress')return `<h2>进度条</h2><div class="preview" style="--height:${PREFS.progressHeight}px;--radius:${PREFS.progressRadius}px;--progress:${PREFS.progressColor}"><div class="track"><div class="buffer"></div><div class="played">${PREFS.progressThumb?'<i class="thumb"></i>':''}</div></div></div><div class="row"><label for="pref-progressColor">播放进度颜色</label><input id="pref-progressColor" data-pref="progressColor" type="color" value="${PREFS.progressColor}"></div>${range('progressHeight','进度条高度',1,12,'px')}${range('progressRadius','圆角',0,12,'px')}${toggle('progressThumb','显示拖动圆点','')}${toggle('progressAlways','始终显示播放控制条','')}`;
  if(tab==='clean')return `<h2>页面净化</h2>${toggle('hideAds','自动清理广告与运营推广','首页轮播、赛事/下载入口、视频下方横幅与右侧推广卡片。')}<div class="actions"><button class="link" id="rescan">重新检查当前页面</button><span class="status" id="ad-count"></span></div>`;
  if(tab==='play')return withoutVideoAi(`<h2>播放</h2>${toggle('soundBalance','声音平衡器','平衡不同视频的响度')}<p id="sound-balance-status" class="hint"></p><div class="row"><label for="pref-volumeBoost">音量增益<span class="hint">超过 100% 可能失真</span></label><input id="pref-volumeBoost" data-pref="volumeBoost" type="range" min="100" max="200" step="5" value="${PREFS.volumeBoost}"><output>${PREFS.volumeBoost}%</output></div><div class="note" role="note"><strong>⚠ 测试功能</strong><br>超分与补帧仍在测试，可能卡顿、闪烁或产生伪影。</div><div class="row"><label for="pref-srMode">超分辨率<span class="hint">WebGPU · 每个源帧只计算一次</span></label><select id="pref-srMode" data-pref="srMode"><option value="off">关闭</option><option value="performance">性能</option><option value="quality">质量</option></select></div><div class="row"><label for="pref-srModel">超分模型<span class="hint">自动：番剧、国创、动画区用动画模型，其余用通用模型</span></label><select id="pref-srModel" data-pref="srModel"><option value="auto">自动识别</option><option value="anime">动画（Anime4K）</option><option value="general">通用</option></select></div><div class="row"><label for="pref-srScale">目标倍率</label><select id="pref-srScale" data-pref="srScale"><option value="1">1× · 原生（不推理）</option><option value="2">2×</option><option value="3">3×</option></select></div><div class="row"><label for="pref-fiMode">补帧模式</label><select id="pref-fiMode" data-pref="fiMode"><option value="off">关闭</option><option value="rife">画面补帧（Lossless Scaling 式）</option></select></div><div class="row"><label for="pref-fiFps">补帧上限<span class="hint">不超过屏幕刷新率</span></label><select id="pref-fiFps" data-pref="fiFps"><option value="60">60 fps</option><option value="120">120 fps</option><option value="144">144 fps</option><option value="240">240 fps</option></select></div><p id="fi-status">${interpolator?.status||'补帧未开启'}</p><div class="row"><div class="label">当前处理状态<span class="hint" id="gpu-status"></span></div><button class="link" id="pip-action">进入画中画 ↗</button></div>`);
  return `<div class="compact-tab"><h2>扩展</h2>${toggle('clickGui','悬浮设置面板','内置插件 · 设置变成可拖动的悬浮面板：左键开关，右键展开详情，右 Shift 也能打开')}<div class="row"><label for="pref-btr">Bilibili 线程撕裂者<span class="hint">多线路并发加速视频缓冲 · 始终开启</span></label><input id="pref-btr" type="checkbox" checked disabled aria-describedby="btr-locked"></div><div class="actions"><button id="btr-settings" class="link">线程撕裂者设置 ↗</button><button id="reload" class="link">刷新页面</button></div><div class="row"><div class="label">一键拉黑 UP主<span class="hint">仅首页 · 同步至 B站黑名单</span></div><span class="status">首页限定</span></div><div class="section-label">内置下载器</div>${toggle('downloader','视频页显示下载按钮','支持 AVC / AAC 单视频下载，暂不支持批量、多段与番剧')}<div class="section-label">插件</div><div id="plugins44-panel" data-setting-keywords="插件 plugin 扩展 本地脚本 主题"></div></div>`;
}
const settingsGroupsOpen=new Map();
function organizeSettings(panel){
 if(currentTab!=='appearance')return;
 const definitions=[['外观',['theme','accent','font','settingsZoom','experimentalFrost','experimentalBounce','experimentalFullscreenMotion']],['顶部栏与首页',['header','feedColumns','showChannels','logoAutoHide','showClock','videoLinkButton','videoLinkCompact','watchlaterOpen']],['窗口与缩放',['trafficLights','closeAction','zoom','autoZoom','autoZoomTarget']],['播放与小窗',['officialVideoStyle','pipDanmaku','pipDanmakuMinWidth','videoLoadingMode']],['剪贴板',['clipboardAutoOpen']],['播放进度条',['progress']]];
 const buckets=definitions.map(()=>[]),heading=panel.querySelector('h2');
 for(const el of [...panel.children]){if(el===heading)continue;if(el.matches('h2,.section-label')){el.remove();continue;}const key=el.querySelector('[data-pref]')?.dataset.pref||(el.matches('.themes')?'theme':el.querySelector('#header-reset')?'headerReset':el.matches('.preview')?'progressPreview':'');const index=definitions.findIndex(([,keys])=>keys.some(k=>key===k||['header','progress'].includes(k)&&key.startsWith(k)));buckets[index<0?0:index].push(el);}
 buckets.forEach((nodes,i)=>{if(!nodes.length)return;const group=document.createElement('details'),summary=document.createElement('summary');group.className='settings-group';group.dataset.group=String(i);group.open=settingsGroupsOpen.get(i)??i===0;summary.textContent=definitions[i][0];const count=document.createElement('small');count.textContent=String(nodes.filter(n=>n.matches('.row,.themes')).length)+' 项';summary.append(count);group.append(summary,...nodes);group.ontoggle=()=>settingsGroupsOpen.set(i,group.open);panel.append(group);});
}
function renderSettings(){
  if(!shadow)return;
  const panel=$('#tab-content',shadow);if(!panel)return;
  // Resetting settings belongs to the settings pages, not to the feedback page.
  const reset=$('#reset',shadow);if(reset)reset.hidden=currentTab==='feedback';
  // Preserve the active slider while dragging rather than replacing its DOM node.
  if(panel.contains(shadow.activeElement)&&shadow.activeElement?.matches('input[type=range],input[type=color]')){
    const input=shadow.activeElement;
    if(input.type==='range')input.nextElementSibling.textContent=PREFS[input.dataset.pref]+(['zoom','volumeBoost'].includes(input.dataset.pref)?'%':'px');
    const preview=$('.preview',panel);if(preview){preview.style.setProperty('--height',PREFS.progressHeight+'px');preview.style.setProperty('--radius',PREFS.progressRadius+'px');preview.style.setProperty('--progress',PREFS.progressColor);}return;
  }
  panel.innerHTML=tabContent();organizeSettings(panel);renderUpdatePanel();
  if(currentTab==='downloads')window.BiliDesktop44?.renderDownloads($('#downloads44-panel',panel));
  if(currentTab==='blocklist')window.BiliDesktop44?.renderBlacklist($('#blacklist44-panel',panel));
  if(currentTab==='community')window.BiliCommunity44?.render($('#community44-panel',panel));
  if(currentTab==='plugins')window.BiliSpacePlugins?.renderPanel($('#plugins44-panel',panel),{update,prefs:PREFS,toast});
  $$('.tabs button',shadow).forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===currentTab));b.tabIndex=b.dataset.tab===currentTab?0:-1;});
  $$('select[data-pref]',panel).forEach(s=>s.value=String(PREFS[s.dataset.pref]));
  const nodeSelect=$('#proxy-node',panel);if(nodeSelect)fillProxyNodes(nodeSelect);
  const gs=$('#gpu-status',panel);if(gs)gs.textContent=status;
  const ac=$('#ad-count',panel);if(ac)ac.textContent=`已识别 ${$$('[data-bs-ad=true]').length} 个推广节点`;
}
let settingsIndex;
function searchSettingEntries(){
  if(settingsIndex)return settingsIndex;
  const selected=currentTab,entries=[];
  try{for(const [tab,[category]] of Object.entries(tabs)){
    currentTab=tab;const template=document.createElement('template');template.innerHTML=tabContent();
    for(const marker of $$('[data-setting-keywords]',template.content))entries.push({tab,category,label:category,target:marker.id,text:(category+' '+marker.dataset.settingKeywords).normalize('NFKC').toLocaleLowerCase()});
    for(const item of $$('.row,.theme,.chip,.actions button,.chip-actions button',template.content)){
      const labelNode=($('label,.label,.theme span,.chip span',item)||item).cloneNode(true);$$('.hint',labelNode).forEach(node=>node.remove());
      const label=labelNode.textContent.trim().replace(/\s+/g,' ');
      if(!label)continue;const control=$('input,select,button',item)||item;
      entries.push({tab,category,label,target:control.id||'',text:(category+' '+item.textContent).normalize('NFKC').toLocaleLowerCase()});
    }
  }}finally{currentTab=selected;}
  settingsIndex=entries;return entries;
}
/* Related words people use for the same setting; any member of a group finds the others. */
const SETTING_SYNONYMS=[['主题','外观','深色','浅色','暗色','黑色','夜间','白天','亮色','皮肤','配色'],['强调色','颜色','主色','粉色','色彩'],['磨砂','毛玻璃','玻璃','透明','模糊','亚克力'],['字体','字','文字','抖音美好体'],['缩放','放大','缩小','大小','尺寸','zoom','比例'],['音量','声音','响度','静音','200%'],['下载','保存','离线','导出'],['进度条','进度','拖动条','滑块'],['弹幕','评论','字幕'],['画中画','小窗','悬浮','浮窗','pip','置顶'],['顶部栏','顶栏','导航','标题栏','菜单栏','头部'],['每行','列数','几个','视频数','卡片','网格'],['代理','网络','节点','加速','vpn','梯子'],['更新','版本','升级','新版'],['关闭','退出','托盘','最小化','后台'],['时间','时钟','几点'],['logo','标志','品牌','图标'],['插件','扩展','脚本','油猴'],['超分','画质','清晰','增强','anime4k','4k','超分辨率'],['插帧','帧率','流畅','60帧','fps','补帧'],['动画','弹性','q弹','回弹','动效','弹跳','实验'],['剪贴板','复制','链接','bv'],['账号','登录','账户','切换账号','多账号'],['窗口','红绿灯','按钮','最大化']];
function settingScore(item,words){
  const label=item.label.normalize('NFKC').toLocaleLowerCase();let total=0;
  for(const word of words){
    if(label.includes(word)){total+=3;continue;}if(item.text.includes(word)){total+=2;continue;}
    const related=SETTING_SYNONYMS.filter(group=>group.some(term=>term.includes(word)||word.includes(term))).flat();
    if(related.some(term=>label.includes(term))){total+=1.5;continue;}if(related.some(term=>item.text.includes(term))){total+=1;continue;}
    // Characters typed in order, such as 进条 for 进度条, still find a loose match.
    let at=0;for(const ch of item.text){if(ch===word[at])at++;if(at===word.length)break;}
    if(word.length>=2&&at===word.length){total+=.5;continue;}
    return 0;
  }
  return total;
}
function renderSettingsSearch(){
  const query=$('#settings-query',shadow),list=$('#settings-matches',shadow),status=$('#settings-search-status',shadow);
  const words=query.value.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  $('.tabs',shadow).hidden=words.length>0;list.hidden=words.length===0;list.replaceChildren();status.textContent='';
  if(!words.length)return;
  // A small secret: "GUQI" offers a switch that makes the stuck-category scene play every time, until the client restarts.
  if(words.join(' ')==='guqi'){status.textContent='发现了一个彩蛋';const egg=document.createElement('button');egg.type='button';egg.className='settings-match settings-egg';egg.dataset.egg='category';
    const title=document.createElement('span'),note=document.createElement('small');title.textContent=categoryEggForced?'分区彩蛋已开启':'开启分区彩蛋';note.textContent=categoryEggForced?'收起分区时必定触发 · 重启客户端后失效':'收起分区时，总有一个分区字会卡住 · 重启后失效';egg.append(title,note);list.append(egg);return;}
  const ranked=searchSettingEntries().map(item=>({item,score:settingScore(item,words)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
  const matches=ranked.map(r=>r.item),loose=ranked.length&&ranked.every(r=>r.score<words.length*2);
  status.textContent=matches.length?(loose?'找到 '+matches.length+' 项相近设置':'找到 '+matches.length+' 项设置'):'没有找到匹配设置';
  for(const item of matches){
    const button=document.createElement('button');button.type='button';button.className='settings-match';button.dataset.settingTab=item.tab;button.dataset.settingTarget=item.target;
    const title=document.createElement('span'),category=document.createElement('small');title.textContent=item.label;category.textContent=item.category;button.append(title,category);list.append(button);
  }
}
function clearSettingsSearch(){const query=$('#settings-query',shadow);query.value='';renderSettingsSearch();}
function closeSettings(){
  if(!shadow)return;$('#settings',shadow).hidden=true;lastFocus?.focus();
}
// Settings belong to the header layer: a page (Ctrl+, or a link inside it) asks the native host to open them there.
function openSettings(tab,local=false,classic=false){if(CONTENT_VIEW&&!local){native('open-settings',{tab:typeof tab==='string'?tab:''});return;}if(PREFS.clickGui&&CHROME_VIEW&&!classic&&!tab){openClickGui();return;}if(typeof tab==='string'&&tab)currentTab=tab;accountsController?.closeLogin();
  lastFocus=shadow.activeElement||document.activeElement;$('#settings',shadow).hidden=false;settingsIndex=null;clearSettingsSearch();renderSettings();$('#dismiss',shadow).focus();
}
function mountShell(){
  root=document.createElement('bili-space-shell');root.id='bili-space-root';shadow=root.attachShadow({mode:'open'});
  root.dataset.platform=NATIVE_PLATFORM;
  shadow.innerHTML=`<style>${shellCss}
:host([data-platform=macos]) .header-left{padding-left:78px}:host([data-platform=macos]) .lights,:host([data-platform=macos]) .window-actions,:host([data-platform=linux]) .lights,:host([data-platform=linux]) .window-actions{display:none!important}:host([data-platform=macos]) .row:has([data-pref=trafficLights]),:host([data-platform=linux]) .row:has([data-pref=trafficLights]),:host([data-platform=macos]) .row:has([data-pref=srMode]),:host([data-platform=linux]) .row:has([data-pref=srMode]),:host([data-platform=macos]) .row:has([data-pref=fiMode]),:host([data-platform=linux]) .row:has([data-pref=fiMode]){display:none}

/* Still clipped for its own show/hide, but with room around it so a hovered button's bounce and tint are not cut off. */.history-controls{display:flex;align-items:center;gap:2px;flex:0 0 auto;height:32px;overflow:clip;overflow-clip-margin:10px}.history-controls[hidden],.history-back[hidden],.history-forward[hidden]{display:none!important}.history-controls button:disabled{opacity:.35;cursor:default}.history-controls button:disabled:hover{background:transparent;color:var(--muted)}.history-back,.history-forward{display:grid;place-items:center;transition:background 120ms cubic-bezier(.2,.8,.2,1),color 120ms cubic-bezier(.2,.8,.2,1)}.history-back:hover{color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--bg))}.history-back:active{transform:scale(.95)}
.favorites-wrap{position:relative;flex:0 0 auto}/* 稍后再看, favourites and messages sit a little closer to each other than to the search box and the avatar. */.header-right>:is(.watchlater,.favorites-wrap,.messages):not([hidden])~:is(.favorites-wrap,.messages){margin-left:-5px}/* Header controls stay on their own compositing layer: a layer that came and went with each hover bounce made the
   control re-snap to the pixel grid as the bounce ended, so buttons twitched by 1px under a passing pointer. */:is(#chrome :is(button,a),#settings-trigger,.upload,#feed-roll,#page-top){will-change:scale;backface-visibility:hidden}/* Every header control and floating button gives a little when pressed. */:is(#chrome :is(button,a),#settings-trigger,.upload,#feed-roll,#page-top):not(:disabled):not(.search-grip):active{scale:.92!important}@media (prefers-reduced-motion:reduce){:is(#chrome :is(button,a),#settings-trigger,.upload,#feed-roll,#page-top):active{scale:none!important}}.favorites{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:var(--muted);cursor:pointer}.favorites svg{width:20px;height:20px;stroke-width:2}.favorites:hover{color:var(--ink);background:var(--field)}.favorites[aria-expanded=true]{background:var(--field)}
.favorites-panel{position:absolute;right:-44px;top:calc(100% + 16px);width:min(540px,calc(100vw - 48px));background:var(--bg);border:1px solid var(--line);border-radius:18px;box-shadow:0 20px 70px #0005;overflow:hidden;z-index:12;user-select:text}.favorites-panel[hidden]{display:none!important}.favorites-heading{display:flex;align-items:center;gap:16px;padding:16px 18px;border-bottom:1px solid var(--line)}.favorites-heading>div{flex:1}.favorites-heading span{font:600 10px/1.4 sans-serif;letter-spacing:1.8px;color:var(--accent)}.favorites-heading h2{font-size:18px;margin:5px 0 0;letter-spacing:-.5px}.favorites-heading button{border:0;background:none;color:var(--muted);font:inherit;cursor:pointer}.favorites-heading .favorites-close{font-size:24px;width:30px;height:30px}.favorites-heading button:hover{color:var(--accent)}.favorites-layout{display:grid;grid-template-columns:125px minmax(0,1fr);height:min(340px,calc(100vh - 190px));min-height:220px}.favorites-folders{display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:14px 10px;border-right:1px solid var(--line);overflow:auto;background:var(--panel)}.favorites-folder{display:flex;align-items:center;gap:8px;width:100%;padding:11px 10px;border:0;border-radius:8px;background:none;color:var(--muted);font:inherit;font-size:12px;text-align:left;cursor:pointer;overflow-wrap:anywhere}.favorites-count{margin-left:auto;font-size:10px;font-variant-numeric:tabular-nums}.favorites-folder[aria-pressed=true]{color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--bg))}.favorites-folder:hover{color:var(--ink)}.favorites-body{padding:14px;overflow:auto;overscroll-behavior:contain}.favorites-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 12px}.favorites-video{display:flex;flex-direction:column;gap:7px;min-width:0;text-decoration:none;color:var(--ink)}.favorites-cover{aspect-ratio:16/9;background:var(--field);border-radius:9px;overflow:hidden}.favorites-cover-error{display:grid;place-items:center;width:100%;height:100%;font-size:11px;color:var(--muted)}.favorites-cover img{width:100%;height:100%;object-fit:cover;transition:transform 160ms ease-out}.favorites-video:hover img{transform:scale(1.035)}.favorites-video strong{font-size:12px;font-weight:500;line-height:1.5;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.favorites-video:hover strong{color:var(--accent)}.favorites-author{font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.favorites-video[aria-disabled=true]{opacity:.5}.favorites-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px;gap:20px;color:var(--muted);font-size:13px;text-align:center;line-height:1.8}.favorites-retry,.favorites-more{padding:9px 16px;border:1px solid var(--line);border-radius:9px;color:var(--accent);background:var(--field);font:inherit;font-size:12px;cursor:pointer}.favorites-more{display:block;margin:22px auto 0}
.search:focus-within{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 9%,transparent)}.search-panel{padding:16px;border-radius:14px;box-shadow:0 18px 50px #0004}.search-panel h2{font-size:11px;letter-spacing:.4px;margin-bottom:12px}.search-row .search-choice{padding:11px 10px!important;border-radius:8px}.search-history-chip{border:1px solid var(--line);background:var(--panel)}#search-panel .search-history-chip{align-items:stretch;overflow:hidden}#search-panel .search-history-chip .search-choice{border-radius:0!important}#search-panel .search-history-chip .search-remove{display:grid;place-items:center;width:26px!important;height:auto!important;padding:0;border-radius:0!important}#search-panel .search-history-chip .search-remove svg{width:10.5px;height:10.5px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}
.dialog aside{background:var(--panel)}.dialog .tabs button{border-radius:9px;margin-bottom:3px}.dialog .tabs button[aria-selected=true]{color:var(--accent);background:color-mix(in srgb,var(--accent) 11%,var(--bg))}.dialog main .section-label{margin-top:26px;padding-top:16px;border-top:1px solid var(--line);color:var(--accent);font-size:11px;letter-spacing:.5px}.dialog main h2{font-size:24px;letter-spacing:-.5px}.dialog .row{padding-block:15px}.dialog .hint{line-height:1.7}.dialog .row label{line-height:1.6}.dialog .row select{max-width:220px;border-radius:8px;padding:8px 10px}
@media(max-width:800px){.favorites-panel{position:fixed;right:12px;left:auto;top:calc(var(--bs-header-height,58px) + 8px);width:min(540px,calc(100vw - 24px))}.favorites-layout{grid-template-columns:120px minmax(0,1fr)}.favorites-heading{padding:18px}.favorites-body{padding:12px}.favorites-grid{gap:14px 10px}}
@media(prefers-reduced-motion:reduce){.history-back,.favorites-cover img{transition:none!important}.favorites-video:hover img,.history-back:active{transform:none}}

.scrim{z-index:20!important}#page-pending{position:fixed;inset:58px 0 0;padding:48px max(24px,7vw);background:var(--bg);color:var(--muted);pointer-events:auto;box-sizing:border-box;z-index:0}#page-pending p{font-size:15px;margin:0 0 24px}#page-pending button{border:0;border-radius:9px;padding:10px 18px;background:var(--field);color:var(--ink);cursor:pointer}#page-pending button[hidden]{display:none}.page-placeholder{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.page-placeholder i{height:clamp(90px,13vw,180px);border-radius:10px;background:var(--field);opacity:.45}#page-pending[data-failed=true] .page-placeholder{display:none}
.brand-slot{display:flex;align-items:center;flex:0 0 auto;min-width:0;height:32px;overflow:hidden}.brand-slot[hidden]{display:none!important}.header-left .brand-label{display:inline-flex;align-items:center;flex:none;height:32px;line-height:20px;padding-top:2px;box-sizing:border-box;font-family:BiliDouyin,sans-serif;font-size:16px;white-space:nowrap;flex-shrink:0}.header-left .brand-label b{color:var(--accent);font-weight:400}.history-back,.history-forward{flex:0 0 32px;width:32px;height:32px;padding:6px;border:0;border-radius:9px;background:transparent;color:var(--muted);cursor:pointer;line-height:0}.history-back svg,.history-forward svg{display:block;width:20px;height:20px;flex:none}.history-back:not(:disabled):hover,.history-forward:not(:disabled):hover{color:var(--ink);background:var(--field)}.upload,#settings-trigger{z-index:1}.upload{position:fixed!important;left:20px;bottom:78px;width:44px;min-width:44px;height:44px;padding:10px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:13px;background:var(--bg);color:#fb7299!important;box-shadow:0 4px 18px #0002}.upload svg{width:24px;height:24px}.upload:hover{background:var(--field)}.upload[hidden]{display:none!important}.brand-label[hidden]{display:none!important}
.header-left[data-instant=true],.header-left[data-instant=true] *{transition:none!important}.header-left[data-controls=windows] .video-home-top{box-sizing:border-box;overflow:hidden}.header-left[data-controls=windows][data-video=true] .primary-nav a[data-route=home][data-leaving=true]{display:inline-flex}.primary-nav a[data-leaving=true]{clip-path:inset(-12px 0)}.primary-nav a{white-space:nowrap;box-sizing:border-box;transition:color 160ms cubic-bezier(.2,.8,.2,1),background 160ms cubic-bezier(.2,.8,.2,1),scale 160ms cubic-bezier(.32,.72,0,1)}nav a[aria-current=page]:after{transform-origin:center}
.history-back,.history-forward{transition:background 120ms cubic-bezier(.2,.8,.2,1),color 120ms cubic-bezier(.2,.8,.2,1),opacity 200ms cubic-bezier(.2,.8,.2,1),scale 160ms cubic-bezier(.32,.72,0,1)}.history-back:active{transform:none}.history-controls button:not(:disabled):active,.header-left>.back:active,.video-home-top:active,.primary-nav a:active,.favorites:active,.header-right :is(.messages,.watchlater):active{scale:.92}.header-left>.back{transition:transform 240ms cubic-bezier(.23,1,.32,1),color 200ms cubic-bezier(.2,.8,.2,1),scale 160ms cubic-bezier(.32,.72,0,1)}.video-home-top{transition:opacity 180ms cubic-bezier(.23,1,.32,1),transform 240ms cubic-bezier(.23,1,.32,1),scale 160ms cubic-bezier(.32,.72,0,1)}.header-right :is(.messages,.watchlater){transition:background 160ms cubic-bezier(.2,.8,.2,1),color 160ms cubic-bezier(.2,.8,.2,1),scale 160ms cubic-bezier(.32,.72,0,1)}
.favorites{transition:background 160ms cubic-bezier(.2,.8,.2,1),color 160ms cubic-bezier(.2,.8,.2,1),scale 160ms cubic-bezier(.32,.72,0,1)}.favorites svg path{fill:transparent;transition:fill 200ms cubic-bezier(.2,.8,.2,1)}.favorites[aria-expanded=true],:host([data-frost=true]) #chrome .favorites[aria-expanded=true]{color:var(--accent)}.favorites[aria-expanded=true] svg{animation:bs-symbol-bounce 420ms cubic-bezier(.32,.72,0,1)}.favorites[aria-expanded=true] svg path{fill:currentColor}
.favorites-heading .favorites-close{display:grid;place-items:center;border-radius:50%;line-height:1;transition:background 160ms cubic-bezier(.2,.8,.2,1),color 160ms cubic-bezier(.2,.8,.2,1),scale 160ms cubic-bezier(.32,.72,0,1)}.favorites-heading .favorites-close:hover{background:var(--field)}.favorites-heading button:active,.favorites-retry:active,.favorites-more:not(:disabled):active{scale:.96}.favorites-official{transition:color 160ms cubic-bezier(.2,.8,.2,1)}.favorites-retry,.favorites-more{transition:background 160ms cubic-bezier(.2,.8,.2,1),color 160ms cubic-bezier(.2,.8,.2,1),opacity 160ms cubic-bezier(.2,.8,.2,1),scale 160ms cubic-bezier(.32,.72,0,1)}.favorites-more:disabled{opacity:.6;cursor:default}
.favorites-folders{position:relative}.favorites-folder{position:relative;z-index:1;transition:color 160ms cubic-bezier(.2,.8,.2,1),background 160ms cubic-bezier(.2,.8,.2,1),scale 160ms cubic-bezier(.32,.72,0,1)}.favorites-folder:active{scale:.97}.favorites-folder:hover:not([aria-pressed=true]){background:color-mix(in srgb,var(--ink) 5%,transparent)}.favorites-folders:has(.favorites-indicator) .favorites-folder[aria-pressed=true]{background:transparent!important}.favorites-indicator{position:absolute;left:10px;right:10px;top:0;z-index:0;border-radius:8px;background:color-mix(in srgb,var(--accent) 12%,var(--bg));pointer-events:none}.favorites-folder-ghost{display:block;flex:none;height:38px;border-radius:8px;background:var(--field);animation:bs-breathe 1.4s ease-in-out infinite}.favorites-folder-ghost:nth-child(2){animation-delay:120ms}.favorites-folder-ghost:nth-child(3){animation-delay:240ms}
.favorites-skeleton,.favorites-empty{animation:bs-fade 220ms ease-out both}.favorites-ghost{display:flex;flex-direction:column;gap:7px}.favorites-ghost i{display:block;border-radius:5px;background:var(--field);animation:bs-breathe 1.4s ease-in-out calc(var(--i,0)*90ms) infinite}.favorites-ghost i:first-child{aspect-ratio:16/9;border-radius:9px}.favorites-ghost i:nth-child(2){height:12px;width:88%}.favorites-ghost i:nth-child(3){height:10px;width:46%}
.favorites-video{animation:bs-rise 420ms cubic-bezier(.32,.72,0,1) calc(var(--i,0)*28ms) both}.favorites-cover{transition:scale 160ms cubic-bezier(.32,.72,0,1)}.favorites-video:active .favorites-cover{scale:.98}.favorites-cover img{opacity:0;transition:opacity 280ms cubic-bezier(.2,.8,.2,1),transform 240ms cubic-bezier(.32,.72,0,1)}.favorites-cover img[data-ready=true]{opacity:1}.favorites-video strong{transition:color 160ms cubic-bezier(.2,.8,.2,1)}
.search input{transition:border-color 160ms cubic-bezier(.2,.8,.2,1),background-color 160ms cubic-bezier(.2,.8,.2,1),box-shadow 160ms cubic-bezier(.2,.8,.2,1)}#chrome .search input:focus,#chrome .search input:focus-visible{outline:none}.search:focus-within{box-shadow:none}#chrome .search input:focus{border-color:color-mix(in srgb,var(--accent) 62%,var(--line))!important;background-color:color-mix(in srgb,var(--accent) 4%,var(--field))!important;box-shadow:var(--elevation-control)!important}:host([data-frost=true]) #chrome .header-right>.search{border-radius:9px;background:color-mix(in srgb,var(--ink) 6%,transparent)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 13%,transparent),0 3px 14px #0000000a!important;transition:box-shadow 160ms cubic-bezier(.2,.8,.2,1)}:host([data-frost=true]) #chrome .header-right>.search:focus-within{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 50%,transparent),0 3px 14px #0000000a!important}:host([data-frost=true]) #chrome .search input:focus{border-color:transparent!important;background:transparent!important;box-shadow:none!important}:host([data-frost=true]) #chrome .search>button{background:transparent!important;background-image:none!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
@keyframes bs-message-dot{0%,56%,100%{transform:scale(1)}24%{transform:scale(1.75)}}.messages svg path:not(:first-child){transform-box:fill-box;transform-origin:center}.messages:hover svg path:not(:first-child){animation:bs-message-dot 1.15s cubic-bezier(.45,0,.35,1) infinite}.messages:hover svg path:nth-child(4){animation-delay:0s}.messages:hover svg path:nth-child(2){animation-delay:.16s}.messages:hover svg path:nth-child(3){animation-delay:.32s}@media (prefers-reduced-motion:reduce){.messages:hover svg path:not(:first-child){animation:none}}.account .account-face.account-spin-ghost{pointer-events:none;border-color:transparent;will-change:transform,opacity}.page-top{bottom:22px}.feed-roll{bottom:80px}:is(.feed-roll,.page-top){position:fixed;right:18px;z-index:1;width:40px;padding:11px 0 10px;display:flex;flex-direction:column;align-items:center;gap:6px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);box-shadow:0 4px 18px #0002;font:500 12px/1.15 var(--font,sans-serif);cursor:pointer;transition:color 140ms cubic-bezier(.2,.8,.2,1),border-color 140ms cubic-bezier(.2,.8,.2,1),opacity .24s cubic-bezier(.32,.72,0,1),transform .24s cubic-bezier(.32,.72,0,1),scale 650ms linear(0,0.053,0.192,0.383,0.597,0.807,0.992,1.139,1.24,1.295,1.309,1.288,1.242,1.181,1.115,1.051,0.995,0.952,0.922,0.907,0.905,0.913,0.928,0.947,0.967,0.987,1.004,1.017,1.025,1.029,1.029,1.026,1.022,1.015,1.009,1.003,0.998,0.994,0.992,0.991,1)}:is(.feed-roll,.page-top)[hidden]{display:none}.feed-roll svg{width:17px;height:17px}.feed-roll span{writing-mode:vertical-rl;letter-spacing:2px}.page-top{padding:7px 0 8px;gap:2px}.page-top svg{width:16px;height:16px}:is(.feed-roll,.page-top):hover{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}:is(.feed-roll,.page-top):active{transform:scale(.96)}:is(.feed-roll,.page-top):focus-visible{outline:2px solid var(--accent);outline-offset:3px}.messages-menu{position:fixed;z-index:13;height:auto;bottom:auto;right:auto;display:flex;flex-direction:column;gap:2px;width:168px;padding:6px;box-sizing:border-box;background:var(--panel);color:var(--ink);border-radius:14px;box-shadow:var(--elevation-panel),inset 0 0 0 1px color-mix(in srgb,var(--ink) 7%,transparent);transform-origin:50% 0}.messages-menu[hidden]{display:none!important}.messages-item{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px 0 12px;border-radius:8px;color:var(--ink);font-size:13px;line-height:20px;text-decoration:none;transition:background 140ms cubic-bezier(.2,.8,.2,1),color 140ms cubic-bezier(.2,.8,.2,1),scale 160ms cubic-bezier(.32,.72,0,1)}.messages-item span{flex:1;min-width:0;white-space:nowrap}.messages-item:hover,.messages-item:focus-visible{background:var(--field);color:var(--ink)}.messages-item:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}.messages-item:active{scale:.97}.messages-count{flex:none;display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:var(--accent);color:#fff;font:600 11px/1 var(--font,sans-serif);font-variant-numeric:tabular-nums}.messages-count[hidden]{display:none}.messages-count[data-kind=dot]{min-width:8px;width:8px;height:8px;padding:0;border-radius:50%}:host([data-frost=true]) #chrome .header-right>.search{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}:host([data-frost=true]) #chrome :is(#account-card,#search-panel,#favorites-panel),:host([data-frost=true]) #messages-menu{background:var(--frost-tint)!important;background-image:linear-gradient(160deg,#ffffff0c,transparent 55%)!important;border-color:transparent!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 10%,transparent),var(--frost-shadow)!important;backdrop-filter:var(--frost-filter)!important;-webkit-backdrop-filter:var(--frost-filter)!important}:host([data-frost=true]) #chrome #search-panel .search-history-chip{background:color-mix(in srgb,var(--ink) 7%,transparent)!important;border-color:transparent!important}:host([data-frost=true]) #messages-menu .messages-item:hover{background:color-mix(in srgb,var(--ink) 9%,transparent)}@media(prefers-reduced-motion:reduce){.messages-item:active{scale:none}}
/* Digits are centred on their cap height and baseline, not on the font's descender-padded line box. */.message-unread[data-kind=count]{display:grid;place-items:center;box-sizing:border-box;font-variant-numeric:tabular-nums;line-height:1}.message-unread[data-kind=count],.messages-count[data-kind=count]{text-box:trim-both cap alphabetic}@supports not (text-box:trim-both cap alphabetic){.message-unread[data-kind=count]{padding-top:1px}}/* The menu's count reads 1px high in its pill; 2px of top padding moves the digit (not the pill) down by 1px. */.messages-count[data-kind=count]{padding-top:2px}@supports not (text-box:trim-both cap alphabetic){.messages-count[data-kind=count]{padding-top:3px}}
.primary-nav a .route-text{display:inline-block;transition:opacity 160ms cubic-bezier(.2,.8,.2,1),transform 260ms cubic-bezier(.32,.72,0,1)}.route-refresh{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;opacity:0;transform:rotate(-120deg) scale(.6);transition:opacity 160ms cubic-bezier(.2,.8,.2,1),transform 360ms cubic-bezier(.32,.72,0,1);pointer-events:none}@media(hover:hover){.header-left:not([data-settling]) .primary-nav a[aria-current=page]:hover .route-text{opacity:0;transform:scale(.8)}.header-left:not([data-settling]) .primary-nav a[aria-current=page]:hover .route-refresh{opacity:1;transform:none}}.primary-nav a[aria-current=page]:focus-visible .route-text{opacity:0;transform:scale(.8)}.primary-nav a[aria-current=page]:focus-visible .route-refresh{opacity:1;transform:none}.header-left:not([data-settling]) .primary-nav a[aria-current=page]:hover,.primary-nav a[aria-current=page]:focus-visible{color:var(--accent)}.route-refresh[data-spin=true]{opacity:1;animation:bs-refresh-spin 640ms cubic-bezier(.32,.72,0,1) both}.primary-nav a:has(.route-refresh[data-spin=true]) .route-text{opacity:0}@keyframes bs-refresh-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.route-refresh,.primary-nav a .route-text{transition:opacity 160ms cubic-bezier(.2,.8,.2,1)!important;transform:none!important}.route-refresh[data-spin=true]{animation:none}}
header{zoom:var(--bs-ui-scale,1);height:calc(var(--bs-header-height,58px) / var(--bs-ui-scale,1))}/* Fixed layers inside the zoomed header are positioned in its zoomed coordinates. */.search[aria-busy=true]:after{top:calc((var(--bs-header-height,58px) - 1px) / var(--bs-ui-scale,1))}@media(max-width:1050px){.category-links{top:calc(var(--bs-header-height,58px) / var(--bs-ui-scale,1))!important;left:calc(16px / var(--bs-ui-scale,1))!important;width:calc((100vw - 32px) / var(--bs-ui-scale,1))!important}}@media(max-width:800px){.favorites-panel{top:calc((var(--bs-header-height,58px) + 8px) / var(--bs-ui-scale,1))!important;right:calc(12px / var(--bs-ui-scale,1))!important;width:calc(min(540px,100vw - 24px) / var(--bs-ui-scale,1))!important}}
/* Channel links read exactly like the main nav items they replace. */.category-links{gap:0}.header-left .category-links a{display:inline-flex;align-items:center;justify-content:center;height:32px;min-width:48px;padding:0 10px;border-radius:10px;font-size:14px;line-height:20px;color:var(--muted);background:none;box-sizing:border-box;transition:color 160ms cubic-bezier(.2,.8,.2,1)}.header-left .category-links a:hover,.header-left .category-links a:focus-visible{color:var(--accent);background:none}.brand-leading{transition:opacity 180ms cubic-bezier(.2,.8,.2,1)}header:has(.header-left[data-categories=true]) .brand-leading{opacity:0;pointer-events:none}
.history-controls:not([hidden])+.back{margin-left:-10px}.history-controls{gap:0}:host([data-frost=true]) #chrome{background:var(--bg)!important;box-shadow:0 5px 16px #00000010!important}:host([data-frost=true]) #chrome::before{display:none!important}:host([data-frost=true]) :is(#settings-trigger,.upload){border-color:transparent!important;background:var(--frost-tint)!important;background-image:linear-gradient(140deg,#ffffff10,transparent 70%)!important;box-shadow:var(--frost-shadow)!important;backdrop-filter:var(--frost-filter)!important;-webkit-backdrop-filter:var(--frost-filter)!important}/* Experimental: every client control bounces once on hover. *//* A damped spring (damping 0.35): about two visible swings, sampled into linear() so it stays smooth and interruptible. */:host([data-bounce=true]) :is(button,a,.search,.account){transition:scale 650ms linear(0,0.053,0.192,0.383,0.597,0.807,0.992,1.139,1.24,1.295,1.309,1.288,1.242,1.181,1.115,1.051,0.995,0.952,0.922,0.907,0.905,0.913,0.928,0.947,0.967,0.987,1.004,1.017,1.025,1.029,1.029,1.026,1.022,1.015,1.009,1.003,0.998,0.994,0.992,0.991,1)}:host([data-bounce=true]) :is(button,a,.search,.account):not(:disabled):hover{scale:1.16}
/* Rows in dropdowns and menus bounce too, but only by 3%: a full-width row then stays inside its panel's padding instead of being clipped. Neighbouring rows stay still. */:host([data-bounce=true]) :is(#search-panel,#messages-menu,#favorites-panel,#account-card,.account-manager) :is(button,a,.search-choice):not(:disabled){scale:none!important}:host([data-bounce=true]) :is(#search-panel,#messages-menu,#favorites-panel,#account-card,.account-manager) :is(button,a,.search-choice):not(:disabled):hover{scale:1.03!important}:host([data-bounce=true]) #settings :is(button,a):not(:disabled){scale:none!important}:host([data-bounce=true]) :is(#search-panel,#messages-menu,#favorites-panel,#account-card,.account-manager) :is(button,a,.search-choice){transition:background 140ms cubic-bezier(.2,.8,.2,1),color 140ms cubic-bezier(.2,.8,.2,1),scale 650ms linear(0,0.053,0.192,0.383,0.597,0.807,0.992,1.139,1.24,1.295,1.309,1.288,1.242,1.181,1.115,1.051,0.995,0.952,0.922,0.907,0.905,0.913,0.928,0.947,0.967,0.987,1.004,1.017,1.025,1.029,1.029,1.026,1.022,1.015,1.009,1.003,0.998,0.994,0.992,0.991,1)!important}/* A history word and its × are one chip: the chip bounces as a whole; the word and the × inside it stay still. */:host([data-bounce=true]) #search-panel .search-history-chip :is(.search-choice,.search-remove):not(:disabled):hover{scale:none!important}:host([data-bounce=true]) #search-panel .search-history-chip :is(.search-choice,.search-remove){scale:none!important}:host([data-bounce=true]) #search-panel .search-history-chip{transition:scale 650ms linear(0,0.053,0.192,0.383,0.597,0.807,0.992,1.139,1.24,1.295,1.309,1.288,1.242,1.181,1.115,1.051,0.995,0.952,0.922,0.907,0.905,0.913,0.928,0.947,0.967,0.987,1.004,1.017,1.025,1.029,1.029,1.026,1.022,1.015,1.009,1.003,0.998,0.994,0.992,0.991,1)}:host([data-bounce=true]) #search-panel .search-history-chip:hover{scale:1.06}@media (prefers-reduced-motion:reduce){:host([data-bounce=true]) #search-panel .search-history-chip{transition:none}:host([data-bounce=true]) #search-panel .search-history-chip:hover{scale:none}}/* Nav items bounce their label and refresh glyph, not the link box, so the current-page underline stays put. */:host([data-bounce=true]) .primary-nav a[data-route]{scale:none!important}:host([data-bounce=true]) .primary-nav a[data-route] .route-text{transition:opacity 160ms cubic-bezier(.2,.8,.2,1),transform 260ms cubic-bezier(.32,.72,0,1),scale 650ms linear(0,0.053,0.192,0.383,0.597,0.807,0.992,1.139,1.24,1.295,1.309,1.288,1.242,1.181,1.115,1.051,0.995,0.952,0.922,0.907,0.905,0.913,0.928,0.947,0.967,0.987,1.004,1.017,1.025,1.029,1.029,1.026,1.022,1.015,1.009,1.003,0.998,0.994,0.992,0.991,1)}:host([data-bounce=true]) .primary-nav a[data-route] .route-refresh{transition:opacity 160ms cubic-bezier(.2,.8,.2,1),transform 360ms cubic-bezier(.32,.72,0,1),scale 650ms linear(0,0.053,0.192,0.383,0.597,0.807,0.992,1.139,1.24,1.295,1.309,1.288,1.242,1.181,1.115,1.051,0.995,0.952,0.922,0.907,0.905,0.913,0.928,0.947,0.967,0.987,1.004,1.017,1.025,1.029,1.029,1.026,1.022,1.015,1.009,1.003,0.998,0.994,0.992,0.991,1)}:host([data-bounce=true]) .primary-nav a[data-route]:hover :is(.route-text,.route-refresh){scale:1.16}:host([data-bounce=true]) .primary-nav a[data-route]:has(+ a[data-route]:hover) .route-text,:host([data-bounce=true]) .primary-nav a[data-route]:hover+a[data-route] .route-text{scale:1.03}
/* The search field is several times wider than a button, so the same scale would look enormous on it. */:host([data-bounce=true]) .search:not(:disabled):hover{scale:1.03}:host([data-bounce=true]) :is(button,a):not(:hover):has(+ :is(button,a):hover),:host([data-bounce=true]) :is(button,a):hover+:is(button,a):not(:hover){scale:1.03}:host([data-bounce=true]) :is(.messages-item,.favorites-video,.favorites-folder,.search-choice):hover{animation:none}@media(prefers-reduced-motion:reduce){:host([data-bounce=true]) *{animation:none!important}}
.settings-group{margin:0 0 14px;padding:0 18px;border:0;border-radius:14px;background:color-mix(in srgb,var(--panel) 82%,var(--bg));box-shadow:0 1px 2px #0000000c,0 6px 20px #00000014;interpolate-size:allow-keywords}.settings-group>summary{padding:15px 0;gap:10px;font-size:15px;letter-spacing:-.1px}.settings-group>summary small{padding:2px 8px;border-radius:999px;background:var(--field);font-variant-numeric:tabular-nums}.settings-group>summary::after{content:'';width:8px;height:8px;border:solid var(--muted);border-width:0 1.8px 1.8px 0;transform:translateY(-2px) rotate(45deg);transition:transform 240ms cubic-bezier(.32,.72,0,1)}.settings-group[open]>summary::after{transform:translateY(2px) rotate(-135deg)}.settings-group>summary:hover{color:var(--accent)}.settings-group::details-content{block-size:0;overflow:hidden;transition:block-size 320ms cubic-bezier(.32,.72,0,1),content-visibility 320ms allow-discrete}.settings-group[open]::details-content{block-size:auto}.settings-group .row+.row{border-top:1px solid color-mix(in srgb,var(--line) 55%,transparent)}.settings-group .row{border-bottom:0!important}.settings-match{border-radius:10px;transition:background 140ms cubic-bezier(.2,.8,.2,1)}@media(prefers-reduced-motion:reduce){.settings-group::details-content,.settings-group>summary::after{transition:none}}
#page-pending{animation:bs-pending-in 220ms ease-out 800ms both}#page-pending .page-placeholder{display:none}@keyframes bs-pending-in{from{opacity:0}}
#home-bubble{position:fixed;left:50%;top:calc(var(--bs-header-height,58px) + 14px);transform:translate(-50%,0);z-index:30;padding:11px 18px;border-radius:18px;background:#fff;color:#1d1d22;font-size:14px;font-weight:600;line-height:20px;white-space:nowrap;box-shadow:0 2px 6px #00000014,0 12px 32px #0000002b;pointer-events:none}#home-bubble::before{content:'';position:absolute;left:50%;top:-6px;width:14px;height:14px;margin-left:-7px;border-radius:3px;background:#fff;transform:rotate(45deg)}#home-bubble[hidden]{display:none}
/* Right-hand header controls read as one set: same icon family, 22px glyphs, 1.8 stroke, 28px avatar. */.header-right :is(.favorites,.messages)>svg{width:22px!important;height:22px!important;stroke-width:1.8!important}.header-right .account .account-face{width:28px;height:28px;border:0;box-shadow:0 0 0 .5px #0000001f,0 1px 3px #00000033}.header-right .account{translate:4px 0}/* The avatar frame (挂件) keeps Bilibili's proportion to the face: about 1.65× its width, centred on it. */.header-right .account .account-pendant{display:block!important;inset:auto;left:50%;top:50%;transform:translate(-50%,-50%);width:46px;height:46px;z-index:1}.header-right .account .account-vip-badge{width:12px;height:12px;right:2px;bottom:2px;z-index:2}.header-right .account-wrap:not(:has(.account-face)){flex:0 0 auto}.header-right .account:not(:has(.account-face)){width:auto;max-width:none;min-width:0;height:28px;padding:0 11px;border-radius:14px;background:var(--field);color:var(--ink);font-size:12px;font-weight:600;line-height:28px;display:inline-flex;align-items:center;box-shadow:0 1px 2px #0000000f,0 2px 8px #00000014;transition:background 160ms cubic-bezier(.2,.8,.2,1),color 160ms cubic-bezier(.2,.8,.2,1)}.header-right .account:not(:has(.account-face)):hover{color:var(--accent)}
:host([data-mode=content]) :is(#chrome,#settings-trigger,.upload,#messages-menu){display:none!important}:host([data-mode=chrome]) :is(#page-pending){display:none!important}
@keyframes bs-symbol-bounce{0%{transform:scale(1)}35%{transform:scale(.84)}70%{transform:scale(1.06)}100%{transform:scale(1)}}@keyframes bs-breathe{0%,100%{opacity:.5}50%{opacity:1}}@keyframes bs-fade{from{opacity:0}}@keyframes bs-rise{from{opacity:0;transform:translateY(8px)}}
@media(prefers-reduced-motion:reduce){.favorites-video,.favorites-skeleton,.favorites-empty,.favorites[aria-expanded=true] svg{animation:none!important}.favorites-ghost i,.favorites-folder-ghost{animation:none!important;opacity:.7}.history-controls button:active,.header-left>.back:active,.video-home-top:active,.primary-nav a:active,.favorites:active,.header-right .messages:active,.favorites-folder:active,.favorites-video:active .favorites-cover,.favorites-heading button:active,.favorites-retry:active,.favorites-more:active{scale:none}.favorites-cover img{transition:opacity 200ms cubic-bezier(.2,.8,.2,1)}}
</style><header id="chrome"><div class="header-left" data-video="false"><a class="video-home-top" href="https://www.bilibili.com/" aria-label="返回首页" hidden>${ICON_TV}<span>首页</span></a><div class="lights"><button class="light close" data-window="close" aria-label="关闭窗口" title="关闭"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9"/></svg></button><button class="light min" data-window="minimize" aria-label="最小化窗口" title="最小化"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7"/></svg></button><button class="light max" data-window="maximize" aria-label="最大化或还原窗口" title="最大化或还原"><svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx=".5"/></svg></button></div><div class="history-controls" role="group" aria-label="页面历史导航"><button class="history-back" type="button" data-window="back" aria-label="返回上一页" title="返回 · Alt+←"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg></button><button class="history-forward" type="button" data-window="forward" aria-label="前进下一页" title="前进"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></div><button class="back" type="button" aria-label="展开分区" aria-controls="header-categories" aria-expanded="false" title="展开频道分区"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.6 4.4-6.2 5.6 6.2 5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="nav-lane"><div id="header-categories" class="category-links" role="navigation" aria-label="频道分区" inert>${CATEGORIES.map(([label,url])=>`<a href="${url}">${label}</a>`).join('')}</div><nav class="primary-nav" aria-label="主导航"><a data-route="home" href="https://www.bilibili.com/">首页</a><a data-route="swipe" data-swipe-link href="https://www.bilibili.com/#swipe">精选</a><a data-route="dynamic" href="https://t.bilibili.com/">动态</a><a data-route="history" href="https://www.bilibili.com/history">历史</a></nav></div></div><div class="brand"><div class="brand-leading"><button type="button" class="video-link" aria-label="复制视频链接" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg><span class="video-link-text"></span></button><time class="header-clock" aria-label="当前时间" hidden></time></div><span class="brand-label">Bili-<b>Space</b></span></div><div class="header-right"><form class="search" role="search" aria-busy="false"><input name="keyword" aria-label="搜索视频" placeholder="搜索你感兴趣的内容" autocomplete="off"><button aria-label="搜索">${icon('search')}</button><span class="sr-only" id="search-status" role="status" aria-live="polite"></span><section id="search-panel" class="search-panel" aria-label="搜索历史和官方联想" hidden></section></form><a class="watchlater" href="https://www.bilibili.com/watchlater/#/list" aria-label="稍后再看" title="稍后再看"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12.5" r="8.5"/><path class="wl-hour" d="M12 12.5V8.6"/><path class="wl-minute" d="M12 12.5h3.6"/><path d="M8.5 2.6h7"/></svg></a><div class="favorites-wrap"><button class="favorites" type="button" aria-label="收藏夹" title="我的收藏夹" aria-expanded="false" aria-controls="favorites-panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg></button><section id="favorites-panel" class="favorites-panel" aria-label="我的收藏夹" hidden><div class="favorites-heading"><div><span>YOUR COLLECTION</span><h2>我的收藏夹</h2></div><button type="button" class="favorites-official" title="打开完整收藏夹">全部收藏 ↗</button><button type="button" class="favorites-close" aria-label="关闭收藏夹">×</button></div><div class="favorites-layout"><nav class="favorites-folders" aria-label="收藏夹列表"></nav><div class="favorites-body" aria-live="polite"></div></div></section></div><a class="messages" href="https://message.bilibili.com/#/reply" aria-label="消息" title="消息">${ICON_MESSAGE}</a><div id="messages-menu" class="messages-menu" role="navigation" aria-label="消息分类" hidden><a class="messages-item" data-kind="reply" href="https://message.bilibili.com/#/reply"><span>回复我的</span><b class="messages-count" hidden></b></a><a class="messages-item" data-kind="at" href="https://message.bilibili.com/#/at"><span>@我的</span><b class="messages-count" hidden></b></a><a class="messages-item" data-kind="love" href="https://message.bilibili.com/#/love"><span>收到的赞</span><b class="messages-count" hidden></b></a><a class="messages-item" data-kind="system" href="https://message.bilibili.com/#/system"><span>系统消息</span><b class="messages-count" hidden></b></a><a class="messages-item" data-kind="whisper" href="https://message.bilibili.com/#/whisper"><span>我的消息</span><b class="messages-count" hidden></b></a></div><a class="upload" href="https://member.bilibili.com/platform/upload/video/frame" aria-label="投稿" title="投稿到B站"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></a><div class="account-wrap"><a class="account" aria-controls="account-card" aria-expanded="false" href="https://passport.bilibili.com/login?gourl=https%3A%2F%2Fwww.bilibili.com%2F">登录 B站</a><section id="account-card" class="account-card" role="region" aria-label="我的账户信息" hidden><div class="account-banner" hidden></div><div class="account-identity"><div class="account-portrait" hidden></div><div class="account-card-head"><strong class="account-name"></strong><span class="account-level"></span><span class="account-vip-label" hidden></span></div></div><div class="account-stats"><div><b data-stat="follower">—</b><span>粉丝</span></div><div><b data-stat="following">—</b><span>关注</span></div><div><b data-stat="likes">—</b><span>获赞</span></div></div><p class="account-status"></p></section></div><div class="window-actions" aria-label="窗口控制" hidden><button type="button" data-window="minimize" aria-label="最小化"><svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg></button><button type="button" data-window="maximize" aria-label="最大化或还原"><svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="1"/></svg></button><button type="button" data-window="close" aria-label="关闭"><svg viewBox="0 0 16 16"><path d="m3 3 10 10M13 3 3 13"/></svg></button></div></div></header><button id="settings-trigger" aria-label="客户端设置" title="客户端设置 · Ctrl+,">${ICON_SETTINGS}</button><div class="scrim" id="settings" hidden><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><aside><h1 id="settings-title">客户端设置</h1><input id="settings-query" type="search" aria-label="搜索客户端设置" placeholder="搜索设置" maxlength="80" autocomplete="off"><p id="settings-search-status" role="status" aria-live="polite"></p><div id="settings-matches" class="settings-matches" aria-label="匹配的设置" hidden></div><div class="tabs" role="tablist" aria-label="设置分类">${Object.entries(tabs).map(([key,[label,i]])=>`<button role="tab" data-tab="${key}" aria-controls="tab-content">${icon(i)}${label}</button>`).join('')}</div><div class="aside-footer"><b>Bili-Space</b>${APP_META.version}</div></aside><main><button id="dismiss" aria-label="关闭设置"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><div id="tab-content" role="tabpanel" tabindex="-1"></div><div class="actions"><button class="link" id="reset">恢复默认设置</button></div></main></section></div><div role="status" id="toast" hidden></div>`;
  const updateCss=document.createElement('style');updateCss.textContent='#settings-trigger[data-update-available=true]::after{content: "";position:absolute;right:7px;top:7px;width:7px;height:7px;border-radius:50%;background:#fb7299}#update-notes{padding-left:20px;line-height:1.9;overflow-wrap:anywhere;max-height:220px;overflow:auto}';shadow.append(updateCss);
  document.documentElement.append(root);
  renderMessageUnread();
  const dialog=$('.dialog',shadow);if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0)dialog.dataset.compact=String(entry.contentRect.width<620);});observer.observe(dialog);}
  shadow.addEventListener('click',e=>{
    const upload=e.target.closest('a.upload');if(upload){e.preventDefault();native('open-external',{url:upload.href});return;}
    const b=e.target.closest('button');
    if(['check','download','ignore','install','log'].includes(b?.dataset.update)){native('updates',{action:b.dataset.update});return;}
    if(b?.classList.contains('video-link')){copyCurrentVideoLink(e.shiftKey);return;}
    if(b?.dataset.egg==='category'){categoryEggForced=true;renderSettingsSearch();toast('彩蛋已开启：去展开再收起分区试试');return;}
    if(b?.dataset.settingTab){currentTab=b.dataset.settingTab;const id=b.dataset.settingTarget;clearSettingsSearch();renderSettings();const control=id?shadow.getElementById(id):$('#tab-content',shadow);if(control){for(let p=control.parentElement;p&&p!==shadow.host;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}control?.focus();if(control&&typeof control.scrollIntoView==='function')control.scrollIntoView({block:'nearest'});return;}
    if(b?.dataset.window){native('window',{action:b.dataset.window});return;}
    if(b?.classList.contains('back')){setCategories(b.getAttribute('aria-expanded')!=='true',e.detail===0);return;}
    if(b?.id==='settings-trigger')openSettings();
    if(b?.id==='dismiss'||e.target.id==='settings')closeSettings();
    if(b?.dataset.tab){currentTab=b.dataset.tab;renderSettings();$(`[data-tab="${currentTab}"]`,shadow).focus();if(currentTab==='plugins')native('downloader',{action:'status'});}
    if(b?.dataset.themeChoice)update({theme:b.dataset.themeChoice});
    if(b?.id==='proxy-free'){toast('正在重启…');native('proxy',{action:'free',url:location.href});}
    if(b?.id==='proxy-import')native('proxy',{action:'import',url:location.href});
    if(b?.id==='proxy-check')checkProxyRegion();
    if(b?.id==='proxy-refresh')native('proxy',{action:'nodes'});
    if(b?.id==='category-reset')update({categorySelection:DEFAULTS.categorySelection.slice()});
    if(b?.id==='category-default')update({categorySelection:DEFAULT_CATEGORIES.slice(),categoryPreset:1});
    if(b?.id==='category-all')update({categorySelection:CATEGORIES.map((_,i)=>i),categoryPreset:1});
    if(b?.id==='category-none')update({categorySelection:[],categoryPreset:1});
    if(b?.id==='reset')showResetConfirmation();
    if(b?.id==='header-reset'){update(Object.fromEntries(HEADER_ITEMS.map(([key])=>[key,true])));toast('已恢复顶部默认布局');}
    if(b?.id==='rescan'){markAds();renderSettings();}
    if(b?.id==='feedback-open'){openFeedback();return;}if(b?.id==='whats-new-open'){closeSettings();openWhatsNew();return;}if(b?.id==='share-open'){closeSettings();showShare();return;}if(b?.id==='btr-settings'){closeSettings();if(!PREFS.btr)toast('请先开启线程撕裂者并刷新页面');else document.dispatchEvent(new CustomEvent('btr-userscript-open-settings'));}
    if(b?.id==='reload')native('window',{action:'reload'});
    if(b?.id==='pip-action'){closeSettings();requestPip();}
    if(b?.id==='downloader-check'){native('downloader',{action:'status'});}
    if(b?.id==='downloader-enable')native('downloader',{action:'enable'});
    if(b?.id==='downloader-open')native('downloader',{action:'open'});
    if(b?.id==='downloader-browse')native('downloader',{action:'browse'});
  });
  shadow.addEventListener('change',e=>{if(e.target?.dataset?.pref==='settingsZoom')update({settingsZoom:Math.min(160,Math.max(80,Math.round(Number(e.target.value)||100)))});});
  shadow.addEventListener('input',e=>{
    const el=e.target;
    if(el.id==='settings-query'){if(!e.isComposing)renderSettingsSearch();return;}
    if(el.dataset.action==='proxy-toggle'){
      const on=el.checked;
      proxyInfo.enabled=on;
      const line=$('#proxy-status',shadow);if(line)line.textContent=on?'正在重启…':'正在重启…';
      toast(on?'正在重启…':'正在重启…');
      native('proxy',{action:on?'enable':'disable',url:location.href});return;
    }
    if(el.id==='proxy-node'){
      if(el.value){proxyInfo.node=el.value;native('proxy',{action:'select',node:el.value});toast('已切换到 '+el.value);}return;
    }
    if(el.dataset.category!==undefined){const selected=new Set(PREFS.categorySelection);if(el.checked)selected.add(Number(el.dataset.category));else selected.delete(Number(el.dataset.category));update({categorySelection:[...selected].sort((a,b)=>a-b),categoryPreset:1});return;}
    const key=el.dataset.pref;if(!key)return;
    // The settings window scales with this slider, so it follows on release; while dragging only the number moves.
    if(key==='settingsZoom'){const out=el.parentElement?.querySelector('output');if(out)out.textContent=el.value+'%';return;}
    // The experimental fullscreen motion asks first; the switch stays off unless the warning is accepted.
    if(key==='experimentalFullscreenMotion'&&el.checked&&!PREFS.experimentalFullscreenMotion){el.checked=false;confirmFullscreenMotion(el);return;}
    let v=el.type==='checkbox'?el.checked:['range','number'].includes(el.type)||['srScale','srFps','fiFps','fiFlowScale','autoZoomTarget','downloadConnections','feedColumns','settingsZoom'].includes(key)?Number(el.value):el.value;
    update({[key]:v});
    if(key==='btr')toast('刷新页面后生效');
    if(key==='proxyAll')toast('重启后生效');
  });
  accountsController=window.installBiliAccounts?.({shadow,native,refreshAccount,hideAccountCard,toast});
  installSearchPanel();favoritesController=window.installBiliFavorites?.({shadow,native,closeSearch:closeSearchPanel});installMessagesMenu();installSearchQuips();installSearchGrip();installWatchlaterSpin();installAvatarSpin();installFeedRoll();installRouteRefresh();installVideoLinkDrag();installChromeView();
  $('.search',shadow).addEventListener('submit',e=>{e.preventDefault();submitSearch();});
  $('#chrome',shadow).addEventListener('mousedown',e=>{if(e.button===0&&!e.target.closest('button,a,input,form'))native('window',{action:'drag',screenX:e.screenX,screenY:e.screenY});});
  $('#chrome',shadow).addEventListener('dblclick',e=>{if(!e.target.closest('button,a,input'))native('window',{action:'maximize'});});
  shadow.addEventListener('compositionend',e=>{if(e.target.id==='settings-query')renderSettingsSearch();});
  shadow.addEventListener('keydown',e=>{
    if(e.target.id==='settings-query'&&!e.isComposing&&e.keyCode!==229){
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(e.target.value)clearSettingsSearch();else closeSettings();return;}
      if(['Enter','ArrowDown'].includes(e.key)){const first=$('.settings-match',shadow);if(first){e.preventDefault();if(e.key==='Enter')first.click();else first.focus();}return;}
    }
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
  const accountWrap=$('.account-wrap',shadow);accountWrap.addEventListener('pointerenter',e=>{if(e.pointerType&&e.pointerType!=='mouse')return;clearTimeout(accountHideTimer);if(accountProfile)accountShowTimer=setTimeout(showAccountCard,150);});accountWrap.addEventListener('pointerleave',()=>{clearTimeout(accountShowTimer);accountHideTimer=setTimeout(hideAccountCard,160);});accountWrap.addEventListener('focusin',()=>{clearTimeout(accountHideTimer);const card=$('#account-card',shadow);if(accountProfile&&(card.hidden||card.dataset.open!=='true'))showAccountCard(false);});accountWrap.addEventListener('focusout',e=>{if(!accountWrap.contains(e.relatedTarget))hideAccountCard();});
  const trigger=$('.back',shadow),left=$('.header-left',shadow),lane=$('.nav-lane',shadow);
  // Mouse wheel notches glide the channel strip toward an accumulated target each frame; touchpads already scroll smoothly and pass straight through.
  // Chromium never routes a real pointerleave through ancestors, so the root watches the bubbling pointerout and
  // treats it as a leave once the pointer is outside the whole button; this survives the caption buttons being rebuilt.
  // Only a deliberate hover (at least 150ms) earns the flourish; sweeping past the buttons stays quiet.
  const captionEntered=new WeakMap(),captionButton=e=>e.target.closest?.('.window-actions [data-window]');
  shadow.addEventListener('pointerover',e=>{const button=captionButton(e);if(button&&!button.contains(e.relatedTarget))captionEntered.set(button,performance.now());});
  shadow.addEventListener('pointerout',e=>{const button=captionButton(e);if(!button||button.contains(e.relatedTarget))return;const since=captionEntered.get(button);captionEntered.delete(button);if(since!==undefined&&performance.now()-since>=150)windowLeaveMotion(e,button);});
  {let target=null,frame=0;const links=$('#header-categories',shadow);
   const glide=()=>{const left=links.scrollLeft,step=(target-left)*.2;if(Math.abs(target-left)<.5){links.scrollLeft=target;target=null;frame=0;return;}links.scrollLeft=left+step;frame=requestAnimationFrame(glide);};
   links.addEventListener('wheel',e=>{if(innerWidth<=1050||links.scrollWidth<=links.clientWidth||e.ctrlKey)return;e.preventDefault();const delta=(e.deltaY||e.deltaX)*(e.deltaMode===1?40:1),max=links.scrollWidth-links.clientWidth;
     if(e.deltaMode===0&&Math.abs(delta)<40&&!frame){links.scrollLeft+=delta;return;}
     target=Math.max(0,Math.min(max,(target??links.scrollLeft)+delta*1.2));if(!frame)frame=requestAnimationFrame(glide);},{passive:false});}
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
/* Video enhancement runs as one WebGPU pipeline on one canvas, so super-resolution and frame generation can never
   fight over what is on screen:

     each decoded frame  → GPU copy (no CPU readback) → super-resolution once (Anime4K for anime, sharpened bicubic
                           for everything else) → block motion between this frame and the previous one
     each display frame  → warp the two upscaled frames along that motion to the moment being shown (frame
                           generation in the manner of Lossless Scaling, one source frame behind) → canvas

   The canvas stays up from its first frame until the enhancer stops; pausing and seeking only change what it draws. */
// Where between the previous source frame (0) and the newest one (1) the display is, one source frame behind.
function enhancePhase(now,previousTime,currentTime){
  const interval=currentTime-previousTime;if(!(interval>2&&interval<120))return 1;
  return Math.max(0,Math.min(1,(now-interval-previousTime)/interval));
}
/* Anime is told by the page's own data: bangumi seasons of type 番剧/国创, and videos filed under the animation,
   bangumi and guochuang zones or tagged as hand-drawn, MAD/MMD or virtual-idol work. */
const ANIME_ZONES=new Set([1,24,25,27,47,253,13,33,32,51,152,167,153,168,169,195,170]);
function animeFromVideoInfo(info){
  if(!info||typeof info!=='object')return false;
  if(info.seasonType!=null)return [1,4].includes(Number(info.seasonType));
  if(ANIME_ZONES.has(Number(info.tid))||ANIME_ZONES.has(Number(info.tidParent)))return true;
  return /动画|番剧|国创|动漫|MAD|AMV|MMD|手书|虚拟UP|VUP|二次元/i.test(String(info.tname||'')+' '+String(info.tags||''));
}
const animeCache=new Map();
async function videoIsAnime(){
  const model=PREFS.srModel||'auto';if(model==='anime')return true;if(model==='general')return false;
  const path=location.pathname,key=(path.match(/\/(?:video\/(BV[0-9A-Za-z]+|av\d+)|bangumi\/play\/((?:ep|ss)\d+))/)||[])[0]||path;
  if(animeCache.has(key))return animeCache.get(key);
  let anime=false;
  try{
    const state=window.__INITIAL_STATE__||{},nextData=window.__NEXT_DATA__?.props?.pageProps?.dehydratedState;
    const season=state.mediaInfo?.season_type??state.mediaInfo?.ssType??state.epInfo?.season_type;
    if(/\/bangumi\/play\//.test(path)){
      let type=season;
      if(type==null){const id=key.match(/(ep|ss)(\d+)/);if(id){const r=await fetch('https://api.bilibili.com/pgc/view/web/season?'+(id[1]==='ep'?'ep_id=':'season_id=')+id[2],{credentials:'include'});type=(await r.json())?.result?.type;}}
      anime=animeFromVideoInfo({seasonType:type??(nextData?1:null)});
    }else{
      let video=state.videoData;
      if(!video?.tid){const id=key.match(/BV[0-9A-Za-z]+|av\d+/)?.[0];if(id){const r=await fetch('https://api.bilibili.com/x/web-interface/view?'+(id.startsWith('BV')?'bvid=':'aid=')+id.replace(/^av/,''),{credentials:'include'});video=(await r.json())?.data;}}
      anime=animeFromVideoInfo({tid:video?.tid,tidParent:video?.tid_v2_parent??video?.tidv2_parent,tname:video?.tname||video?.tname_v2,tags:(state.tags||[]).map(t=>t.tag_name).join(' ')});
    }
  }catch{}
  animeCache.set(key,anime);return anime;
}
let aiLibrariesPromise;
function loadAiLibraries(){
  if(window['anime4k-webgpu'])return Promise.resolve();
  if(!aiLibrariesPromise)aiLibrariesPromise=new Promise((resolve,reject)=>{native('load-ai');const start=performance.now();const check=()=>{if(window['anime4k-webgpu'])resolve();else if(performance.now()-start>15000){aiLibrariesPromise=null;reject(Error('超分组件加载超时'));}else setTimeout(check,40);};check();});
  return aiLibrariesPromise;
}
const ENHANCE_SHADERS={
  // Full-screen triangle shared by the render passes.
  vertex:`struct Out{@builtin(position) pos:vec4f,@location(0) uv:vec2f};
    @vertex fn vs(@builtin(vertex_index) i:u32)->Out{var p=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));var o:Out;o.pos=vec4f(p[i],0.,1.);o.uv=vec2f((p[i].x+1.)*.5,(1.-p[i].y)*.5);return o;}`,
  // General upscaling: Catmull-Rom bicubic from nine bilinear taps, then contrast-adaptive sharpening that never
  // overshoots the local range (no halos).
  general:`@group(0) @binding(0) var src:texture_2d<f32>;@group(0) @binding(1) var samp:sampler;@group(0) @binding(2) var<uniform> u:vec4f;
    fn bicubic(uv:vec2f)->vec3f{let size=u.xy;let p=uv*size-.5;let f=fract(p);let base=floor(p)+.5;
      let w0=f*(-.5+f*(1.-.5*f));let w1=1.+f*f*(-2.5+1.5*f);let w2=f*(.5+f*(2.-1.5*f));let w3=f*f*(-.5+.5*f);
      let w12=w1+w2;let t0=(base-1.)/size;let t3=(base+2.)/size;let t12=(base+w2/w12)/size;
      var c=vec3f(0.);
      c+=textureSampleLevel(src,samp,vec2f(t0.x,t0.y),0.).rgb*w0.x*w0.y;c+=textureSampleLevel(src,samp,vec2f(t12.x,t0.y),0.).rgb*w12.x*w0.y;c+=textureSampleLevel(src,samp,vec2f(t3.x,t0.y),0.).rgb*w3.x*w0.y;
      c+=textureSampleLevel(src,samp,vec2f(t0.x,t12.y),0.).rgb*w0.x*w12.y;c+=textureSampleLevel(src,samp,vec2f(t12.x,t12.y),0.).rgb*w12.x*w12.y;c+=textureSampleLevel(src,samp,vec2f(t3.x,t12.y),0.).rgb*w3.x*w12.y;
      c+=textureSampleLevel(src,samp,vec2f(t0.x,t3.y),0.).rgb*w0.x*w3.y;c+=textureSampleLevel(src,samp,vec2f(t12.x,t3.y),0.).rgb*w12.x*w3.y;c+=textureSampleLevel(src,samp,vec2f(t3.x,t3.y),0.).rgb*w3.x*w3.y;
      return c;}
    @fragment fn fs(@location(0) uv:vec2f)->@location(0) vec4f{
      let px=1./u.xy;let c=bicubic(uv);
      let n=textureSampleLevel(src,samp,uv+vec2f(0.,-px.y),0.).rgb;let s=textureSampleLevel(src,samp,uv+vec2f(0.,px.y),0.).rgb;
      let e=textureSampleLevel(src,samp,uv+vec2f(px.x,0.),0.).rgb;let w=textureSampleLevel(src,samp,uv+vec2f(-px.x,0.),0.).rgb;
      let lo=min(min(min(n,s),min(e,w)),c);let hi=max(max(max(n,s),max(e,w)),c);
      let amount=u.z*sqrt(clamp(min(lo,1.-hi)/max(hi,vec3f(.001)),vec3f(0.),vec3f(1.)));
      let sharp=c+(c-(n+s+e+w)*.25)*amount*2.;
      return vec4f(clamp(sharp,lo,hi),1.);}`,
  // Block motion: for each block of the newest frame, the offset d with  newest(x) ≈ previous(x + d), in source pixels.
  // A coarse pass searches widely on 32 px blocks; the fine pass refines 16 px blocks from the coarse neighbours.
  motion:`@group(0) @binding(0) var a:texture_2d<f32>;@group(0) @binding(1) var b:texture_2d<f32>;@group(0) @binding(2) var samp:sampler;
    @group(0) @binding(3) var coarseIn:texture_2d<f32>;@group(0) @binding(4) var outField:texture_storage_2d<rgba16float,write>;@group(0) @binding(5) var<uniform> u:vec4f;
    fn luma(t:texture_2d<f32>,p:vec2f)->f32{return dot(textureSampleLevel(t,samp,p/u.xy,0.).rgb,vec3f(.299,.587,.114));}
    fn cost(center:vec2f,size:f32,d:vec2f)->f32{var s=0.;let step=size/6.;
      for(var y=0;y<6;y++){for(var x=0;x<6;x++){let o=center+(vec2f(f32(x),f32(y))-2.5)*step;s+=abs(luma(b,o)-luma(a,o+d));}}
      return s/36.+length(d)*.0004;}
    @compute @workgroup_size(8,8) fn coarse(@builtin(global_invocation_id) id:vec3u){
      let dims=textureDimensions(outField);if(id.x>=dims.x||id.y>=dims.y){return;}
      let center=(vec2f(id.xy)+.5)*32.;var best=vec2f(0.);var bestCost=cost(center,32.,best);
      for(var y=-8;y<=8;y++){for(var x=-8;x<=8;x++){let d=vec2f(f32(x),f32(y))*8.;let c=cost(center,32.,d);if(c<bestCost){bestCost=c;best=d;}}}
      let still=cost(center,32.,vec2f(0.));if(bestCost>still-.004){best=vec2f(0.);bestCost=still;}
      textureStore(outField,id.xy,vec4f(best,bestCost,1.));}
    @compute @workgroup_size(8,8) fn fine(@builtin(global_invocation_id) id:vec3u){
      let dims=textureDimensions(outField);if(id.x>=dims.x||id.y>=dims.y){return;}
      let center=(vec2f(id.xy)+.5)*16.;let cdims=vec2i(textureDimensions(coarseIn));let cid=vec2i(id.xy/2u);
      var mean=vec2f(0.);for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){mean+=textureLoad(coarseIn,clamp(cid+vec2i(x,y),vec2i(0),cdims-1),0).xy;}}mean/=9.;
      var best=vec2f(0.);var bestCost=cost(center,16.,best)+length(mean)*.004;
      for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){let q=clamp(cid+vec2i(x,y),vec2i(0),cdims-1);let d=textureLoad(coarseIn,q,0).xy;let c=cost(center,16.,d)+length(d-mean)*.004;if(c<bestCost){bestCost=c;best=d;}}}
      for(var r=0;r<2;r++){let stepSize=select(1.,4.,r==0);let around=best;
        for(var y=-2;y<=2;y++){for(var x=-2;x<=2;x++){let d=around+vec2f(f32(x),f32(y))*stepSize;let c=cost(center,16.,d)+length(d-mean)*.004;if(c<bestCost){bestCost=c;best=d;}}}}
      let still=cost(center,16.,vec2f(0.));if(bestCost>still-.003){best=vec2f(0.);bestCost=still;}
      textureStore(outField,id.xy,vec4f(best,bestCost,1.));}`,
  // Frame generation: both frames move along the motion to the shown moment and are blended; where the match is poor
  // (occlusion, scene change) the nearer real frame is shown instead of a guess.
  present:`@group(0) @binding(0) var ua:texture_2d<f32>;@group(0) @binding(1) var ub:texture_2d<f32>;@group(0) @binding(2) var field:texture_2d<f32>;
    @group(0) @binding(3) var samp:sampler;@group(0) @binding(4) var<uniform> u:vec4f;
    @fragment fn fs(@location(0) uv:vec2f)->@location(0) vec4f{
      let t=u.z;let b=textureSampleLevel(ub,samp,uv,0.);
      if(u.w<.5||t>=.999){return vec4f(b.rgb,1.);}
      let a=textureSampleLevel(ua,samp,uv,0.);if(t<=.001){return vec4f(a.rgb,1.);}
      let m=textureSampleLevel(field,samp,uv,0.);let d=m.xy/u.xy;
      let wa=textureSampleLevel(ua,samp,uv+t*d,0.).rgb;let wb=textureSampleLevel(ub,samp,uv-(1.-t)*d,0.).rgb;
      let warped=mix(wa,wb,t);let nearest=select(b.rgb,a.rgb,t<.5);
      let trust=(1.-smoothstep(.03,.09,m.z))*(1.-smoothstep(.05,.16,length(wa-wb)));
      return vec4f(mix(nearest,warped,trust),1.);}`
};
class VideoEnhancer {
  constructor(video){
    if(!navigator.gpu)throw Error('需要 WebGPU 显卡支持');
    this.video=video;this.frames=0;this.generated=0;this.sourceFrames=0;this.stopped=false;this.shown=false;
    this.sr=PREFS.srMode!=='off';this.fi=PREFS.fiMode!=='off';this.anime=null;this.slots=[];this.current=-1;this.history=0;
    rememberVideo(video);this.parent=video.parentElement;
    this.canvas=document.createElement('canvas');this.canvas.className='bs-gpu-canvas bs-enhance-canvas';this.canvas.style.visibility='hidden';
    if(getComputedStyle(this.parent).position==='static')this.parent.style.position='relative';this.parent.append(this.canvas);
    this.onFrame=this.onFrame.bind(this);this.onDisplay=this.onDisplay.bind(this);
    this.start().catch(e=>this.fail(e.message));
  }
  async start(){
    if(this.sr){this.anime=await Promise.race([videoIsAnime(),new Promise(r=>setTimeout(()=>r(false),1500))]);if(this.anime)await loadAiLibraries();}
    if(this.stopped)return;
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('找不到 WebGPU 显卡');
    this.device=await adapter.requestDevice();if(this.stopped){this.device.destroy();return;}
    this.device.addEventListener('uncapturederror',e=>{e.preventDefault();if(!this.stopped)this.fail(e.error.message);});
    this.device.lost.then(info=>{if(!this.stopped)this.fail('显卡已重置：'+info.message);});
    this.context=this.canvas.getContext('webgpu');if(!this.context)throw Error('WebGPU 画布不可用');
    this.format=navigator.gpu.getPreferredCanvasFormat();this.context.configure({device:this.device,format:this.format,alphaMode:'opaque'});
    const d=this.device,module=code=>d.createShaderModule({code:ENHANCE_SHADERS.vertex+code});
    this.sampler=d.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
    this.uniform=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.presentUniform=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.presentPipeline=d.createRenderPipeline({layout:'auto',vertex:{module:module(ENHANCE_SHADERS.present),entryPoint:'vs'},fragment:{module:module(ENHANCE_SHADERS.present),entryPoint:'fs',targets:[{format:this.format}]},primitive:{topology:'triangle-list'}});
    this.generalPipeline=d.createRenderPipeline({layout:'auto',vertex:{module:module(ENHANCE_SHADERS.general),entryPoint:'vs'},fragment:{module:module(ENHANCE_SHADERS.general),entryPoint:'fs',targets:[{format:'rgba16float'}]},primitive:{topology:'triangle-list'}});
    const motion=d.createShaderModule({code:ENHANCE_SHADERS.motion});
    this.coarsePipeline=d.createComputePipeline({layout:'auto',compute:{module:motion,entryPoint:'coarse'}});
    this.finePipeline=d.createComputePipeline({layout:'auto',compute:{module:motion,entryPoint:'fine'}});
    this.frameHandle=this.video.requestVideoFrameCallback(this.onFrame);
    if(this.fi)this.raf=requestAnimationFrame(this.onDisplay);
    this.setStatus(this.sr?(this.anime?'超分：动画模型（Anime4K）':'超分：通用模型')+' · 等待视频帧':'补帧已就绪，等待视频帧');
  }
  // Source size and output size; output follows what the player actually shows, capped near 4 megapixels.
  plan(){
    const w=this.video.videoWidth,h=this.video.videoHeight;if(!w||!h)return null;
    let factor=1;
    if(this.sr){const box=this.video.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),shown=Math.max(box.width*dpr/w,box.height*dpr/h);
      factor=Math.min(Number(PREFS.srScale)||2,Math.max(1,shown),Math.sqrt(4.2e6/(w*h)));if(factor<1.05)factor=1;
      if(w*h>1920*1080)return {w,h,outW:w,outH:h,upscale:false,key:w+'x'+h+'@native'};
      if(this.anime)factor=2;}
    return {w,h,outW:Math.round(w*factor),outH:Math.round(h*factor),upscale:this.sr,key:w+'x'+h+'@'+factor.toFixed(2)};
  }
  build(plan){
    this.releaseSlots();const d=this.device,{w,h,outW,outH}=plan;this.plan_=plan;
    const usage=GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT;
    for(let i=0;i<3;i++){
      const src=d.createTexture({size:[w,h],format:'rgba16float',usage});let up=src,anime=null;
      if(plan.upscale&&this.anime){const lib=window['anime4k-webgpu'];anime=new (PREFS.srMode==='quality'?lib.CNNx2UL:lib.CNNx2M)({device:d,inputTexture:src});up=anime.getOutputTexture();}
      else if(plan.upscale)up=d.createTexture({size:[outW,outH],format:'rgba16float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT});
      this.slots.push({src,up,anime,time:0,media:0});
    }
    if(plan.upscale&&!this.anime){d.queue.writeBuffer(this.uniform,0,new Float32Array([w,h,PREFS.srMode==='quality'?1.:.7,0]));
      for(const slot of this.slots)slot.general=d.createBindGroup({layout:this.generalPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:slot.src.createView()},{binding:1,resource:this.sampler},{binding:2,resource:{buffer:this.uniform}}]});}
    const fieldUsage=GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING;
    this.coarse=d.createTexture({size:[Math.ceil(w/32),Math.ceil(h/32)],format:'rgba16float',usage:fieldUsage});
    // Three frames and the motion into each: the display runs 1.5 source frames behind, so an early or late frame still
    // falls inside a pair that can be interpolated.
    this.fields=[0,1,2].map(()=>d.createTexture({size:[Math.ceil(w/16),Math.ceil(h/16)],format:'rgba16float',usage:fieldUsage}));this.field=this.fields[0];
    this.motionUniform=this.motionUniform||d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});d.queue.writeBuffer(this.motionUniform,0,new Float32Array([w,h,0,0]));
    // Motion is always measured from the slot just written (b) back to the other one (a).
    this.motionGroups=[0,1,2].map(i=>{const b=this.slots[i].src.createView(),a=this.slots[(i+2)%3].src.createView();const entries=(pipeline,coarseIn,out)=>d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:a},{binding:1,resource:b},{binding:2,resource:this.sampler},...(coarseIn?[{binding:3,resource:coarseIn.createView()}]:[]),{binding:4,resource:out.createView()},{binding:5,resource:{buffer:this.motionUniform}}]});
      return {coarse:entries(this.coarsePipeline,null,this.coarse),fine:entries(this.finePipeline,this.coarse,this.fields[i])};});
    this.presentGroups=[0,1,2].map(i=>d.createBindGroup({layout:this.presentPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.slots[(i+2)%3].up.createView()},{binding:1,resource:this.slots[i].up.createView()},{binding:2,resource:this.fields[i].createView()},{binding:3,resource:this.sampler},{binding:4,resource:{buffer:this.presentUniform}}]}));
    this.canvas.width=outW;this.canvas.height=outH;this.current=-1;this.history=0;
  }
  releaseSlots(){
    for(const slot of this.slots){if(slot.anime){const seen=new Set(),visit=o=>{if(!o||typeof o!=='object'||seen.has(o))return;seen.add(o);if(typeof o.destroy==='function'&&typeof o.createView==='function'){if(o!==slot.src)o.destroy();return;}if(Array.isArray(o))o.forEach(visit);else for(const [k,v] of Object.entries(o))if(k!=='device')visit(v);};visit(slot.anime);}else if(slot.up!==slot.src)slot.up.destroy();slot.src.destroy();}
    this.slots=[];this.coarse?.destroy();this.fields?.forEach(f=>f.destroy());this.coarse=this.field=this.fields=null;
  }
  onFrame(now,meta){
    if(this.stopped)return;this.frameHandle=this.video.requestVideoFrameCallback(this.onFrame);
    if(!this.video.isConnected){this.stop();scheduleScan();return;}
    try{
      const plan=this.plan();if(!plan)return;const rebuilt=!this.plan_||plan.key!==this.plan_.key;if(rebuilt)this.build(plan);
      const d=this.device,next=this.current<0?0:(this.current+1)%3,slot=this.slots[next],media=meta?.mediaTime??this.video.currentTime,shown=meta?.expectedDisplayTime??now;
      // Seeking, a stall or a backwards jump starts a fresh pair instead of generating frames across the gap.
      const previous=this.current<0?null:this.slots[this.current],gap=previous?media-previous.media:0;
      if(!previous||gap<=0||gap>.25||this.video.seeking)this.history=0;
      d.queue.copyExternalImageToTexture({source:this.video},{texture:slot.src},[plan.w,plan.h]);
      const encoder=d.createCommandEncoder();
      if(plan.upscale){if(slot.anime)slot.anime.pass(encoder);else{const pass=encoder.beginRenderPass({colorAttachments:[{view:slot.up.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});pass.setPipeline(this.generalPipeline);pass.setBindGroup(0,slot.general);pass.draw(3);pass.end();}}
      if(this.fi&&this.history>0){const groups=this.motionGroups[next];
        const c=encoder.beginComputePass();c.setPipeline(this.coarsePipeline);c.setBindGroup(0,groups.coarse);c.dispatchWorkgroups(Math.ceil(this.coarse.width/8),Math.ceil(this.coarse.height/8));
        c.setPipeline(this.finePipeline);c.setBindGroup(0,groups.fine);c.dispatchWorkgroups(Math.ceil(this.field.width/8),Math.ceil(this.field.height/8));c.end();}
      d.queue.submit([encoder.finish()]);
      // Display times are snapped to the screen's refresh; media times are exact. Map one to the other with a slowly
      // corrected offset so generated frames advance evenly.
      const offset=media-shown*(this.video.playbackRate||1)/1000;this.clockOffset=this.history===0||this.clockOffset==null?offset:this.clockOffset+(offset-this.clockOffset)*.08;
      slot.time=shown;slot.media=media;this.current=next;this.history=Math.min(3,this.history+1);this.sourceFrames++;
      // Without frame generation (or while paused) each source frame is shown as it arrives.
      if(!this.fi||this.video.paused||rebuilt)this.present(1);
    }catch(e){this.fail(e.message);}
  }
  onDisplay(now){
    if(this.stopped)return;this.raf=requestAnimationFrame(this.onDisplay);
    if(this.current<0||this.video.paused||document.hidden)return;
    // Cap at the chosen rate: on a fast display some refreshes are skipped evenly.
    const cap=1000/(Number(PREFS.fiFps)||60);if(now-(this.lastPresent||0)<cap*.8)return;this.lastPresent=now;
    if(this.history<2){this.present(1,this.current);return;}
    const newest=this.current,b=this.slots[newest],a=this.slots[(newest+2)%3],dur=b.media-a.media;
    if(!(dur>.002&&dur<.12)){this.present(1,newest);return;}
    const target=now*(this.video.playbackRate||1)/1000+(this.clockOffset||0)-1.5*dur;
    let pair=newest;if(target<a.media&&this.history>=3)pair=(newest+2)%3;
    const nb=this.slots[pair],na=this.slots[(pair+2)%3];
    this.present(Math.max(0,Math.min(1,(target-na.media)/Math.max(.001,nb.media-na.media))),pair);
  }
  present(phase,pair=this.current){
    const d=this.device,plan=this.plan_;if(!plan||this.current<0)return;
    d.queue.writeBuffer(this.presentUniform,0,new Float32Array([plan.w,plan.h,phase,this.fi&&this.history>1?1:0]));
    const encoder=d.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});
    pass.setPipeline(this.presentPipeline);pass.setBindGroup(0,this.presentGroups[pair]);pass.draw(3);pass.end();d.queue.submit([encoder.finish()]);
    this.frames++;if(phase>.001&&phase<.999)this.generated++;
    if(typeof RUNTIME!=='undefined'&&RUNTIME.testing){{const b=this.slots[pair],o=this.slots[(pair+2)%3];(this.trace||(this.trace=[])).push([performance.now(),o.media+phase*(b.media-o.media),b.media-o.media,phase]);}if(this.trace.length>240)this.trace.shift();}
    if(!this.shown){this.shown=true;this.canvas.style.visibility='visible';}
    // The player resets the element's inline style now and then; keep the raw video from compositing under the canvas.
    if(this.video.style.opacity!=='0')this.video.style.opacity='0';
    if(this.frames%30===1){const parts=[];if(plan.upscale)parts.push((this.anime?'动画模型 Anime4K':'通用模型')+` ${plan.w}×${plan.h} → ${plan.outW}×${plan.outH}`);else if(this.sr)parts.push('超分待机（画面不比源大）');if(this.fi)parts.push(`补帧 ${this.generated} 帧 · 上限 ${PREFS.fiFps}fps`);this.setStatus(parts.join(' · '));}
  }
  setStatus(text){status=text;updateStatus();this.status=text;const el=shadow&&$('#fi-status',shadow);if(el)el.textContent=text;}
  fail(message){if(this.stopped)return;this.stop();this.setStatus('画面增强已关闭：'+message+'；已恢复原生播放');toast('画面增强不可用，已恢复原生播放：'+message);diagnostic(status);}
  stop(){
    if(this.stopped)return;this.stopped=true;cancelAnimationFrame(this.raf);if(this.frameHandle!=null)this.video.cancelVideoFrameCallback?.(this.frameHandle);
    try{this.releaseSlots();this.context?.unconfigure();this.device?.destroy();}catch{}
    this.canvas.remove();restoreVideo(this.video,this);
  }
}
function updateStatus(){
  const label=shadow&&$('#gpu-status',shadow);if(label)label.textContent=status;
  $$('.bs-player-tool[data-kind=sr] output').forEach(el=>el.textContent=status);
}
// One enhancer serves both settings; `gpu` and `interpolator` stay as names for the rest of the page script.
function startEnhancer(){
  gpu?.stop();gpu=interpolator=null;if(CHROME_VIEW)return;
  if(PREFS.srMode==='off'&&PREFS.fiMode==='off'){status='未开启';updateStatus();return;}
  const video=playbackVideo();if(!video){status='等待视频';updateStatus();return;}
  if(!navigator.gpu){status='需要 WebGPU 显卡支持，已保留原生播放';updateStatus();return;}
  if(!video.requestVideoFrameCallback){status='此系统不支持逐帧处理，已保留原生播放';updateStatus();return;}
  try{gpu=interpolator=new VideoEnhancer(video);}
  catch(e){status=e.message;updateStatus();toast('画面增强不可用，原生播放不受影响：'+e.message);diagnostic(status);}
}
function startGpu(){startEnhancer();}
function startInterpolation(){if(!gpu||gpu.stopped||gpu.video!==playbackVideo()||gpu.fi!==(PREFS.fiMode!=='off'))startEnhancer();}

let volumeDrag=null;const volumeWatched=new WeakSet(),volumeTracks=new WeakSet(),volumeIntents=new WeakMap(),volumeObserved=new WeakMap();
function playerVolumePercent(){const video=playbackVideo();return video?Math.round((video.muted?0:video.volume)*Math.max(1,Math.min(2,Number(PREFS.volumeBoost||100)/100))*100):0;}
function syncNativeVolume(){
 const host=$('.bpx-player-ctrl-volume');if(!host)return;const percent=playerVolumePercent(),number=$('.bpx-player-ctrl-volume-number',host),track=$('.bui-track',host),bar=$('.bui-bar-normal',host),thumb=$('.bui-thumb',host);host.dataset.bsMaxVolume='200';if(number&&number.textContent!==String(percent))number.textContent=String(percent);
 if(!track)return;track.dataset.bsVolumeSlider='';track.tabIndex=0;track.setAttribute('role','slider');track.setAttribute('aria-orientation','vertical');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','200');track.setAttribute('aria-valuenow',String(percent));track.setAttribute('aria-valuetext',percent+'%');track.setAttribute('aria-label','音量');const position=(percent/2)+'%';
 if(bar){if(bar.style.height!==position)bar.style.height=position;if(bar.style.transform!=='none')bar.style.transform='none';}if(thumb){if(thumb.style.bottom!==position)thumb.style.bottom=position;if(thumb.style.transform!=='translateY(50%)')thumb.style.transform='translateY(50%)';}
 if(!volumeTracks.has(track)){volumeTracks.add(track);track.addEventListener('keydown',e=>{const steps={ArrowUp:5,ArrowRight:5,ArrowDown:-5,ArrowLeft:-5,PageUp:20,PageDown:-20};if(!(e.key in steps)&&!['Home','End'].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();setPlayerVolume(e.key==='Home'?0:e.key==='End'?200:playerVolumePercent()+steps[e.key],true);showPlayerVolumeHint();});}
}
function setPlayerVolume(percent,persist=false){
  const video=playbackVideo();if(!video)return;percent=Math.max(0,Math.min(200,Math.round(Number(percent)||0)));PREFS.volumeBoost=Math.max(100,percent);volumeIntents.set(video,Math.min(1,percent/100));video.volume=Math.min(1,percent/100);video.muted=percent===0;applyAudioBoost();syncNativeVolume();if(persist)update({volumeBoost:PREFS.volumeBoost});
}
let volumeHintTimer;
function showPlayerVolumeHint(){
  const player=$('.bpx-player-video-wrap')||$('.bpx-player-container');if(!player)return;
  let hint=$('[data-bs-volume-hint]',player);
  if(!hint){hint=document.createElement('div');hint.dataset.bsVolumeHint='';hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');hint.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:90;pointer-events:none;padding:12px 20px;border-radius:10px;background:rgba(0,0,0,.65);color:#fff;font:500 18px/1.4 sans-serif;transition:opacity 150ms cubic-bezier(.2,.8,.2,1)';player.append(hint);}
  hint.textContent='音量 '+playerVolumePercent()+'%';hint.style.opacity='1';clearTimeout(volumeHintTimer);volumeHintTimer=setTimeout(()=>{hint.style.opacity='0';},1100);
}
function installPlayerInteractions(){
  document.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key)||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||pageKind()!=='video'||!playbackVideo())return;const path=e.composedPath();if(path.some(el=>el?.matches?.('input,textarea,select,[contenteditable=true],[role=textbox],[role=dialog]'))||shadow&&!$('#settings',shadow).hidden)return;e.preventDefault();e.stopImmediatePropagation();setPlayerVolume(playerVolumePercent()+(e.key==='ArrowUp'?5:-5),true);showPlayerVolumeHint();},true);

  document.addEventListener('click',e=>{const button=e.target.closest?.('.bpx-player-ctrl-pip,.bilibili-player-video-btn-pip');if(!button||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();requestPip();},true);
  const endVolume=(e,cancel=false)=>{if(!volumeDrag||e&&volumeDrag.pointer!==e.pointerId)return;const drag=volumeDrag;if(!cancel&&e&&drag.track.isConnected&&drag.video===playbackVideo())change(e);volumeDrag=null;delete drag.host.dataset.bsDragging;try{if(drag.track.hasPointerCapture?.(drag.pointer))drag.track.releasePointerCapture(drag.pointer);}catch{}if(e){e.preventDefault();e.stopImmediatePropagation();}update({volumeBoost:PREFS.volumeBoost});};
  const change=e=>{if(!volumeDrag)return;if(!volumeDrag.track.isConnected||volumeDrag.video!==playbackVideo()){endVolume(null,true);return;}const rect=volumeDrag.track.getBoundingClientRect();if(rect.height>0&&Number.isFinite(e.clientY)){setPlayerVolume((rect.bottom-e.clientY)/rect.height*200);showPlayerVolumeHint();}};
  document.addEventListener('pointerdown',e=>{const slider=e.target.closest?.('.bpx-player-ctrl-volume-progress');if(!slider||e.button!==0||e.isPrimary===false)return;const host=slider.closest('.bpx-player-ctrl-volume'),track=$('.bui-track',slider)||slider;if(!host)return;e.preventDefault();e.stopImmediatePropagation();if(volumeDrag)endVolume(null,true);volumeDrag={host,track,pointer:e.pointerId,video:playbackVideo()};host.dataset.bsDragging='true';try{track.setPointerCapture?.(e.pointerId);}catch{}change(e);},true);
  document.addEventListener('pointermove',e=>{if(!volumeDrag||volumeDrag.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();change(e);},true);
  document.addEventListener('pointerup',e=>endVolume(e),true);document.addEventListener('pointercancel',e=>endVolume(e,true),true);document.addEventListener('lostpointercapture',e=>endVolume(e,true),true);window.addEventListener('blur',()=>endVolume(null,true));
  for(const type of ['mousedown','click','dblclick'])document.addEventListener(type,e=>{if(e.target.closest?.('.bpx-player-ctrl-volume-progress')){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('wheel',e=>{if(!e.target.closest?.('.bpx-player-ctrl-volume-progress')||e.ctrlKey||!e.deltaY)return;e.preventDefault();e.stopImmediatePropagation();setPlayerVolume(playerVolumePercent()+(e.deltaY<0?5:-5),true);showPlayerVolumeHint();},{capture:true,passive:false});
}
let audioContext,audioVideo,soundBalanceTimer,soundBalanceOwner;const audioGraphs=new WeakMap(),audioStarting=new WeakSet();
function stopSoundBalance(){clearInterval(soundBalanceTimer);soundBalanceTimer=null;soundBalanceOwner=null;}
function soundBalanceStep(rms,db,seconds){
  if(!Number.isFinite(rms)||rms<.003)return db;
  const target=Math.max(-15,Math.min(12,20*Math.log10(.08/rms))),dt=Math.max(0,Math.min(.25,seconds));
  return db+(target-db)*(1-Math.exp(-dt/(target<db ? .18 : 1.8)));
}
/* Program loudness: the mean square of non-silent audio, averaged over about three seconds (it rises in under a
   second so a loud video is caught quickly, and falls over four). Returns the matching RMS level, or 0 until enough
   sound has been heard. */
function soundBalanceLoudness(graph,square,seconds){
  const dt=Math.max(0,Math.min(.25,seconds));
  if(!Number.isFinite(square)||square<1e-5)return graph.heard>1?Math.sqrt(graph.energy):0;
  if(!graph.energy){graph.energy=square;graph.heard=0;}
  graph.heard+=dt;graph.energy+=(square-graph.energy)*(1-Math.exp(-dt/(square>graph.energy?.8:4)));
  return graph.heard>.6?Math.sqrt(graph.energy):0;
}
function audioParamValue(param,value,time=.12){if(param.setTargetAtTime){param.cancelScheduledValues(audioContext.currentTime);param.setTargetAtTime(value,audioContext.currentTime,time);}else param.value=value;}
function configureSoundBalance(video,graph){
  const enabled=!!PREFS.soundBalance&&!!graph.level;
  if(!graph.level){video.dataset.bsBalance=PREFS.soundBalance?'unavailable':'off';return;}
  if(!enabled){stopSoundBalance();audioParamValue(graph.level.gain,1);audioParamValue(graph.compressor.ratio,1);audioParamValue(graph.compressor.threshold,0);graph.balanceEnabled=false;video.dataset.bsBalance='off';return;}
  if(!graph.balanceEnabled){audioParamValue(graph.compressor.threshold,-16);audioParamValue(graph.compressor.knee,8);audioParamValue(graph.compressor.ratio,4);audioParamValue(graph.compressor.attack,.003);audioParamValue(graph.compressor.release,.25);graph.balanceEnabled=true;}
  video.dataset.bsBalance='active';
  if(video.paused||video.ended){if(soundBalanceOwner===graph)stopSoundBalance();return;}
  if(soundBalanceTimer&&soundBalanceOwner===graph)return;
  stopSoundBalance();soundBalanceOwner=graph;graph.balanceLast=performance.now();
  soundBalanceTimer=setInterval(()=>{
    const now=performance.now(),dt=(now-graph.balanceLast)/1000;graph.balanceLast=now;
    if(!PREFS.soundBalance||video!==playbackVideo()||!video.isConnected||video.paused||video.muted||video.seeking||video.volume<.01||video.readyState<2||document.hidden)return;
    graph.analyser.getFloatTimeDomainData(graph.samples);let sum=0;for(const sample of graph.samples)sum+=sample*sample;
    // Measured before the balance and boost stages, compensating the element volume rather than the user's choice.
    const square=sum/graph.samples.length/Math.max(1e-4,video.volume*video.volume);
    graph.balanceDb=soundBalanceStep(soundBalanceLoudness(graph,square,dt),graph.balanceDb,dt);audioParamValue(graph.level.gain,10**(graph.balanceDb/20),.25);
  },100);
}
function applyAudioBoost(){
  const video=playbackVideo();if(!video){stopSoundBalance();return;}
  if(!volumeWatched.has(video)){volumeWatched.add(video);volumeObserved.set(video,video.volume);video.addEventListener('volumechange',()=>{const expected=volumeIntents.get(video),previous=volumeObserved.get(video),changed=Math.abs(video.volume-previous)>.001;volumeObserved.set(video,video.volume);if(changed&&(expected===undefined||Math.abs(video.volume-expected)>.001)&&Number(PREFS.volumeBoost)>100){volumeIntents.delete(video);PREFS.volumeBoost=100;const graph=audioGraphs.get(video);if(graph)graph.gain.gain.value=1;native('config',{value:{volumeBoost:100},revision:++revision});}syncNativeVolume();});}syncNativeVolume();
  const amount=Math.max(1,Math.min(2,Number(PREFS.volumeBoost||100)/100));
  if(audioVideo&&audioVideo!==video){const old=audioGraphs.get(audioVideo);if(old){old.gain.gain.value=1;if(old.level)audioParamValue(old.level.gain,1);}stopSoundBalance();}audioVideo=video;
  let graph=audioGraphs.get(video);if(!graph&&amount<=1&&!PREFS.soundBalance)return;
  if(!graph&&amount<=1&&!video.currentSrc&&!video.src&&!video.srcObject)return;
  if(!graph){
    try{
      const src=video.currentSrc||video.src;
      if(src&&!src.startsWith('blob:')&&!video.crossOrigin&&new URL(src,location.href).origin!==location.origin){video.dataset.bsAudio='unsupported-cors';video.dataset.bsBalance='unsupported-cors';return;}
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){video.dataset.bsBalance='unavailable';return;}
      audioContext=audioContext||new Audio();
      if(audioContext.state!=='running'){
        video.dataset.bsAudio='pending-gesture';if(!audioStarting.has(video)){audioStarting.add(video);audioContext.resume().then(()=>{audioStarting.delete(video);if(audioContext.state==='running')applyAudioBoost();}).catch(()=>audioStarting.delete(video));}return;
      }
      /* source → analyser → level (balance) → compressor (balance) → gain (user boost) → limiter → speakers.
         The boost comes after the balance stage so it really is louder, and the limiter only catches peaks above
         -1 dBFS so a 200% boost does not crackle. */
      let level,analyser,compressor,limiter;
      if(audioContext.createAnalyser&&audioContext.createDynamicsCompressor){analyser=audioContext.createAnalyser();analyser.fftSize=2048;level=audioContext.createGain();level.gain.value=10**(-4/20);compressor=audioContext.createDynamicsCompressor();limiter=audioContext.createDynamicsCompressor();limiter.threshold.value=-1;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.002;limiter.release.value=.12;}
      const gain=audioContext.createGain(),source=audioContext.createMediaElementSource(video);
      if(level){source.connect(analyser);analyser.connect(level);level.connect(compressor);compressor.connect(gain);gain.connect(limiter);limiter.connect(audioContext.destination);}else{source.connect(gain);gain.connect(audioContext.destination);}
      graph={source,gain,level,analyser,compressor,limiter,balanceDb:-4,energy:0,heard:0,samples:new Float32Array(2048)};audioGraphs.set(video,graph);if(typeof RUNTIME!=='undefined'&&RUNTIME.testing)window.__bsAudioGraph=graph;
      video.addEventListener('play',()=>{audioContext?.resume().catch(()=>{});applyAudioBoost();});
      video.addEventListener('pause',()=>{if(audioVideo===video)stopSoundBalance();});
      for(const type of ['emptied','loadstart'])video.addEventListener(type,()=>{graph.balanceDb=-4;graph.energy=0;graph.heard=0;if(graph.level)audioParamValue(graph.level.gain,PREFS.soundBalance?10**(-4/20):1,.03);});
    }catch(e){diagnostic('音量增益不可用，保留原声：'+e.message);return;}
  }
  graph.gain.gain.value=amount;video.dataset.bsAudio='gain-'+Math.round(amount*100);configureSoundBalance(video,graph);audioContext.resume().catch(()=>{});
  const line=shadow&&$('#sound-balance-status',shadow);if(line)line.textContent=PREFS.soundBalance&&video.dataset.bsBalance!=='active'?'此视频暂不支持声音平衡':'';
}

function pauseForTray(){playbackSuspended=true;$$('video,audio').forEach(media=>media.pause());if(shadow)$$('video',shadow).forEach(media=>media.pause());finishVideoLoading();recordVideoLoading('tray-paused');}
function restoreFromTray(){playbackSuspended=false;refreshMessageUnread(true);}
function beginClose(){
  if(PREFS.closeAction==='tray')pauseForTray();
  if(document.querySelector('#bs-close-animation'))return;
  const layer=document.createElement('div');layer.id='bs-close-animation';layer.setAttribute('role','status');layer.setAttribute('aria-label','正在关闭 Bili Space');layer.innerHTML='<div>'+ICON_TV+'<p>Bili Space</p></div>';
  document.documentElement.append(layer);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(()=>native('window',{action:'close-ready'}),reduced?0:240);
}

let pagePendingTimer=0,pagePendingStart=0;
function updatePagePending(failed=false){
  const panel=shadow?.querySelector('#page-pending');if(!panel)return;
  clearTimeout(pagePendingTimer);const body=document.body;
  const rendered=body&&(((typeof body.innerText==='string'?body.innerText:body.textContent)||'').trim().length>24||[...body.querySelectorAll('img')].some(img=>img.complete&&img.naturalWidth>0&&img.getBoundingClientRect().width>80));
  if(rendered){panel.remove();document.documentElement.dataset.bsContentState='ready';return;}
  if(failed||performance.now()-pagePendingStart>12000){panel.dataset.failed='true';panel.querySelector('p').textContent='页面暂未加载完成，请重试';panel.querySelector('button').hidden=false;document.documentElement.dataset.bsContentState='failed';return;}
  pagePendingTimer=setTimeout(updatePagePending,80);
}
function startPagePending(){
  if(pageKind()==='video'||!shadow)return;
  const panel=document.createElement('section');panel.id='page-pending';panel.setAttribute('role','status');
  const title=document.createElement('p');title.textContent='正在加载'+({home:'首页',dynamic:'动态',history:'历史记录',search:'搜索结果',space:'个人空间',messages:'消息'}[pageKind()]||'页面')+'…';
  const retry=document.createElement('button');retry.type='button';retry.textContent='重新加载';retry.hidden=true;retry.onclick=()=>location.reload();panel.append(title,retry);shadow.append(panel);pagePendingStart=performance.now();document.documentElement.dataset.bsContentState='pending';updatePagePending();
  window.addEventListener('pagehide',()=>clearTimeout(pagePendingTimer),{once:true});
}
/* The header grows in small windows and the gain eases off as the window widens: 1240px gives about 20%, 2000px about 8%, 2560px about 5%. */
// The scale lives in its own stylesheet: Bilibili rewrites the root element's inline style while it loads.
// The client zooms pages so they stay near 1280 CSS px wide; the feed's column count follows the window's real width.
let pageZoom=1;function setPageZoom(z){z=Number(z);if(!(z>0)||Math.abs(z-pageZoom)<.001)return;pageZoom=z;applyUiScale();}
function applyUiScale(){const html=document.documentElement;if(!html)return;const width=Math.max(320,innerWidth||1240),scale=Math.round(Math.min(1.28,Math.max(1,1+.2*Math.pow(1240/width,2)))*1000)/1000;
  let sheet=document.getElementById('bs-ui-scale');if(!sheet){sheet=document.createElement('style');sheet.id='bs-ui-scale';html.append(sheet);}
  const real=width*(CONTENT_VIEW?pageZoom:1),auto=real<=800?2:real<=1100?3:real<1500?4:real<1900?5:real<2300?6:7,floor=Number.isInteger(PREFS.feedColumns)&&PREFS.feedColumns>=2&&PREFS.feedColumns<=8?PREFS.feedColumns:0;
  const css='html:root{--bs-ui-scale:'+scale+';--bs-header-height:'+Math.round((width<=800?102:58)*scale)+'px;--bs-feed-columns:'+Math.max(auto,floor)+'}';if(sheet.textContent!==css)sheet.textContent=css;if(!sheet.isConnected)html.append(sheet);}
let uiScaleFrame;window.addEventListener('resize',()=>{cancelAnimationFrame(uiScaleFrame);uiScaleFrame=requestAnimationFrame(applyUiScale);});
/* Video pages tell the native host their title and cover so the video dock can label them. */
let tabInfoSent='',tabInfoTimer;
function reportTabInfo(){clearTimeout(tabInfoTimer);tabInfoTimer=setTimeout(()=>{if(typeof RUNTIME==='undefined'||pageKind()!=='video')return;
  const heading=document.querySelector('h1.video-title,.video-title,.media-title,h1')?.textContent?.trim();
  const title=(heading||document.title.replace(/_哔哩哔哩_bilibili$|_bilibili$/,'')).trim().slice(0,200);
  const meta=document.querySelector('meta[itemprop=image],meta[property="og:image"],meta[itemprop=thumbnailUrl]')?.content||'';const cover=/^(https?:)?\/\/[a-z0-9.-]+\.hdslb\.com\//i.test(meta)?meta:'';
  const key=title+'|'+cover;if(!title||key===tabInfoSent)return;tabInfoSent=key;native('tab-info',{title,cover});},400);}
function homeBubble(text='你已经在主页啦！'){
  if(!shadow)return;let bubble=$('#home-bubble',shadow);if(!bubble){bubble=document.createElement('div');bubble.id='home-bubble';bubble.setAttribute('role','status');shadow.append(bubble);}
  bubble.textContent=text;clearTimeout(homeBubble.timer);bubble.hidden=false;bubble.dataset.leaving='false';
  if(bubble.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)bubble.animate([{opacity:0,transform:'translate(-50%,-10px) scale(.86)'},{opacity:1,offset:.35},{opacity:1,transform:'translate(-50%,0) scale(1)'}],{duration:460,easing:'cubic-bezier(.3,1.3,.5,1)'});
  homeBubble.timer=setTimeout(()=>{const done=()=>{if(bubble.dataset.leaving==='true')bubble.hidden=true;};bubble.dataset.leaving='true';if(bubble.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)bubble.animate([{opacity:1,transform:'translate(-50%,0) scale(1)'},{opacity:0,transform:'translate(-50%,-6px) scale(.94)'}],{duration:200,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}).onfinish=done;else done();},1700);
}
function ctrlHome(){if(pageKind()==='home')homeBubble();else location.href='https://www.bilibili.com/';}
/* Header view: the native host reports the visible page's address (also the moment a navigation starts), so the
   header moves on click instead of waiting for the next page to load. */
let chromePending=null,chromeDirection=null,chromeHoldControls=false,chromeAssume={};
// Back/forward started outside the header (mouse side buttons, Alt+arrows) announce their direction the same way a header click does.
function chromeStep(d){if(!CHROME_VIEW||(d!=='back'&&d!=='forward'))return;chromeDirection=d;setTimeout(()=>{if(chromeDirection===d)chromeDirection=null;},1500);}
function chromeActive(state){
  if(!CHROME_VIEW||!state?.url)return;let next;try{next=new URL(state.url);}catch{return;}
  // While a navigation is under way the page still reports its old address (history updates, state reads); those
  // reports must not pull the header back. The destination's own report, or 8s without one, ends the wait.
  const kind=pageKind(next);
  const previewed=chromePending?.kind===kind?chromePending.previewed:0;
  if(state.starting)chromePending={kind,until:Date.now()+8000,previewed};else if(kind!=='search'||state.complete)clearSearchBusy();
  else if(chromePending){if(kind!==chromePending.kind&&Date.now()<chromePending.until)return;chromePending=null;}
  /* A starting navigation already tells what history it ends with, so back/forward move once, with the logo and the
     underline, instead of waiting for the page to load and moving again. */
  if(state.starting){
    chromeAssume=chromeDirection==='back'?{forward:true}:chromeDirection==='forward'?{back:true}:{};
    // Anything that is not a back/forward step is a new page: it can go back and has nothing ahead.
    const was=navigationState||{back:false,forward:false};
    navigationState=chromeDirection?{back:was.back||!!chromeAssume.back,forward:was.forward||!!chromeAssume.forward}:{back:true,forward:false};chromeHoldControls=false;
    chromeDirection=null;
  }else{navigationState={back:!!state.back||!!chromeAssume.back,forward:!!state.forward||!!chromeAssume.forward};chromeHoldControls=false;}chromeLocation=next;syncRoute();syncNavigationControls();reportChromeLayout();
}
let chromeLayoutKey='',chromeLayoutFrame,webFullscreen=false;
// The player's web fullscreen fills the page; the floating buttons of the header would cover its controls.
function watchWebFullscreen(){if(!CONTENT_VIEW)return;let was=false;const check=()=>{const on=!!document.querySelector('.bpx-player-container[data-screen=web],.bpx-player-container[data-screen=full]');if(on!==was){was=on;native('web-fullscreen',{on});}};
  new MutationObserver(check).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['data-screen']});check();
  // The tab that comes to the front tells the header its own state.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){was=null;check();}});}
function setWebFullscreen(on){if(!CHROME_VIEW||!shadow)return;webFullscreen=!!on;shadow.host.toggleAttribute('data-web-full',webFullscreen);reportChromeLayout();}
function reportChromeLayout(){
  if(!CHROME_VIEW||!shadow)return;cancelAnimationFrame(chromeLayoutFrame);chromeLayoutFrame=requestAnimationFrame(()=>{
    const rects=[],scale=devicePixelRatio||1;
    const add=el=>{if(!el||el.hidden||!el.isConnected)return;const look=getComputedStyle(el);if(look.display==='none'||look.visibility==='hidden'||Number(look.opacity)===0)return;const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)rects.push([Math.floor(r.left*scale),Math.floor(r.top*scale),Math.ceil(r.right*scale),Math.ceil(r.bottom*scale)]);};
    if(!swipeTucked)add($('#chrome',shadow));for(const q of ['#search-panel','#favorites-panel','#account-card','#messages-menu','#header-categories',...(webFullscreen?[]:['#settings-trigger','.upload','#feed-roll','#page-top']),'#toast','#clipboard-video-prompt','.account-manager'])add($(q,shadow));for(const p of $$('.bs-plugin-panel',shadow))add(p);
    // Windows that other scripts open in this document (the login panel, the thread ripper's settings dialog) sit
    // outside the shadow root; without their rectangles the clicks would land on the page underneath.
    let foreignModal=false;
    for(const el of document.querySelectorAll('html>*:not(head):not(body),body>*')){if(el.id==='bili-space-root'||el.matches('style,script,link,meta,iframe,template,dialog:not([open])'))continue;
      if(el.matches('dialog[open]')&&el.matches(':modal')){foreignModal=true;continue;}if(getComputedStyle(el).pointerEvents!=='none')add(el);}
    const modal=foreignModal||!!$('#settings:not([hidden])',shadow)||!!$('.scrim:not([hidden])',shadow)||!!$('#update-notice',shadow)||!!$('#plugin-dialog',shadow)||!!$('#onboarding',shadow)||!!$('#feedback',shadow)||!!$('#whats-new',shadow)||!!$('#share-card',shadow)||!!$('#news-card',shadow)||!!$('#language-pick',shadow)||!!$('#clickgui',shadow);
    const key=JSON.stringify([rects,modal]);if(key===chromeLayoutKey)return;chromeLayoutKey=key;native('chrome-layout',{rects,modal});
  });
}
// Ctrl+wheel (over the header or the page) zooms one step per notch; the client animates the step instead of the browser jumping.
function installZoomWheel(){let at=0;addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();const now=performance.now();if(now-at<90||!e.deltaY)return;at=now;native('zoom-step',{dir:e.deltaY<0?1:-1});},{passive:false});}
function installChromeView(){
  if(!CHROME_VIEW||!shadow)return;
  // Links in the header open on the visible page, never inside the header view.
  shadow.addEventListener('click',e=>{const step=e.composedPath().find(n=>n.dataset?.window==='back'||n.dataset?.window==='forward');if(step&&!step.disabled){const d=chromeDirection=step.dataset.window;setTimeout(()=>{if(chromeDirection===d)chromeDirection=null;},1500);}},true);
  shadow.addEventListener('click',e=>{if(e.defaultPrevented||e.button)return;const a=e.composedPath().find(n=>n.tagName==='A'&&n.href);if(a&&/^https?:/i.test(a.href)){e.preventDefault();native('navigate',{url:a.href});}});
  // Reported when something can have changed, not on a timer: DOM changes (plus one late check for the motion that
  // follows them), finished transitions and animations, and window resizes.
  let settle;const changed=()=>{reportChromeLayout();clearTimeout(settle);settle=setTimeout(reportChromeLayout,450);};
  new MutationObserver(changed).observe(shadow,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','style','data-open','aria-expanded','data-categories']});
  new MutationObserver(changed).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden','class','style']});
  for(const type of ['transitionend','animationend','animationcancel'])shadow.addEventListener(type,reportChromeLayout,true);
  addEventListener('resize',changed);
  installZoomWheel();
  surfaceRevealed();acceptRouteOrigin('');native('navigation-state',{action:'read'});reportChromeLayout();
}
let resumeMedia=[];
function tabShown(){reportTabInfo();refreshMessageUnread?.(true);const media=resumeMedia.filter(m=>m.isConnected);resumeMedia=[];for(const m of media)m.play?.().catch(()=>{});}
function tabHidden(){resumeMedia=[...document.querySelectorAll('video,audio')].filter(m=>!m.paused&&!m.ended);for(const m of resumeMedia)m.pause();closeSearchPanel?.();favoritesController?.close();hideMessageMenu?.(true);}
window.addEventListener('load',()=>{reportTabInfo();const title=document.querySelector('title');if(title)new MutationObserver(reportTabInfo).observe(title,{childList:true,characterData:true,subtree:true});},{once:true});
function prepareShell(){if(root||!document.documentElement)return;applyUiScale();style=document.createElement('style');style.id='bili-space-style';style.textContent=pageCss;document.documentElement.append(style);mountShell();warmProfileMediaCache();applyHeaderPreferences();const dark=PREFS.theme==='dark'||(PREFS.theme==='system'&&mediaTheme.matches);root.dataset.theme=dark?'dark':'light';document.documentElement.dataset.bsTheme=dark?'dark':'light';root.style.setProperty('--accent',PREFS.accent);if(pageKind()==='search')setLoading(true);startPagePending();surfaceRevealed();}
function boot(){
  prepareShell();native('app-visibility');installWheelInertia();installPlayerInteractions();
  if(pageKind()==='video'){beginVideoLoading();settleVideoLoading();}
  document.addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const link=e.composedPath().find(el=>el?.matches?.('a[href]'));if(!link)return;const opened=link.target&&link.target!=='_self';const download=link.hasAttribute('download');try{const url=new URL(link.href,location.href);if(/(^|\.)bilibili\.com$/i.test(url.hostname)&&/\/video\/BV[a-z0-9]{10}/i.test(url.pathname)&&!download&&!(opened&&pageKind()!=='video'))beginVideoLoading(url.href);}catch{}},true);
  // One-time migration: profiles that never touched the category list still carry all 18.
  if(!Number(INITIAL.categoryPreset)&&Array.isArray(PREFS.categorySelection)&&PREFS.categorySelection.length===CATEGORIES.length)update({categorySelection:DEFAULT_CATEGORIES.slice(),categoryPreset:1});
  if(!PREFS.experimentalControlsV1)update({srMode:'off',fiMode:'off',experimentalControlsV1:true});
  applyPreferences();markAds();linkifyDescriptions();cacheSpaceBackgrounds();mountHomeBanner();compactHomeFeed();mountPlayerTools();startGpu();startInterpolation();if(PREFS.srMode!=='off'||PREFS.fiMode!=='off')toast('测试功能已开启：超分/补帧可能卡顿或闪烁。');refreshAccount();
  if(pageKind()==='search'&&document.readyState!=='complete')setLoading(true);watchSearchReady();
  window.addEventListener('load',()=>setLoading(false),{once:true});
  window.addEventListener('focus',()=>{refreshAccount();refreshMessageUnread(true);});
  let unreadTimer=setInterval(()=>refreshMessageUnread(),60000),unreadReadTimer;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshMessageUnread(true);});
  document.addEventListener('click',()=>{if(pageKind()==='messages'){clearTimeout(unreadReadTimer);unreadReadTimer=setTimeout(()=>refreshMessageUnread(true),1200);}},true);
  window.addEventListener('pagehide',()=>{clearInterval(unreadTimer);unreadTimer=null;clearTimeout(unreadReadTimer);messageRequest?.abort();});
  window.addEventListener('pageshow',()=>{if(!unreadTimer)unreadTimer=setInterval(()=>refreshMessageUnread(),60000);refreshMessageUnread(true);});
  for(const method of ['pushState','replaceState']){
    const original=history[method];
    history[method]=function(...args){const result=Reflect.apply(original,this,args);syncRoute();scheduleScan();return result;};
  }
  window.addEventListener('popstate',()=>{syncRoute();scheduleScan();});
  window.addEventListener('hashchange',syncSwipeHash);setTimeout(syncSwipeHash,0);
  window.addEventListener('pagehide',()=>{if(swipe)native('swipe-state',{on:false});});
  window.addEventListener('hashchange',syncRoute);
  // Danmaku and live-chat lines arrive many times a second and never need a page scan (ads, links, player tools).
  const SCAN_QUIET='#bili-space-root,.bs-player-tool,.bs-gpu-canvas,.bili-danmaku-x-dm,.b-danmaku,#chat-items';
  const observer=new MutationObserver(records=>{
    const home=document.documentElement.dataset.bsPage==='home';
    if(records.some(r=>(r.type==='attributes'&&home&&r.target.matches?.('.feed-card,.bili-feed-card,.bili-video-card,.floor-single-card')&&r.target.closest?.('.bili-feed4-layout'))||((r.type==='characterData'||r.type==='childList')&&(r.target.nodeType===1?r.target:r.target.parentElement)?.closest('.basic-desc-info,.desc-info-text,#v_desc .info,.bili-video-card__stats--text,.bili-video-card__info--text-ad,[data-ad-label]'))||[...r.addedNodes].some(n=>n.nodeType===1&&!n.closest?.(SCAN_QUIET)))){scheduleScan();}
  });observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style']});
  mediaTheme.addEventListener('change',applyPreferences);
  document.addEventListener('pointerdown',applyAudioBoost,{passive:true});document.addEventListener('keydown',applyAudioBoost);document.addEventListener('loadedmetadata',applyAudioBoost,true);window.addEventListener('pagehide',stopSoundBalance);window.addEventListener('pageshow',applyAudioBoost);
  const controls=document.createElement('div');controls.className='bs-pip-controls';controls.innerHTML='<button type="button" aria-label="返回客户端" title="返回客户端"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M3 3l7 7M14 3h7v18H3v-7"/></svg></button><button class="bs-pip-play" type="button" data-paused="true" aria-label="播放" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="pip-play-glyph" d="M8 5l11 7-11 7z"/><g class="pip-pause-glyph"><path d="M7 5v14M17 5v14"/></g></svg></button>';
  document.body.append(controls);$('button',controls).onclick=()=>native('window',{action:'pip'});$('.bs-pip-play',controls).onclick=()=>{const v=playbackVideo();if(v){if(v.paused)v.play().catch(()=>{});else v.pause();}syncPipPlayback();};
  for(const type of ['play','pause','ended','emptied'])document.addEventListener(type,()=>{syncPipPlayback();if(pipDanmaku.timer)pipDanmaku.tick();},true);document.addEventListener('loadedmetadata',()=>{if(pipActive)syncPipPresentation();},true);
  window.addEventListener('resize',()=>{layoutHeaderLeading();syncPipPresentation();});
  scheduleHeaderClock();syncPipPlayback();watchWebFullscreen();watchPageScroll();
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey&&e.key.toLowerCase()==='w'){e.preventDefault();e.stopImmediatePropagation();native('window',{action:'close'});return;}
    if(e.ctrlKey&&e.key===','){e.preventDefault();openSettings();}
    if(e.key==='Escape'){if(!$('#settings',shadow).hidden)closeSettings();if(pipActive)native('window',{action:'pip'});}
    if(e.key==='F5'){e.preventDefault();native('window',{action:'reload'});}
  });
  document.addEventListener('mousedown',e=>{if(pipActive&&e.button===0&&!e.target.closest('button'))native('window',{action:'drag',screenX:e.screenX,screenY:e.screenY});});
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('#bili-space-video-download');
    const cancel=e.target.closest?.('#bili-space-download-cancel');if(cancel){e.preventDefault();e.stopPropagation();if(cancel.disabled)return;downloadCancelling=true;cancel.disabled=true;cancel.textContent='取消中';const label=$('#bili-space-download-progress');if(label)label.textContent='正在取消下载…';native('downloader',{action:'cancel'});return;}
    if(!button)return;
    e.preventDefault();e.stopPropagation();requestDownload();
  },true);
  window.BiliSpace={fullReadyAt,tourBackdrop,offerClipboardVideo,clipboardVideoTarget,refreshMessageUnread,acceptUpdateStatus,videoLinkCopied,pauseForTray,restoreFromTray,setPlayerVolume,acceptSearchHistory,beginNavigation,showAccountCard,hideAccountCard,surfaceRevealed,beginVideoLoading,finishVideoLoading,cancelVideoLoading,revealFade,chromeActive,chromeStep,tabShown,tabHidden,homeBubble,ctrlHome,beginClose,proxyStatus,proxyState,proxyToast(text){if(!CONTENT_VIEW)toast(text);},pluginsChanged(){if(shadow&&!$('#settings',shadow).hidden&&currentTab==='plugins')renderSettings();},
    openSettings,closeSettings,update,markAds,requestPip,setLoading,refreshAccount,syncRoute,checkProxyRegion,
    downloaderStatus(info){
      downloaderInfo={...downloaderInfo,...(info||{})};
      const line=$('#downloader-status',shadow);if(line)line.textContent=downloaderInfo.message||'';
      const button=$('#bili-space-video-download');if(button)button.hidden=!PREFS.downloader;
    },
    acceptDownloadQueue(value){window.BiliDesktop44?.acceptQueue(value);},
    resolveQueuedDownload(item){return window.BiliDesktop44?.resolveQueuedDownload(item);},
    mediaCommand(command){window.BiliDesktop44?.mediaCommand(command);},
    openLoginPanel(){accountsController?.openLogin();},
    closeLoginPanel(){accountsController?.closeLogin();},
    acceptAccountState(state){if(state.event==='login'||state.event==='signed-out'){accountRequest?.abort();accountRequest=null;accountChecked=0;accountProfile=null;renderAccountCard();}accountsController?.accept(state);},
    acceptCommunityState(state){window.BiliCommunity44?.acceptState(state);},
    downloadProgress,
    downloadPhase(text){const button=$('#bili-space-video-download');if(!downloadCancelling&&button?.dataset.state==='busy'){$('span',button).textContent=String(text||'下载中');downloadDisplay(text==='合并中'?'下载完成 · 正在合并音视频…':String(text||'下载中'));}},
    downloadStarted(){const button=$('#bili-space-video-download');if(button?.dataset.state==='busy'){downloadCancelling=false;$('span',button).textContent='下载中';const cancel=$('#bili-space-download-cancel');if(cancel){cancel.dataset.started='true';cancel.hidden=false;cancel.disabled=false;}downloadDisplay('0% · 0 B/s · 预计剩余 计算中');}},
    downloadResult(result){settleDownload(Boolean(result?.ok),String(result?.message||''));},
    downloaderNotice(text){toast(String(text||''));},
    acceptConfig(next,ack){if(ack<revision)return;const langBefore=uiLanguage();Object.assign(PREFS,next);applyPreferences();if(uiLanguage()!==langBefore)setLanguage(uiLanguage());},
    setPip(on){
      pipActive=on;document.documentElement.dataset.bsPip=String(on);root.style.display=on?'none':'';syncPipPresentation();
      // Upstream hosts use inline all:initial!important; a stylesheet cannot override it.
      if(on){
        $$('[id^="__bilibili_thread_ripper_"]').forEach(el=>{pipHiddenHosts.set(el,[el.style.getPropertyValue('display'),el.style.getPropertyPriority('display')]);el.style.setProperty('display','none','important');});
      }else{
        for(const [el,[value,priority]] of pipHiddenHosts){if(value)el.style.setProperty('display',value,priority);else el.style.removeProperty('display');}pipHiddenHosts.clear();
      }
    },
    setWebFullscreen,setSwipeActive,revealSwipeHeader,openSwipe,closeSwipe,openFeedback,feedbackResult,clearSearchBusy,setPageZoom,openWhatsNew,showShare,shareCopied,acceptNews,rollFeed,setPageScrolled,scrollPageTop,
    setFullscreen(on){if(!on)holdPlayer(false);fullActive=on;document.documentElement.dataset.bsFull=String(on);root.style.display=on?'none':'';},
    emitPipDanmaku(items,time){for(const item of items)pipDanmaku.emit(item,time);},
    get state(){return {headerBrand:{shown:brandShown,moving:brandMotion.length>0},pipDanmaku:{active:!!pipDanmaku.timer,status:pipDanmaku.status,font:pipDanmaku.font||0,comments:pipDanmaku.active.length},prefs:{...PREFS},status,headerSurfaceReady,videoLoadingEvents:[...videoLoadingEvents],audioBoost:PREFS.volumeBoost,soundBalance:{enabled:!!PREFS.soundBalance,status:playbackVideo()?.dataset.bsBalance||'waiting',gainDb:audioGraphs.get(playbackVideo())?.balanceDb||0},audioState:playbackVideo()?.dataset.bsAudio||'native',frames:gpu?.frames||0,stopped:gpu?.stopped??true,pip:pipActive,full:fullActive,route:pageKind(),loading:$('.search',shadow).getAttribute('aria-busy')==='true',ads:$$('[data-bs-ad=true]').length,proxy:proxyInfo,interpolation:interpolator?{frames:interpolator.frames,generated:interpolator.generated,stopped:interpolator.stopped,status:interpolator.status}:null};}
  };
  const route44=()=>({url:currentVideoLink(),title:$('.video-title,h1')?.textContent||document.title});
  window.BiliDesktop44?.install({native,getVideo:playbackVideo,getRoute:route44,getAccountId:()=>String(accountProfile?.mid||''),wbiQuery:downloadWbiQuery,chooseStreams:chooseDownloadStreams});
  window.BiliSpacePlugins?.start({getVideo:playbackVideo,getPrefs:()=>PREFS,toast,update,getShadow:()=>shadow,view:CHROME_VIEW?'header':'page',navigate:url=>{if(CHROME_VIEW)native('navigate',{url});else location.href=url;}});
  window.BiliCommunity44?.install({native,getVideo:playbackVideo,getRoute:route44,getAccountId:()=>String(accountProfile?.mid||''),parseDanmaku:parsePipDanmaku,wbiQuery:downloadWbiQuery,disableDanmaku:true});
  window.addEventListener('pagehide',()=>{window.BiliDesktop44?.stop();window.BiliCommunity44?.stop();});
  window.addEventListener('pageshow',e=>{if(e.persisted){brandMotion.forEach(a=>{a.onfinish=null;a.cancel();});brandMotion=[];brandShown=undefined;brandStateRequested=false;syncHeaderBrand();categoryMotion.forEach(a=>{a.onfinish=null;a.cancel();});categoryMotion=[];categoryShown=undefined;syncCategoryVisibility();navigationMotion.forEach(a=>{a.onfinish=null;a.cancel();});navigationMotion=[];navigationState=undefined;navigationMask=undefined;navigationRequested=false;syncNavigationControls();}native('navigation-state',{action:'read'});window.BiliDesktop44?.start();window.BiliCommunity44?.start();});
  if(typeof RUNTIME!=='undefined'&&RUNTIME.testing)window.BiliSpace.enhancer=()=>gpu&&{trace:gpu.trace,frames:gpu.frames,generated:gpu.generated,sourceFrames:gpu.sourceFrames,anime:gpu.anime,plan:gpu.plan_,shown:gpu.shown,stopped:gpu.stopped,status:gpu.status};
  // Right Shift on its own (pressed and released with nothing else, outside text fields) opens the floating panels.
  {let lone=false;document.addEventListener('keydown',e=>{lone=e.code==='ShiftRight'&&!e.repeat;},true);
   document.addEventListener('keyup',e=>{if(e.code!=='ShiftRight'||!lone||!PREFS.clickGui)return;lone=false;const t=e.composedPath()[0];if(t?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
     if(CHROME_VIEW)openClickGui();else native('open-settings',{tab:''});},true);}
  native('updates',{action:'status'});startI18n();scheduleLanguagePicker();scheduleOnboarding();scheduleWhatsNew();startNews();if(CONTENT_VIEW){native('page-zoom');installZoomWheel();}
  loadOfficialSearchHistory();
  // A video page carries its own loading cover from here on, so its tab can be shown now (about 0.8 s sooner than
  // waiting for the load event); the cover stays until the video itself is ready.
  if(document.readyState==='complete'||(CONTENT_VIEW&&pageKind()==='video'&&$('#bs-video-loading')))window.__bsPaintReady?.();
  diagnostic('Bili-Space ready');
}
if(document.documentElement)prepareShell();else{const earlyShell=new MutationObserver(()=>{if(document.documentElement){earlyShell.disconnect();prepareShell();}});earlyShell.observe(document,{childList:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
