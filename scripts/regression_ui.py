import asyncio,base64,ctypes,hashlib,json,subprocess,urllib.request
from websockets.asyncio.client import connect
from smoke import ROOT,OUT,CDP

async def main():
 startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],startupinfo=startup)
 report={'mode':'mock account + representative page DOM; no real login or account writes','events':{},'sha256':hashlib.sha256((ROOT/'dist/assets/enhance.js').read_bytes()).hexdigest()}
 try:
  targets=[]
  for _ in range(80):
   try:
    targets=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));targets=[t for t in targets if t.get('type')=='page' and 'bili-space.local' in t.get('url','')]
    if targets:break
   except Exception:pass
   await asyncio.sleep(.25)
  async with connect(targets[0]['webSocketDebuggerUrl'],max_size=20000000) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Emulation.setDeviceMetricsOverride',{'width':1280,'height':800,'deviceScaleFactor':1,'mobile':False})
   html=(ROOT/'tests/fixtures/ui-regression.html').read_bytes()
   avatar=b'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="#6ba494"/><path d="M12 15h16v13H12Z" fill="#d4eadf"/></svg>'
   def intercept(event):
    req=event['request'];url=req['url'];origin=req.get('headers',{}).get('Origin','https://www.bilibili.com')
    headers=[{'name':'Access-Control-Allow-Origin','value':origin},{'name':'Access-Control-Allow-Credentials','value':'true'}]
    if '/x/web-interface/nav' in url:
     body=json.dumps({'code':0,'data':{'isLogin':True,'mid':1234,'uname':'测试账号（非真实登录）','face':'https://i0.hdslb.com/bfs/face/bs-test-avatar.svg'}}).encode();mime='application/json'
    elif 'bs-test-avatar.svg' in url:body=avatar;mime='image/svg+xml'
    else:body=html;mime='text/html; charset=utf-8'
    return {'method':'Fetch.fulfillRequest','params':{'requestId':event['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':mime},*headers],'body':base64.b64encode(body).decode()}}
   c.intercept=intercept
   await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*','resourceType':'Document'},{'urlPattern':'https://api.bilibili.com/x/web-interface/nav*'},{'urlPattern':'https://i0.hdslb.com/bfs/face/bs-test-avatar.svg'}]})
   urls={'home':'https://www.bilibili.com/','history':'https://www.bilibili.com/account/history','dynamic':'https://t.bilibili.com/','search':'https://search.bilibili.com/all?keyword=%E8%8B%8F%E4%B8%B9','video':'https://www.bilibili.com/video/BVfixture'}
   for name,url in urls.items():
    await c.call('Page.navigate',{'url':url})
    for _ in range(80):
     ready=await c.js(f'location.href==={json.dumps(url)}&&!!window.BiliSpace&&!!document.querySelector(".case.visible")')
     if ready:break
     await asyncio.sleep(.1)
    assert ready,name
    await c.js('BiliSpace.update({theme:"dark",srMode:"off",showChannels:false,headerHome:true,headerDynamic:true,headerHistory:true,headerBrand:true,headerSearch:true,headerMessages:true,headerAccount:true,headerBack:true})')
    for _ in range(30):
     if await c.js('!!document.querySelector("#bili-space-root").shadowRoot.querySelector(".account img")'):break
     await asyncio.sleep(.05)
    stats=await c.js('''(()=>{const s=document.querySelector('#bili-space-root').shadowRoot;const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};const visible=[...document.querySelectorAll('.case.visible .feed-card')].filter(e=>e.getClientRects().length);return{url:location.href,route:BiliSpace.state.route,active:s.querySelector('nav a[aria-current=page]')?.textContent||null,query:s.querySelector('.search input').value,avatar:s.querySelector('.account img')?.src,avatarComplete:s.querySelector('.account img')?.complete,messages:s.querySelector('.messages').href,lights:[...s.querySelectorAll('.lights .light')].map(rect),glyphs:[...s.querySelectorAll('.lights .light svg')].map(rect),content:rect(document.querySelector('.case.visible')),cards:visible.map(rect),overflow:document.documentElement.scrollWidth>innerWidth,searchInput:getComputedStyle(document.querySelector('.search-input')).display,historyPad:getComputedStyle(document.querySelector('.history-record')).paddingTop,dynamicPad:getComputedStyle(document.querySelector('.bili-dyn-home--member')).paddingTop,playerShadow:getComputedStyle(document.querySelector('#bilibili-player')).boxShadow,dmBg:getComputedStyle(document.querySelector('.bpx-player-sending-bar')).backgroundColor,channelDisplay:getComputedStyle(document.querySelector('.channel-container')).display,buttonBg:getComputedStyle(document.querySelector('.case.visible .vui_button')||document.querySelector('.vui_button')).backgroundColor}})()''')
    assert not stats['overflow'],stats
    assert stats['avatar'] and stats['messages']=='https://message.bilibili.com/#/reply',stats
    assert max(r['y'] for r in stats['lights'])-min(r['y'] for r in stats['lights'])<.1
    for button,glyph in zip(stats['lights'],stats['glyphs']):assert abs(button['y']+button['h']/2-glyph['y']-glyph['h']/2)<.1
    if name in ('history','dynamic'):assert stats['active']=={'history':'历史','dynamic':'动态'}[name]
    if name=='home':
     assert stats['channelDisplay']=='none'
     first=stats['cards'][:4];assert len(first)==4 and max(x['y'] for x in first)-min(x['y'] for x in first)<1,stats
     assert first[-1]['x']+first[-1]['w']>1150,stats
    if name=='search':assert stats['query']=='苏丹' and stats['searchInput']=='none' and stats['buttonBg']=='rgb(38, 38, 43)',stats
    if name=='video':assert stats['playerShadow']=='none' and stats['dmBg']=='rgb(32, 32, 35)',stats
    report['events'][name]=stats;await c.shot('fixed-'+name+'.png');print(name,'PASS',flush=True)
    if name=='home':
     report['responsive']=[]
     for width in [580,880,1100,1440]:
      await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':800,'deviceScaleFactor':1,'mobile':False})
      metrics=await c.js('(()=>{const s=document.querySelector("#bili-space-root").shadowRoot,b=s.querySelector(".brand").getBoundingClientRect(),h=s.querySelector("header").getBoundingClientRect();return{width:innerWidth,scroll:document.documentElement.scrollWidth,columns:getComputedStyle(document.querySelector(".recommended-container_floor-aside>.container")).gridTemplateColumns,headerRight:s.querySelector(".account").getBoundingClientRect().right,brandCenter:b.x+b.width/2,headerCenter:h.x+h.width/2,brandWidth:b.width}})()')
      assert metrics['scroll']<=width and metrics['headerRight']<=width,metrics
      assert metrics['brandWidth']>0 and abs(metrics['brandCenter']-metrics['headerCenter'])<1,metrics
      report['responsive'].append(metrics)
     await c.call('Emulation.setDeviceMetricsOverride',{'width':1280,'height':800,'deviceScaleFactor':1,'mobile':False})
   report['header']=await c.js('(()=>{const s=document.querySelector("#bili-space-root").shadowRoot;return{square:!!s.querySelector(".light.max rect"),messageIcon:!!s.querySelector(".messages .lucide-message-square-more"),videoHome:document.querySelector("#bili-space-video-home")?.href}})()')
   assert report['header']=={'square':True,'messageIcon':True,'videoHome':'https://www.bilibili.com/'}
   await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
   await c.call('Emulation.setFocusEmulationEnabled',{'enabled':True})
   await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':600,'y':700})
   await asyncio.sleep(.2)
   opacity='Number(getComputedStyle(document.querySelector("#bili-space-root").shadowRoot.querySelector(".light.max svg")).opacity)'
   start=await c.js(opacity)
   point=await c.js('(()=>{const r=document.querySelector("#bili-space-root").shadowRoot.querySelector(".light.max").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()')
   await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved',**point});await asyncio.sleep(.045)
   during=await c.js(opacity);await asyncio.sleep(.18);end=await c.js(opacity)
   await c.shot('header-symbols.png')
   await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':600,'y':700});await asyncio.sleep(.045)
   out=await c.js(opacity);await asyncio.sleep(.18);hidden=await c.js(opacity)
   report['header']['fade']={'start':start,'during':during,'end':end,'out':out,'hidden':hidden}
   assert start==0 and 0<during<1 and end==1 and 0<out<1 and hidden==0,report['header']
   flags=['headerHome','headerDynamic','headerHistory','headerBrand','headerSearch','headerMessages','headerAccount','headerBack']
   await c.js('BiliSpace.update('+json.dumps({key:False for key in flags})+');window.__headerBeforeReload=true')
   await asyncio.sleep(.25)
   saved=json.loads((ROOT/'dist/.appdata/settings.json').read_text())['config']
   assert all(saved[key] is False for key in flags)
   await c.call('Page.reload')
   for _ in range(80):
    loaded=await c.js('!window.__headerBeforeReload&&!!window.BiliSpace&&document.readyState==="complete"')
    if loaded:break
    await asyncio.sleep(.05)
   assert loaded
   report['header']['after_reload']=await c.js('({prefs:BiliSpace.state.prefs,visibleWindows:document.querySelector("#bili-space-root").shadowRoot.querySelector(".lights").getBoundingClientRect().width>0,videoHome:!!document.querySelector("#bili-space-video-home:not([hidden])")})')
   assert all(report['header']['after_reload']['prefs'][key] is False for key in flags)
   assert report['header']['after_reload']['visibleWindows'] and report['header']['after_reload']['videoHome']
   await c.js('BiliSpace.update('+json.dumps({key:True for key in flags})+');BiliSpace.openSettings();document.querySelector("#bili-space-root").shadowRoot.querySelector("[data-tab=header]").click()')
   await c.shot('header-settings.png');await c.js('BiliSpace.closeSettings()')
   # Form submit is a real Enter key, through WebView2 to the native navigation handler.
   await c.js('window.__testSend=chrome.webview.postMessage.bind(chrome.webview);chrome.webview.postMessage=m=>{if(m.type==="navigate")window.__testPending=m;else window.__testSend(m)};const s=document.querySelector("#bili-space-root").shadowRoot;s.querySelector(".search input").value="苏丹";s.querySelector(".search input").focus()')
   await c.call('Input.dispatchKeyEvent',{'type':'keyDown','key':'Enter','code':'Enter','windowsVirtualKeyCode':13})
   await c.call('Input.dispatchKeyEvent',{'type':'char','key':'Enter','code':'Enter','text':'\r','windowsVirtualKeyCode':13})
   await c.call('Input.dispatchKeyEvent',{'type':'keyUp','key':'Enter','code':'Enter','windowsVirtualKeyCode':13})
   report['enter_loader']=await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector(".search").getAttribute("aria-busy")')
   assert report['enter_loader']=='true',report
   await c.shot('fixed-search-loading.png')
   assert await c.js('window.__testPending?.type')=='navigate'
   await c.js('window.__testSend(window.__testPending)')
   for _ in range(80):
    done=await c.js('location.hostname==="search.bilibili.com"&&!!window.BiliSpace&&BiliSpace.state.route==="search"')
    if done:break
    await asyncio.sleep(.1)
   assert done
   await c.shot('fixed-search-enter.png')
   await c.call('Fetch.disable');c.intercept=None
   report['runtime_errors']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown']
   assert not report['runtime_errors'],report['runtime_errors']
   report['result']='PASS'
 finally:
  if p.poll() is None:
   ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]'),0x10,0,0)
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:p.terminate();p.wait()
  (OUT/'ui-regression.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps(report,ensure_ascii=True,indent=2))

asyncio.run(main())
