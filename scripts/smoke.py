"""Exercise the built C++/WebView2 app via its test-only localhost CDP port."""
import asyncio, base64, ctypes, hashlib, json, pathlib, subprocess, time, urllib.request
from websockets.asyncio.client import connect

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'verification'
observed={}
observed['artifact_sha256']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'dist/BetterBiliSpace.exe',*sorted((ROOT/'dist/assets').glob('*'))] if p.is_file()}

class CDP:
    def __init__(self, ws): self.ws=ws; self.seq=0; self.events=[]; self.intercept=None
    async def call(self,method,params=None):
        self.seq+=1; n=self.seq
        await self.ws.send(json.dumps({'id':n,'method':method,'params':params or {}}))
        while True:
            m=json.loads(await asyncio.wait_for(self.ws.recv(),timeout=20))
            if m.get('method')=='Fetch.requestPaused' and self.intercept:
                action=self.intercept(m['params'])
                if action:
                    self.seq+=1
                    await self.ws.send(json.dumps({'id':self.seq,**action}))
                continue
            if m.get('id')==n:
                if 'error' in m: raise RuntimeError(m['error'])
                return m.get('result',{})
            self.events.append(m)
    async def js(self,exp):
        r=await self.call('Runtime.evaluate',{'expression':exp,'returnByValue':True,'awaitPromise':True})
        if 'exceptionDetails' in r: raise RuntimeError(r['exceptionDetails'])
        return r.get('result',{}).get('value')
    async def shot(self,name):
        data=await self.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})
        (OUT/name).write_bytes(base64.b64decode(data['data']))

async def main():
    startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
    process=subprocess.Popen([str(ROOT/'dist/BetterBiliSpace.exe'),'--test'],cwd=ROOT/'dist',startupinfo=startup)
    observed['process_pid']=process.pid
    try:
        targets=None
        for _ in range(80):
            if process.poll() is not None: raise RuntimeError(f'App exited: {process.returncode}')
            try:
                targets=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1))
                targets=[t for t in targets if t.get('type')=='page' and 'bili-space.local' in t.get('url','')]
                if targets:break
            except Exception:pass
            await asyncio.sleep(.25)
        if not targets: raise RuntimeError('WebView2 test target did not start')
        async with connect(targets[0]['webSocketDebuggerUrl'],max_size=20*1024*1024) as ws:
            c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable')
            for _ in range(60):
                if await c.js('Boolean(window.BiliSpace)'):break
                await asyncio.sleep(.2)
            await asyncio.sleep(1)
            observed['initial']=await c.js('({state:BiliSpace.state,btr:document.documentElement.hasAttribute("data-btr-userscript"),font:document.fonts.check("16px BiliDouyin"),adDisplays:[...document.querySelectorAll(".recommended-swipe,.ad-report,.video-page-special-card-small,#ad-card")].map(e=>getComputedStyle(e).display),commentVisible:getComputedStyle(document.querySelector(".normal-comment")).display,toolBeforeQuality:document.querySelector(".bpx-player-ctrl-quality").previousElementSibling.className})')
            assert observed['initial']['btr'], 'BTR did not initialize'
            assert all(v=='none' for v in observed['initial']['adDisplays'])
            assert observed['initial']['commentVisible']!='none'
            await c.shot('home.png')
            await c.js('BiliSpace.openSettings()');await c.shot('settings.png')
            await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector("[data-tab=progress]").click()');await c.shot('progress.png')
            await c.js('BiliSpace.update({accent:"#5aaf9a",showChannels:false,progressHeight:8,progressColor:"#5aaf9a"})')
            await asyncio.sleep(.7)
            stored=json.loads((ROOT/'dist/.appdata/settings.json').read_text())
            assert stored['config']['accent']=='#5aaf9a' and stored['config']['showChannels'] is False
            observed['native_persistence']=stored['config']
            await c.js('BiliSpace.closeSettings(); BiliSpace.update({srMode:"quality",srScale:2})')
            await asyncio.sleep(2)
            observed['gpu']=await c.js('({...BiliSpace.state,canvas:{width:document.querySelector(".bs-gpu-canvas")?.width,height:document.querySelector(".bs-gpu-canvas")?.height},opacity:document.querySelector("video").style.opacity})')
            assert observed['gpu']['frames']>0 and observed['gpu']['canvas']=={'width':1280,'height':720}, observed['gpu']
            await c.js('document.querySelector(".bs-sr-toggle").click()');await c.shot('player.png')
            # Actual C++ event switches the existing HWND; no simulated-only PiP state.
            await c.js('BiliSpace.requestPip()');await asyncio.sleep(.8)
            user32=ctypes.windll.user32;hwnd=user32.FindWindowW('BetterBiliSpace','Better Bili Space [test]')
            observed['pip']=await c.js('({state:BiliSpace.state,width:innerWidth,height:innerHeight,bodyScroll:document.body.scrollHeight,video:document.querySelector("video").getBoundingClientRect().toJSON()})')
            observed['pip']['style']=user32.GetWindowLongW(hwnd,-16)&0xffffffff
            observed['pip']['topmost']=bool(user32.GetWindowLongW(hwnd,-20)&8)
            assert observed['pip']['state']['pip'] and observed['pip']['topmost']
            assert observed['pip']['style']&0x00c00000==0, 'Native title bar exists'
            assert await c.js('[...document.querySelectorAll("[id^=__bilibili_thread_ripper_]")].every(e=>getComputedStyle(e).display==="none")')
            await c.shot('pip.png')
            await c.js('chrome.webview.postMessage({type:"window",action:"pip"})');await asyncio.sleep(.5)
            assert await c.js('BiliSpace.state.pip') is False
            # Clean defaults again; real saved prefs must survive an actual reload.
            await c.js('BiliSpace.update({theme:"dark",accent:"#fb7299",progressColor:"#fb7299",progressHeight:4,showChannels:true,srMode:"off"})');await asyncio.sleep(.5)
            await c.call('Page.reload');await asyncio.sleep(.3)
            for _ in range(100):
                if await c.js('Boolean(window.BiliSpace)'):break
                await asyncio.sleep(.2)
            observed['after_reload']=await c.js('BiliSpace.state')
            assert observed['after_reload']['prefs']['srMode']=='off'
            # Renderer failure path: force context loss after rendering, original video returns.
            await c.js('BiliSpace.update({srMode:"performance",srScale:3})');await asyncio.sleep(1)
            observed['performance']=await c.js('BiliSpace.state')
            assert observed['performance']['frames']>0
            assert observed['performance']['prefs']['srMode']=='performance'
            assert '性能' in observed['performance']['status']
            await c.js('document.querySelector(".bs-gpu-canvas").getContext("webgl").getExtension("WEBGL_lose_context").loseContext()');await asyncio.sleep(.4)
            observed['context_loss']=await c.js('({state:BiliSpace.state,opacity:document.querySelector("video").style.opacity,canvas:!!document.querySelector(".bs-gpu-canvas")})')
            assert observed['context_loss']['canvas'] is False and observed['context_loss']['opacity']!='0'
            await c.js('BiliSpace.update({srMode:"off"})');await asyncio.sleep(.3)
            observed['runtime_exceptions']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown']
            assert not observed['runtime_exceptions'],observed['runtime_exceptions']
            # Real anonymous Bilibili load; no account mutations or fabricated playback claim.
            await c.call('Page.navigate',{'url':'https://www.bilibili.com/'})
            await asyncio.sleep(12)
            observed['live_home']=await c.js('({url:location.href,title:document.title,ready:!!window.BiliSpace,btr:document.documentElement.hasAttribute("data-btr-userscript"),cards:document.querySelectorAll(".bili-video-card").length,blockButtons:document.querySelector("[data-bilibili-blacklist-overlay-host]")?.shadowRoot.querySelectorAll(".bilibili-blacklist-btn").length||0,state:window.BiliSpace?.state,text:document.body.innerText.slice(0,300)})')
            assert observed['live_home']['ready'] and observed['live_home']['btr']
            assert observed['live_home']['blockButtons']>0, 'Home blocker buttons missing'
            await c.shot('live-home.png')
            observed['result']='PASS'
    finally:
        if process.poll() is None:
            ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace','Better Bili Space [test]'),0x10,0,0)
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.terminate();process.wait()
        observed['process_exit']=process.returncode
        (OUT/'smoke.json').write_text(json.dumps(observed,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(observed,ensure_ascii=True,indent=2))

if __name__=='__main__':asyncio.run(main())
