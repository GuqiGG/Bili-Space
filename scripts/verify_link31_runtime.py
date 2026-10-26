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
   html='<html><head><style>body{margin:0;background:#161618;color:white}.bpx-player-container{position:relative;width:640px;height:360px}.bpx-player-video-wrap{height:100%}video{width:100%;height:100%}</style></head><body><div class="left-container"><div class="bpx-player-container"><div class="bpx-player-video-wrap"><video muted playsinline></video></div></div></div><h1>首页 / 本地转场验证</h1></body></html>'
   c.intercept=lambda m:{'method':'Fetch.fulfillRequest','params':{'requestId':m['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode(html.encode()).decode()}}
   await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*link31-fixture*'}]});await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV1234567890?link31-fixture=1'});await wait(c,'!!window.BiliSpace')
   await wait(c,"!document.querySelector('#bs-video-loading')");report['interfaceReady']=await c.js('({ready:document.querySelector("video").readyState,events:BiliSpace.state.videoLoadingEvents})');assert report['interfaceReady']['ready']==0
   await c.js("BiliSpace.beginNavigation('https://www.bilibili.com/');history.pushState({},'','/')");assert await c.js("!document.querySelector('#bs-home-transition')")
   await c.shot('link31-no-home-wipe.png')
   await c.js("history.replaceState({},'','/video/BV1234567890?p=2&spm_id_from=fixture')")
   report['layouts']=[]
   for theme in ['dark','light']:
    for traffic in [True,False]:
     for width in [480,800,1050,1280,1920]:
      await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':False});await c.js('BiliSpace.update({theme:'+json.dumps(theme)+',trafficLights:'+str(traffic).lower()+'})');await asyncio.sleep(.3)
      row=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,b=s.querySelector('.video-link'),brand=s.querySelector('.brand'),nav=s.querySelector('.primary-nav'),search=s.querySelector('.search'),r=e=>{const x=e.getBoundingClientRect();return {x:x.x,right:x.right,y:x.y,bottom:x.bottom,width:x.width}},bs=getComputedStyle(b);return {button:r(b),brand:r(brand),nav:r(nav),search:r(search),hidden:b.hidden,url:b.dataset.url,border:bs.borderTopStyle,color:bs.borderTopColor}})()")
      row.update(theme=theme,traffic=traffic,width=width);report['layouts'].append(row)
      assert not row['hidden'] and row['button']['width']>=30 and row['button']['x']>=0 and row['button']['right']<=width,row
      assert row['border']=='solid' and row['url']=='https://www.bilibili.com/video/BV1234567890?p=2',row
      if width>800:assert row['button']['right']<=row['brand']['x'],row
      if width==1280:await c.shot('link31-'+theme+'-'+str(traffic)+'.png')
   await c.call('Emulation.setDeviceMetricsOverride',{'width':1280,'height':900,'deviceScaleFactor':1,'mobile':False})
   await c.js("BiliSpace.update({theme:'dark'});const b=document.querySelector('#bili-space-video-download');window.originalFetch=window.fetch;window.fetch=()=>new Promise(()=>{});b.click();BiliSpace.downloadStarted();BiliSpace.downloadProgress({percent:42,bytesPerSecond:2097152,etaSeconds:18});")
   report['progressUi']=await c.js("(()=>{const b=document.querySelector('#bili-space-video-download'),p=document.querySelector('#bili-space-download-progress'),r=p.getBoundingClientRect();return {text:p.textContent,left:r.left,buttonRight:b.getBoundingClientRect().right,hidden:p.hidden}})()");assert not report['progressUi']['hidden'] and report['progressUi']['left']>report['progressUi']['buttonRight'];assert '2.0 MB/s' in report['progressUi']['text']
   await c.shot('link31-download-progress.png');await c.js('window.fetch=originalFetch')
   report['metrics']=[]
   for theme in ['light','dark']:
    for width in [240,280,320,400]:
     await c.js('BiliSpace.update({theme:'+json.dumps(theme)+'})')
     row=await c.js("(()=>{document.querySelector('#metric-fixture')?.remove();const card=document.createElement('div');card.id='metric-fixture';card.className='video-page-card-small';card.style.cssText='width:"+str(width)+"px;display:flex;gap:10px';card.innerHTML='<div style=\"width:44%;flex-shrink:0;height:70px;background:#888\"></div><div style=\"min-width:0;flex:1\"><b>推荐标题</b><div class=playinfo style=\"display:flex;height:18px\"><div class=playinfo-item style=\"width:50%;display:flex\"><svg width=14 height=14></svg><span>1994.4万</span></div><div class=playinfo-item style=\"width:50%;display:flex\"><svg width=14 height=14></svg><span>1.2万</span></div></div></div>';document.body.append(card);return [...card.querySelectorAll('.playinfo-item')].map(el=>{const s=el.querySelector('span'),range=document.createRange();range.selectNodeContents(s);return {text:s.textContent,lines:range.getClientRects().length,whiteSpace:getComputedStyle(s).whiteSpace,itemWidth:el.getBoundingClientRect().width,parentWidth:el.parentElement.getBoundingClientRect().width}})})()")
     assert all(x['lines']==1 and x['whiteSpace']=='nowrap' and x['itemWidth']<=x['parentWidth'] for x in row),row
     report['metrics'].append({'theme':theme,'width':width,'items':row})
   await c.shot('link31-metrics.png')
   report['pass']=True
   await c.call('Fetch.disable')
 finally:
  p.terminate();p.wait(timeout=10);settings.write_bytes(backup);(R/'verification/link31-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
asyncio.run(main());print(json.dumps(report,ensure_ascii=False,indent=2))
