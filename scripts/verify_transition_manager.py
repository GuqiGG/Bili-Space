"""Exercise all recipes through real WebView2 document navigations and capture paint evidence."""
import asyncio,json,subprocess,urllib.request,base64
from websockets.asyncio.client import connect
from verify_login50_runtime import Session
from smoke import ROOT
async def main():
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist');report=[]
 try:
  for _ in range(100):
   try:t=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if t.get('type')=='page');break
   except (OSError,StopIteration):await asyncio.sleep(.2)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=Session(ws)
   async def until(code):
    for _ in range(200):
     try:
      if await c.js(code):return
     except RuntimeError:pass
     await asyncio.sleep(.05)
    print(await c.js("({stats:window.TransitionManager?.test.stats,state:window.TransitionManager?.test.state,native:window.__transitionNative,ready:document.readyState,fonts:document.fonts.status,images:[...document.images].filter(x=>!x.complete&&!x.closest('#bs-transition')).map(x=>x.src)})"));print((ROOT/'dist/.appdata/runtime.log').read_text(encoding='utf-8')[-2400:]);raise AssertionError(code)
   await until('!!window.TransitionManager&&!!window.BiliSpace')
   await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
   await c.call('Emulation.setDeviceMetricsOverride',{'width':1280,'height':800,'deviceScaleFactor':1,'mobile':False})
   await c.js("chrome.webview.postMessage({type:'window',action:'test-restore'});TransitionManager.ready()")
   await asyncio.sleep(.5)
   await c.js("chrome.webview.postMessage({type:'transition',action:'inspect'})")
   await until("(chrome.webview.postMessage({type:'transition',action:'inspect'}),window.__transitionNative?.cached&&__transitionNative.bitmap)")
   supported=await c.js("Array.from({length:12},(_,i)=>TransitionManager.test.frames(i,i===0||i===11?'cover':'new').every(f=>!f.clipPath||CSS.supports('clip-path',f.clipPath)))")
   assert all(supported),supported
   await c.call('Page.addScriptToEvaluateOnNewDocument',{'source':"window.__rafGaps=[];let last=0;function frame(t){if(window.TransitionManager?.test?.state?.phase==='animating'&&last)__rafGaps.push(t-last);last=t;requestAnimationFrame(frame)}requestAnimationFrame(frame);document.addEventListener('DOMContentLoaded',()=>{const h=document.querySelector('h1');if(h)h.textContent='Page '+location.search})"})
   for i in range(12):
    await c.js("chrome.webview.postMessage({type:'transition',action:'force',index:"+str(i)+"})")
    await c.call('Page.navigate',{'url':'https://bili-space.local/fixture.html?transition='+str(i)})
    await until("!!window.TransitionManager?.test.stats.some(x=>x.event==='present')")
    await asyncio.sleep(.08)
    await c.shot('transition-'+str(i+1).zfill(2)+'-motion.png')
    await until("!!window.TransitionManager?.test.stats.some(x=>x.event==='done')&&!document.querySelector('#bs-transition')")
    data=await c.js("({stats:TransitionManager.test.stats,gaps:TransitionManager.test.stats.find(x=>x.event==='frames')?.gaps||[],scrollY,hosts:document.querySelectorAll('#bs-transition').length})")
    assert len([x for x in data['stats'] if x['event']=='accept'])==1,data
    assert data['stats'][0]['index']==i,data
    data['recipe']=i+1;report.append(data);await asyncio.sleep(.25)
   await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]})
   await c.js('TransitionManager.cancel()');await asyncio.sleep(.2)
   await c.call('Page.navigate',{'url':'https://bili-space.local/fixture.html?reduced=1'})
   await until('!!window.TransitionManager&&!!window.BiliSpace');await asyncio.sleep(.5)
   assert not await c.js("!!document.querySelector('#bs-transition')")
   (ROOT/'verification/transition-manager-runtime.json').write_text(json.dumps({'recipes':report,'reducedMotion':True,'supported':supported},indent=2),encoding='utf-8')
   print(json.dumps({'recipes':len(report),'allMasksSupported':all(supported),'noResidualOverlay':True,'reducedMotion':True,'stats':[{'recipe':r['recipe'],'samples':len(r.get('gaps',[])),'maxFrameMs':max(r.get('gaps',[]),default=0)} for r in report]},indent=2))
 finally:p.terminate();p.wait()
if __name__=='__main__':asyncio.run(main())
