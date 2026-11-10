"""Records the media for assets/whats-new/ from a running `Bili-Space.exe --test` client on the home page.

Only CDP inside the test window is used (no desktop input). Run: python scripts/record_whats_new.py assets/whats-new
The clips and pictures it writes are named in assets/whats-new/whats-new.json; adjust both for each release.
"""
import json, urllib.request, asyncio, sys, base64, io, os, subprocess, shutil
from websockets.asyncio.client import connect
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
import tempfile
WORK = os.path.join(tempfile.gettempdir(), 'bili-space-whats-new-frames'); os.makedirs(WORK, exist_ok=True)
W, H, FPS = 1280, 720, 30
S = "document.getElementById('bili-space-root').shadowRoot"
def T(): return [x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list')) if x['type'] == 'page']

class Tab:
    def __init__(self, url): self.url = url; self.n = 0; self.events = []
    async def __aenter__(self):
        self.ws = await connect(self.url, max_size=None); return self
    async def __aexit__(self, *a): await self.ws.close()
    async def call(self, method, params={}):
        self.n += 1; i = self.n; await self.ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        while True:
            v = json.loads(await self.ws.recv())
            if v.get('id') == i: return v.get('result', {})
            if 'method' in v: await self.on_event(v)
    async def on_event(self, v):
        if v['method'] == 'Page.screencastFrame':
            p = v['params']; self.events.append((p['metadata']['timestamp'], p['data']))
            await self.ws.send(json.dumps({'id': 10**6 + len(self.events), 'method': 'Page.screencastFrameAck', 'params': {'sessionId': p['sessionId']}}))
    async def js(self, code):
        r = await self.call('Runtime.evaluate', {'expression': code, 'returnByValue': True, 'awaitPromise': True})
        return r.get('result', {}).get('value')
    async def pump(self, seconds):
        end = asyncio.get_event_loop().time() + seconds
        while True:
            left = end - asyncio.get_event_loop().time()
            if left <= 0: return
            try: v = json.loads(await asyncio.wait_for(self.ws.recv(), left))
            except asyncio.TimeoutError: return
            if 'method' in v: await self.on_event(v)
    async def shot(self):
        r = await self.call('Page.captureScreenshot', {'format': 'png'}); return Image.open(io.BytesIO(base64.b64decode(r['data']))).convert('RGBA')

def backdrop(base):
    bg = base.convert('RGB').resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(18))
    return ImageEnhance.Brightness(bg).enhance(.55)

def framed(base_bg, crop, max_w=1180, max_h=560):
    s = min(max_w / crop.width, max_h / crop.height); cw, ch = int(crop.width * s), int(crop.height * s)
    img = crop.convert('RGB').resize((cw, ch), Image.LANCZOS)
    out = base_bg.copy(); x, y = (W - cw) // 2, (H - ch) // 2
    shadow = Image.new('L', (W, H), 0); ImageDraw.Draw(shadow).rounded_rectangle((x, y + 10, x + cw, y + ch + 10), 22, fill=150)
    out.paste(Image.new('RGB', (W, H), (0, 0, 0)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(24)))
    mask = Image.new('L', (cw, ch), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw - 1, ch - 1), 18, fill=255)
    out.paste(img, (x, y), mask); return out

def encode(frames, name):
    d = os.path.join(WORK, name); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    for i, f in enumerate(frames): f.save(os.path.join(d, '%04d.png' % i))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(d, '%04d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '27',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', os.path.join(OUT, name + '.mp4')], check=True)

async def record(head, region, base, actions):
    """Screencast the header layer while running actions; composite each frame over the page; resample to 30 fps."""
    head.events = []
    await head.call('Page.startScreencast', {'format': 'png', 'everyNthFrame': 1})
    await head.pump(.4)
    for act in actions:
        if isinstance(act, (int, float)): await head.pump(act)
        else: await act()
    await head.pump(.3)
    await head.call('Page.stopScreencast')
    evs = sorted(head.events)
    t0, t1 = evs[0][0], evs[-1][0]
    bg = backdrop(base); out = []; cache = {}
    x0, y0, x1, y1 = region
    t = t0; k = 0
    while t <= t1:
        while k + 1 < len(evs) and evs[k + 1][0] <= t: k += 1
        if k not in cache:
            layer = Image.open(io.BytesIO(base64.b64decode(evs[k][1]))).convert('RGBA')
            if layer.size != base.size: layer = layer.resize(base.size)
            comp = base.copy(); comp.alpha_composite(layer); cache = {k: framed(bg, comp.crop((x0, y0, x1, y1)))}
        out.append(cache[k]); t += 1 / FPS
    return out

async def main():
    head_url = [t for t in T() if '__bili_space_chrome__' in t['url']][0]['webSocketDebuggerUrl']
    page_url = [t for t in T() if '__bili_space_chrome__' not in t['url']][0]['webSocketDebuggerUrl']
    async with Tab(head_url) as head, Tab(page_url) as page:
        await head.call('Emulation.setDefaultBackgroundColorOverride', {'color': {'r': 0, 'g': 0, 'b': 0, 'a': 0}})
        dpr = await head.js('devicePixelRatio')
        await page.js('scrollTo(0,0);1'); await asyncio.sleep(1.5)
        base = await page.shot()
        R = lambda sel, pad=(0, 0, 0, 0): head.js("(()=>{const r=%s.querySelector('%s').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()" % (S, sel))
        async def mouse(x, y): await head.call('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y})
        async def click(x, y):
            for t in ('mousePressed', 'mouseReleased'): await head.call('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})
        # 1. search box lines
        l, t, r, b = await R('.search')
        cx, cy = (l + r) / 2, (t + b) / 2
        region = tuple(int(v * dpr) for v in (l - 34, t - 12, r + 34, b + 12))
        away = lambda: mouse(cx, cy + 300); into = lambda: mouse(cx, cy)
        frames = await record(head, region, base, [away, .6, into, 1.8, away, 1.0, into, 1.8, away, 1.0, into, 1.8, away, .8])
        encode(frames, 'search-lines'); print('search-lines', len(frames))
        # 2. channel strip
        l, t, r, b = await R('.header-left')
        bl, bt, br, bb = await R('.back')
        region = tuple(int(v * dpr) for v in (max(0, l - 6), t + 8, min(r + 120, base.width / dpr), b - 8))
        tog = lambda: click((bl + br) / 2, (bt + bb) / 2)
        frames = await record(head, region, base, [.5, tog, 1.8, tog, 2.2, tog, 1.6, tog, 1.4])
        encode(frames, 'channel-strip'); print('channel-strip', len(frames))
        await mouse(5, 600)
        # 3. home column (scrolled so 顶部 shows)
        await page.js('scrollTo(0,1400);1'); await asyncio.sleep(1.6)
        base2 = await page.shot(); layer = await head.shot(); comp = base2.copy(); comp.alpha_composite(layer.resize(base2.size))
        l, t, r, b = await R('#feed-roll'); _, _, _, bb2 = await R('#page-top')
        region = tuple(int(v * dpr) for v in (r - 520, t - 120, r + 30, bb2 + 26))
        framed(backdrop(base2), comp.crop(region), 1000, 560).save(os.path.join(OUT, 'home-column.png'))
        await page.js('scrollTo(0,0);1'); await asyncio.sleep(1)
        # 4. feedback window
        await head.js('BiliSpace.openFeedback();1'); await asyncio.sleep(1)
        base3 = await page.shot(); layer = await head.shot(); comp = base3.copy(); comp.alpha_composite(layer.resize(base3.size))
        l, t, r, b = await R('#feedback .fb-card')
        region = tuple(int(v * dpr) for v in (l - 40, t - 30, r + 40, b + 30))
        framed(backdrop(base3), comp.crop(region), 1100, 660).save(os.path.join(OUT, 'feedback.png'))
        await head.js("%s.querySelector('#feedback [data-fb=close]')?.click();1" % S)
        await head.call('Emulation.setDefaultBackgroundColorOverride', {})
asyncio.run(main())
