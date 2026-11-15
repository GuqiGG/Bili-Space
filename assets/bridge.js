// 首页推荐的记录与回放：首页从客户端的本地缓存打开（启动更快），这样打开的页面浏览器放不进后退缓存，
// 去历史等页面再回来时首页会重新加载，之前往下刷出来的推荐全没了。这里把 B 站每次请求到的推荐（每页 12 条）记下来，
// 回到首页时按原来的顺序交给 B 站自己渲染，补齐到离开时的条数再滚回原位；手动刷新还是换一批。
if(location.hostname==='www.bilibili.com'&&/^\/(?:zh-Hans\/?)?(?:index\.html)?$/.test(location.pathname))try{
const LOG='bs-feed-log',POS='bs-feed-pos',RCMD=/\/x\/web-interface\/(?:wbi\/)?index\/top\/feed\/rcmd/;
// 同一个接口还有别的用法（一次多要几行等），所以按「第几页、几行、每页几条、哪种刷新」配对，不按先后顺序
const keyOf=url=>{try{const q=new URL(url,location.href).searchParams;return ['fresh_idx','fetch_row','ps','fresh_type','y_num'].map(k=>q.get(k)).join('|');}catch{return '';}};
let saved={};try{saved=JSON.parse(sessionStorage.getItem(LOG)||'{}')||{};if(Array.isArray(saved))saved={};}catch{}
const nav=performance.getEntriesByType('navigation')[0]?.type,pos=(()=>{try{return JSON.parse(sessionStorage.getItem(POS)||'null');}catch{return null;}})();
const replay=new Map(nav!=='reload'&&Object.keys(saved).length>1&&pos&&Date.now()-pos.at<30*60*1000?Object.entries(saved):[]);
const log={};const keep=()=>{try{sessionStorage.setItem(LOG,JSON.stringify(log));}catch{}};
const stat=window.__bsFeed={nav,start:replay.size,served:0,net:0,done:null};if(!replay.size){try{sessionStorage.removeItem(LOG);}catch{}}
const realFetch=window.fetch;
window.fetch=function(input,init){const url=typeof input==='string'?input:input?.url||'';
  if(!RCMD.test(url))return realFetch.apply(this,arguments);const key=keyOf(url);
  // 回来后的第一次请求：把记下的所有页按页码顺序合成一页一次交出去，B 站一次就渲染完（一页页要会慢到好几秒）
  if(replay.size){let merged=null;const pages=[...replay.entries()].sort((a,b)=>Number(a[0].split('|')[0])-Number(b[0].split('|')[0]));
    for(const [k,body] of pages){try{const j=JSON.parse(body);if(!merged)merged=j;else merged.data.item.push(...(j.data?.item||[]));log[k]=body;}catch{}}
    replay.clear();keep();stat.served=pages.length;
    if(merged)return Promise.resolve(new Response(JSON.stringify(merged),{status:200,headers:{'Content-Type':'application/json; charset=utf-8'}}));}
  stat.net++;return realFetch.apply(this,arguments).then(r=>{if(r.ok&&key&&Object.keys(log).length<40)r.clone().text().then(t=>{if(t.length<2e6&&/"code":0/.test(t)){log[key]=t;keep();}}).catch(()=>{});return r;});};
window.addEventListener('pagehide',()=>{try{sessionStorage.setItem(POS,JSON.stringify({y:scrollY,at:Date.now()}));}catch{}});
if(replay.size){history.scrollRestoration='manual';
  // 这段脚本比页面的 <html> 元素还早运行，遮挡要等它出现后再加
  const style=document.createElement('style');style.textContent='html[data-bs-restoring=true] body{opacity:0!important}';
  const cover=()=>{const html=document.documentElement;if(!html)return false;html.dataset.bsRestoring='true';html.append(style);return true;};
  if(!cover()){const wait=new MutationObserver(()=>{if(cover())wait.disconnect();});wait.observe(document,{childList:true});}
  const started=Date.now(),done=()=>{stat.done={ms:Date.now()-started,left:replay.size,h:document.documentElement.scrollHeight};clearInterval(timer);scrollTo(0,pos.y);if(document.documentElement)delete document.documentElement.dataset.bsRestoring;style.remove();};
  // 还有没交出去的记录时就滚到底，让 B 站去要下一页；交完了、页面也够高了就回到原来的位置
  const timer=setInterval(()=>{if(!document.body)return;const max=document.documentElement.scrollHeight-innerHeight;
    if(!replay.size&&max>=pos.y-4)done();else if(Date.now()-started>4000)done();},80);}
}catch(e){console.warn('首页推荐回放出错',e);}
// Native persistence only; no filesystem, process, credential or network bridge.
const native = (type, value = {}) => window.chrome?.webview?.postMessage({ type, ...value });
const gmValues = structuredClone(GM_INITIAL);
// The engine stays enabled; only the upstream floating launcher is disabled.
function withoutFloatingLauncher(value){
  try{
    const v=typeof value==='string'?JSON.parse(value):value;
    if(v&&typeof v==='object'&&!Array.isArray(v))return JSON.stringify({...v,floatingButton:false});
  }catch{}
  return JSON.stringify({floatingButton:false});
}
// Upstream reads its settings from this origin's localStorage, so the stored copy has to be
// rewritten here, before btr.user.js starts; the manager shim below is only the fallback.
for(const key of ['BTR_Userscript.sync','BTR_Userscript.local']){
  try{
    const raw=localStorage.getItem(key);
    if(raw===null)continue;
    const current=JSON.parse(raw);
    if(current&&typeof current==='object'&&current.floatingButton!==false)localStorage.setItem(key,withoutFloatingLauncher(current));
  }catch{}
}
gmValues.sync=withoutFloatingLauncher(gmValues.sync);
const unsafeWindow = window;
const GM_info = {scriptHandler:'Bili-Space',version:'0.1.51',injectInto:'page'};
const GM = {
  getValue: async (key, fallback) => gmValues[key] ?? fallback,
  setValue: async (key, value) => { if(key==='sync')value=withoutFloatingLauncher(value);gmValues[key]=value; native('gm-set',{key,value}); }
};
const GM_getValue = (_key, fallback) => fallback;
const GM_setValue = () => {};
const GM_registerMenuCommand = () => 0;
const GM_unregisterMenuCommand = () => {};
const GM_addStyle = (css) => {
  const el=document.createElement('style');el.textContent=css;
  (document.head||document.documentElement).append(el);return el;
};

// Install before website scripts: Shadow DOM retargeting must not leak typing into player shortcuts.
for(const type of ['keydown','keypress','keyup'])window.addEventListener(type,event=>{
  if(!event.composed)return;const path=event.composedPath(),shell=document.querySelector('#bili-space-root');
  const editor=path.find(el=>el?.matches?.('input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]'));if(!editor||!editor.getRootNode()?.host)return;
  event.stopImmediatePropagation();
  if(type==='keydown'&&event.ctrlKey&&event.key===','){event.preventDefault();window.BiliSpace?.openSettings();return;}
  if(type==='keydown'&&event.key==='F5'){event.preventDefault();native('window',{action:'reload'});return;}
  const local=new KeyboardEvent(type,{key:event.key,code:event.code,location:event.location,repeat:event.repeat,ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey,metaKey:event.metaKey,isComposing:event.isComposing,bubbles:true,cancelable:true,composed:false});
  if(!editor.dispatchEvent(local))event.preventDefault();
},true);

// Native editors retain their own key handlers. Only outer player/global hotkeys are gated.
const keyboardAdd=EventTarget.prototype.addEventListener,keyboardRemove=EventTarget.prototype.removeEventListener,keyboardWrappers=new WeakMap();
function typingInPage(event){return event.composedPath().some(el=>el?.matches?.('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox],bili-comment-textarea,bili-comment-reply-renderer,[data-bs-volume-slider],[role=dialog],[role=alertdialog]'));}
function shouldWrapKeyboard(target,type){return ['keydown','keypress','keyup'].includes(type)&&(target===window||target===document||target?.matches?.('#bilibili-player,.bpx-player-container,.bilibili-player,.bpx-player-video-wrap'));}
EventTarget.prototype.addEventListener=function(type,listener,options){
  if(!listener||!['function','object'].includes(typeof listener)||!shouldWrapKeyboard(this,type))return keyboardAdd.call(this,type,listener,options);
  let byType=keyboardWrappers.get(this);if(!byType){byType=new Map();keyboardWrappers.set(this,byType);}const key=type+':'+Boolean(typeof options==='boolean'?options:options?.capture);let callbacks=byType.get(key);if(!callbacks){callbacks=new WeakMap();byType.set(key,callbacks);}let wrapped=callbacks.get(listener);
  if(!wrapped){wrapped=function(event){if([' ','Spacebar','Enter'].includes(event.key)&&event.composedPath().some(el=>el?.matches?.('button.video-link,#bili-space-download-cancel,#bili-space-video-download,.bs-pip-controls button,[role=alertdialog]')))return;if(!event.ctrlKey&&!event.altKey&&!event.metaKey&&[' ','Spacebar','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','f','d','m','j','k','l','w'].includes(event.key?.length===1?event.key.toLowerCase():event.key)&&typingInPage(event))return;if(typeof listener==='function')return listener.call(this,event);return listener.handleEvent?.call(listener,event);};callbacks.set(listener,wrapped);}
  return keyboardAdd.call(this,type,wrapped,options);
};
EventTarget.prototype.removeEventListener=function(type,listener,options){const key=type+':'+Boolean(typeof options==='boolean'?options:options?.capture),wrapped=listener&&keyboardWrappers.get(this)?.get(key)?.get(listener);return keyboardRemove.call(this,type,wrapped||listener,options);};
