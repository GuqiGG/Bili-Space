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
   await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV1cjHK6GEJE'})
   for _ in range(60):
    if await c.js('!!document.querySelector(".video-container-v1,.video-container-v2")'):break
    await asyncio.sleep(.3)
   assert await c.js('!!document.querySelector(".video-container-v1,.video-container-v2")'),'Live Bilibili layout unavailable'
   for _ in range(100):
    if await c.js("!!document.querySelector('.bpx-player-ctrl-volume')"):break
    await asyncio.sleep(.15)
   report['controls']=await c.js("[...document.querySelectorAll('.bpx-player-control-bottom-right > *')].map(e=>({class:e.className,title:e.getAttribute('data-text')||e.title,html:e.outerHTML.slice(0,1200)}))")
   report['volume']=await c.js("document.querySelector('.bpx-player-ctrl-volume')?.outerHTML")
   report['result']='PASS'
   await c.js('BiliSpace.update({fiMode:"off",srMode:"off"});chrome.webview.postMessage({type:"window",action:"close"})')
 finally:
  try:p.wait(timeout=3)
  except: p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/profile21-controls.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
