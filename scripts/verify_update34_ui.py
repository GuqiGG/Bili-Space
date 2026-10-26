import asyncio,json,subprocess,time,urllib.request,base64
from pathlib import Path
from websockets.asyncio.client import connect
R=Path.cwd();V=R/'verification';D=R/'dist/.appdata';D.mkdir(exist_ok=True);U=D/'updates';U.mkdir(exist_ok=True)
backup={p:p.read_bytes() if p.exists() else None for p in [D/'settings.json',U/'required.json',U/'preferences.json']}
class CDP:
 def __init__(self,ws):self.ws=ws;self.n=0
 async def call(self,m,p={}):
  self.n+=1;n=self.n;await self.ws.send(json.dumps(dict(id=n,method=m,params=p)))
  while True:
   a=json.loads(await asyncio.wait_for(self.ws.recv(),20))
   if a.get('id')==n:
    if 'error' in a:raise RuntimeError(a['error'])
    return a.get('result',{})
 async def js(self,s):
  a=await self.call('Runtime.evaluate',dict(expression=s,returnByValue=True,awaitPromise=True))
  if 'exceptionDetails' in a:raise RuntimeError(a['exceptionDetails'])
  return a.get('result',{}).get('value')
 async def shot(self,name):a=await self.call('Page.captureScreenshot',dict(format='png'));(V/name).write_bytes(base64.b64decode(a['data']))
async def target():
 for i in range(120):
  try:
   targets=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json',timeout=1));tabs=[t for t in targets if t['type']=='page']
   if tabs:return tabs[0]['webSocketDebuggerUrl']
  except Exception:pass
  await asyncio.sleep(.1)
 raise RuntimeError('No isolated app test target')
async def main():
 report={}
 settings={'config':{'theme':'dark','autoCheckUpdates':False,'closeAction':'exit','proxy':False,'srMode':'off','fiMode':'off'},'gm':{}}
 (D/'settings.json').write_text(json.dumps(settings),encoding='utf8')
 if (U/'required.json').exists():(U/'required.json').unlink()
 proc=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 try:
  async with connect(await target(),max_size=12*1024*1024) as ws:
   c=CDP(ws)
   for i in range(120):
    if await c.js('!!window.BiliSpace'):break
    await asyncio.sleep(.1)
   await c.js("BiliSpace.openSettings();document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-tab=about]').click()")
   report['about']=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot;return {version:s.querySelector('#app-version').textContent,author:s.querySelector('#app-author').textContent,footer:s.querySelector('.aside-footer').textContent,bodyWidth:document.documentElement.scrollWidth,width:innerWidth}})()")
   assert report['about']['version']=='0.1.34' and report['about']['author']=='未署名'
   await c.shot('update34-about.png')
   await c.js("BiliSpace.acceptUpdateStatus({status:'available',available:true,version:'0.1.35',changelog:['改善播放体验','<script>只是文字</script>'],message:'发现新版本'})")
   await c.shot('update34-available.png')
 finally:
  import ctypes
  hwnd=ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]')
  if hwnd:ctypes.windll.user32.PostMessageW(hwnd,0x10,0,0)
  try:proc.wait(5)
  except subprocess.TimeoutExpired:proc.terminate();proc.wait(10)
  await asyncio.sleep(1)
 manifest=dict(schema=1,appId='bili-space',platform='windows-x64',version='0.1.35',minimumSupportedVersion='0.1.0',force=True,downloadUrl='https://bili.gvqi.top/releases/Bili-Space-0.1.35-win64.zip',sha256='a'*64,size=1024,changelog=['强制升级测试','</script><img src=x>'])
 (U/'required.json').write_text(json.dumps(manifest),encoding='utf8')
 proc=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 try:
  async with connect(await target(),max_size=12*1024*1024) as ws:
   c=CDP(ws)
   for i in range(120):
    if await c.js("!!document.querySelector('#notes li')"):break
    await asyncio.sleep(.1)
   print('forced-debug',await c.js('({url:location.href,html:document.documentElement.outerHTML.slice(0,250)})'),flush=True)
   report['forced']=await c.js("({url:location.href,notes:document.querySelector('#notes').textContent,images:document.querySelectorAll('img').length,ignore:!!document.querySelector('[data-action=ignore]'),buttons:[...document.querySelectorAll('button')].map(b=>b.textContent)})")
   assert report['forced']['url']=='about:blank' and not report['forced']['ignore'] and report['forced']['images']==0
   await c.js("chrome.webview.postMessage({type:'updates',action:'ignore'});chrome.webview.postMessage({type:'navigate',url:'https://www.bilibili.com/'})")
   await asyncio.sleep(.3);report['afterBypass']=await c.js('location.href');assert report['afterBypass']=='about:blank'
   try:await c.call('Page.navigate',{'url':'https://bili-space.local/fixture.html'})
   except Exception:pass
   await asyncio.sleep(.3);assert await c.js('location.href')=='about:blank'
   await c.shot('update34-required.png')
 finally:
  import ctypes
  hwnd=ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]')
  if hwnd:ctypes.windll.user32.PostMessageW(hwnd,0x10,0,0)
  try:proc.wait(5)
  except subprocess.TimeoutExpired:proc.terminate();proc.wait(10)
  await asyncio.sleep(1)
 (V/'update34-ui.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False,indent=2))
try:asyncio.run(main())
finally:
 for p,data in backup.items():
  if data is None:p.unlink(missing_ok=True)
  else:p.write_bytes(data)
