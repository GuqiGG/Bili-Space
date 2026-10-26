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
   await c.call('Runtime.evaluate',{'expression':'BiliSpace.update({volumeBoost:200})','userGesture':True,'awaitPromise':True});await asyncio.sleep(.5)
   report['volume']=await c.js('({requested:BiliSpace.state.audioBoost,state:BiliSpace.state.audioState})');assert report['volume']['state']=='gain-200',report['volume']
   report['gainProof']=await c.js("(async()=>{const c=new OfflineAudioContext(1,256,48000),s=c.createConstantSource(),g=c.createGain();s.offset.value=.1;g.gain.value=2;s.connect(g);g.connect(c.destination);s.start();const b=await c.startRendering();return b.getChannelData(0)[100];})()");assert abs(report['gainProof']-.2)<1e-5
   await c.js("BiliSpace.update({volumeBoost:100});history.replaceState(null,'','/video/BV1cjHK6GEJE');document.documentElement.dataset.bsPage='video';const box=document.createElement('div');box.id='mini-fixture';box.innerHTML='<div class=\"bpx-player-container bpx-state-mini\" style=\"position:fixed;width:1800px;height:260px;min-width:800px;left:0;bottom:0;background:black\"><div class=bpx-player-video-area>preview</div></div>';document.body.append(box)")
   report['mini']=[]
   for width in [640,1280,1920,2560]:
    await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':1000,'deviceScaleFactor':1,'mobile':False});await asyncio.sleep(.2)
    box=await c.js("(()=>{document.documentElement.dataset.bsPage='video';const b=document.querySelector('#mini-fixture>.bpx-player-container').getBoundingClientRect();return {width:innerWidth,miniWidth:b.width,miniHeight:b.height,left:b.left,right:b.right}})()");report['mini'].append(box);assert box['miniWidth']<=360.5 and abs(box['miniWidth']/box['miniHeight']-16/9)<.02 and box['left']>=0,box
   await c.js("document.querySelector('#mini-fixture').remove()")
   await c.call('Page.addScriptToEvaluateOnNewDocument',{'source':"window.__surfaceSamples=[];const check=()=>{if(document.documentElement)window.__surfaceSamples.push(getComputedStyle(document.documentElement).backgroundColor);if(window.__surfaceSamples.length<12)requestAnimationFrame(check);};requestAnimationFrame(check);"})
   await c.call('Page.navigate',{'url':'https://bili-space.local/fixture.html?surface=1'})
   await asyncio.sleep(1);report['surface']=await c.js('({early:!!document.querySelector("#bs-navigation-surface"),samples:window.__bsSurfaceSamples,bg:getComputedStyle(document.documentElement).backgroundColor})');assert report['surface']['early'];assert all(x!='rgb(255, 255, 255)' for x in report['surface']['samples']),report['surface'];report['result']='PASS'
   await c.js('BiliSpace.update({fiMode:"off",srMode:"off"});chrome.webview.postMessage({type:"window",action:"close"})')
 finally:
  try:p.wait(timeout=3)
  except: p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/audio-surface-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
