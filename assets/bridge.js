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
const GM_info = {scriptHandler:'Bili-Space',version:'0.1.37',injectInto:'page'};
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
function typingInPage(event){return event.composedPath().some(el=>el?.matches?.('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox],bili-comment-textarea,bili-comment-reply-renderer,[data-bs-volume-slider]'));}
function shouldWrapKeyboard(target,type){return ['keydown','keypress','keyup'].includes(type)&&(target===window||target===document||target?.matches?.('#bilibili-player,.bpx-player-container,.bilibili-player,.bpx-player-video-wrap'));}
EventTarget.prototype.addEventListener=function(type,listener,options){
  if(!listener||!['function','object'].includes(typeof listener)||!shouldWrapKeyboard(this,type))return keyboardAdd.call(this,type,listener,options);
  let byType=keyboardWrappers.get(this);if(!byType){byType=new Map();keyboardWrappers.set(this,byType);}const key=type+':'+Boolean(typeof options==='boolean'?options:options?.capture);let callbacks=byType.get(key);if(!callbacks){callbacks=new WeakMap();byType.set(key,callbacks);}let wrapped=callbacks.get(listener);
  if(!wrapped){wrapped=function(event){if([' ','Spacebar','Enter'].includes(event.key)&&event.composedPath().some(el=>el?.matches?.('button.video-link,#bili-space-download-cancel,#bili-space-video-download,.bs-pip-controls button')))return;if(!event.ctrlKey&&!event.altKey&&!event.metaKey&&[' ','Spacebar','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','f','d','m','j','k','l','w'].includes(event.key?.length===1?event.key.toLowerCase():event.key)&&typingInPage(event))return;if(typeof listener==='function')return listener.call(this,event);return listener.handleEvent?.call(listener,event);};callbacks.set(listener,wrapped);}
  return keyboardAdd.call(this,type,wrapped,options);
};
EventTarget.prototype.removeEventListener=function(type,listener,options){const key=type+':'+Boolean(typeof options==='boolean'?options:options?.capture),wrapped=listener&&keyboardWrappers.get(this)?.get(key)?.get(listener);return keyboardRemove.call(this,type,wrapped||listener,options);};
