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
   await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*motion27-fixture*'}]});await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV1234567890?motion27-fixture=1'});await wait(c,'!!window.BiliSpace')
   await c.js("window.cv=document.createElement('canvas');cv.width=320;cv.height=180;cv.getContext('2d').fillRect(0,0,320,180);const v=document.querySelector('video');v.srcObject=cv.captureStream(30);v.play();window.paint=setInterval(()=>cv.getContext('2d').fillRect(0,0,320,180),30)")
   await wait(c,"!document.querySelector('#bs-video-loading')");report['loader']=await c.js('({time:document.querySelector("video").currentTime,events:BiliSpace.state.videoLoadingEvents})');assert report['loader']['time']<1,report
   await c.js("BiliSpace.beginNavigation('https://www.bilibili.com/');history.pushState({},'','/');const a=document.querySelector('#bs-home-transition').getAnimations()[0];a.pause();a.currentTime=140;")
   report['wipe']=await c.js("(()=>{const e=document.querySelector('#bs-home-transition'),s=getComputedStyle(e);return {transform:s.transform,pointer:s.pointerEvents,svgWidth:e.querySelector('svg').getBoundingClientRect().width,header:document.querySelector('#bili-space-root').getBoundingClientRect().top,marker:sessionStorage.getItem('bs-home-transition')}})()");assert report['wipe']['pointer']=='none' and report['wipe']['svgWidth']>=180 and report['wipe']['marker'] is None
   await c.shot('motion27-home-mid.png');await c.js("document.querySelector('#bs-home-transition').getAnimations()[0].finish()");await wait(c,"!document.querySelector('#bs-home-transition')");await c.shot('motion27-home-after.png');report['pass']=True
   await c.call('Fetch.disable')
 finally:
  p.terminate();p.wait(timeout=10);settings.write_bytes(backup);(R/'verification/motion27-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
asyncio.run(main());print(json.dumps(report,ensure_ascii=False,indent=2))
