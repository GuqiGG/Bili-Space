import asyncio, ctypes, json, subprocess, urllib.request
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
ROOT = Path.cwd(); out = {}

async def main():
    p = subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'), '--test'], cwd=ROOT/'dist')
    try:
        t = None
        for _ in range(120):
            try:
                targets = json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list', timeout=1))
                t = next(x for x in targets if x.get('type') == 'page'); break
            except Exception: await asyncio.sleep(.2)
        async with connect(t['webSocketDebuggerUrl'], max_size=20*1024*1024) as ws:
            c = CDP(ws); await c.call('Runtime.enable'); await c.call('Page.enable')
            for _ in range(120):
                if await c.js('!!window.BiliSpace'): break
                await asyncio.sleep(.2)
            async def snap(tag):
                return await c.js(f'''(()=>{{const d=document.createElement("div");d.style.cssText="position:fixed;width:100px;height:10px";document.body.append(d);const w=d.getBoundingClientRect().width;d.remove();return {{tag:"{tag}",iw:innerWidth,ih:innerHeight,dpr:devicePixelRatio,probe:w,header:document.querySelector("#bili-space-root").shadowRoot.querySelector("header").getBoundingClientRect().height}}}})()''')
            out['z100'] = await snap('100')
            await c.js('BiliSpace.update({zoom:150})'); await asyncio.sleep(.8)
            out['z150'] = await snap('150')
            await c.js('BiliSpace.update({zoom:200})'); await asyncio.sleep(.8)
            out['z200'] = await snap('200')
            await c.js('BiliSpace.update({zoom:100})'); await asyncio.sleep(.6)
            hwnd = ctypes.windll.user32.FindWindowW('BetterBiliSpace', 'Bili-Space [test]')
            ctypes.windll.user32.ShowWindow(hwnd, 3); await asyncio.sleep(1.2)
            out['max'] = await snap('max')
            out['screen'] = await c.js('({w:screen.width,h:screen.height,aw:screen.availWidth})')
            print(json.dumps(out, indent=2))
    finally:
        h = ctypes.windll.user32.FindWindowW('BetterBiliSpace', 'Bili-Space [test]')
        ctypes.windll.user32.PostMessageW(h, 0x10, 0, 0)
        try: p.wait(timeout=6)
        except Exception: p.terminate()

asyncio.run(main())
