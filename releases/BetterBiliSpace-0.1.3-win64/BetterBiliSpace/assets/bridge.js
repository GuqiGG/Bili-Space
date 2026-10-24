// Native persistence only; no filesystem, process, credential or network bridge.
const native = (type, value = {}) => window.chrome?.webview?.postMessage({ type, ...value });
const gmValues = structuredClone(GM_INITIAL);
const unsafeWindow = window;
const GM_info = {scriptHandler:'Better Bili Space',version:'0.1.3',injectInto:'page'};
const GM = {
  getValue: async (key, fallback) => gmValues[key] ?? fallback,
  setValue: async (key, value) => { gmValues[key]=value; native('gm-set',{key,value}); }
};
const GM_getValue = (_key, fallback) => fallback;
const GM_setValue = () => {};
const GM_registerMenuCommand = () => 0;
const GM_unregisterMenuCommand = () => {};
const GM_addStyle = (css) => {
  const el=document.createElement('style');el.textContent=css;
  (document.head||document.documentElement).append(el);return el;
};
