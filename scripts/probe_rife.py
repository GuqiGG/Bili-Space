import asyncio,ctypes,json,subprocess,urllib.request
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
ROOT=Path.cwd();o={}
async def main():
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist')
 try:
  for _ in range(100):
   try:t=next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5)) if x.get('type')=='page');break
   except:await asyncio.sleep(.2)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable')
   for _ in range(100):
    if await c.js('!!window.BiliSpace?.testRife'):break
    await asyncio.sleep(.2)
   for w,h in [(192,128),(320,192),(640,384)]:
    o[f'{w}x{h}']=await c.js(f'BiliSpace.testRife({w},{h})');print(json.dumps(o[f'{w}x{h}']))
 finally:
  ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]'),0x10,0,0)
  try:p.wait(timeout=5)
  except:p.terminate()
  (ROOT/'verification/rife-webgpu-probe.json').write_text(json.dumps(o,indent=2),encoding='utf8')
asyncio.run(main())
