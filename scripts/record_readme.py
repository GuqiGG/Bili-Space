"""Records the animated README showcase from a running `Bili-Space.exe --test` window on the home page.

Only CDP inside the test window is used (no desktop input). Use a clean, logged-out profile and a 1440x960 window.
  python scripts/record_readme.py            -> docs/images/showcase.webp (+ home.png / settings.png stills)
  python scripts/record_readme.py features   -> download.webp, customize.webp, pip.webp (needs a video page open, and
                                                BILI_SPACE_TEST_DOWNLOAD_DIR set when the test window started)
Both layers (header view and page view) are screencast together and composited, then every frame is laid out with
docs/design/showcase.html in headless Edge, so the animation keeps exactly the static showcase's composition.
"""
import asyncio, base64, io, json, os, subprocess, sys, tempfile, urllib.request, shutil
from pathlib import Path
from websockets.asyncio.client import connect
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FPS = 12
SIZE = (1440, 960)
S = "document.getElementById('bili-space-root').shadowRoot"


class Tab:
    """A CDP session with a reader task, so two views can be screencast at the same time."""
    def __init__(self, url): self.url, self.n, self.wait, self.frames = url, 0, {}, []
    async def __aenter__(self):
        self.ws = await connect(self.url, max_size=None); self.reader = asyncio.create_task(self.read()); return self
    async def __aexit__(self, *a): self.reader.cancel(); await self.ws.close()
    async def read(self):
        async for raw in self.ws:
            v = json.loads(raw)
            if 'id' in v and v['id'] in self.wait: self.wait.pop(v['id']).set_result(v.get('result', {}))
            elif v.get('method') == 'Page.screencastFrame':
                p = v['params']; self.frames.append((p['metadata']['timestamp'], p['data']))
                await self.ws.send(json.dumps({'id': 0, 'method': 'Page.screencastFrameAck', 'params': {'sessionId': p['sessionId']}}))
    async def call(self, method, params=None):
        self.n += 1; f = asyncio.get_running_loop().create_future(); self.wait[self.n] = f
        await self.ws.send(json.dumps({'id': self.n, 'method': method, 'params': params or {}})); return await f
    async def js(self, code):
        r = await self.call('Runtime.evaluate', {'expression': code, 'returnByValue': True, 'awaitPromise': True})
        return r.get('result', {}).get('value')
    async def move(self, x, y): await self.call('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y})
    async def click(self, x, y):
        for t in ('mousePressed', 'mouseReleased'): await self.call('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})


def targets():
    return [t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list')) if t['type'] == 'page']


async def record(head, page, actions):
    """Screencast both layers while the actions run; returns window frames resampled to FPS."""
    head.frames, page.frames = [], []
    await head.call('Page.startScreencast', {'format': 'png', 'everyNthFrame': 1})
    await page.call('Page.startScreencast', {'format': 'jpeg', 'quality': 92, 'everyNthFrame': 1})
    await asyncio.sleep(.5)
    for act in actions:
        if isinstance(act, (int, float)): await asyncio.sleep(act)
        else: await act()
    await asyncio.sleep(.3)
    await head.call('Page.stopScreencast'); await page.call('Page.stopScreencast')
    hf, pf = sorted(head.frames), sorted(page.frames)
    # A layer only sends frames when it changes, so the clip runs until the later of the two stops.
    start, end = max(hf[0][0], pf[0][0]), max(hf[-1][0], pf[-1][0])
    out, t, i, j, cache = [], start, 0, 0, None
    while t <= end:
        while i + 1 < len(hf) and hf[i + 1][0] <= t: i += 1
        while j + 1 < len(pf) and pf[j + 1][0] <= t: j += 1
        if not cache or cache[0] != (i, j):
            base = Image.open(io.BytesIO(base64.b64decode(pf[j][1]))).convert('RGBA')
            layer = Image.open(io.BytesIO(base64.b64decode(hf[i][1]))).convert('RGBA').resize(base.size)
            base.alpha_composite(layer); cache = ((i, j), base.convert('RGB').resize(SIZE, Image.LANCZOS))
        out.append(cache[1]); t += 1 / FPS
    return out


async def clips():
    head_url = next(t for t in targets() if '__bili_space_chrome__' in t['url'])['webSocketDebuggerUrl']
    page_url = next(t for t in targets() if '__bili_space_chrome__' not in t['url'] and 'bilibili.com' in t['url'])['webSocketDebuggerUrl']
    async with Tab(head_url) as head, Tab(page_url) as page:
        await head.call('Emulation.setDefaultBackgroundColorOverride', {'color': {'r': 0, 'g': 0, 'b': 0, 'a': 0}})
        await head.js('BiliSpace.closeSettings?.();1'); await page.js('scrollTo(0,0);1'); await asyncio.sleep(1.2)
        rect = lambda tab, sel: tab.js("(()=>{const e=%s;if(!e)return null;const r=e.getBoundingClientRect();return [(r.left+r.right)/2,(r.top+r.bottom)/2]})()" % sel)
        search = await rect(head, S + ".querySelector('.search input')")
        clock = await rect(head, S + ".querySelector('.watchlater')")
        toggle = await rect(head, S + ".querySelector('.back')")
        cards = [await rect(page, "document.querySelectorAll('.bili-video-card')[%d]" % k) for k in (1, 2, 6)]
        away = lambda: head.move(search[0], 700)
        go = lambda tab, p: (lambda: tab.move(*p))
        press = lambda tab, p: (lambda: tab.click(*p))
        home = await record(head, page, [away, .5, go(head, search), 2.2, go(head, clock), 1.8, away,
                                         go(page, cards[0]), 1.2, go(page, cards[1]), 1.2, go(page, cards[2]), 1.0, lambda: page.move(5, 700),
                                         press(head, toggle), 1.9, press(head, toggle), 1.2])
        # Settings: walk through its pages.
        await head.js('BiliSpace.openSettings();1'); await asyncio.sleep(1.2)
        count = await head.js(S + ".querySelectorAll('[data-tab]').length")
        steps = [.8]
        for k in (1, 2, 3, 4, 5, 6, 0):
            if k < count: steps += [(lambda k=k: head.js(S + ".querySelectorAll('[data-tab]')[%d].click();1" % k)), 1.2]
        settings = await record(head, page, steps)
        await head.js('BiliSpace.closeSettings?.();1')
        await head.call('Emulation.setDefaultBackgroundColorOverride', {})
    return home, settings


async def render(home, settings, out):
    """Lays out each frame with docs/design/showcase.html in headless Edge (transparent background)."""
    edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    profile = tempfile.mkdtemp(prefix='bili-space-showcase-')
    proc = subprocess.Popen([edge, '--headless=new', '--remote-debugging-port=9333', '--user-data-dir=' + profile, '--hide-scrollbars', 'about:blank'])
    try:
        for _ in range(100):
            try: t = next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9333/json/list', timeout=.5)) if x['type'] == 'page'); break
            except Exception: await asyncio.sleep(.1)
        async with Tab(t['webSocketDebuggerUrl']) as b:
            await b.call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 960, 'deviceScaleFactor': 1, 'mobile': False})
            await b.call('Emulation.setDefaultBackgroundColorOverride', {'color': {'r': 0, 'g': 0, 'b': 0, 'a': 0}})
            html = (ROOT / 'docs/design/showcase.html').read_text(encoding='utf8')
            html = html.replace('src="../images/home.png"', 'id="home"').replace('src="../images/settings.png"', 'id="settings"')
            tree = await b.call('Page.getFrameTree'); await b.call('Page.setDocumentContent', {'frameId': tree['frameTree']['frame']['id'], 'html': html})
            frames = []
            for k in range(len(home)):
                urls = []
                for img in (home[k], settings[k % len(settings)]):
                    buf = io.BytesIO(); img.save(buf, 'JPEG', quality=90); urls.append('data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode())
                await b.js("Promise.all([['home',%s],['settings',%s]].map(([id,u])=>{const i=document.getElementById(id);i.src=u;return i.decode()})).then(()=>1)" % (json.dumps(urls[0]), json.dumps(urls[1])))
                shot = await b.call('Page.captureScreenshot', {'format': 'png'})
                frames.append(Image.open(io.BytesIO(base64.b64decode(shot['data']))).convert('RGBA'))
    finally:
        proc.terminate(); shutil.rmtree(profile, ignore_errors=True)
    frames = [f.resize((1200, 720), Image.LANCZOS) for f in frames]
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 / FPS), loop=0, quality=72, method=6, lossless=False)


def save_anim(frames, out, size, quality=75):
    frames = [f.resize(size, Image.LANCZOS) for f in frames]
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 / FPS), loop=0, quality=quality, method=6)
    print(out.name, len(frames), os.path.getsize(out) // 1024, 'KB')


def crop(frames, box, scale):
    box = tuple(round(v * scale) for v in box); return [f.crop(box) for f in frames]


async def features():
    global SIZE
    head_url = next(t for t in targets() if '__bili_space_chrome__' in t['url'])['webSocketDebuggerUrl']
    page_url = next(t for t in targets() if '/video/' in t['url'])['webSocketDebuggerUrl']
    async with Tab(head_url) as head, Tab(page_url) as page:
        await head.call('Emulation.setDefaultBackgroundColorOverride', {'color': {'r': 0, 'g': 0, 'b': 0, 'a': 0}})
        width = await page.js('innerWidth'); SIZE = (1440, 960); scale = 1440 / width
        # Logged out, bilibili pops a login dialog after a while of playback; keep it out of the recording.
        await page.js("setInterval(()=>{for(const e of document.querySelectorAll('div'))if(e.childElementCount<40&&/扫描二维码登录/.test(e.textContent||'')){let f=e;while(f&&f!==document.body&&getComputedStyle(f).position!=='fixed')f=f.parentElement;if(f&&f!==document.body)f.style.display='none';}},150);1")
        await page.js("document.querySelector('video').muted=true;document.querySelector('video').play();scrollTo(0,0);1"); await asyncio.sleep(1.5)
        # Download: start it from the video bar and let it run to 已保存.
        bar = await page.js("(()=>{const r=document.querySelector('.bs-video-bar').getBoundingClientRect();return [r.left,r.top]})()")
        left, top = max(0, bar[0] - 20), max(0, bar[1] - 14); w = width - 2 * left; h = w * 760 / 1420
        btn = await page.js("(()=>{const r=document.querySelector('#bili-space-video-download').getBoundingClientRect();return [(r.left+r.right)/2,(r.top+r.bottom)/2]})()")
        frames = await record(head, page, [1.0, lambda: page.move(*btn), .5, lambda: page.click(*btn), 5.5])
        save_anim(crop(frames, (left, top, left + w, top + h), scale), ROOT / 'docs/images/download.webp', (880, 471), quality=55)
        # Progress bar: drag the height and corner sliders and watch the preview follow.
        await head.js("BiliSpace.openSettings('progress');1"); await asyncio.sleep(1.4)
        R = lambda sel: head.js("(()=>{const e=%s.querySelector('%s');const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,+e.min,+e.max,+e.value]})()" % (S, sel))
        dialog = await head.js("(()=>{const r=%s.querySelector('#settings .dialog,#settings [role=dialog],#settings>*').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()" % S)
        async def drag(sel, to):
            l, t, r, b, lo, hi, v = await R(sel); y = (t + b) / 2; x0 = l + (r - l) * (v - lo) / (hi - lo); x1 = l + (r - l) * (to - lo) / (hi - lo)
            await head.call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': x0, 'y': y, 'button': 'left', 'clickCount': 1})
            for k in range(1, 25):
                await head.call('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x0 + (x1 - x0) * k / 24, 'y': y, 'buttons': 1}); await asyncio.sleep(.035)
            await head.call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': x1, 'y': y, 'button': 'left', 'clickCount': 1})
        hv = (await R('#pref-progressHeight'))[6]; rv = (await R('#pref-progressRadius'))[6]
        frames = await record(head, page, [.8, lambda: drag('#pref-progressHeight', 10), .6, lambda: drag('#pref-progressRadius', 0), .6,
                                           lambda: drag('#pref-progressRadius', 12), .6, lambda: drag('#pref-progressHeight', hv), .4, lambda: drag('#pref-progressRadius', rv), 1.0])
        save_anim(crop(frames, dialog, scale), ROOT / 'docs/images/customize.webp', (752, round(752 * (dialog[3] - dialog[1]) / (dialog[2] - dialog[0]))))
        await head.js('BiliSpace.closeSettings?.();1')
        await head.call('Emulation.setDefaultBackgroundColorOverride', {})
        # Picture in picture: the window shrinks to the bare video; record it playing.
        await page.js("window.chrome.webview.postMessage({type:'window',action:'pip'});1"); await asyncio.sleep(2.5)
        await page.js("(async()=>{const v=document.querySelector('video');v.muted=true;await v.play().catch(()=>0);return 1})()"); await asyncio.sleep(1)
    async with Tab(page_url) as page:
        page.frames = []
        await page.call('Page.startScreencast', {'format': 'jpeg', 'quality': 92}); await asyncio.sleep(4.5); await page.call('Page.stopScreencast')
        pf = sorted(page.frames); out, t, j = [], pf[0][0], 0
        while t <= pf[-1][0]:
            while j + 1 < len(pf) and pf[j + 1][0] <= t: j += 1
            out.append(Image.open(io.BytesIO(base64.b64decode(pf[j][1]))).convert('RGB')); t += 1 / FPS
        save_anim(out, ROOT / 'docs/images/pip.webp', (560, round(560 * out[0].height / out[0].width)))
        await page.js("window.chrome.webview.postMessage({type:'window',action:'pip'});1")


async def main():
    home, settings = await clips()
    print('home', len(home), 'settings', len(settings))
    home[0].save(ROOT / 'docs/images/home.png'); settings[len(settings) // 2].save(ROOT / 'docs/images/settings.png')
    save_anim(home, ROOT / 'docs/images/home.webp', (960, 640), quality=60); save_anim(settings, ROOT / 'docs/images/settings.webp', (960, 640), quality=65)
    await render(home, settings, ROOT / 'docs/images/showcase.webp')
    print('showcase.webp', os.path.getsize(ROOT / 'docs/images/showcase.webp') // 1024, 'KB')

asyncio.run(features() if sys.argv[1:] == ['features'] else main())
