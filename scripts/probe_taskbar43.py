"""Probe only isolated app windows: standard taskbar commands, frame insets and PiP."""
import asyncio,ctypes,json,subprocess,time,urllib.request,sys
from ctypes import wintypes as W
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import CDP
R=Path(__file__).resolve().parents[1];V=R/'verification';phase=sys.argv[1];client=Path(sys.argv[2]).resolve()
u=ctypes.WinDLL('user32',use_last_error=True)
u.GetWindowLongW.argtypes=[W.HWND,ctypes.c_int];u.GetWindowLongW.restype=ctypes.c_long
u.SendMessageW.argtypes=[W.HWND,W.UINT,W.WPARAM,W.LPARAM];u.SendMessageW.restype=W.LPARAM
u.GetWindowRect.argtypes=[W.HWND,ctypes.POINTER(W.RECT)];u.GetClientRect.argtypes=[W.HWND,ctypes.POINTER(W.RECT)];u.ClientToScreen.argtypes=[W.HWND,ctypes.POINTER(W.POINT)];u.IsIconic.argtypes=[W.HWND];u.IsZoomed.argtypes=[W.HWND];u.IsWindowVisible.argtypes=[W.HWND]
def geometry(h):
 r=W.RECT();c=W.RECT();p=W.POINT();u.GetWindowRect(h,ctypes.byref(r));u.GetClientRect(h,ctypes.byref(c));u.ClientToScreen(h,ctypes.byref(p));return {'outer':[r.left,r.top,r.right-r.left,r.bottom-r.top],'client':[c.right,c.bottom],'topInset':p.y-r.top,'sideInset':p.x-r.left}
def state(h):
 s=u.GetWindowLongW(h,-16)&0xffffffff;return {'style':hex(s),'caption':s&0xc00000==0xc00000,'sysmenu':bool(s&0x80000),'popup':bool(s&0x80000000),'minimized':bool(u.IsIconic(h)),'maximized':bool(u.IsZoomed(h)),'visible':bool(u.IsWindowVisible(h)),**geometry(h)}
async def main():
 startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
 p=subprocess.Popen([str(client/'Bili-Space.exe'),'--test'],cwd=client,startupinfo=startup);h=None;result={}
 try:
  for _ in range(100):
   found=[];cb=ctypes.WINFUNCTYPE(W.BOOL,W.HWND,W.LPARAM)
   def find(hwnd,_):
    pid=W.DWORD();u.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
    if pid.value==p.pid:found.append(hwnd)
    return True
   u.EnumWindows(cb(find),0)
   try:
    pages=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));page=next(x for x in pages if 'bili-space.local' in x.get('url',''));h=found[0];break
   except Exception:await asyncio.sleep(.2)
  async with connect(page['webSocketDebuggerUrl'],max_size=20*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable')
   for _ in range(80):
    if await c.js('Boolean(window.BiliSpace?.openSettings)'):break
    await asyncio.sleep(.2)
   u.ShowWindow(h,5);await asyncio.sleep(.4)
   class Animation(ctypes.Structure):_fields_=[('cbSize',W.UINT),('iMinAnimate',ctypes.c_int)]
   ani=Animation(ctypes.sizeof(Animation),0);result['system_animation_query_ok']=bool(u.SystemParametersInfoW(0x48,ani.cbSize,ctypes.byref(ani),0));result['system_minimize_animation_enabled']=bool(ani.iMinAnimate)
   result['normal']=state(h);result['eligible_for_system_transition']=result['normal']['caption'] and result['normal']['sysmenu'] and not result['normal']['popup'];result['cycles']=[]
   for _ in range(3):
    start=time.perf_counter();u.SendMessageW(h,0x112,0xf020,0);minMs=(time.perf_counter()-start)*1000;await asyncio.sleep(.3);mini=bool(u.IsIconic(h));start=time.perf_counter();u.SendMessageW(h,0x112,0xf120,0);restoreMs=(time.perf_counter()-start)*1000;await asyncio.sleep(.3);restored=state(h);assert mini and not restored['minimized'] and restored['visible'];assert restored['outer']==result['normal']['outer'];result['cycles'].append({'minimizeMs':round(minMs,2),'restoreMs':round(restoreMs,2),'minimized':mini,'restored':restored})
   x,y,w,height=result['normal']['outer'];points=[(x+4,y+height//2,10),(x+w-5,y+height//2,11),(x+w//2,y+4,12),(x+w//2,y+height-5,15),(x+4,y+4,13),(x+w-5,y+4,14),(x+4,y+height-5,16),(x+w-5,y+height-5,17)]
   result['resize_hit_targets']=[u.SendMessageW(h,0x84,0,((py&65535)<<16)|(px&65535)) for px,py,_ in points];assert result['resize_hit_targets']==[expected for _,_,expected in points]
   u.SendMessageW(h,0x112,0xf030,0);await asyncio.sleep(.3);result['maximized']=state(h);assert result['maximized']['maximized']
   u.SendMessageW(h,0x112,0xf020,0);await asyncio.sleep(.3);u.SendMessageW(h,0x112,0xf120,0);await asyncio.sleep(.3);assert u.IsZoomed(h);result['maximized_restored']=state(h)
   u.SendMessageW(h,0x112,0xf120,0);await asyncio.sleep(.2)
   await c.js('BiliSpace.requestPip()');await asyncio.sleep(.3);result['pip']=state(h);assert not result['pip']['caption']
   await c.js('BiliSpace.requestPip()');await asyncio.sleep(.3);result['after_pip']=state(h)
   if phase=='MODIFIED':assert result['eligible_for_system_transition'] and result['after_pip']['caption'] and result['normal']['topInset']<=2
   else:assert not result['eligible_for_system_transition']
   await c.shot('taskbar43-'+phase+'-restored.png')
   result['runtime_exceptions']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown'];assert not result['runtime_exceptions']
 finally:
  if h:u.SendMessageW(h,0x10,0,0)
  p.wait(timeout=15)
  (V/('taskbar43-'+phase+'-native.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result))
asyncio.run(main())
