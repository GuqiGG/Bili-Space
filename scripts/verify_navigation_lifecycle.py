import asyncio,json,subprocess,urllib.request,ctypes
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
R=Path.cwd();report={}
async def main():
 settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();data=json.loads(backup);data['config'].update(srMode='off',fiMode='off',proxy=False,closeAction='exit');settings.write_text(json.dumps(data));p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test','--lifecycle-preview'],cwd=R/'dist')
 try:
  for _ in range(150):
   try:
    ts=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.3));t=next(x for x in ts if x.get('type')=='page');break
   except:await asyncio.sleep(.02)
  async with connect(t['webSocketDebuggerUrl'],max_size=20*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable')
   for _ in range(200):
    splash=await c.js("(()=>{const svg=document.querySelector('.center .bs-tv');return svg?{animation:getComputedStyle(svg).animationName,curve:getComputedStyle(svg).animationTimingFunction,width:svg.getBoundingClientRect().width}:null})()")
    if splash:report['startup']=splash;await c.shot('startup-tv-proof.png');break
    if await c.js('!!window.BiliSpace'):break
    await asyncio.sleep(.01)
   for _ in range(100):
    if await c.js('!!window.BiliSpace'):break
    await asyncio.sleep(.1)
   assert report.get('startup'), 'Startup television was not observed'
   report['toolbarControls']=await c.js('document.querySelectorAll(".bs-player-tool").length');assert report['toolbarControls']==0
   await c.js('BiliSpace.openSettings();document.querySelector("#bili-space-root").shadowRoot.querySelector("[data-tab=play]").click()')
   report['settingsWarning']=await c.js('document.querySelector("#bili-space-root").shadowRoot.textContent.includes("测试功能")');assert report['settingsWarning']
   await c.js('BiliSpace.beginClose()');report['close']=await c.js("(()=>{const el=document.querySelector('#bs-close-animation');return {exists:!!el,tv:!!el?.querySelector('.bs-tv'),curve:el?getComputedStyle(el.querySelector('svg')).animationTimingFunction:null}})()");assert report['close']['tv']
   # The real window close path owns the completion timer; exercise it, not only the overlay.
   u=ctypes.windll.user32;u.FindWindowW.restype=ctypes.c_void_p;u.GetWindowRect.argtypes=[ctypes.c_void_p,ctypes.c_void_p]
   class Rect(ctypes.Structure):_fields_=[('left',ctypes.c_long),('top',ctypes.c_long),('right',ctypes.c_long),('bottom',ctypes.c_long)]
   hwnd=u.FindWindowW('BetterBiliSpace','Bili-Space [test]');before=Rect();u.GetWindowRect(hwnd,ctypes.byref(before))
   await c.js('chrome.webview.postMessage({type:"window",action:"close"})')
   await asyncio.sleep(.08);after=Rect();u.GetWindowRect(hwnd,ctypes.byref(after));report['windowShrink']={'before':before.right-before.left,'during':after.right-after.left};assert 0<report['windowShrink']['during']<report['windowShrink']['before'],report['windowShrink']
  p.wait(timeout=5);report['exit_status']=p.returncode;assert p.returncode==0;report['result']='PASS'
 finally:
  if p.poll() is None:p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/navigation-lifecycle.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
