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
   held=[]
   def intercept(params):
    url=params['request']['url'];rid=params['requestId']
    if 'loading17-slow.js' in url:held.append(rid);return None
    import base64
    html='<html><head><script src="https://www.bilibili.com/loading17-slow.js"></script></head><body>delayed fixture</body></html>'
    return {'method':'Fetch.fulfillRequest','params':{'requestId':rid,'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode(html.encode()).decode()}}
   c.intercept=intercept
   await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*loading17.html*'},{'urlPattern':'*loading17-slow.js*'}]})
   await c.call('Page.navigate',{'url':'https://www.bilibili.com/loading17.html'})
   for _ in range(60):
    report['earlyHeader']=await c.js("(()=>{const root=document.querySelector('#bili-space-root'),h=root?.shadowRoot?.querySelector('header');return {state:document.readyState,header:!!h,hit:document.elementFromPoint(24,24)?.id,height:h?.getBoundingClientRect().height};})()")
    if held and report['earlyHeader']['header']:break
    await asyncio.sleep(.1)
   assert report['earlyHeader']['header'] and report['earlyHeader']['state']=='loading' and report['earlyHeader']['hit']=='bili-space-root',report
   for rid in held:await c.call('Fetch.fulfillRequest',{'requestId':rid,'responseCode':200,'body':''})
   await c.call('Fetch.disable');c.intercept=None
   for _ in range(60):
    if await c.js('!!window.BiliSpace'):break
    await asyncio.sleep(.1)
   report['click']=await c.js("(()=>{const a=document.createElement('a');a.href='https://www.bilibili.com/video/BV1cjHK6GEJE';a.target='_blank';a.textContent='video';document.body.append(a);a.click();const el=document.querySelector('#bs-video-loading');return {overlay:!!el,tv:!!el?.querySelector('.bs-tv'),buttons:el?.querySelectorAll('button').length,curve:el?getComputedStyle(el).animationTimingFunction:null};})()");assert report['click']['overlay'] and report['click']['tv'] and report['click']['buttons']==0,report['click']
   for _ in range(120):
    if await c.js("location.pathname.includes('/video/')&&!!window.BiliSpace&&BiliSpace.state.route==='video'"):break
    await asyncio.sleep(.15)
   for _ in range(160):
    if await c.js("!!window.BiliSpace&&!document.querySelector('#bs-video-loading')"):break
    await asyncio.sleep(.15)
   report['loaded']=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,home=s.querySelector('.video-home-top').getBoundingClientRect(),lights=s.querySelector('.lights').getBoundingClientRect();return {href:location.href,ready:document.querySelector('video')?.readyState,events:BiliSpace.state.videoLoadingEvents,remaining:!!document.querySelector('#bs-video-loading'),homeX:home.left,lightsX:lights.left,homeVisible:!s.querySelector('.video-home-top').hidden};})()");assert report['loaded']['homeVisible'] and report['loaded']['homeX']<report['loaded']['lightsX'],report['loaded'];assert all(e.get('videoReady',0)>=2 for e in report['loaded']['events'] if e['event']=='exit'),report['loaded'];assert not report['loaded']['remaining'];assert all(x in [e['event'] for e in report['loaded']['events']] for x in ['enter','exit','removed']),report['loaded'];report['duplicateEvents']=await c.js("(()=>{const b=BiliSpace,v=document.querySelector('video');for(let i=0;i<4;i++){v.dispatchEvent(new Event('loadstart'));v.dispatchEvent(new Event('emptied'));b.setLoading(true);b.setLoading(false);b.beginVideoLoading();}return {overlay:!!document.querySelector('#bs-video-loading'),events:b.state.videoLoadingEvents};})()");assert not report['duplicateEvents']['overlay'];assert len([e for e in report['duplicateEvents']['events'] if e['event']=='enter'])==1,report['duplicateEvents']
   report['playbackStart']=await c.js("(()=>{const v=document.querySelector('video');return {paused:v.paused,time:v.currentTime,ready:v.readyState};})()")
   await asyncio.sleep(1.5)
   report['playbackAfter']=await c.js("(()=>{const v=document.querySelector('video');return {paused:v.paused,time:v.currentTime,ready:v.readyState};})()")
   assert not report['playbackAfter']['paused'] and report['playbackAfter']['time']>report['playbackStart']['time'],report
   await c.js("document.querySelector('video').pause();document.querySelector('video').dispatchEvent(new Event('loadstart'))")
   await asyncio.sleep(.4)
   report['manualPausePreserved']=await c.js("document.querySelector('video').paused&&!document.querySelector('#bs-video-loading')")
   assert report['manualPausePreserved'],report
   report['search']=await c.js("(()=>{BiliSpace.beginNavigation('https://search.bilibili.com/all?keyword=test');const s=document.querySelector('#bili-space-root').shadowRoot;return {videoOverlay:!!document.querySelector('#bs-video-loading'),busy:s.querySelector('.search').getAttribute('aria-busy'),text:s.querySelector('#search-status').textContent,headerHit:document.elementFromPoint(24,24)?.id};})()");assert not report['search']['videoOverlay'] and report['search']['busy']=='true' and '搜索' in report['search']['text'] and report['search']['headerHit']=='bili-space-root',report['search'];report['result']='PASS'
   await c.js('BiliSpace.update({fiMode:"off",srMode:"off"});chrome.webview.postMessage({type:"window",action:"close"})')
 finally:
  try:p.wait(timeout=3)
  except: p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/chrome23-live.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
