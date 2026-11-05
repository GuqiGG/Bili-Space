import asyncio,json,subprocess,urllib.request,base64
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import CDP,ROOT
async def main():
 si=subprocess.STARTUPINFO();si.dwFlags|=subprocess.STARTF_USESHOWWINDOW;si.wShowWindow=0
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist',startupinfo=si)
 try:
  targets=[]
  for _ in range(100):
   try:targets=[t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if t.get('type')=='page' and 'bili-space.local' in t.get('url','')]
   except:pass
   if targets:break
   await asyncio.sleep(.2)
  async with connect(targets[0]['webSocketDebuggerUrl'],max_size=20*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable');await asyncio.sleep(2)
   print(await c.js('({width:innerWidth,height:innerHeight,ready:!!window.BiliSpace})'))
   await c.js("history.replaceState({},'', '/');BiliSpace.syncRoute();BiliSpace.update({trafficLights:false,logoAutoHide:true})")
   for width in [1500,900,620]:
    await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':False});await asyncio.sleep(.4)
    print(await c.js("(()=>{let s=document.querySelector('#bili-space-root').shadowRoot;return [...s.querySelectorAll('.history-back,.window-actions,.upload,.search,.brand-label')].map(e=>{let r=e.getBoundingClientRect();return {class:e.className,x:r.x,y:r.y,w:r.width,h:r.height,hidden:e.hidden}})})()"))
    await c.shot('ui-repair-'+str(width)+'.png')
   await c.js('BiliSpace.openSettings()');await c.shot('ui-repair-settings.png')
 finally:
  p.terminate();p.wait()
asyncio.run(main())
