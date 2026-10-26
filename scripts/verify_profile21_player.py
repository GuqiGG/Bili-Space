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
   await c.js("BiliSpace.finishVideoLoading();document.querySelector('video').play().catch(()=>{})")
   await asyncio.sleep(.5)
   r=await c.js("(()=>{const h=document.querySelector('.bpx-player-ctrl-volume').getBoundingClientRect();return {x:h.x+h.width/2,y:h.y+h.height/2};})()")
   await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved',**r});await asyncio.sleep(.5)
   track=await c.js("(()=>{const t=document.querySelector('.bpx-player-ctrl-volume .bui-track').getBoundingClientRect();return {x:t.x+t.width/2,y:t.y,width:t.width,height:t.height};})()")
   assert track['height']>0,track
   await c.call('Input.dispatchMouseEvent',{'type':'mousePressed','x':track['x'],'y':track['y'],'button':'left','buttons':1,'clickCount':1})
   await c.call('Input.dispatchMouseEvent',{'type':'mouseReleased','x':track['x'],'y':track['y'],'button':'left','buttons':0,'clickCount':1})
   await asyncio.sleep(.4)
   report['volume']=await c.js("({mediaVolume:document.querySelector('video').volume,ui:document.querySelector('.bpx-player-ctrl-volume-number').textContent,state:BiliSpace.state.audioState,max:document.querySelector('.bpx-player-ctrl-volume .bui-track').getAttribute('aria-valuemax')})")
   assert report['volume']['mediaVolume']==1 and report['volume']['ui']=='200' and report['volume']['state']=='gain-200',report['volume']
   await c.shot('profile21-volume200.png')
   await c.js("document.querySelector('.bpx-player-ctrl-pip').click()")
   await asyncio.sleep(.4)
   report['pip']=await c.js("({pip:BiliSpace.state.pip,hidden:document.querySelector('#bili-space-root').style.display,screen:[innerWidth,innerHeight]})")
   assert report['pip']['pip'] and report['pip']['hidden']=='none',report['pip']
   await c.js("BiliSpace.requestPip()")
   await asyncio.sleep(.3)
   await c.js("chrome.webview.postMessage({type:'window',action:'fullscreen'})")
   await asyncio.sleep(.3)
   await c.js("BiliSpace.requestPip()")
   await asyncio.sleep(.3)
   report['pipFromFull']=await c.js("({pip:BiliSpace.state.pip,full:BiliSpace.state.full})")
   assert report['pipFromFull']['pip'] and not report['pipFromFull']['full'],report['pipFromFull']
   await c.js("BiliSpace.requestPip()")
   report['result']='PASS'
   await c.js('BiliSpace.update({fiMode:"off",srMode:"off"});chrome.webview.postMessage({type:"window",action:"close"})')
 finally:
  try:p.wait(timeout=3)
  except: p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/profile21-player-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
