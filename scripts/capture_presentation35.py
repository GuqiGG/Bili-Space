import asyncio,json,subprocess,urllib.request,base64,ctypes,time
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import CDP
R=Path.cwd();V=R/'verification';images=R/'docs/images';settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes() if settings.exists() else None
report={};proc=None
async def wait(c,exp,seconds=30):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  try:
   value=await c.js(exp)
   if value:return value
  except Exception:pass
  await asyncio.sleep(.2)
 raise RuntimeError('Timed out: '+exp)
async def shot(c,name):
 a=await c.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False});(images/name).write_bytes(base64.b64decode(a['data']))
async def main():
 global proc
 settings.parent.mkdir(exist_ok=True);settings.write_text(json.dumps({'config':{'theme':'dark','proxy':False,'btr':False,'clipboardAutoOpen':False,'srMode':'off','fiMode':'off','zoom':100,'autoZoom':False,'closeAction':'exit','trafficLights':True},'gm':{}}),encoding='utf8')
 proc=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 for i in range(120):
  try:target=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json',timeout=.5)) if t['type']=='page');break
  except Exception:await asyncio.sleep(.1)
 else:raise RuntimeError('No test browser')
 async with connect(target['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
  c=CDP(ws);await c.call('Page.enable');await c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':960,'deviceScaleFactor':1,'mobile':False})
  await c.call('Page.addScriptToEvaluateOnNewDocument',{'source':"new MutationObserver(()=>document.querySelectorAll('video,audio').forEach(v=>{v.muted=true;v.pause()})).observe(document,{childList:true,subtree:true});"})
  await c.call('Page.navigate',{'url':'https://www.bilibili.com/'})
  await wait(c,"!!window.BiliSpace && document.querySelectorAll('.bili-video-card').length>=6",45)
  await wait(c,"[...document.querySelectorAll('.bili-video-card img')].filter(i=>i.complete&&i.naturalWidth>50).length>=6",30)
  await asyncio.sleep(1)
  report['home']=await c.js("({url:location.href,title:document.title,cards:document.querySelectorAll('.bili-video-card').length,login:document.querySelector('#bili-space-root').shadowRoot.querySelector('.account').textContent,hasPersonalAvatar:!!document.querySelector('#bili-space-root').shadowRoot.querySelector('.account img')})")
  assert not report['home']['hasPersonalAvatar'],'Do not publish personal account screenshot'
  await shot(c,'home.png')
  await c.js("BiliSpace.openSettings();document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-tab=appearance]').click()")
  await shot(c,'settings.png')
  report['settingsCopy']=await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('#tab-content').textContent")
  await c.js('BiliSpace.closeSettings()')
  await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV17an46ZEEc/'})
  await wait(c,"!!window.BiliSpace && !!document.querySelector('video') && !!document.querySelector('h1')",40)
  await wait(c,"!!document.querySelector('video') && document.querySelector('video').readyState>=2",40)
  await c.js("document.querySelectorAll('video').forEach(v=>{v.pause();v.muted=true})")
  await wait(c,"!document.querySelector('#bs-video-loading')",10)
  await asyncio.sleep(.8);await shot(c,'player.png');report['player']=await c.js("({url:location.href,title:document.title,ready:document.querySelector('video').readyState})")
 (V/'presentation35-capture.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False,indent=2))
try:asyncio.run(main())
finally:
 if proc:
  hwnd=ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]')
  if hwnd:ctypes.windll.user32.PostMessageW(hwnd,0x10,0,0)
  try:proc.wait(5)
  except subprocess.TimeoutExpired:proc.terminate();proc.wait(10)
 if backup is not None:settings.write_bytes(backup)
 else:settings.unlink(missing_ok=True)
