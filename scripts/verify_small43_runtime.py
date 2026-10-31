"""Exercise the local preview in an isolated WebView2 profile; never write the user clipboard."""
import asyncio,ctypes,json,subprocess,urllib.request
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import CDP
R=Path(__file__).resolve().parents[1];V=R/'verification'
async def main():
 startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
 p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist',startupinfo=startup);result={}
 try:
  for _ in range(100):
   try:
    pages=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));page=next(x for x in pages if 'bili-space.local' in x.get('url',''));break
   except Exception:await asyncio.sleep(.2)
  async with connect(page['webSocketDebuggerUrl'],max_size=20*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable')
   for _ in range(80):
    if await c.js('Boolean(window.BiliSpace?.openSettings)'):break
    await asyncio.sleep(.2)
   await c.js("window.__s=document.querySelector('#bili-space-root').shadowRoot;BiliSpace.openSettings();__s.querySelector('#settings-query').value='声音 平衡';__s.querySelector('#settings-query').dispatchEvent(new Event('input',{bubbles:true}));")
   result['search']=await c.js("({count:__s.querySelectorAll('.settings-match').length,text:__s.querySelector('.settings-match').textContent,status:__s.querySelector('#settings-search-status').textContent})")
   assert result['search']['count']==1
   await c.shot('small43-settings-dark.png')
   await c.js("__s.querySelector('.settings-match').click()")
   result['focus']=await c.js("({id:__s.activeElement.id,on:__s.querySelector('#pref-soundBalance').checked})");assert result['focus']=={'id':'pref-soundBalance','on':True}
   await c.js("BiliSpace.update({theme:'light'});__s.querySelector('#settings-query').value='播放';__s.querySelector('#settings-query').dispatchEvent(new Event('input',{bubbles:true}));__s.querySelector('.dialog').style.width='560px'");await asyncio.sleep(.3)
   result['compact']=await c.js("(()=>{const d=__s.querySelector('.dialog'),a=__s.querySelector('aside'),l=__s.querySelector('#settings-matches');return {compact:d.dataset.compact,count:l.children.length,scroll:l.scrollHeight,height:l.clientHeight,dialog:d.getBoundingClientRect().toJSON(),aside:a.getBoundingClientRect().toJSON(),inside:d.getBoundingClientRect().bottom<=innerHeight+1};})()");assert result['compact']['compact']=='true' and result['compact']['inside'];assert result['compact']['height']<=result['compact']['dialog']['height']
   await c.shot('small43-settings-light-compact.png')
   result['runtime_exceptions']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown'];assert not result['runtime_exceptions'],result['runtime_exceptions']
 finally:
  user=ctypes.windll.user32;cb=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p)
  def close(hwnd,_):
   pid=ctypes.c_ulong();user.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
   if pid.value==p.pid:user.PostMessageW(hwnd,0x10,0,0)
   return True
  user.EnumWindows(cb(close),0);p.wait(timeout=15)
  (V/'small43-runtime.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=True))
asyncio.run(main())
