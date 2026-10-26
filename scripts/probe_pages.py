import asyncio,ctypes,json,subprocess,sys,urllib.request
from websockets.asyncio.client import connect
from smoke import ROOT,OUT,CDP

async def main():
 label=sys.argv[1] if len(sys.argv)>1 else 'baseline'
 startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],startupinfo=startup)
 records={}
 try:
  targets=[]
  for _ in range(80):
   try:
    targets=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));targets=[t for t in targets if t.get('type')=='page' and 'bili-space.local' in t.get('url','')]
    if targets:break
   except Exception:pass
   await asyncio.sleep(.25)
  async with connect(targets[0]['webSocketDebuggerUrl'],max_size=20000000) as ws:
   c=CDP(ws);await c.call('Runtime.enable')
   urls=[('home','https://www.bilibili.com/'),('history','https://www.bilibili.com/account/history'),('dynamic','https://t.bilibili.com/'),('search','https://search.bilibili.com/all?keyword=%E8%8B%8F%E4%B8%B9')]
   for name,url in urls:
    await c.call('Page.navigate',{'url':url});await asyncio.sleep(8)
    records[name]=await c.js('''(()=>{
      const sample=e=>({tag:e.tagName,id:e.id,class:e.className,top:Math.round(e.getBoundingClientRect().top),height:Math.round(e.getBoundingClientRect().height),bg:getComputedStyle(e).backgroundColor,shadow:getComputedStyle(e).boxShadow,margin:getComputedStyle(e).margin,padding:getComputedStyle(e).padding});
      const elements=[...document.querySelectorAll('main,#app,#i_cecream,.bili-layout,.bili-feed4-layout,.recommended-container_floor-aside,.recommended-container_floor-aside>.container,.feed2,.feed-list,.history-page,.history-container,.bili-dyn-home--member,.bili-dyn-home--unlogin,.search-page,.search-header,.search-header-wrapper,.search-input,.search-content,.search-all-list,.search-panel,.channel-container,.video-container-v1,#bilibili-player,.bpx-player-sending-bar,.bpx-player-dm-wrap,.bpx-player-dm-input')];
      return {url:location.href,title:document.title,roots:elements.map(sample),children:[...document.body.children].map(e=>({...sample(e),children:[...e.children].slice(0,8).map(sample)})),inputs:[...document.querySelectorAll('input')].map(e=>({c:e.className,ph:e.placeholder})),styles:[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules].filter(r=>/margin-top: (1[0-9][0-9]|[7-9][0-9])px|padding-top: (1[0-9][0-9]|[7-9][0-9])px|grid-template/.test(r.cssText)).slice(0,35).map(r=>r.cssText.slice(0,800))}catch{return []}}).slice(0,60),text:document.body.innerText.slice(0,100)};
    })()''')
    if name=='home':
     href=await c.js('document.querySelector(".bili-video-card a[href*=video]")?.href')
     if href:urls.append(('video',href))
    await c.shot(label+'-live-'+name+'.png')
   (OUT/(label+'-live-pages.json')).write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
 finally:
  # Only stop the disposable test process, never the user's running client.
  if p.poll() is None:p.terminate();p.wait()
 print(json.dumps(records,ensure_ascii=True,indent=2))

asyncio.run(main())
