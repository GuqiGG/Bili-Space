from pathlib import Path
p=Path('assets/enhance.js');s=p.read_text(encoding='utf8')
# One main-player media selector, never a hidden preview/banner element.
s=s.replace("const $$ = (q, root=document) => [...root.querySelectorAll(q)];", "const $$ = (q, root=document) => [...root.querySelectorAll(q)];\nfunction playbackVideo(){const main=[...new Set($$('.bpx-player-video-wrap video,#bilibili-player video,.bilibili-player-video video'))],all=main.length?main:$$('video');return all.sort((a,b)=>{const score=v=>{const r=v.getBoundingClientRect();return (!v.hidden&&getComputedStyle(v).display!=='none'&&r.width>1&&r.height>1?100:0)+v.readyState;};return score(b)-score(a);})[0]||null;}")
s=s.replace("$('video')", "playbackVideo()")
s=s.replace("headerHome:true,headerDynamic", "trafficLights:true,headerHome:true,headerDynamic",1)
s=s.replace("  if(!shadow)return;\n  for(const [key,,selector]", "  if(!shadow)return;\n  const left=$('.header-left',shadow);left.dataset.controls=PREFS.trafficLights?'traffic':'windows';$('.lights',shadow).hidden=!PREFS.trafficLights;$('.window-actions',shadow).hidden=Boolean(PREFS.trafficLights);\n  for(const [key,,selector]",1)
s=s.replace("let completedVideoKey='',", "let playbackSuspended=false,completedVideoKey='',",1)
s=s.replace("video.addEventListener('loadstart',start);}", "video.addEventListener('loadstart',start);for(const event of ['loadeddata','playing','timeupdate'])video.addEventListener(event,()=>{if($('#bs-video-loading'))settleVideoLoading();});if($('#bs-video-loading'))settleVideoLoading();}",1)
s=s.replace("document.documentElement.append(layer);\n}\nfunction beginNavigation", "document.documentElement.append(layer);queueMicrotask(()=>settleVideoLoading());\n}\nfunction beginNavigation",1)
s=s.replace("  if(!video||video.readyState<1", "  if(playbackSuspended||!video||video.readyState<1",1)
s=s.replace("videoWaitTimer=setTimeout(shown,300)", "videoWaitTimer=setTimeout(shown,80)",1)
s=s.replace("},reduced?0:180);\n}\nfunction autoplayLoadingVideo", "},reduced?0:120);\n}\nfunction autoplayLoadingVideo",1)
s=s.replace("if(pageKind()==='video'){beginVideoLoading();if(document.readyState==='complete')settleVideoLoading();}", "if(pageKind()==='video'){beginVideoLoading();settleVideoLoading();}",1)
s=s.replace("animation:bs-loading-in 180ms", "animation:bs-loading-in 120ms").replace("animation:bs-loading-out 180ms", "animation:bs-loading-out 120ms")
s=s.replace("@keyframes bs-loading-in{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:scale(1)}}@keyframes bs-loading-out{to{opacity:0;transform:scale(1.02)}}", "@keyframes bs-loading-in{from{opacity:0}to{opacity:1}}@keyframes bs-loading-out{to{opacity:0}}")
s=s.replace("if(PREFS.fiMode!=='off'&&(!interpolator", "if(PREFS.fiMode!=='off'&&(!interpolator")
# Keep both native Home text and TV Home. Explicit alignment across all controls.
s=s.replace('.header-left[data-video=true] nav [data-route=home]{display:none}', '')
s=s.replace('.header-left[data-video=true]>.back,.header-left[data-video=true]>.nav-lane{display:none}', '.header-left[data-video=true]>.back{display:none}.header-left[data-video=true]{grid-column:1/-1}.header-left[data-video=true]~.brand{visibility:hidden}')
idx=s.index('.header-left{position:relative;');s=s[:idx]+'''.header-left nav a{display:inline-flex;align-items:center;justify-content:center;height:32px;line-height:20px}.header-left>.lights{height:32px}.header-left[data-controls=windows]>.lights{display:none!important}.header-left[data-controls=windows]:not([data-video=true])>.back{margin-left:0}.window-actions{display:flex;gap:3px;align-items:center;margin-left:12px;padding-left:12px;border-left:1px solid var(--line);flex-shrink:0}.window-actions button{width:28px;height:32px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent}.window-actions button:hover{background:var(--field)}.window-actions button:last-child:hover{background:#e55353;color:white}.window-actions svg{width:14px;height:14px;stroke:currentColor;stroke-width:1.5;fill:none;display:block}.header-left[data-controls=windows][data-video=true]>.back,.header-left[data-controls=windows][data-video=true]>.nav-lane{transform:translateX(0)}.header-left[data-controls=windows][data-video=true]{padding-right:0;--header-home-shift:0px}.header-left[data-controls=windows] .video-home-top{display:none}.window-actions[hidden]{display:none!important}
''' +s[idx:]
s=s.replace('appearance:[\'外观与主题\'', 'appearance:[\'个性化\'')
s=s.replace("if(currentTab==='appearance')return `<h2>让空间，像你。</h2>", "if(currentTab==='appearance')return `<h2>让空间，像你。</h2>${toggle('trafficLights','使用红绿灯窗口按钮','关闭后导航移至左侧，最小化、最大化、关闭按钮移至头像右侧。')}")
old='</section></div></div></header><button id="settings-trigger"';new='</section></div><div class="window-actions" aria-label="窗口控制" hidden><button type="button" data-window="minimize" aria-label="最小化"><svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg></button><button type="button" data-window="maximize" aria-label="最大化或还原"><svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="1"/></svg></button><button type="button" data-window="close" aria-label="关闭"><svg viewBox="0 0 16 16"><path d="m3 3 10 10M13 3 3 13"/></svg></button></div></div></header><button id="settings-trigger"';assert old in s;s=s.replace(old,new,1)
# Route arrow keys through the same extended volume path; leave typing/shortcuts intact.
idx=s.index("function installPlayerInteractions(){")+len("function installPlayerInteractions(){")
s=s[:idx]+'''
  document.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key)||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||pageKind()!=='video'||!playbackVideo())return;const path=e.composedPath();if(path.some(el=>el?.matches?.('input,textarea,select,[contenteditable=true],[role=textbox],[role=dialog]'))||shadow&&!$('#settings',shadow).hidden)return;e.preventDefault();e.stopImmediatePropagation();setPlayerVolume(playerVolumePercent()+(e.key==='ArrowUp'?5:-5),true);},true);
''' +s[idx:]
idx=s.index('html[data-bs-pip=true] body{');s=s[:idx]+'''html[data-bs-page=video] .bpx-player-ctrl-volume-box{height:160px!important;padding-block:10px!important}html[data-bs-page=video] .bpx-player-ctrl-volume-progress,html[data-bs-page=video] .bpx-player-ctrl-volume-progress .bui-area,html[data-bs-page=video] .bpx-player-ctrl-volume-progress .bui-track{height:110px!important;min-height:110px!important}html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) .bpx-player-container[data-screen=normal]{aspect-ratio:16/9!important;height:auto!important}html[data-bs-page=video]:not([data-bs-pip=true]):not([data-bs-full=true]) .bpx-player-container[data-screen=normal] .bpx-player-video-wrap{height:100%!important}
''' +s[idx:]
# Pause before actual hide, not on restoring: returning never resumes without intent.
idx=s.index('function beginClose(){');s=s[:idx]+'''function pauseForTray(){playbackSuspended=true;$$('video,audio').forEach(media=>media.pause());if(shadow)$$('video',shadow).forEach(media=>media.pause());finishVideoLoading();recordVideoLoading('tray-paused');}
function restoreFromTray(){playbackSuspended=false;}
''' +s[idx:]
s=s.replace("function beginClose(){\n", "function beginClose(){\n  if(PREFS.closeAction==='tray')pauseForTray();\n",1)
s=s.replace("window.BiliSpace={setPlayerVolume", "window.BiliSpace={pauseForTray,restoreFromTray,setPlayerVolume",1)
# Small damped spring, interruptible through WAAPI; reduced motion and keyboard stay immediate.
s=s.replace('accountHideTimer,accountShowTimer;', 'accountHideTimer,accountShowTimer,accountMotion;')
a=s.index('function showAccountCard(){');b=s.index('\nfunction hideAccountCard()',a)
s=s[:a]+'''function showAccountCard(animate=true){clearTimeout(accountHideTimer);const card=$('#account-card',shadow),wasHidden=card.hidden;card.hidden=false;renderAccountCard();$('.account',shadow).setAttribute('aria-expanded','true');const from=accountMotion?getComputedStyle(card).transform:null;accountMotion?.cancel();card.dataset.open='true';if(animate&&wasHidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&card.animate){card.style.transition='none';const frames=[];for(let i=0;i<=30;i++){const t=i/30*.5,x=1-Math.exp(-5*t)*(Math.cos(Math.sqrt(75)*t)+5/Math.sqrt(75)*Math.sin(Math.sqrt(75)*t)),scale=.96+.04*x;frames.push({offset:i/30,opacity:Math.min(1,t/.12),transform:i===30?'translateY(0) scale(1)':(i===0&&from&&from!=='none'?from:'translateY('+(-6*(1-x))+'px) scale('+scale+')')});}accountMotion=card.animate(frames,{duration:500,easing:'linear'});}refreshAccountStats();}
''' +s[b:]
s=s.replace("function hideAccountCard(){clearTimeout(accountShowTimer);", "function hideAccountCard(){accountMotion?.cancel();clearTimeout(accountShowTimer);")
s=s.replace("accountWrap.addEventListener('focusin',showAccountCard)", "accountWrap.addEventListener('focusin',()=>showAccountCard(false))")
p.write_text(s,encoding='utf8')
p=Path('src/main.cpp');s=p.read_text(encoding='utf8').replace('{"headerHome",true}', '{"trafficLights",true},{"headerHome",true}',1)
s=s.replace("execute(\"document.querySelector('#bs-close-animation')?.remove()\");ShowWindow", "execute(\"document.querySelector('#bs-close-animation')?.remove();window.BiliSpace?.restoreFromTray()\");ShowWindow",1)
s=s.replace('else if(selected==2)ShowWindow(hwnd,SW_HIDE);', 'else if(selected==2){execute("window.BiliSpace?.pauseForTray()");ShowWindow(hwnd,SW_HIDE);}')
s=s.replace('if(!closePending){closePending=true;GetWindowRect', 'if(!closePending){if(config.value("closeAction",std::string("tray"))=="tray")execute("window.BiliSpace?.pauseForTray()");closePending=true;GetWindowRect',1)
s=s.replace('=="tray"){ShowWindow(hwnd,SW_HIDE);', '=="tray"){execute("window.BiliSpace?.pauseForTray()");ShowWindow(hwnd,SW_HIDE);',1)
p.write_text(s,encoding='utf8')
# Keep upstream account API, but mount controls inside each card instead of an independently-positioned overlay plane.
p=Path('assets/blocker.home.user.js');s=p.read_text(encoding='utf8');a=s.index('    function positionHomeCardOverlays() {');b=s.index('\n    function mountHomeCardOverlay',a)
s=s[:a]+'''    function positionHomeCardOverlays() {
        // Inline card children scroll on the compositor with their card; no viewport coordinate tracking.
        for (const [anchor,{overlay,card}] of homeCardOverlays) {
            if (!anchor.isConnected || !card.isConnected) { overlay.remove();homeCardOverlays.delete(anchor);homeCardRegistry.delete(card); }
        }
    }
''' +s[b:]
s=s.replace("overlay.className = 'home-card-blacklist-overlay';", "overlay.className = 'home-card-blacklist-overlay';\n        overlay.dataset.biliSpaceInline = 'true';",1)
s=s.replace("        getOverlayRoot().appendChild(overlay);\n        positionHomeCardOverlays();", "        anchor.insertAdjacentElement('afterend',overlay);\n        positionHomeCardOverlays();",1)
s=s.replace(".home-card-blacklist-overlay {\n          position: fixed !important;\n          z-index: 1000 !important;\n          pointer-events: none !important;", ".home-card-blacklist-overlay {\n          position: static !important;\n          display: inline-flex !important;\n          flex: 0 0 auto !important;\n          margin-left: 6px !important;\n          align-self: center !important;\n          vertical-align: middle !important;\n          pointer-events: auto !important;",1)
s=s.replace('transition: all 0.2s ease !important;', 'transition: color 150ms ease,background-color 150ms ease,border-color 150ms ease !important;')
p.write_text(s,encoding='utf8')
for name in ['package.json','package-lock.json','assets/bridge.js','assets/enhance.js','CMakeLists.txt']:
 p=Path(name);p.write_text(p.read_text(encoding='utf8').replace('0.1.22','0.1.23'),encoding='utf8')
