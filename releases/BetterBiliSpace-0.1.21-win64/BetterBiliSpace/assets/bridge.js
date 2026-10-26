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
const GM_info = {scriptHandler:'Better Bili Space',version:'0.1.21',injectInto:'page'};
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
