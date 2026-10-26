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
   report['library']=await c.js('Object.keys(window["anime4k-webgpu"]||{})');assert 'CNNx2M' in report['library']
   await c.js('document.querySelector("video").play();BiliSpace.update({srMode:"performance",srScale:2,srFps:60})')
   await asyncio.sleep(6);report['sr']=await c.js('BiliSpace.state');assert report['sr']['frames']>2,report['sr']
   await c.js('BiliSpace.update({fiMode:"rife",fiFlowScale:25})');await asyncio.sleep(8);report['combined']=await c.js('BiliSpace.state');assert report['combined']['interpolation']['inferences']>2,report['combined']
   await c.js('BiliSpace.update({srMode:"off"})');await asyncio.sleep(3);report['fi']=await c.js('BiliSpace.state');assert report['fi']['interpolation']['generated']>2
   report['flickerProbe']=await c.js("new Promise(resolve=>{const canvas=document.querySelector('.bs-fi-canvas'),gl=canvas.getContext('webgl'),pixel=new Uint8Array(4),rows=[];let n=0;function sample(){gl.readPixels(10,10,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);rows.push([...pixel]);if(++n<90)requestAnimationFrame(sample);else resolve({samples:rows.length,blackFrames:rows.filter(p=>p[0]+p[1]+p[2]<5).length,alphaMin:Math.min(...rows.map(p=>p[3]))});}sample();})");assert report['flickerProbe']['blackFrames']==0,report['flickerProbe']
   report['alignment']=await c.js("(()=>{const q=document.querySelector('.bpx-player-ctrl-quality');q.style.height='48px';q.style.fontSize='20px';document.querySelector('.bs-sr-toggle').click();return 1})()");await asyncio.sleep(.4)
   report['alignment']=await c.js("(()=>{const q=document.querySelector('.bpx-player-ctrl-quality').getBoundingClientRect();return [...document.querySelectorAll('.bs-player-tool')].map(e=>{const b=e.getBoundingClientRect();return {kind:e.dataset.kind,deltaY:b.top-q.top,height:b.height,qualityHeight:q.height,font:getComputedStyle(e.querySelector('button')).fontSize}})})()");assert all(abs(x['deltaY'])<1 for x in report['alignment']),report['alignment']
   await c.shot('anime4k-player-proof.png')
   report['errors']=[x for x in c.events if x.get('method')=='Runtime.exceptionThrown'];assert not report['errors'],report['errors'];report['result']='PASS'
   await c.js('BiliSpace.update({fiMode:"off",srMode:"off"});chrome.webview.postMessage({type:"window",action:"close"})')
 finally:
  try:p.wait(timeout=3)
  except: p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/anime4k-gpu.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
