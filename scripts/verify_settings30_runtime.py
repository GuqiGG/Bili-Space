import asyncio,json,subprocess,urllib.request,base64
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
R=Path.cwd();report={}
async def wait(c,expr):
 for _ in range(100):
  if await c.js(expr):return
  await asyncio.sleep(.03)
 raise AssertionError(expr)
async def main():
 settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();d=json.loads(backup);d['config'].update(proxy=False,btr=False,srMode='off',fiMode='off',clipboardAutoOpen=False,autoZoom=False,zoom=100);settings.write_text(json.dumps(d));p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 try:
  for _ in range(100):
   try:t=next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5)) if x.get('type')=='page');break
   except:await asyncio.sleep(.15)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
   html='<html><head><style>body{margin:0;background:#161618;color:white}.bpx-player-container{position:relative;width:640px;height:360px}.bpx-player-video-wrap{height:100%}video{width:100%;height:100%}</style></head><body><div class="bpx-player-container"><div class="bpx-player-video-wrap"><video muted playsinline></video></div></div><h1>首页 / 本地转场验证</h1></body></html>'
   c.intercept=lambda m:{'method':'Fetch.fulfillRequest','params':{'requestId':m['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode(html.encode()).decode()}}
   await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*settings30-fixture*'}]});await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV1234567890?settings30-fixture=1'});await wait(c,'!!window.BiliSpace')
   await wait(c,"!document.querySelector('#bs-video-loading')");report['interfaceReady']=await c.js('({ready:document.querySelector("video").readyState,events:BiliSpace.state.videoLoadingEvents})');assert report['interfaceReady']['ready']==0
   await c.js("BiliSpace.beginNavigation('https://www.bilibili.com/');history.pushState({},'','/')");assert await c.js("!document.querySelector('#bs-home-transition')")
   await c.shot('settings30-no-home-wipe.png')
   await c.js("BiliSpace.update({videoLoadingMode:'video',trafficLights:false});history.pushState({},'','/video/BV1234567890?p=2');")
   await asyncio.sleep(.35);report['waitingForVideo']=await c.js("({overlay:!!document.querySelector('#bs-video-loading'),ready:document.querySelector('video').readyState,text:document.querySelector('#bs-video-loading p')?.textContent})");assert report['waitingForVideo']['overlay'] and report['waitingForVideo']['ready']==0
   await c.js("window.cv=document.createElement('canvas');cv.width=320;cv.height=180;cv.getContext('2d').fillRect(0,0,320,180);const v=document.querySelector('video');v.srcObject=cv.captureStream(30);v.play();window.paint=setInterval(()=>cv.getContext('2d').fillRect(0,0,320,180),30)")
   await wait(c,"!document.querySelector('#bs-video-loading')");report['decoded']=await c.js("({ready:document.querySelector('video').readyState,events:BiliSpace.state.videoLoadingEvents})");assert report['decoded']['ready']>=2
   await c.js("BiliSpace.openSettings();const s=document.querySelector('#bili-space-root').shadowRoot;const select=s.querySelector('#pref-videoLoadingMode');select.value='page';select.dispatchEvent(new Event('input',{bubbles:true}));")
   await asyncio.sleep(.15);report['storedMode']=json.loads(settings.read_text())['config']['videoLoadingMode'];assert report['storedMode']=='page'
   await c.js("BiliSpace.closeSettings();{const player=document.querySelector('video');clearInterval(paint);player.srcObject.getTracks().forEach(t=>t.stop());player.srcObject=null;player.load();history.pushState({},'','/video/BV1234567890?p=3')}")
   await wait(c,"!document.querySelector('#bs-video-loading')");report['pageMode']=await c.js("({ready:document.querySelector('video').readyState,overlay:!!document.querySelector('#bs-video-loading')})");assert report['pageMode']['ready']==0
   await asyncio.sleep(.3)
   report['arrow']=await c.js("(async()=>{const s=document.querySelector('#bili-space-root').shadowRoot,b=s.querySelector('.back'),svg=b.querySelector('svg'),rows=[{stage:'closed',transform:getComputedStyle(svg).transform}];b.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true,detail:1}));await new Promise(r=>setTimeout(r,60));rows.push({stage:'moving',transform:getComputedStyle(svg).transform});await new Promise(r=>setTimeout(r,200));rows.push({stage:'open',transform:getComputedStyle(svg).transform,expanded:b.getAttribute('aria-expanded'),parent:getComputedStyle(b).transform});b.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true,detail:1}));await new Promise(r=>setTimeout(r,220));rows.push({stage:'closedAgain',transform:getComputedStyle(svg).transform});return rows})()")
   assert report['arrow'][0]['transform']!=report['arrow'][1]['transform']!=report['arrow'][2]['transform'],report['arrow'];assert report['arrow'][2]['expanded']=='true' and report['arrow'][0]['transform']==report['arrow'][3]['transform']
   await c.shot('settings30-arrow.png')
   report['pass']=True
   await c.call('Fetch.disable')
 finally:
  p.terminate();p.wait(timeout=10);settings.write_bytes(backup);(R/'verification/settings30-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
asyncio.run(main());print(json.dumps(report,ensure_ascii=False,indent=2))
