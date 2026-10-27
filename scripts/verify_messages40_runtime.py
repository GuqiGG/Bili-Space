"""Render system/count badges in an isolated native WebView2 profile using fixtures."""
import asyncio,base64,ctypes,json,subprocess,urllib.request
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import CDP
R=Path(__file__).resolve().parents[1];V=R/'verification'
async def main():
 config=R/'dist/.appdata/settings.json';saved=config.read_bytes() if config.exists() else None
 process=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist');result={}
 try:
  for _ in range(100):
   try:
    pages=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));target=next(p for p in pages if 'bili-space.local' in p.get('url',''));break
   except Exception:await asyncio.sleep(.2)
  async with connect(target['webSocketDebuggerUrl'],max_size=20*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable')
   for _ in range(100):
    if await c.js('Boolean(window.BiliSpace?.refreshMessageUnread)'):break
    await asyncio.sleep(.2)
   await c.js("window.__unreadFixture={feed:{sys_msg:3},direct:{}};window.fetch=async u=>({ok:true,json:async()=>({code:0,data:String(u).includes('unread')?(String(u).includes('single_unread')?__unreadFixture.direct:__unreadFixture.feed):{isLogin:true,mid:1234,uname:'Fixture account',face:'https://i0.hdslb.com/bfs/face/fixture.png'}})});BiliSpace.update({headerMessages:true,theme:'dark'});")
   for _ in range(60):
    await c.js('BiliSpace.refreshAccount(true)');await asyncio.sleep(.15)
    if await c.js("(()=>{const b=document.querySelector('#bili-space-root').shadowRoot.querySelector('.message-unread');return !b.hidden&&b.dataset.kind==='dot'})()"):break
   read="(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,b=s.querySelector('.message-unread'),l=s.querySelector('.messages');return {hidden:b.hidden,kind:b.dataset.kind,text:b.textContent,title:l.title,link:l.href,badge:b.getBoundingClientRect().toJSON(),icon:l.getBoundingClientRect().toJSON(),color:getComputedStyle(b).backgroundColor};})()"
   result['system']=await c.js(read);assert not result['system']['hidden'] and result['system']['kind']=='dot'
   await c.shot('messages40-system-native.png')
   await c.js("__unreadFixture={feed:{like:2,reply:3,sys_msg:1},direct:{follow_unread:4}};BiliSpace.update({theme:'light'});BiliSpace.refreshMessageUnread(true)");await asyncio.sleep(.2)
   result['numeric']=await c.js(read);assert result['numeric']['text']=='9' and result['numeric']['badge']['height']>=16
   assert result['numeric']['badge']['width']<40
   await c.shot('messages40-count-native.png')
   await c.js('__unreadFixture={feed:{},direct:{}};BiliSpace.refreshMessageUnread(true)');await asyncio.sleep(.15)
   result['read']=await c.js(read);assert result['read']['hidden']
   result['runtime_exceptions']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown'];assert not result['runtime_exceptions']
 finally:
  user=ctypes.windll.user32;callback=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p)
  def close(hwnd,_):
   pid=ctypes.c_ulong();user.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
   if pid.value==process.pid:user.PostMessageW(hwnd,0x10,0,0)
   return True
  user.EnumWindows(callback(close),0);process.wait(timeout=15)
  if saved is not None:config.write_bytes(saved)
  (V/'message40-runtime.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=True))
asyncio.run(main())
