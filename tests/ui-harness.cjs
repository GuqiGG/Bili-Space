const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const initial={theme:'dark',accent:'#fb7299',progressColor:'#fb7299',progressHeight:4,progressRadius:6,progressAlways:false,progressThumb:true,showChannels:true,hideAds:true,btr:true,font:true,zoom:100,srMode:'off',srScale:2};
function app({url='https://www.bilibili.com/',source='assets/enhance.js',html,config={},loggedIn=false}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html||fs.readFileSync('assets/fixture.html','utf8'),{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,messages=[];w.matchMedia=()=>({matches:true,addEventListener(){}});w.structuredClone=structuredClone;
 w.chrome={webview:{postMessage:m=>messages.push(m)}};
 w.fetch=async()=>({ok:true,json:async()=>loggedIn?{code:0,data:{isLogin:true,mid:1234,uname:'测试账号',face:'https://i0.hdslb.com/bfs/face/test-avatar.png'}}:{code:-101,data:{isLogin:false}}});
 if(loggedIn)w.document.cookie='DedeUserID=1234; path=/';
 w.eval(`const INITIAL=${JSON.stringify({...initial,...config})};const GM_INITIAL={};const ICON_SETTINGS=${JSON.stringify(fs.readFileSync('assets/settings.svg','utf8'))};const ICON_SPARKLES=${JSON.stringify(fs.readFileSync('assets/sparkles.svg','utf8'))};const ICON_MESSAGE=${JSON.stringify(fs.readFileSync('assets/message-square-more.svg','utf8'))};\n`+fs.readFileSync('assets/bridge.js','utf8')+'\n'+fs.readFileSync(source,'utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {dom,w,messages,errors,close:()=>w.close()};
}
module.exports={app};
