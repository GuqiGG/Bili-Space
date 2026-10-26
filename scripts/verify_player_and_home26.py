"""Verify the video-page header and the toolbar alignment in the built client (CDP on 9223)."""
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

    async def shot(self, name, clip=None):
        params = {'format': 'png', 'captureBeyondViewport': False}
        if clip:
            params['clip'] = dict(clip, scale=1)
        data = await self.call('Page.captureScreenshot', params)
        (OUT / name).write_bytes(base64.b64decode(data['data']))


HEADER = r"""(()=>{
  const s=document.querySelector('#bili-space-root').shadowRoot;
  const r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.left),w:Math.round(b.width)}};
  const left=s.querySelector('.header-left'),home=s.querySelector('.video-home-top'),nav=s.querySelector('.primary-nav'),back=s.querySelector('.back');
  return {controls:left.dataset.controls,video:left.dataset.video,homeHidden:home.hidden,homeDisplay:getComputedStyle(home).display,
    home:r(home),back:r(back),nav:r(nav),navFirst:nav.querySelector('a[data-route=home]')?getComputedStyle(nav.querySelector('a[data-route=home]')).display:null,
    gapIconText:getComputedStyle(home).gap,orderBack:getComputedStyle(back).order};
})()"""

ALIGN = r"""(()=>{
  const bar=document.querySelector('.bpx-player-sending-area'),toolbar=document.querySelector('.video-toolbar-container');
  if(!bar||!toolbar)return null;
  return {barBottom:Math.round(bar.getBoundingClientRect().bottom),toolbarTop:Math.round(toolbar.getBoundingClientRect().top),
    gap:Math.round(toolbar.getBoundingClientRect().top-bar.getBoundingClientRect().bottom),
    margin:toolbar.style.getPropertyValue('margin-top')};
})()"""


async def main():
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    process = subprocess.Popen([str(ROOT / 'dist/Bili-Space.exe'), '--test'], cwd=ROOT / 'dist', startupinfo=startup)
    evidence = {}
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
                if await c.js("Boolean(document.querySelector('.video-toolbar-container'))"):
                    break
            await c.call('Emulation.setDeviceMetricsOverride', {'width': 1500, 'height': 950, 'deviceScaleFactor': 1, 'mobile': False})
            await asyncio.sleep(4)
            evidence['url'] = href
            evidence['align'] = await c.js(ALIGN)
            await c.js('BiliSpace.update({trafficLights:false})')
            await asyncio.sleep(.8)
            evidence['windows_header'] = await c.js(HEADER)
            await c.shot('v0126-header-windows.png', {'x': 0, 'y': 0, 'width': 1200, 'height': 58})
            await c.js('BiliSpace.update({trafficLights:true})')
            await asyncio.sleep(.8)
            evidence['traffic_header'] = await c.js(HEADER)
            await c.shot('v0126-header-traffic.png', {'x': 0, 'y': 0, 'width': 1200, 'height': 58})
            evidence['download_button'] = await c.js("""(()=>{const b=document.querySelector('#bili-space-video-download');if(!b)return null;const r=b.getBoundingClientRect();return {text:b.textContent.trim(),hidden:b.hidden,x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}})()""")
            bar = await c.js("(()=>{const b=document.querySelector('#bili-space-video-download');if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.max(0,r.left-20),y:Math.max(0,r.top-16),width:520,height:Math.round(r.height+32)}})()")
            if bar:
                await c.shot('v0126-download-button.png', bar)
            evidence['downloader_state'] = await c.js("(()=>new Promise(resolve=>{BiliSpace.downloaderStatus=s=>resolve(s);chrome.webview.postMessage({type:'downloader',action:'status'});setTimeout(()=>resolve('timeout'),4000)}))()")
            await c.shot('v0126-video-page.png')
            (OUT / 'v0126-evidence.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=1), encoding='utf8')
            print(json.dumps(evidence, ensure_ascii=False, indent=1))
    finally:
        ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace', 'Bili-Space [test]'), 0x10, 0, 0)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait()


asyncio.run(main())
