"""End-to-end: click the video-page download button, let Bili23 queue the video into a temp folder."""
import asyncio, base64, ctypes, json, os, pathlib, shutil, subprocess, tempfile, time, urllib.request
from websockets.asyncio.client import connect

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification'
CONFIG = pathlib.Path(os.environ['APPDATA']) / 'Bili23 Downloader' / 'config.json'
TEMP = pathlib.Path(tempfile.gettempdir()) / 'bs-download-check'


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

    async def shot(self, name):
        data = await self.call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
        (OUT / name).write_bytes(base64.b64decode(data['data']))


def bili_running():
    out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq Bili23.exe'], capture_output=True, text=True, encoding='utf-8', errors='replace')
    return 'Bili23.exe' in out.stdout


async def main():
    if bili_running():
        print('Bili23 is running; stop it before this test')
        return 1
    original = json.loads(CONFIG.read_text(encoding='utf-8'))
    folder = original.get('Download', {}).get('download_path')
    shutil.rmtree(TEMP, ignore_errors=True)
    TEMP.mkdir(parents=True)
    original.setdefault('Download', {})
    original['Download']['download_path'] = str(TEMP)
    CONFIG.write_text(json.dumps(original, ensure_ascii=False, indent=4), encoding='utf-8')

    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    app = subprocess.Popen([str(ROOT / 'dist/Bili-Space.exe'), '--test'], cwd=ROOT / 'dist', startupinfo=startup)
    evidence = {'temp_folder': str(TEMP)}
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
            short = await c.js("""(()=>{
              for(const card of document.querySelectorAll('.bili-video-card a[href*="/video/BV"]')){
                const box=card.closest('.bili-video-card');
                const text=box?box.innerText:'';
                const dur=text.match(/(\\d{1,2}):(\\d{2})/);
                if(dur&&Number(dur[1])<4)return card.href;
              }
              return document.querySelector('a[href*="/video/BV"]')?.href||'';
            })()""")
            await c.call('Page.navigate', {'url': short.split('?')[0]})
            for _ in range(90):
                await asyncio.sleep(1)
                if await c.js("Boolean(document.querySelector('#bili-space-video-download'))"):
                    break
            await asyncio.sleep(3)
            evidence['video'] = await c.js('location.href')
            evidence['button_before'] = await c.js("(()=>{const b=document.querySelector('#bili-space-video-download');return {state:b.dataset.state||'',label:b.textContent.trim(),hidden:b.hidden}})()")
            await c.js("document.querySelector('#bili-space-video-download').click()")
            state = None
            for _ in range(70):
                await asyncio.sleep(2)
                state = await c.js("(()=>{const b=document.querySelector('#bili-space-video-download');const t=document.querySelector('#bili-space-root').shadowRoot.querySelector('#toast');return {state:b.dataset.state||'',label:b.textContent.trim(),toast:t.hidden?'':t.textContent}})()")
                if state['state'] in ('done', 'blocked'):
                    break
            evidence['button_after'] = state
            await c.shot('v0126-download-result.png')
        await asyncio.sleep(2)
        evidence['files'] = [p.name for p in TEMP.glob('*')][:10]
    finally:
        app.send_signal(ctypes.windll.kernel32.CTRL_BREAK_EVENT) if False else None
        ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace', 'Bili-Space [test]'), 0x10, 0, 0)
        try:
            app.wait(timeout=5)
        except subprocess.TimeoutExpired:
            app.terminate()
            app.wait()
        subprocess.run(['taskkill', '/IM', 'Bili23.exe', '/F'], capture_output=True)
        time.sleep(2)
        CONFIG.write_text(json.dumps(original | {'Download': {'download_path': folder}}, ensure_ascii=False, indent=4), encoding='utf-8')
        print(json.dumps(evidence, ensure_ascii=False, indent=1))
        (OUT / 'v0126-download.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=1), encoding='utf8')


asyncio.run(main())
