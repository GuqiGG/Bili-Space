"""Exercise the in-app 'enable one-click download' button against the real Bili23 config."""
import asyncio, base64, ctypes, json, os, pathlib, subprocess, time, urllib.request
from websockets.asyncio.client import connect

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = pathlib.Path(os.environ['APPDATA']) / 'Bili23 Downloader' / 'config.json'


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


async def main():
    subprocess.run(['taskkill', '/F', '/IM', 'Bili23.exe'], capture_output=True)
    time.sleep(1)
    saved = json.loads(CONFIG.read_text(encoding='utf-8'))
    token = saved.get('MCP', {}).get('mcp_token', '')
    saved.setdefault('MCP', {})['mcp_enabled'] = False
    saved['MCP']['mcp_token'] = ''
    CONFIG.write_text(json.dumps(saved, ensure_ascii=False, indent=4), encoding='utf-8')
    print('disabled for the probe')

    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    app = subprocess.Popen([str(ROOT / 'dist/Bili-Space.exe'), '--test'], cwd=ROOT / 'dist', startupinfo=startup)
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
            await asyncio.sleep(.8)
            print('status', await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('#downloader-status').textContent"))
            await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('#downloader-enable').click()")
            await asyncio.sleep(3)
            print('status', await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('#downloader-status').textContent"))
    finally:
        ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace', 'Bili-Space [test]'), 0x10, 0, 0)
        try:
            app.wait(timeout=5)
        except subprocess.TimeoutExpired:
            app.terminate()
            app.wait()
    await asyncio.sleep(4)
    data = json.loads(CONFIG.read_text(encoding='utf-8'))
    print('config MCP', {k: (v[:6] + '…' if k == 'mcp_token' and v else v) for k, v in data.get('MCP', {}).items()})
    print('Bili23 running', 'Bili23.exe' in subprocess.run(['tasklist', '/FI', 'IMAGENAME eq Bili23.exe'], capture_output=True, text=True, encoding='utf-8', errors='replace').stdout)
    subprocess.run(['taskkill', '/F', '/IM', 'Bili23.exe'], capture_output=True)
    time.sleep(2)
    data.setdefault('MCP', {})['mcp_enabled'] = True
    if not data['MCP'].get('mcp_token'):
        data['MCP']['mcp_token'] = token
    CONFIG.write_text(json.dumps(data, ensure_ascii=False, indent=4), encoding='utf-8')
    print('restored', data['MCP']['mcp_enabled'], len(data['MCP']['mcp_token']))


asyncio.run(main())
