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
   html='<html><head><style>body{margin:0}.bpx-player-container{position:relative}.bpx-player-video-wrap{height:220px}video{width:100%;height:100%}.bpx-player-sending-bar{height:32px}.video-toolbar-container{padding:16px}.video-toolbar-container:before{content:"";position:absolute;inset:0;background:linear-gradient(black,black);box-shadow:0 -8px 16px white;z-index:-1}.video-toolbar-left{background:black}.playinfo-item svg{width:14px;height:14px;margin-right:12px}.playinfo-item span{margin-left:12px}.playinfo-item{padding:8px;justify-content:space-between}</style></head><body><div class="video-container-v1"><div class="left-container"><h1 class="video-title">回归测试</h1><div id="bilibili-player"><div class="bpx-player-container" data-screen="normal"><div class="bpx-player-video-wrap"><video muted playsinline></video></div><div class="bpx-player-sending-bar">弹幕栏</div></div></div><div class="video-toolbar-container" style="--bg1:#000;background:linear-gradient(black,black);box-shadow:0 -8px 16px white"><div class="video-toolbar-left"><span style="color:#fb7299">♥ 点赞</span></div></div><div class="basic-desc-info">店铺请访问yuanshen.top，亚托莉.shop是我们的网址😀</div></div><div class="right-container"><div class="video-page-card-small"><div class="playinfo" style="justify-content:space-between"><div class="playinfo-item"><svg></svg><span>1030.8万</span></div><div class="playinfo-item"><svg></svg><span>5.5万</span></div></div></div></div></div></body></html>'
   c.intercept=lambda m:{'method':'Fetch.fulfillRequest','params':{'requestId':m['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode(html.encode()).decode()}}
   await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*polish32-fixture*'}]});await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV1234567890?polish32-fixture=1'});await wait(c,'!!window.BiliSpace')
   await wait(c,"!document.querySelector('#bs-video-loading')");report['interfaceReady']=await c.js('({ready:document.querySelector("video").readyState,events:BiliSpace.state.videoLoadingEvents})');assert report['interfaceReady']['ready']==0
   report['categories']=[]
   for route in ['/','/video/BV1234567890']:
    for traffic in [True,False]:
     for width in [480,800,1050,1280,1920]:
      await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':False});await c.js('history.replaceState({},"",'+json.dumps(route)+');BiliSpace.update({trafficLights:'+str(traffic).lower()+',headerBack:true,categorySelection:[0,1,2,3,4,13,14,16]})')
      await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,b=s.querySelector('.back');if(b.getAttribute('aria-expanded')!=='true')b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}))})()");await asyncio.sleep(.27)
      row=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,p=s.querySelector('#header-categories'),a=[...p.querySelectorAll('a')].find(a=>!a.hidden),r=a.getBoundingClientRect(),q=p.getBoundingClientRect(),hit=s.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {panelWidth:q.width,panelX:q.x,panelRight:q.right,firstX:r.x,firstRight:r.right,firstY:r.y,firstBottom:r.bottom,hit:!!hit?.closest('#header-categories')}})()")
      assert row['panelWidth']>=72 and row['firstX']>=0 and row['firstRight']<=width and row['firstBottom']<=900 and row['hit'],row
      report['categories'].append({'route':route,'traffic':traffic,'width':width,**row});await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('.back').click()")
   await c.call('Emulation.setDeviceMetricsOverride',{'width':1280,'height':900,'deviceScaleFactor':1,'mobile':False});await c.js("history.replaceState({},'','/video/BV1234567890')")
   report['themes']=[]
   for theme in ['light','dark','light']:
    await c.js('BiliSpace.update({theme:'+json.dumps(theme)+'})');row=await c.js("(()=>{const e=document.querySelector('.video-toolbar-container'),s=getComputedStyle(e),p=getComputedStyle(e,'::before');return {background:s.backgroundColor,image:s.backgroundImage,shadow:s.boxShadow,pseudoImage:p.backgroundImage,pseudoShadow:p.boxShadow,liked:getComputedStyle(e.querySelector('span')).color}})()")
    assert row['background']==('rgb(250, 250, 250)' if theme=='light' else 'rgb(22, 22, 24)') and row['image']=='none' and row['pseudoImage']=='none' and row['shadow']=='none' and row['pseudoShadow']=='none',row
    report['themes'].append({'theme':theme,**row})
   report['metrics']=await c.js("(()=>{const els=[...document.querySelectorAll('.playinfo-item')],rect=e=>e.getBoundingClientRect();return els.map((e,i)=>{const span=e.querySelector('span'),r=document.createRange();r.selectNodeContents(span);return {iconGap:rect(span).left-rect(e.querySelector('svg')).right,lines:r.getClientRects().length,groupGap:i?rect(e).left-rect(els[i-1]).right:null};});})()")
   assert all(abs(x['iconGap']-4)<.2 and x['lines']==1 for x in report['metrics']),report['metrics'];assert abs(report['metrics'][1]['groupGap']-8)<.2,report['metrics']
   report['bareLinks']=await c.js("[...document.querySelectorAll('.basic-desc-info a')].map(a=>({text:a.textContent,href:a.href}))");assert [x['text'] for x in report['bareLinks']]==['yuanshen.top','亚托莉.shop']
   report['resume']=await c.js("(async()=>{const v=document.querySelector('video');let time=0;window.plays=[];Object.defineProperty(v,'currentTime',{configurable:true,get:()=>time,set:x=>time=x});v.play=()=>{plays.push(time);return Promise.resolve()};v.dispatchEvent(new Event('loadedmetadata'));await new Promise(r=>setTimeout(r,100));const before=plays.length;v.currentTime=87.5;await v.play();v.dispatchEvent(new Event('playing'));v.dispatchEvent(new Event('timeupdate'));return {clientEarlyPlays:before,currentTime:v.currentTime,plays}})()");assert report['resume']['clientEarlyPlays']==0 and report['resume']['plays']==[87.5]
   await c.shot('polish32-light-toolbar.png')
   report['pass']=True
   await c.call('Fetch.disable')
 finally:
  p.terminate();p.wait(timeout=10);settings.write_bytes(backup);(R/'verification/polish32-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
asyncio.run(main());print(json.dumps(report,ensure_ascii=False,indent=2))
