import asyncio,json,subprocess,urllib.request
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
R=Path.cwd();report={}
async def main():
 settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();data=json.loads(backup);data['config'].update(srMode='off',fiMode='off',proxy=False,zoom=100,autoZoom=False);settings.write_text(json.dumps(data));p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 try:
  for _ in range(100):
   try:
    ts=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5));t=next(x for x in ts if x.get('type')=='page' and 'bili-space.local' in x.get('url',''));break
   except:await asyncio.sleep(.2)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Emulation.setFocusEmulationEnabled',{'enabled':True})
   for _ in range(100):
    if await c.js('!!window.BiliSpace'):break
    await asyncio.sleep(.2)
   await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
   report['click']=await c.js("(()=>{const a=document.createElement('a');a.href='https://www.bilibili.com/video/BV1cjHK6GEJE';a.target='_blank';a.textContent='video';document.body.append(a);a.click();const el=document.querySelector('#bs-video-loading');return {overlay:!!el,tv:!!el?.querySelector('.bs-tv'),curve:el?getComputedStyle(el).animationTimingFunction:null};})()");assert report['click']['overlay'] and report['click']['tv'],report['click']
   for _ in range(120):
    if await c.js("location.pathname.includes('/video/')&&!!window.BiliSpace&&BiliSpace.state.route==='video'"):break
    await asyncio.sleep(.15)
   for _ in range(160):
    await c.call('Runtime.evaluate',{'expression':"document.querySelector('.bs-load-play:not([hidden])')?.click()",'userGesture':True})
    if await c.js("!!window.BiliSpace&&!document.querySelector('#bs-video-loading')"):break
    await asyncio.sleep(.15)
   report['loaded']=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,home=s.querySelector('.video-home-top').getBoundingClientRect(),lights=s.querySelector('.lights').getBoundingClientRect();return {href:location.href,ready:document.querySelector('video')?.readyState,events:BiliSpace.state.videoLoadingEvents,remaining:!!document.querySelector('#bs-video-loading'),homeX:home.left,lightsX:lights.left,homeVisible:!s.querySelector('.video-home-top').hidden};})()");assert report['loaded']['homeVisible'] and report['loaded']['homeX']<report['loaded']['lightsX'],report['loaded'];assert report['loaded']['ready']>=2,report['loaded'];assert not report['loaded']['remaining'];assert all(x in [e['event'] for e in report['loaded']['events']] for x in ['enter','exit','removed']),report['loaded'];report['result']='PASS'
   await c.js('BiliSpace.update({fiMode:"off",srMode:"off"});chrome.webview.postMessage({type:"window",action:"close"})')
 finally:
  try:p.wait(timeout=3)
  except: p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/polish16-loading.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
