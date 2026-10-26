import asyncio,json,subprocess,urllib.request,base64,ctypes
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
R=Path.cwd();report={}
async def wait(c,expr):
 for _ in range(120):
  if await c.js(expr):return
  await asyncio.sleep(.05)
 raise AssertionError(expr)
async def main():
 settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();d=json.loads(backup);d['config'].update(proxy=False,btr=False,srMode='off',fiMode='off',clipboardAutoOpen=False,zoom=100,autoZoom=False,closeAction='tray',trafficLights=True);settings.write_text(json.dumps(d));p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test','--tray-preview'],cwd=R/'dist');held=[]
 try:
  for _ in range(100):
   try:t=next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5)) if x.get('type')=='page');break
   except:await asyncio.sleep(.15)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
   html='''<html><head><style>body{margin:0}.bpx-player-container{width:640px;height:360px}.bpx-player-video-wrap{height:100%}video{width:100%;height:100%}.bpx-player-ctrl-volume{position:absolute;left:100px;top:420px}.bui-track{width:10px;height:48px;position:relative}.bui-thumb{position:absolute;bottom:0}</style></head><body><video hidden id="preview"></video><div id="bilibili-player"><div class="bpx-player-container" data-screen="normal"><div class="bpx-player-video-wrap"><video id="main" muted playsinline></video></div></div></div><div class="bpx-player-ctrl-volume"><div class="bpx-player-ctrl-volume-number">100</div><div class="bpx-player-ctrl-volume-progress"><div class="bui-area"><div class="bui-track"><div class="bui-bar-normal"></div><div class="bui-thumb"></div></div></div></div></div><img src="https://www.bilibili.com/chrome23-slow.png"></body></html>'''
   def intercept(m):
    if 'chrome23-slow' in m['request']['url']:held.append(m['requestId']);return None
    return {'method':'Fetch.fulfillRequest','params':{'requestId':m['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode(html.encode()).decode()}}
   c.intercept=intercept;await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*chrome23-fixture*'},{'urlPattern':'*chrome23-slow.png*'}]});await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV1234567890?chrome23-fixture=1'});await wait(c,'!!window.BiliSpace')
   await c.js("window.cv=document.createElement('canvas');cv.width=320;cv.height=180;window.paintTimer=setInterval(()=>{const x=cv.getContext('2d');x.fillStyle=performance.now()%1000>500?'#28564d':'#384d6b';x.fillRect(0,0,320,180);},30);const v=document.querySelector('#main');v.srcObject=cv.captureStream(30);v.play()")
   await wait(c,"!document.querySelector('#bs-video-loading')")
   report['loader']=await c.js("({documentReady:document.readyState,currentTime:document.querySelector('#main').currentTime,events:BiliSpace.state.videoLoadingEvents,mainReady:document.querySelector('#main').readyState,previewReady:document.querySelector('#preview').readyState})")
   assert report['loader']['documentReady']!='complete' and report['loader']['currentTime']<1 and report['loader']['previewReady']==0,report['loader']
   for rid in held:await c.call('Fetch.fulfillRequest',{'requestId':rid,'responseCode':200,'body':''})
   await c.call('Fetch.disable');c.intercept=None
   await c.js("document.querySelector('#main').muted=false;document.querySelector('#main').volume=1;for(let i=0;i<30;i++)document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}))")
   await asyncio.sleep(.2)
   report['volume']=await c.js("({percent:document.querySelector('.bpx-player-ctrl-volume-number').textContent,gain:BiliSpace.state.audioState,trackHeight:document.querySelector('.bui-track').getBoundingClientRect().height})")
   assert report['volume']['percent']=='200' and report['volume']['gain']=='gain-200' and report['volume']['trackHeight']>=100,report['volume']
   await c.js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))")
   report['down']=await c.js("document.querySelector('.bpx-player-ctrl-volume-number').textContent");assert report['down']=='195'
   report['header']=[]
   for traffic in [True,False]:
    await c.js('BiliSpace.update({trafficLights:'+str(traffic).lower()+'})');await asyncio.sleep(.4)
    r=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,l=s.querySelector('.lights'),h=s.querySelector('nav [data-route=home]'),tv=s.querySelector('.video-home-top'),w=s.querySelector('.window-actions'),a=s.querySelector('.account-wrap'),center=e=>{const r=e.getBoundingClientRect();return r.top+r.height/2};return {traffic:!l.hidden,windows:!w.hidden,homeVisible:getComputedStyle(h).display!=='none',homeX:h.getBoundingClientRect().left,tvVisible:getComputedStyle(tv).display!=='none',homeLightsDelta:Math.abs(center(tv)-center(l)),rightGap:w.getBoundingClientRect().left-a.getBoundingClientRect().right,svg:w.querySelectorAll('svg').length};})()")
    assert r['homeVisible'] and r['traffic']==traffic and r['windows']!=traffic
    if traffic:assert r['homeLightsDelta']<1,r
    else:assert r['rightGap']>=12 and r['homeX']<=30,r
    report['header'].append(r)
    if traffic:await c.shot('chrome23-traffic.png')
   await c.shot('chrome23-windows.png')
   report['narrow']=[]
   for width in [480,800,1280]:
    await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':850,'deviceScaleFactor':1,'mobile':False})
    for traffic in [True,False]:
     await c.js('BiliSpace.update({trafficLights:'+str(traffic).lower()+'})');await asyncio.sleep(.35)
     r=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,home=s.querySelector('nav [data-route=home]'),h=home.getBoundingClientRect(),tv=s.querySelector('.video-home-top').getBoundingClientRect();return {width:innerWidth,homeLeft:h.left,homeRight:h.right,homeVisible:getComputedStyle(home).display!=='none',tvText:s.querySelector('.video-home-top span').textContent};})()")
     r['traffic']=traffic;report['narrow'].append(r);assert r['homeVisible'] and r['homeLeft']>=0 and r['homeRight']<=r['width'] and r['tvText']=='首页',r
   await c.js('BiliSpace.update({trafficLights:true})')
   await c.js('BiliSpace.showAccountCard()')
   report['spring']=await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('#account-card').getAnimations().map(a=>({duration:a.effect.getTiming().duration,frames:a.effect.getKeyframes().length}))");assert any(a['duration']==500 for a in report['spring']),report['spring']
   await c.js("chrome.webview.postMessage({type:'window',action:'close'})")
   for _ in range(12):await c.js('true');await asyncio.sleep(.05)
   u=ctypes.windll.user32;u.FindWindowW.restype=ctypes.c_void_p;u.IsWindowVisible.argtypes=[ctypes.c_void_p];hwnd=u.FindWindowW('BetterBiliSpace','Bili-Space [test]')
   report['tray']=await c.js("({paused:document.querySelector('#main').paused,events:BiliSpace.state.videoLoadingEvents})");report['tray']['nativeVisible']=bool(u.IsWindowVisible(hwnd));assert report['tray']['paused'] and not report['tray']['nativeVisible'],report['tray']
   await c.js("chrome.webview.postMessage({type:'window',action:'test-restore'})")
   await asyncio.sleep(.25);report['restorePaused']=await c.js("document.querySelector('#main').paused");assert report['restorePaused']
   await c.js("history.pushState(null,'','/');const list=document.createElement('div');list.className='bili-feed4-layout';list.style.height='2400px';list.innerHTML='<div class=\"bili-video-card\" style=\"margin-top:120px\"><div class=\"bili-video-card__info--bottom\"><a class=\"bili-video-card__info--owner\" href=\"https://space.bilibili.com/1234\"><span class=\"bili-video-card__info--author\">Fixture UP</span></a></div></div>';document.body.append(list)")
   await wait(c,"!!document.querySelector('.home-card-blacklist-overlay')")
   report['inline']=await c.js("(()=>{const h=document.querySelector('.home-card-blacklist-overlay'),a=h.previousElementSibling;return {inside:!!h.closest('.bili-video-card'),position:getComputedStyle(h).position,offset:h.getBoundingClientRect().top-a.getBoundingClientRect().top};})()")
   assert report['inline']['inside'] and report['inline']['position']=='static',report['inline']
   await c.js('window.scrollBy(0,250)');await asyncio.sleep(.2)
   report['inlineAfterScroll']=await c.js("(()=>{const h=document.querySelector('.home-card-blacklist-overlay'),a=h.previousElementSibling;return h.getBoundingClientRect().top-a.getBoundingClientRect().top;})()");assert abs(report['inlineAfterScroll']-report['inline']['offset'])<1
   report['result']='PASS';await c.js("clearInterval(paintTimer);BiliSpace.update({closeAction:'exit'});chrome.webview.postMessage({type:'window',action:'close'})")
 finally:
  try:p.wait(timeout=4)
  except:p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/chrome23-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
