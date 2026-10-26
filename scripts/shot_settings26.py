"""Screenshot the downloader section in the settings dialog (test build, CDP on 9223)."""
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

    async def shot(self, name):
        data = await self.call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
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
            await c.js("BiliSpace.openSettings();document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-tab=plugins]').click()")
            await asyncio.sleep(1)
            text = await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('#tab-content').innerText")
            print(text[-420:])
            await c.shot('v0126-settings-downloader.png')
    finally:
        ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace', 'Bili-Space [test]'), 0x10, 0, 0)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait()


asyncio.run(main())
