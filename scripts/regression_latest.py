import asyncio,ctypes,json,subprocess,urllib.request,time,requests,shutil,hashlib
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
ROOT=Path.cwd();OUT=ROOT/'verification';PROFILE=ROOT/'dist/.appdata';report={};u=ctypes.windll.user32
async def attach():
 for _ in range(180):
  try:
   ts=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.4));t=next(x for x in ts if x.get('type')=='page' and 'bili-space.local' in x.get('url',''));return await connect(t['webSocketDebuggerUrl'],max_size=50*1024*1024)
  except Exception:await asyncio.sleep(.15)
 raise AssertionError('test CDP did not start')
async def ready(c):
 await c.call('Runtime.enable');await c.call('Page.enable')
 for _ in range(150):
  if await c.js('!!window.BiliSpace'):return
  await asyncio.sleep(.1)
 raise AssertionError('BiliSpace did not initialize')
def close():
 h=u.FindWindowW('BetterBiliSpace','Bili-Space [test]')
 if h:u.PostMessageW(h,0x10,0,0)
async def main():
 settings=PROFILE/'settings.json';backup=settings.read_bytes() if settings.exists() else None
 src=PROFILE/'mihomo/proxy-source.yaml';srcBackup=src.read_bytes() if src.exists() else None
 legacy=PROFILE/'proxy-enabled';legacyBackup=legacy.read_bytes() if legacy.exists() else None
 p=None;ws=None
 try:
  d=json.loads(backup) if backup else {'config':{},'gm':{}};d['config'].update(proxy=False,autoZoom=True,zoom=100,srMode='off',categorySelection=[0,2,5],categoryPreset=1);settings.write_text(json.dumps(d),encoding='utf8');legacy.unlink(missing_ok=True)
  p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist');ws=await attach();c=CDP(ws);await ready(c)
  report['sha256']={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [ROOT/'dist/Bili-Space.exe',ROOT/'assets/enhance.js',ROOT/'assets/bridge.js']}
  report['arrow']=await c.js('(()=>{const s=document.querySelector("#bili-space-root").shadowRoot;const cy=e=>{const r=e.getBoundingClientRect();return r.top+r.height/2};return {header:cy(s.querySelector("header")),button:cy(s.querySelector(".back")),svg:cy(s.querySelector(".back svg")),lights:cy(s.querySelector(".lights")),names:[...s.querySelectorAll("#header-categories a:not([hidden])")].map(a=>a.textContent)}})()')
  assert max(report['arrow'][x] for x in ['header','button','svg','lights'])-min(report['arrow'][x] for x in ['header','button','svg','lights'])<1,report['arrow']
  assert report['arrow']['names']==['番剧','漫画','游戏']
  await c.js('BiliSpace.openSettings();document.querySelector("#bili-space-root").shadowRoot.querySelector("[data-tab=categories]").click()');await c.shot('latest-categories.png')
  await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector("#category-none").click()');assert await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelectorAll("#header-categories a:not([hidden])").length')==0
  await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector("#category-default").click()');await asyncio.sleep(.3)
  assert len((await c.js('BiliSpace.state.prefs.categorySelection')))==8
  await c.call('Page.reload');await asyncio.sleep(.3);await ready(c);assert len(await c.js('BiliSpace.state.prefs.categorySelection'))==8
  report['ball']=await c.js('({engine:document.documentElement.hasAttribute("data-btr-userscript"),launcher:!!document.querySelector("#__bilibili_thread_ripper_launcher__"),stored:JSON.parse(localStorage.getItem("BTR_Userscript.sync")||"{}").floatingButton})');assert report['ball']['engine'] and not report['ball']['launcher'] and report['ball']['stored'] is False
  await c.js('window.scrollTo(0,0)');await asyncio.sleep(.1)
  report['scrollbar']=await c.js('({root:getComputedStyle(document.documentElement).scrollbarWidth,body:getComputedStyle(document.body).scrollbarWidth,gutter:innerWidth-document.documentElement.clientWidth})')
  assert report['scrollbar']['root']=='none' and report['scrollbar']['gutter']==0,report['scrollbar']
  await c.call('Input.dispatchMouseEvent',{'type':'mouseWheel','x':600,'y':200,'deltaX':0,'deltaY':120})
  report['inertia']={'start':await c.js('scrollY')};await asyncio.sleep(.035);report['inertia']['during']=await c.js('scrollY');await asyncio.sleep(.2);report['inertia']['end']=await c.js('scrollY')
  assert 0<=report['inertia']['start']<report['inertia']['end'] and report['inertia']['during']<report['inertia']['end'] and abs(report['inertia']['end']-120)<=2,report['inertia']
  await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]});await c.js('window.scrollTo(0,0)');await asyncio.sleep(.1)
  await c.js('document.body.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:120}))');await asyncio.sleep(.2);report['reduced_motion_y']=await c.js('scrollY');assert report['reduced_motion_y']==0
  await c.call('Emulation.setEmulatedMedia',{'features':[]});await c.js('window.scrollTo(0,0)');await asyncio.sleep(.1)
  await c.js('document.body.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:8}))');await asyncio.sleep(.2);report['precision_y']=await c.js('scrollY');assert report['precision_y']==0
  await c.shot('latest-clean-scrollbar.png')
  base=await c.js('({width:innerWidth,dpr:devicePixelRatio})');h=u.FindWindowW('BetterBiliSpace','Bili-Space [test]');u.ShowWindow(h,3);await asyncio.sleep(.8);report['maximized']=await c.js('({width:innerWidth,dpr:devicePixelRatio})');assert report['maximized']['dpr']>base['dpr']
  await c.js('chrome.webview.postMessage({type:"window",action:"fullscreen"})');await asyncio.sleep(.6);report['fullscreen']=await c.js('({width:innerWidth,dpr:devicePixelRatio,full:BiliSpace.state.full})');assert report['fullscreen']['full'] and report['fullscreen']['dpr']>base['dpr']
  await c.js('chrome.webview.postMessage({type:"window",action:"fullscreen"})');await asyncio.sleep(.4);u.ShowWindow(h,9);await asyncio.sleep(.4)
  await c.js('document.querySelector("video").style.cssText="width:1280px;height:720px;max-width:none";document.querySelector("video").play();BiliSpace.update({srMode:"quality",srScale:2})')
  for _ in range(150):
   st=await c.js('BiliSpace.state')
   if st['frames']>10 or st['stopped']:break
   await asyncio.sleep(.2)
  report['ai']=await c.js('({status:BiliSpace.state.status,frames:BiliSpace.state.frames,opacity:document.querySelector("video").style.opacity,output:[document.querySelector(".bs-gpu-canvas")?.width,document.querySelector(".bs-gpu-canvas")?.height]})');assert report['ai']['frames']>10 and report['ai']['output']==[1280,720] and report['ai']['opacity']=='0',report['ai']
  await c.shot('latest-ai.png');await c.js('BiliSpace.update({srMode:"off"})');await asyncio.sleep(.2);assert await c.js('document.querySelector("video").style.opacity')!='0'
  report['errors']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown'];assert not report['errors']
  await ws.close();ws=None;close();p.wait(timeout=8);await asyncio.sleep(1)
  # Explicitly enabled disposable test profile: never a real account or system proxy.
  d=json.loads(settings.read_text());d['config'].update(proxy=True,proxyAll=True,srMode='off');settings.write_text(json.dumps(d),encoding='utf8');src.parent.mkdir(exist_ok=True);shutil.copyfile(ROOT/'runtime/free-candidates.yaml',src)
  p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist');ws=await attach();c=CDP(ws);await ready(c);await asyncio.sleep(.4)
  report['proxy_on']=await c.js('BiliSpace.state.proxy');assert report['proxy_on']['running'] and len(report['proxy_on']['nodes'])>=2,report['proxy_on']
  cfg=json.loads((PROFILE/'mihomo/client.json').read_text());assert cfg['allow-lan'] is False and cfg['tun']['enable'] is False
  report['proxy_route']={'local_only':cfg['bind-address'],'tun':cfg['tun']['enable'],'port':cfg['mixed-port']}
  session=requests.Session();session.trust_env=False;response=session.get('https://example.com/',proxies={'https':'http://127.0.0.1:'+str(cfg['mixed-port'])},timeout=15);assert response.status_code==200 and 'Example Domain' in response.text;report['proxy_route']['anonymous_example_status']=response.status_code
  await c.js('BiliSpace.openSettings();document.querySelector("#bili-space-root").shadowRoot.querySelector("[data-tab=network]").click()');await c.shot('latest-proxy.png')
  node=report['proxy_on']['nodes'][1];await c.js('(()=>{const s=document.querySelector("#bili-space-root").shadowRoot.querySelector("#proxy-node");s.value='+json.dumps(node)+';s.dispatchEvent(new Event("input",{bubbles:true}))})()');await asyncio.sleep(.4);report['proxy_selected']=await c.js('BiliSpace.state.proxy');assert report['proxy_selected']['node']==node and '失败' not in report['proxy_selected']['message'],report['proxy_selected']
  await c.js('(()=>{const s=document.querySelector("#bili-space-root").shadowRoot.querySelector("#proxy-switch");s.checked=false;s.dispatchEvent(new Event("input",{bubbles:true}))})()');await ws.close();ws=None;p.wait(timeout=10);await asyncio.sleep(2)
  ws=await attach();c=CDP(ws);await ready(c);report['proxy_off']=await c.js('BiliSpace.state.proxy');assert not report['proxy_off']['running'] and not report['proxy_off']['enabled']
  try:session.get('http://127.0.0.1:'+str(cfg['external-controller'].split(':')[-1])+'/version',timeout=.5);raise AssertionError('old core still alive')
  except requests.RequestException:report['old_core_closed']=True
  await ws.close();ws=None;close();await asyncio.sleep(1)
  report['result']='PASS'
 finally:
  if ws:await ws.close()
  close()
  if p and p.poll() is None:
   try:p.wait(timeout=5)
   except:p.terminate();p.wait()
  if backup is not None:settings.write_bytes(backup)
  if srcBackup is not None:src.write_bytes(srcBackup)
  else:src.unlink(missing_ok=True)
  if legacyBackup is not None:legacy.write_bytes(legacyBackup)
  else:legacy.unlink(missing_ok=True)
  (OUT/'latest-regression.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True,indent=2))
asyncio.run(main())
