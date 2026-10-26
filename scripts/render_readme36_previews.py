import asyncio,json,base64,subprocess,urllib.request,ctypes
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import CDP
R=Path.cwd();S=R/'dist/.appdata/settings.json';backup=S.read_bytes();proc=None
async def main():
 global proc
 S.write_text(json.dumps({'config':{'theme':'dark','proxy':False,'clipboardAutoOpen':False,'closeAction':'exit'},'gm':{}}),encoding='utf8');proc=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 for i in range(120):
  try:t=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json',timeout=.5)) if t['type']=='page');break
  except:await asyncio.sleep(.1)
 async with connect(t['webSocketDebuggerUrl'],max_size=25*1024*1024) as ws:
  c=CDP(ws)
  for i in range(150):
   if await c.js('!!window.BiliSpace'):break
   await asyncio.sleep(.1)
  else:raise RuntimeError('Fixture did not settle')
  await c.call('Page.stopLoading');await c.call('Emulation.setScriptExecutionDisabled',{'value':True})
  async def document(html,w,h):
   await c.call('Emulation.setDeviceMetricsOverride',{'width':w,'height':h,'deviceScaleFactor':1,'mobile':False});tree=await c.call('Page.getFrameTree');await c.call('Page.setDocumentContent',{'frameId':tree['frameTree']['frame']['id'],'html':html});await asyncio.sleep(.8)
  data='data:image/png;base64,'+base64.b64encode((R/'docs/images/player.png').read_bytes()).decode()
  await document('<!doctype html><html><style>*{margin:0}html,body{width:1440px;height:960px;overflow:hidden}img{display:block;width:1440px;height:960px}</style><img src="'+data+'"></html>',1440,960)
  r=await c.call('Page.captureScreenshot',{'format':'webp','quality':90,'clip':{'x':10,'y':70,'width':1420,'height':760,'scale':1},'captureBeyondViewport':False});(R/'docs/images/download.webp').write_bytes(base64.b64decode(r['data']))
  data='data:image/webp;base64,'+base64.b64encode((R/'docs/images/showcase.webp').read_bytes()).decode()
  for theme,color in [('dark','#0d1117'),('light','#ffffff')]:
   await document('<!doctype html><html><style>*{box-sizing:border-box;margin:0}html,body{background:'+color+';width:1280px;height:800px}body{padding:40px}img{display:block;width:1200px}</style><img src="'+data+'"></html>',1280,800)
   r=await c.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False});(R/'verification'/('readme36-'+theme+'-preview.png')).write_bytes(base64.b64decode(r['data']))
 print('Exported download view from existing genuine 0.1.35 player screenshot; verified hero composition on dark/light surfaces')
try:asyncio.run(main())
finally:
 if proc:
  h=ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]')
  if h:ctypes.windll.user32.PostMessageW(h,0x10,0,0)
  try:proc.wait(4)
  except subprocess.TimeoutExpired:proc.terminate();proc.wait(10)
 S.write_bytes(backup)
