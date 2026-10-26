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
   await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*dash29-fixture*'}]});await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV1234567890?dash29-fixture=1'});await wait(c,'!!window.BiliSpace')
   await wait(c,"!document.querySelector('#bs-video-loading')");report['interfaceReady']=await c.js('({ready:document.querySelector("video").readyState,events:BiliSpace.state.videoLoadingEvents})');assert report['interfaceReady']['ready']==0
   await c.js("BiliSpace.beginNavigation('https://www.bilibili.com/');history.pushState({},'','/')");assert await c.js("!document.querySelector('#bs-home-transition')")
   await c.shot('dash29-no-home-wipe.png')
   report['toolbar']=[]
   await c.js("history.replaceState({},'','/video/BV1234567890');const toolbar=document.createElement('div');toolbar.className='video-toolbar-container';toolbar.style.cssText='background:black;padding:24px';toolbar.innerHTML='<div class=video-toolbar-left><span class=liked style=\"color:rgb(251,114,153)\">♥ 赞</span></div>';document.body.append(toolbar)")
   for theme in ['light','dark','light']:
    await c.js('BiliSpace.update({theme:'+json.dumps(theme)+'})');await asyncio.sleep(.1)
    row=await c.js("(()=>{const t=document.querySelector('.video-toolbar-container');return {background:getComputedStyle(t).backgroundColor,liked:getComputedStyle(t.querySelector('.liked')).color}})()")
    assert row['background']==('rgb(250, 250, 250)' if theme=='light' else 'rgb(22, 22, 24)'),row;assert row['liked']=='rgb(251, 114, 153)';report['toolbar'].append({'theme':theme,**row})
   await c.shot('dash29-light-toolbar.png')
   report['recorder']=await c.js("({types:['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4'].filter(x=>MediaRecorder.isTypeSupported(x))})")
   media=await c.js("(async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const x=canvas.getContext('2d'),timer=setInterval(()=>{x.fillStyle='hsl('+(performance.now()%360)+',50%,40%)';x.fillRect(0,0,320,180)},50),ctx=new AudioContext();await ctx.resume();const osc=ctx.createOscillator(),dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();const stream=canvas.captureStream(20);stream.addTrack(dest.stream.getAudioTracks()[0]);const type=['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4'].find(x=>MediaRecorder.isTypeSupported(x)),rec=new MediaRecorder(stream,{mimeType:type}),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(r=>rec.onstop=r);rec.start();await new Promise(r=>setTimeout(r,1200));rec.stop();await stopped;clearInterval(timer);osc.stop();stream.getTracks().forEach(t=>t.stop());await ctx.close();const blob=new Blob(chunks,{type:'video/mp4'});return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob)})})()")
   (R/'verification/dash29-fixture.mp4').write_bytes(base64.b64decode(media));report['fixtureBytes']=len(base64.b64decode(media))
   report['pass']=True
   await c.call('Fetch.disable')
 finally:
  p.terminate();p.wait(timeout=10);settings.write_bytes(backup);(R/'verification/dash29-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
asyncio.run(main());print(json.dumps(report,ensure_ascii=False,indent=2))
