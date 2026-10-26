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
   await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*download28-fixture*'}]});await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV1234567890?download28-fixture=1'});await wait(c,'!!window.BiliSpace')
   await wait(c,"!document.querySelector('#bs-video-loading')");report['interfaceReady']=await c.js('({ready:document.querySelector("video").readyState,events:BiliSpace.state.videoLoadingEvents})');assert report['interfaceReady']['ready']==0
   await c.js("BiliSpace.beginNavigation('https://www.bilibili.com/');history.pushState({},'','/')");assert await c.js("!document.querySelector('#bs-home-transition')")
   await c.shot('download28-no-home-wipe.png')
   report['official']=await c.js("(async()=>{try{const v=await fetch('https://api.bilibili.com/x/web-interface/view?bvid=BV17an46ZEEc',{credentials:'include'}).then(r=>r.json());if(v.code!==0)return {viewCode:v.code};const r=await fetch('https://api.bilibili.com/x/player/playurl?'+new URLSearchParams({bvid:'BV17an46ZEEc',cid:v.data.cid,qn:64,fnval:1,platform:'html5',high_quality:1}),{credentials:'include'}).then(r=>r.json());return {code:r.code,format:r.data?.format,durl:r.data?.durl?.map(x=>({url:x.url,size:x.size})),message:r.message};}catch(e){return {error:String(e)}}})()")
   if report['official'].get('durl'):(R/'verification/download28-media-url.txt').write_text(report['official']['durl'][0]['url'],encoding='utf8')
   report['pass']=True
   await c.call('Fetch.disable')
 finally:
  p.terminate();p.wait(timeout=10);settings.write_bytes(backup);(R/'verification/download28-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
asyncio.run(main());print(json.dumps(report,ensure_ascii=False,indent=2))
