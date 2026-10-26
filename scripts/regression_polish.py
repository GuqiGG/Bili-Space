"""Native runtime: promotion clipping, click-only categories, original banner events, early loading and message colors."""
import asyncio,base64,ctypes,hashlib,json,subprocess,sys,urllib.request
from websockets.asyncio.client import connect
from smoke import ROOT,OUT,CDP

async def main():
 label=sys.argv[1] if len(sys.argv)>1 else 'modified';baseline=label=='baseline'
 report={'label':label,'mode':'native WebView2 with representative promotion/message DOM and native IntersectionObserver; no real chat or account actions','sha256':hashlib.sha256((ROOT/'dist/assets/enhance.js').read_bytes()).hexdigest()}
 startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],startupinfo=startup)
 try:
  for _ in range(80):
   try:
    targets=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));targets=[t for t in targets if t.get('type')=='page' and 'bili-space.local' in t.get('url','')]
    if targets:break
   except Exception:pass
   await asyncio.sleep(.2)
  async with connect(targets[0]['webSocketDebuggerUrl'],max_size=20000000) as ws:
   c=CDP(ws);await c.call('Runtime.enable')
   body=(ROOT/'tests/fixtures/client-polish.html').read_bytes()
   def intercept(event):
    content=b'{"code":-101,"data":{"isLogin":false}}' if '/x/web-interface/nav' in event['request']['url'] else body
    return {'method':'Fetch.fulfillRequest','params':{'requestId':event['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'application/json' if content!=body else 'text/html; charset=utf-8'},{'name':'Access-Control-Allow-Origin','value':event['request'].get('headers',{}).get('Origin','https://www.bilibili.com')},{'name':'Access-Control-Allow-Credentials','value':'true'}],'body':base64.b64encode(content).decode()}}
   c.intercept=intercept;await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*','resourceType':'Document'},{'urlPattern':'https://api.bilibili.com/x/web-interface/nav*'}]})
   await c.call('Emulation.setDeviceMetricsOverride',{'width':1360,'height':900,'deviceScaleFactor':1,'mobile':False})
   await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
   await c.call('Page.navigate',{'url':'https://www.bilibili.com/'})
   for _ in range(80):
    if await c.js('!!window.BiliSpace&&document.querySelectorAll("[data-normal]").length>=16'):break
    await asyncio.sleep(.1)
   await c.js('BiliSpace.update({theme:"dark",hideAds:true,showChannels:false,srMode:"off",headerHome:true,headerDynamic:true,headerHistory:true,headerBack:true})');await asyncio.sleep(1.2)
   stats='''(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,ad=document.querySelector('.recommended-swipe'),creative=document.querySelector('.promotion-creative'),t=s.querySelector('.back'),r=t.getBoundingClientRect();return{adDisplay:getComputedStyle(ad).display,adFlattened:ad.dataset.bsFeed,creativeVisible:!!creative.getClientRects().length,requests:window.__requests,scrollY,cards:document.querySelectorAll('[data-normal]').length,expanded:t.getAttribute('aria-expanded'),navHidden:s.querySelector('nav').hidden,font:getComputedStyle(s.querySelector('#header-categories a')).fontSize,trigger:{x:r.x+r.width/2,y:r.y+r.height/2},title:s.querySelector('.brand').getBoundingClientRect().toJSON()}})()'''
   report['home']=await c.js(stats);await c.shot('polish-'+label+'-home.png')
   point=report['home']['trigger'];await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved',**point});await asyncio.sleep(.55)
   report['hover']=await c.js(stats)
   await c.js('BiliSpace.update({headerBack:false});BiliSpace.update({headerBack:true})')
   for kind in ['mousePressed','mouseReleased']:await c.call('Input.dispatchMouseEvent',{'type':kind,'button':'left','clickCount':1,**point})
   await asyncio.sleep(.25);report['click']=await c.js(stats);await c.shot('polish-'+label+'-categories.png')
   if not baseline:
    assert report['home']['adDisplay']=='none' and not report['home']['creativeVisible'],report['home']
    assert report['home']['requests'] and all(r['scrollY']==0 for r in report['home']['requests']),report['home']
    assert report['home']['cards']>16 and len(report['home']['requests'])<=3,report['home']
    assert report['hover']['expanded']=='false',report['hover']
    assert report['click']['expanded']=='true' and report['click']['navHidden'] and float(report['click']['font'][:-2])>=15,report['click']
   await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':1200,'y':500});await asyncio.sleep(.65)
   report['leave']=await c.js(stats)
   if not baseline:assert report['leave']['expanded']=='true' and report['leave']['navHidden']
   await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector(".back").click()')
   banner=await c.js('document.querySelector(".bili-header__banner").getBoundingClientRect().toJSON()')
   report['motion']=[]
   for x in [.2,.8]:
    await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':banner['x']+banner['width']*x,'y':banner['y']+banner['height']*.5});await asyncio.sleep(.18)
    report['motion'].append(await c.js('({events:__motionEvents,layer:getComputedStyle(document.querySelector(".animated-banner .layer")).transform,layers:document.querySelectorAll(".animated-banner .layer").length,mode:document.querySelector(".bili-header__banner").dataset.bsMotion})'))
   if not baseline:assert report['motion'][0]['layer']!=report['motion'][1]['layer'] and report['motion'][1]['events']>=2 and report['motion'][1]['mode']=='native',report['motion']
   await c.shot('polish-'+label+'-banner-motion.png')
   await c.call('Page.navigate',{'url':'https://message.bilibili.com/#/whisper'})
   for _ in range(80):
    if await c.js('!!window.BiliSpace&&location.hostname==="message.bilibili.com"&&!!document.querySelector(".message-main")'):break
    await asyncio.sleep(.1)
   await c.js('BiliSpace.update({theme:"dark"})');await asyncio.sleep(.2)
   report['messages']=await c.js('({background:getComputedStyle(document.querySelector(".message-bgc")).backgroundColor,image:getComputedStyle(document.querySelector(".message-bg")).backgroundImage,sidebar:getComputedStyle(document.querySelector(".message-aside")).backgroundColor,rgb:getComputedStyle(document.documentElement).getPropertyValue("--bg1_rgb"),main:getComputedStyle(document.querySelector(".message-main")).backgroundColor,top:document.querySelector(".message-layout").getBoundingClientRect().top})')
   await c.shot('polish-'+label+'-messages.png')
   if not baseline:
    assert report['messages']['background']=='rgb(22, 22, 24)' and report['messages']['image']=='none' and report['messages']['sidebar']=='rgb(32, 32, 35)',report['messages']
    assert report['messages']['top']<100,report['messages']
   report['runtime_errors']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown'];assert not report['runtime_errors'],report['runtime_errors']
   report['result']='OBSERVED BASELINE' if baseline else 'PASS'
 finally:
  if p.poll() is None:
   ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]'),0x10,0,0)
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:p.terminate();p.wait()
  (OUT/('polish-'+label+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps(report,ensure_ascii=True,indent=2))
asyncio.run(main())
