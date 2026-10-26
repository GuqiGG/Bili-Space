"""Header video-home inspection (test build, CDP on 9223)."""
import asyncio, base64, ctypes, json, pathlib, subprocess, urllib.request
from websockets.asyncio.client import connect

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification'


class CDP:
    def __init__(self, ws):
        self.ws = ws
        self.seq = 0

    async def call(self, method, params=None):
        self.seq += 1
        n = self.seq
        await self.ws.send(json.dumps({'id': n, 'method': method, 'params': params or {}}))
        while True:
            m = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=30))
            if m.get('id') == n:
                if 'error' in m:
                    raise RuntimeError(m['error'])
                return m.get('result', {})

    async def js(self, exp):
        r = await self.call('Runtime.evaluate', {'expression': exp, 'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in r:
            raise RuntimeError(r['exceptionDetails'])
        return r.get('result', {}).get('value')

    async def shot(self, name, clip=None):
        params = {'format': 'png', 'captureBeyondViewport': False}
        if clip:
            params['clip'] = dict(clip, scale=1)
        data = await self.call('Page.captureScreenshot', params)
        (OUT / name).write_bytes(base64.b64decode(data['data']))


async def main():
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    process = subprocess.Popen([str(ROOT / 'dist/Bili-Space.exe'), '--test'], cwd=ROOT / 'dist', startupinfo=startup)
    try:
        targets = None
        for _ in range(80):
            try:
                targets = json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list', timeout=1))
                targets = [t for t in targets if t.get('type') == 'page' and 'bili-space.local' in t.get('url', '')]
                if targets:
                    break
            except Exception:
                pass
            await asyncio.sleep(.25)
        async with connect(targets[0]['webSocketDebuggerUrl'], max_size=20 * 1024 * 1024) as ws:
            c = CDP(ws)
            await c.call('Runtime.enable')
            for _ in range(60):
                if await c.js('Boolean(window.BiliSpace)'):
                    break
                await asyncio.sleep(.2)
            await asyncio.sleep(1)
            # Pretend to be a video page.
            await c.js("history.pushState({},'', '/video/BV1xx411c7mD');BiliSpace.syncRoute?.();")
            await asyncio.sleep(.6)
            for lights in (True, False):
                await c.js(f'BiliSpace.update({{trafficLights:{str(lights).lower()}}})')
                await asyncio.sleep(.8)
                state = await c.js("""(()=>{const s=document.querySelector('#bili-space-root').shadowRoot;const h=s.querySelector('.header-left');const home=s.querySelector('.video-home-top');const nav=s.querySelector('.primary-nav');const back=s.querySelector('.back');const r=e=>{const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]};return {controls:h.dataset.controls,video:h.dataset.video,homeHidden:home.hidden,homeDisplay:getComputedStyle(home).display,homeRect:r(home),homeGap:getComputedStyle(home).gap,navRect:r(nav),backRect:r(back),navLeft:getComputedStyle(nav).marginLeft}})()""")
                print(json.dumps(state, ensure_ascii=False))
                await c.shot(f'header26-{"lights" if lights else "windows"}.png', {'x': 0, 'y': 0, 'width': 900, 'height': 56})
    finally:
        ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace', 'Bili-Space [test]'), 0x10, 0, 0)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait()


asyncio.run(main())
