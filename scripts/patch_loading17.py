from pathlib import Path
p=Path('assets/enhance.js');s=p.read_text(encoding='utf8')
s=s.replace("let videoLoadTimer,videoWaitTimer,loadFrameOwner,loadFrameHandle;", "let completedVideoKey='',videoLoadTimer,videoWaitTimer,loadFrameOwner,loadFrameHandle;")
a=s.index('function watchVideoLoading()');b=s.index('function finishVideoLoading()',a)
s=s[:a]+'''function videoLoadingKey(value=location.href){try{const url=new URL(value,location.href);if(!/(^|\\.)bilibili\\.com$/i.test(url.hostname)&&url.hostname!=='bili-space.local')return '';const path=url.pathname.replace(/^\\/(?:zh-Hans|zh-Hant|en)(?=\\/|$)/,'').replace(/\\/$/,'');return /^\\/(?:video|bangumi|list)(?:\\/|$)/.test(path)?path+'?p='+(url.searchParams.get('p')||'1'):'';}catch{return '';}}
function watchVideoLoading(){const video=$('video');if(!video||watchedLoadingVideos.has(video))return;watchedLoadingVideos.add(video);const start=()=>{if(video.isConnected&&pageKind()==='video'&&videoLoadingKey()!==completedVideoKey){beginVideoLoading();settleVideoLoading();}};video.addEventListener('emptied',start);video.addEventListener('loadstart',start);}
function recordVideoLoading(event){videoLoadingEvents.push({event,time:performance.now(),videoReady:$('video')?.readyState});if(videoLoadingEvents.length>24)videoLoadingEvents.shift();}
function cancelVideoLoading(){clearTimeout(videoLoadTimer);clearTimeout(videoWaitTimer);cancelLoadingFrame();const layer=$('#bs-video-loading');if(layer){layer.remove();recordVideoLoading('cancelled');}}
function beginVideoLoading(target=location.href){
  const key=videoLoadingKey(target);if(!key||key===completedVideoKey)return;
  let layer=$('#bs-video-loading');if(layer?.dataset.key===key)return;if(layer)cancelVideoLoading();
  recordVideoLoading('enter');layer=document.createElement('div');layer.id='bs-video-loading';layer.dataset.key=key;layer.setAttribute('role','status');layer.setAttribute('aria-live','polite');layer.innerHTML='<div>'+ICON_TV+'<p>正在打开视频…</p><button type="button" class="bs-load-play" hidden>点击播放</button><button type="button" class="bs-load-dismiss">显示页面</button></div>';document.documentElement.append(layer);$('.bs-load-dismiss',layer).onclick=()=>finishVideoLoading();$('.bs-load-play',layer).onclick=()=>{const video=$('video');delete layer.dataset.awaitPlay;delete layer.dataset.waiting;$('p',layer).textContent='正在准备画面…';settleVideoLoading();video?.play().catch(()=>toast('自动播放受限，可点“显示页面”使用原生播放器。'));};
}
function beginNavigation(target){const url=new URL(target,location.href);if(videoLoadingKey(url.href)){setLoading(false);beginVideoLoading(url.href);}else{cancelVideoLoading();setLoading(url.hostname==='search.bilibili.com');}}
''' +s[b:]
s=s.replace("if(!layer||layer.classList.contains('leaving'))return;clearTimeout(videoWaitTimer);", "if(!layer||layer.classList.contains('leaving'))return;completedVideoKey=layer.dataset.key;clearTimeout(videoWaitTimer);")
s=s.replace("if($('#bs-video-loading')!==layer)return;const video=$('video');", "if($('#bs-video-loading')!==layer||layer.classList.contains('leaving'))return;if(layer.dataset.key!==videoLoadingKey()){videoWaitTimer=setTimeout(wait,100);return;}const video=$('video');")
s=s.replace("if(on&&pageKind()==='video')beginVideoLoading();if(!on)settleVideoLoading(failed);", "if(!on&&pageKind()==='video')settleVideoLoading(failed);else if(pageKind()!=='video')cancelVideoLoading();")
s=s.replace("setLoading(true);native('navigate',{url});", "beginNavigation(url);native('navigate',{url});")
s=s.replace("if(previous&&kind==='video'){beginVideoLoading();setTimeout(()=>settleVideoLoading(),200);}","if(previous&&kind==='video'){beginVideoLoading();setTimeout(()=>settleVideoLoading(),200);}else if(kind!=='video')cancelVideoLoading();")
s=s.replace("))beginVideoLoading();}catch{}},true);", "))beginVideoLoading(url.href);}catch{}},true);")
s=s.replace("window.BiliSpace={showAccountCard", "window.BiliSpace={beginNavigation,showAccountCard")
s=s.replace("  style=document.createElement('style');style.id='bili-space-style';style.textContent=pageCss;document.documentElement.append(style);\n  mountShell();installWheelInertia();", "  prepareShell();installWheelInertia();")
# Mount only the chrome before DOMContentLoaded, so slow resources cannot withhold it.
s=s.replace("function boot(){", "function prepareShell(){if(root||!document.documentElement)return;style=document.createElement('style');style.id='bili-space-style';style.textContent=pageCss;document.documentElement.append(style);mountShell();applyHeaderPreferences();const dark=PREFS.theme==='dark'||(PREFS.theme==='system'&&mediaTheme.matches);root.dataset.theme=dark?'dark':'light';document.documentElement.dataset.bsTheme=dark?'dark':'light';root.style.setProperty('--accent',PREFS.accent);surfaceRevealed();}\nfunction boot(){")
s=s.replace("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();", "if(document.documentElement)prepareShell();else{const earlyShell=new MutationObserver(()=>{if(document.documentElement){earlyShell.disconnect();prepareShell();}});earlyShell.observe(document,{childList:true});}\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();")
p.write_text(s,encoding='utf8')
p=Path('src/main.cpp');s=p.read_text(encoding='utf8');old='surfaceCommitted=false;surfaceWaiting=true;surfaceStart=GetTickCount64();controller->put_IsVisible(FALSE);SetTimer(windowHandle,75,16,nullptr);SetTimer(windowHandle,76,testing?30000:10000,nullptr);InvalidateRect(windowHandle,nullptr,FALSE);';s=s.replace(old,'surfaceCommitted=false;surfaceWaiting=false;')
s=s.replace('if(uri.find(L"/video/")!=std::wstring::npos)execute("window.BiliSpace?.beginVideoLoading()");execute("window.BiliSpace?.setLoading(true)");', 'execute("window.BiliSpace?.beginNavigation("+json(utf8(uri)).dump()+")");')
p.write_text(s,encoding='utf8')
for name in ['package.json','package-lock.json','assets/bridge.js','assets/enhance.js','CMakeLists.txt']:
 p=Path(name);p.write_text(p.read_text(encoding='utf8').replace('0.1.16','0.1.17'),encoding='utf8')
