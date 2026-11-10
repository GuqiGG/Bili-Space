"""Use real pointer/focus and native account actions with synthetic cookies in an isolated profile."""
import asyncio,ctypes,json,shutil,subprocess,tempfile,urllib.request
from ctypes import wintypes
from pathlib import Path
from websockets.asyncio.client import connect
from verify_login50_runtime import Session
from smoke import ROOT

async def main():
    stage=Path(tempfile.mkdtemp(prefix='ui51-',dir=ROOT/'verification'))
    for name in ['Bili-Space.exe','WebView2Loader.dll']:shutil.copy2(ROOT/'dist'/name,stage/name)
    shutil.copytree(ROOT/'dist/assets',stage/'assets')
    si=subprocess.STARTUPINFO();si.dwFlags|=subprocess.STARTF_USESHOWWINDOW;si.wShowWindow=0
    process=subprocess.Popen([str(stage/'Bili-Space.exe'),'--test'],cwd=stage,startupinfo=si)
    try:
        for _ in range(120):
            try:t=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if 'bili-space.local' in t.get('url',''));break
            except (OSError,StopIteration):await asyncio.sleep(.2)
        async with connect(t['webSocketDebuggerUrl'],max_size=25*1024*1024) as ws:
            c=Session(ws)
            async def until(code):
                for _ in range(100):
                    if await c.js(code):return
                    await asyncio.sleep(.1)
                print(await c.js("({events:window.accountEvents,profile:document.querySelector('#bili-space-root').shadowRoot.querySelector('.account-name').textContent,syntheticUid:window.syntheticUid})"));print((stage/'.appdata/runtime.log').read_text(encoding='utf-8')[-1800:]);raise AssertionError(code)
            await until('!!window.BiliSpace')
            u=ctypes.windll.user32;handles=[]
            callback_type=ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)
            u.GetWindowThreadProcessId.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.DWORD)]
            u.GetClassNameW.argtypes=[wintypes.HWND,wintypes.LPWSTR,ctypes.c_int]
            @callback_type
            def enum(hwnd,_):
                pid=wintypes.DWORD();name=ctypes.create_unicode_buffer(128);u.GetWindowThreadProcessId(hwnd,ctypes.byref(pid));u.GetClassNameW(hwnd,name,128)
                if pid.value==process.pid and name.value=='BetterBiliSpace':handles.append(hwnd)
                return True
            u.EnumWindows(enum,0);assert handles
            rect=wintypes.RECT();point=wintypes.POINT(0,0)
            u.GetWindowRect.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.RECT)];u.ClientToScreen.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.POINT)]
            u.GetWindowRect(handles[0],ctypes.byref(rect));u.ClientToScreen(handles[0],ctypes.byref(point));top_gap=point.y-rect.top;assert top_gap==0,top_gap
            await c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':940,'deviceScaleFactor':1,'mobile':False})
            await c.js("window.accountEvents=[];const accept=BiliSpace.acceptAccountState;BiliSpace.acceptAccountState=x=>{accountEvents.push(x);accept(x)};window.fetch=async url=>({ok:true,json:async()=>String(url).includes('/x/web-interface/nav')&&!String(url).includes('/stat')?{code:0,data:{isLogin:!!window.syntheticUid,mid:window.syntheticUid,uname:'Synthetic account',face:''}}:{code:-101,data:{}}});BiliSpace.update({experimentalFrost:true,theme:'dark'})")
            # Only the isolated test profile receives these artificial cookies.
            for uid in ['906001','906002']:
                await c.call('Network.setCookie',{'name':'DedeUserID','value':uid,'domain':'.bilibili.com','path':'/','secure':True})
                await c.call('Network.setCookie',{'name':'SESSDATA','value':'synthetic-ui51-not-a-real-session','domain':'.bilibili.com','path':'/','secure':True,'httpOnly':True})
                await c.js("window.syntheticUid="+json.dumps(uid)+";BiliSpace.refreshAccount(true)")
                await until("(BiliSpace.refreshAccount(true),accountEvents.some(x=>x.event==='saved'&&x.active==='"+uid+"'))")
            await c.js('BiliSpace.showAccountCard(false)')
            async def click(selector):
                pos=await c.js("(()=>{const e=document.querySelector('#bili-space-root').shadowRoot.querySelector("+json.dumps(selector)+"),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
                await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved',**pos})
                await c.call('Input.dispatchMouseEvent',{'type':'mousePressed','button':'left','clickCount':1,**pos})
                await c.call('Input.dispatchMouseEvent',{'type':'mouseReleased','button':'left','clickCount':1,**pos})
            await click('.account-switch')
            await until("!document.querySelector('#bili-space-root').shadowRoot.querySelector('.account-manager').hidden")
            layout=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,b=s.querySelector('.account-switch').getBoundingClientRect(),n=s.querySelector('.account-name').getBoundingClientRect(),v=s.querySelector('.account-switch svg').getBoundingClientRect(),f=getComputedStyle(s.querySelector('.account-add'));return {nameOffset:Math.abs(b.y+b.height/2-n.y-n.height/2),svgX:Math.abs(b.x+b.width/2-v.x-v.width/2),svgY:Math.abs(b.y+b.height/2-v.y-v.height/2),buttonBlur:f.backdropFilter,buttonBackground:f.backgroundColor,fadeBottom:getComputedStyle(s.querySelector('#chrome'),'::before').bottom}})()")
            assert layout['nameOffset']<1 and layout['svgX']<.1 and layout['svgY']<.1,layout
            assert 'blur(' in layout['buttonBlur'] and layout['fadeBottom']=='0px',layout
            await c.shot('ui51-accounts-dark.png')
            await click('.account-row')
            await until("typeof window.syntheticUid==='undefined'&&!!window.BiliSpace")
            cookies=await c.call('Network.getCookies',{'urls':['https://www.bilibili.com/']})
            assert next(x['value'] for x in cookies['cookies'] if x['name']=='DedeUserID')=='906001'
            # A second pointer-driven action opens login rather than losing its click on focus.
            await c.js("window.accountEvents=[];const f=BiliSpace.acceptAccountState;BiliSpace.acceptAccountState=x=>{accountEvents.push(x);f(x)};BiliSpace.showAccountCard(false)")
            await click('.account-switch');await click('.account-add')
            await until("accountEvents.some(x=>x.event==='login')")
            cookies=await c.call('Network.getCookies',{'urls':['https://www.bilibili.com/']})
            assert not any(x['name']=='DedeUserID' for x in cookies['cookies'])
            await c.js("BiliSpace.closeLoginPanel();window.syntheticUid='906001';window.fetch=async()=>({ok:true,json:async()=>({code:0,data:{isLogin:true,mid:'906001',uname:'Synthetic account',face:''}})})")
            await c.call('Network.setCookie',{'name':'DedeUserID','value':'906001','domain':'.bilibili.com','path':'/','secure':True})
            await until("(BiliSpace.refreshAccount(true),document.querySelector('#bili-space-root').shadowRoot.querySelector('.account-name').textContent==='Synthetic account')")
            await until("accountEvents.some(x=>x.event==='saved'&&x.active==='906001')")
            await c.js("BiliSpace.showAccountCard(false);const s=document.querySelector('#bili-space-root').shadowRoot;if(s.querySelector('.account-manager').hidden)s.querySelector('.account-switch').click()")
            await click('.account-logout');await until("typeof window.syntheticUid==='undefined'&&!!window.BiliSpace")
            cookies=await c.call('Network.getCookies',{'urls':['https://www.bilibili.com/']})
            assert not any(x['name']=='DedeUserID' for x in cookies['cookies'])
            result={'isolatedProfile':True,'nativeTopFrameGap':top_gap,'pointerSwitch':True,'nativeCookieSwitch':True,'pointerAdd':True,'pointerLogout':True,'nativeCookieClear':True,'layout':layout}
            (ROOT/'verification/ui51-runtime.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
    finally:process.terminate();process.wait()

if __name__=='__main__':asyncio.run(main())
