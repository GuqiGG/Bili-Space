import asyncio,json,base64,subprocess,urllib.request,ctypes
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import CDP
R=Path.cwd();settings=R/'dist/.appdata/settings.json';original=settings.read_bytes() if settings.exists() else None;proc=None
async def main():
 global proc
 settings.write_text(json.dumps({'config':{'theme':'dark','proxy':False,'clipboardAutoOpen':False,'closeAction':'exit'},'gm':{}}),encoding='utf8');proc=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 for i in range(100):
  try:t=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json',timeout=.5)) if t['type']=='page');break
  except:await asyncio.sleep(.1)
 async with connect(t['webSocketDebuggerUrl'],max_size=35*1024*1024) as ws:
  c=CDP(ws);await c.call('Page.enable')
  for i in range(150):
   if await c.js('!!window.BiliSpace'):break
   await asyncio.sleep(.1)
  else:raise RuntimeError('Initial fixture did not settle')
  await c.call('Page.stopLoading')
  await asyncio.sleep(.5)
  await c.call('Emulation.setDeviceMetricsOverride',{'width':1600,'height':960,'deviceScaleFactor':1,'mobile':False});await c.call('Emulation.setScriptExecutionDisabled',{'value':True});await c.call('Emulation.setDefaultBackgroundColorOverride',{'color':{'r':0,'g':0,'b':0,'a':0}})
  html=(R/'docs/design/showcase.html').read_text(encoding='utf8')
  for n in ['home','settings']:html=html.replace('../images/'+n+'.png','data:image/png;base64,'+base64.b64encode((R/f'docs/images/{n}.png').read_bytes()).decode())
  tree=await c.call('Page.getFrameTree');await c.call('Page.setDocumentContent',{'frameId':tree['frameTree']['frame']['id'],'html':html});await asyncio.sleep(.8)
  a=await c.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False});(R/'verification/readme36-transparent.png').write_bytes(base64.b64decode(a['data']))
  a=await c.call('Page.captureScreenshot',{'format':'webp','quality':90,'captureBeyondViewport':False});(R/'docs/images/showcase.webp').write_bytes(base64.b64decode(a['data']))
  tree=await c.call('DOM.getDocument',{'depth':5});assert 'Product Showcase' in str(tree),str(tree)[:500]
  print('Rendered transparent readme36-transparent.png + showcase.webp from actual client screenshots')
try:asyncio.run(main())
finally:
 if proc:
  hwnd=ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]')
  if hwnd:ctypes.windll.user32.PostMessageW(hwnd,0x10,0,0)
  try:proc.wait(4)
  except subprocess.TimeoutExpired:proc.terminate();proc.wait(10)
 if original is not None:settings.write_bytes(original)
 else:settings.unlink(missing_ok=True)
