import asyncio,ctypes,json,subprocess,urllib.request
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
ROOT=Path.cwd();out={}
async def main():
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist')
 try:
  for i in range(100):
   try:
    targets=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));t=next(x for x in targets if x.get('type')=='page');break
   except Exception:await asyncio.sleep(.2)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable')
   for i in range(100):
    if await c.js('!!window.BiliSpace'):break
    await asyncio.sleep(.2)
   await c.js('BiliSpace.update({srMode:"off",categorySelection:[0,2,5],autoZoom:true})');await asyncio.sleep(.4)
   out['ui']=await c.js('({state:BiliSpace.state,gpu:!!navigator.gpu,ort:typeof ort,categories:[...document.querySelector("#bili-space-root").shadowRoot.querySelectorAll("#header-categories a:not([hidden])")].map(a=>a.textContent),chevron:document.querySelector("#bili-space-root").shadowRoot.querySelector(".back").innerHTML,launcher:getComputedStyle(document.querySelector("#__bilibili_thread_ripper_launcher__")||document.createElement("div")).display})')
   await c.js('document.querySelector("video").play();BiliSpace.update({srMode:"performance",srScale:2})')
   for i in range(160):
    state=await c.js('BiliSpace.state')
    if state.get('frames',0)>1 or state.get('stopped'):break
    await asyncio.sleep(.25)
   out['ai']=await c.js('({state:BiliSpace.state,opacity:document.querySelector("video").style.opacity,canvas:[document.querySelector(".bs-gpu-canvas")?.width,document.querySelector(".bs-gpu-canvas")?.height]})')
   out['errors']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown'];print(json.dumps(out,ensure_ascii=True,indent=2))
   await c.shot('latest-ai.png')
 finally:
  (ROOT/'verification/latest-probe.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
  ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]'),0x10,0,0)
  try:p.wait(timeout=5)
  except:p.terminate()
asyncio.run(main())
