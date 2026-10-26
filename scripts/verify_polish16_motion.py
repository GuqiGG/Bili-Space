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
   await c.js("BiliSpace.surfaceRevealed();history.replaceState(null,'','/')");await asyncio.sleep(.4)
   report['motion']=await c.js("new Promise(resolve=>{const s=document.querySelector('#bili-space-root').shadowRoot,lights=s.querySelector('.lights'),values=[];history.replaceState(null,'','/video/BV1cjHK6GEJE');let n=0;function sample(){values.push(lights.getBoundingClientRect().left);if(++n<22)requestAnimationFrame(sample);else resolve(values);}sample();})");assert max(report['motion'])-min(report['motion'])>60;assert len(set(round(x,1) for x in report['motion']))>3,report['motion']
   report['alignment']=[]
   for width in [480,800,1280]:
    await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':False});await asyncio.sleep(.35)
    item=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,h=s.querySelector('.video-home-top').getBoundingClientRect(),l=s.querySelector('.lights').getBoundingClientRect();return {width:innerWidth,homeLeft:h.left,homeRight:h.right,lightsLeft:l.left,centerDelta:Math.abs(h.top+h.height/2-l.top-l.height/2)}})()");report['alignment'].append(item);assert item['homeLeft']>=12 and item['homeRight']+7<=item['lightsLeft'] and item['centerDelta']<1,item
   await c.js('BiliSpace.showAccountCard()');await asyncio.sleep(.25);report['popover']=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,c=s.querySelector('#account-card'),b=c.getBoundingClientRect();return {hidden:c.hidden,open:c.dataset.open,left:b.left,right:b.right,viewport:innerWidth}})()");assert not report['popover']['hidden'] and report['popover']['right']<=report['popover']['viewport'] and report['popover']['left']>=0
   await c.shot('polish16-account.png')
   await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]});report['reduced']=await c.js("getComputedStyle(document.querySelector('#bili-space-root').shadowRoot.querySelector('.lights')).transitionDuration");assert report['reduced']=='0s';report['result']='PASS'
   await c.js('BiliSpace.update({fiMode:"off",srMode:"off"});chrome.webview.postMessage({type:"window",action:"close"})')
 finally:
  try:p.wait(timeout=3)
  except: p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/polish16-motion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
