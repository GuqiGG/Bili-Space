const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const initial={theme:'dark',accent:'#fb7299',progressColor:'#fb7299',progressHeight:4,progressRadius:6,progressAlways:false,progressThumb:true,showChannels:true,hideAds:true,btr:true,font:true,zoom:100,srMode:'off',srScale:2};
function app({url='https://www.bilibili.com/',source='assets/enhance.js',bridgeSource='assets/bridge.js',html,config={},loggedIn=false,reduceMotion=true,officialHistory=[]}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html||fs.readFileSync('assets/fixture.html','utf8'),{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,messages=[],historyMessages=[],historyStore=new Map([['search_history:search_history',JSON.stringify(officialHistory)],['search_history:migrated','1']]);w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
 const originalWindow=Object.getOwnPropertyDescriptor(w.HTMLIFrameElement.prototype,'contentWindow').get;Object.defineProperty(w.HTMLIFrameElement.prototype,'contentWindow',{get(){const win=originalWindow.call(this);if(win&&this.src.includes('/cols/iframe.html'))win.postMessage=(m,target)=>{historyMessages.push(m);let value;if(m.type==='COLS_GET')value=historyStore.get(m.key)??null;else if(m.type==='COLS_SET')historyStore.set(m.key,m.value);queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{origin:'https://s1.hdslb.com',source:win,data:{type:'COLS_RES',key:m.key,id:m.id,value}})));};return win;}});
 const append=w.Element.prototype.append;w.Element.prototype.append=function(...nodes){const r=append.apply(this,nodes);for(const n of nodes)if(n.tagName==='IFRAME'&&n.src.includes('/cols/iframe.html'))queueMicrotask(()=>n.dispatchEvent(new w.Event('load')));return r;};
w.matchMedia=q=>({matches:q.includes('prefers-reduced-motion')?reduceMotion:true,addEventListener(){}});w.structuredClone=structuredClone;
 w.chrome={webview:{postMessage:m=>messages.push(m)}};
 w.fetch=async()=>({ok:true,json:async()=>loggedIn?{code:0,data:{isLogin:true,mid:1234,uname:'测试账号',face:'https://i0.hdslb.com/bfs/face/test-avatar.png'}}:{code:-101,data:{isLogin:false}}});
 if(loggedIn)w.document.cookie='DedeUserID=1234; path=/';
 w.eval(`const APP_INFO=${JSON.stringify(JSON.parse(fs.readFileSync('assets/app-info.json','utf8')))};const INITIAL=${JSON.stringify({...initial,...config})};const GM_INITIAL={};const ICON_SETTINGS=${JSON.stringify(fs.readFileSync('assets/settings.svg','utf8'))};const ICON_SPARKLES=${JSON.stringify(fs.readFileSync('assets/sparkles.svg','utf8'))};const ICON_MESSAGE=${JSON.stringify(fs.readFileSync('assets/message-square-more.svg','utf8'))};\n`+fs.readFileSync(bridgeSource,'utf8')+'\n'+['assets/desktop44.js','assets/community44.js'].filter(p=>fs.existsSync(p)).map(p=>fs.readFileSync(p,'utf8')).join('\n')+'\n'+fs.readFileSync(source,'utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {dom,w,messages,historyStore,historyMessages,errors,close:()=>w.close()};
}
module.exports={app};
