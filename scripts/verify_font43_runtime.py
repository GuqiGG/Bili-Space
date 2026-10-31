"""Verify bundled font across origins with local fonts disabled and external requests blocked."""
import asyncio,base64,ctypes,json,subprocess,time,urllib.request
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import CDP
R=Path(__file__).resolve().parents[1];V=R/'verification';CLIENT=R/'.tools/font43-client'
async def main():
 startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
 p=subprocess.Popen([str(CLIENT/'Bili-Space.exe'),'--test'],cwd=CLIENT,startupinfo=startup);result={}
 try:
  for _ in range(100):
   try:
    pages=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));page=next(x for x in pages if 'bili-space.local' in x.get('url',''));break
   except Exception:await asyncio.sleep(.2)
  async with connect(page['webSocketDebuggerUrl'],max_size=25*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable');await c.call('Network.enable');await c.call('DOM.enable');await c.call('CSS.enable');await c.call('CSS.setLocalFontsEnabled',{'enabled':False});result['local_fonts_disabled']=True
   fixture=(R/'assets/fixture.html').read_bytes()
   def intercept(q):
    u=q['request']['url'];id=q['requestId']
    if q['resourceType']=='Document' and u.startswith('https://www.bilibili.com/video/'):
     return {'method':'Fetch.fulfillRequest','params':{'requestId':id,'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode(fixture).decode()}}
    if u.startswith('https://bili-space.local/') or u.startswith(('data:','blob:')):return {'method':'Fetch.continueRequest','params':{'requestId':id}}
    return {'method':'Fetch.failRequest','params':{'requestId':id,'errorReason':'BlockedByClient'}}
   c.intercept=intercept;await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*'}]});await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV1cjHK6GEJE'})
   for _ in range(100):
    try:
     if await c.js("location.hostname==='www.bilibili.com'&&Boolean(window.BiliSpace?.openSettings)"):break
    except RuntimeError:pass
    await asyncio.sleep(.15)
   await c.call('CSS.setLocalFontsEnabled',{'enabled':False})
   result['font']=await c.js("(async()=>{const p=new FontFace('BiliBundledProbe','url(https://bili-space.local/fonts/DouyinSansBold.ttf?probe='+Date.now()+')');await p.load();document.fonts.add(p);const faces=await document.fonts.load('16px BiliDouyin','抖音美好体');return {probe:p.status,faces:faces.map(f=>({family:f.family,status:f.status})),check:document.fonts.check('16px BiliDouyin','抖音美好体'),origin:location.origin};})()")
   assert result['font']['probe']=='loaded' and result['font']['check'] and result['font']['faces']
   await c.js("window.__s=document.querySelector('#bili-space-root').shadowRoot;BiliSpace.update({theme:'light',accent:'#456789'});BiliSpace.openSettings();__s.querySelector('#reset').focus();__s.querySelector('#reset').click()")
   result['pending']=await c.js("({dialog:!!__s.querySelector('#reset-confirm'),focus:__s.activeElement.id,accent:BiliSpace.state.prefs.accent})");assert result['pending']=={'dialog':True,'focus':'reset-confirm-cancel','accent':'#456789'}
   await c.shot('font43-reset-light.png');await c.js("__s.querySelector('#reset-confirm-cancel').click()");result['cancelled']=await c.js("({dialog:!!__s.querySelector('#reset-confirm'),focus:__s.activeElement.id,accent:BiliSpace.state.prefs.accent})");assert result['cancelled']=={'dialog':False,'focus':'reset','accent':'#456789'}
   await c.js("BiliSpace.update({theme:'dark'});__s.querySelector('#reset').click()");await c.shot('font43-reset-dark.png');await c.js("__s.querySelector('#reset-confirm-apply').click()");result['confirmed']=await c.js("({dialog:!!__s.querySelector('#reset-confirm'),accent:BiliSpace.state.prefs.accent,font:BiliSpace.state.prefs.font})");assert result['confirmed']=={'dialog':False,'accent':'#fb7299','font':True}
   result['font_responses']=[e['params']['response']['url'] for e in c.events if e.get('method')=='Network.responseReceived' and e['params'].get('type')=='Font' and '/fonts/DouyinSansBold.ttf' in e['params']['response']['url']];assert result['font_responses']
   result['runtime_exceptions']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown'];assert not result['runtime_exceptions'],result['runtime_exceptions']
 finally:
  u=ctypes.windll.user32;cb=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p)
  def close(h,_):
   pid=ctypes.c_ulong();u.GetWindowThreadProcessId(h,ctypes.byref(pid))
   if pid.value==p.pid:u.PostMessageW(h,0x10,0,0)
   return True
  u.EnumWindows(cb(close),0);p.wait(timeout=15);(V/'font43-runtime.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=True))
asyncio.run(main())
