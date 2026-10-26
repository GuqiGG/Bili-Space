"""Compare player box metrics with and without our page CSS at wide viewports."""
import asyncio, ctypes, json, pathlib, subprocess, urllib.request
from websockets.asyncio.client import connect

ROOT = pathlib.Path(__file__).resolve().parents[1]


class CDP:
    def __init__(self, ws):
        self.ws = ws
        self.seq = 0

    async def call(self, method, params=None):
        self.seq += 1
        n = self.seq
        await self.ws.send(json.dumps({'id': n, 'method': method, 'params': params or {}}))
        while True:
            m = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=40))
            if m.get('id') == n:
                if 'error' in m:
                    raise RuntimeError(m['error'])
                return m.get('result', {})

    async def js(self, exp):
        r = await self.call('Runtime.evaluate', {'expression': exp, 'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in r:
            raise RuntimeError(r['exceptionDetails'])
        return r.get('result', {}).get('value')


PROBE = r"""(()=>{
  const q=s=>document.querySelector(s);
  const r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height)}};
  const p=q('#bilibili-player'),c=q('.bpx-player-container'),w=q('.bpx-player-video-wrap'),v=q('.bpx-player-video-wrap video');
  const bar=q('.bpx-player-sending-bar'),t=q('.video-toolbar-container');
  const ps=getComputedStyle(p);
  return {w:innerWidth,player:r(p),container:r(c),wrap:r(w),video:r(v),bar:r(bar),toolbar:r(t),
    playerH:ps.height,playerBox:ps.boxSizing,wrapH:w?getComputedStyle(w).height:null,
    overlap:(bar&&t)?Math.round(t.getBoundingClientRect().top-bar.getBoundingClientRect().bottom):null};
})()"""


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
            await c.call('Page.enable')
            await c.call('Page.navigate', {'url': 'https://www.bilibili.com/'})
            for _ in range(60):
                await asyncio.sleep(1)
                if await c.js("Boolean(window.BiliSpace)"):
                    break
            await asyncio.sleep(2)
            href = await c.js("document.querySelector('.bili-video-card a[href*=\"/video/BV\"], a[href*=\"/video/BV\"]')?.href || ''")
            await c.call('Page.navigate', {'url': href.split('?')[0]})
            for _ in range(90):
                await asyncio.sleep(1)
                if await c.js("Boolean(document.querySelector('.video-toolbar-left'))"):
                    break
            await asyncio.sleep(3)
            for width in (1900, 1800, 1750, 1700):
                await c.call('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 950, 'deviceScaleFactor': 1, 'mobile': False})
                await asyncio.sleep(1.2)
                print('ours ', json.dumps(await c.js(PROBE)))
                await c.js("document.querySelector('#bili-space-style').disabled=true")
                await asyncio.sleep(.6)
                print('plain', json.dumps(await c.js(PROBE)))
                await c.js("document.querySelector('#bili-space-style').disabled=false")
                await asyncio.sleep(.6)
    finally:
        ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace', 'Bili-Space [test]'), 0x10, 0, 0)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait()


asyncio.run(main())
