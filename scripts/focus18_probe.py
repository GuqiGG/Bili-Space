import asyncio,json,urllib.request,ctypes,sys
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
async def main():
 t=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list')) if t.get('type')=='page')
 async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
  c=CDP(ws)
  if '--prepare' in sys.argv:await c.js("BiliSpace.closeSettings();document.body.tabIndex=-1;document.body.focus();window.__focusKeys=[];document.addEventListener('keydown',e=>__focusKeys.push({key:e.key,ctrl:e.ctrlKey,target:e.composedPath()[0]?.tagName}));true")
  r=await c.js("(()=>{const root=document.querySelector('#bili-space-root'),s=root.shadowRoot;return {documentFocus:document.hasFocus(),activeElement:document.activeElement?.tagName,shadowActive:s.activeElement?.className,settingsOpen:!s.querySelector('#settings').hidden,keys:window.__focusKeys||[],search:s.querySelector('.search input').value};})()")
  u=ctypes.windll.user32;u.GetForegroundWindow.restype=ctypes.c_void_p;u.FindWindowW.restype=ctypes.c_void_p
  class GUI(ctypes.Structure):_fields_=[('cbSize',ctypes.c_ulong),('flags',ctypes.c_ulong),('hwndActive',ctypes.c_void_p),('hwndFocus',ctypes.c_void_p),('hwndCapture',ctypes.c_void_p),('hwndMenuOwner',ctypes.c_void_p),('hwndMoveSize',ctypes.c_void_p),('hwndCaret',ctypes.c_void_p),('rect',ctypes.c_long*4)]
  info=GUI();info.cbSize=ctypes.sizeof(info);u.GetGUIThreadInfo(0,ctypes.byref(info));r['native']={'foreground':u.GetForegroundWindow(),'active':info.hwndActive,'focus':info.hwndFocus,'root':u.FindWindowW('BetterBiliSpace','Bili-Space [test]')}
  print(json.dumps(r,ensure_ascii=True))
  if len(sys.argv)>1 and not sys.argv[-1].startswith('--'):(Path('verification')/sys.argv[-1]).write_text(json.dumps(r,indent=2),encoding='utf8')
asyncio.run(main())
