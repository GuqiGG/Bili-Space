import asyncio,json,pathlib,subprocess,urllib.request,ctypes
from websockets.asyncio.client import connect
from smoke import CDP,ROOT,OUT

async def main():
 s=subprocess.STARTUPINFO();s.dwFlags|=subprocess.STARTF_USESHOWWINDOW;s.wShowWindow=0
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],startupinfo=s)
 try:
  for _ in range(80):
   try:
    ts=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));ts=[t for t in ts if t.get('type')=='page' and 'bili-space.local' in t.get('url','')]
    if ts:break
   except Exception:pass
   await asyncio.sleep(.25)
  async with connect(ts[0]['webSocketDebuggerUrl'],max_size=20000000) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.navigate',{'url':'https://www.bilibili.com/'});await asyncio.sleep(12)
   home=await c.js('({url:location.href,headers:[...document.querySelectorAll(".bili-header,.bili-header__bar,.bili-header__channel,.channel-container,.international-header")].map(e=>({class:e.className,html:e.outerHTML.slice(0,1500)})),bodyClasses:document.body.className,card:document.querySelector(".bili-video-card")?.outerHTML,href:document.querySelector(".bili-video-card a[href*=video]")?.href})')
   (OUT/'live-dom.json').write_text(json.dumps(home,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(home,ensure_ascii=True))
   if home.get('href'):
    await c.call('Page.navigate',{'url':home['href']});await asyncio.sleep(14)
    video=await c.js('({url:location.href,ready:!!window.BiliSpace,title:document.title,video:[...document.querySelectorAll("video")].map(v=>({width:v.videoWidth,height:v.videoHeight,paused:v.paused,ready:v.readyState,src:v.currentSrc.slice(0,150)})),btr:document.documentElement.hasAttribute("data-btr-userscript"),quality:!!document.querySelector(".bpx-player-ctrl-quality"),adNodes:[...document.querySelectorAll(".ad-report,.video-page-special-card-small,.video-page-game-card-small,.vcd")].map(e=>({c:e.className,display:getComputedStyle(e).display})),text:document.body.innerText.slice(0,800)})')
    await c.shot('live-video.png');print(json.dumps(video,ensure_ascii=True));(OUT/'live-video.json').write_text(json.dumps(video,ensure_ascii=False,indent=2),encoding='utf8')
    if video['ready'] and video['video']:
     await c.js('BiliSpace.update({srMode:"performance",srScale:2})');await asyncio.sleep(3)
     state=await c.js('BiliSpace.state');print('SR',json.dumps(state,ensure_ascii=True));(OUT/'live-video-sr.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf8');await c.shot('live-sr.png');await c.js('BiliSpace.update({srMode:"off"})')
 finally:
  ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]'),0x10,0,0)
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:p.terminate();p.wait()

asyncio.run(main())
