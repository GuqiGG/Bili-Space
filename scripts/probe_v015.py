"""Verify 0.1.5: arrow geometry, category defaults, proxy panel, zoom, AI benchmark."""
import asyncio, ctypes, json, subprocess, urllib.request
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
ROOT = Path.cwd(); out = {}

async def main():
    p = subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'), '--test'], cwd=ROOT/'dist')
    try:
        t = None
        for _ in range(160):
            try:
                targets = json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list', timeout=1))
                t = next(x for x in targets if x.get('type') == 'page'); break
            except Exception: await asyncio.sleep(.2)
        async with connect(t['webSocketDebuggerUrl'], max_size=40*1024*1024) as ws:
            c = CDP(ws); await c.call('Runtime.enable'); await c.call('Page.enable')
            for _ in range(160):
                if await c.js('!!window.BiliSpace'): break
                await asyncio.sleep(.2)
            await asyncio.sleep(1)
            out['state'] = await c.js('BiliSpace.state')
            out['cats'] = await c.js('''(()=>{const r=document.querySelector("#bili-space-root").shadowRoot;return {visible:[...r.querySelectorAll("#header-categories a:not([hidden])")].map(a=>a.textContent),total:r.querySelectorAll("#header-categories a").length}})()''')
            out['ball'] = await c.js('''(()=>{const h=document.querySelector("#__bilibili_thread_ripper_launcher__");return {exists:!!h,display:h?getComputedStyle(h).display:null,ls:localStorage.getItem("BTR_Userscript.sync")?.includes("floatingButton\\":false")}})()''')
            await c.shot('v015-home.png')
            await c.js('BiliSpace.openSettings();(()=>{const r=document.querySelector("#bili-space-root").shadowRoot;r.querySelector("[data-tab=categories]").click()})()')
            await asyncio.sleep(.3)
            out['catsPanel'] = await c.js('''(()=>{const r=document.querySelector("#bili-space-root").shadowRoot;return {chips:r.querySelectorAll(".chip").length,checked:r.querySelectorAll(".chip input:checked").length,grid:getComputedStyle(r.querySelector(".chip-grid")).gridTemplateColumns}})()''')
            await c.shot('v015-categories.png')
            await c.js('''(()=>{const r=document.querySelector("#bili-space-root").shadowRoot;r.querySelector("[data-tab=network]").click()})()''')
            await asyncio.sleep(.3)
            out['network'] = await c.js('''(()=>{const r=document.querySelector("#bili-space-root").shadowRoot;return {status:r.querySelector("#proxy-status")?.textContent,switch:r.querySelector("#proxy-switch")?.checked,nodeOptions:r.querySelector("#proxy-node")?.options.length,region:r.querySelector("#proxy-region")?.textContent}})()''')
            await c.shot('v015-network.png')
            await c.js('BiliSpace.closeSettings()')
            user32 = ctypes.windll.user32
            hwnd = user32.FindWindowW('BetterBiliSpace', 'Bili-Space [test]')
            user32.ShowWindow(hwnd, 3); await asyncio.sleep(1.3)
            out['max'] = await c.js('({iw:innerWidth,ih:innerHeight,dpr:devicePixelRatio,header:document.querySelector("#bili-space-root").shadowRoot.querySelector("header").getBoundingClientRect().height})')
            await c.shot('v015-maximized.png')
            await c.js('chrome.webview.postMessage({type:"window",action:"fullscreen"})'); await asyncio.sleep(.9)
            out['full'] = await c.js('({iw:innerWidth,full:BiliSpace.state.full})')
            await c.js('chrome.webview.postMessage({type:"window",action:"fullscreen"})'); await asyncio.sleep(.6)
            user32.ShowWindow(hwnd, 9); await asyncio.sleep(.6)
            out['ai'] = await c.js('({gpu:!!navigator.gpu})')
            for label, w, h in [('360p', 640, 360), ('720p', 1280, 720), ('1080p', 1920, 1080)]:
                try: out[f'bench_{label}'] = await c.js(f'BiliSpace.bench({w},{h},5)')
                except Exception as e: out[f'bench_{label}'] = {'error': str(e)[:160]}
            await c.js('document.querySelector("video").play();BiliSpace.update({srMode:"quality",srScale:2})')
            for _ in range(60):
                st = await c.js('BiliSpace.state')
                if st.get('frames', 0) > 2 or st.get('stopped'): break
                await asyncio.sleep(.25)
            out['aiRun'] = await c.js('({status:BiliSpace.state.status,frames:BiliSpace.state.frames,canvas:[document.querySelector(".bs-gpu-canvas")?.width,document.querySelector(".bs-gpu-canvas")?.height]})')
            await c.shot('v015-ai.png')
            out['errors'] = [e.get('params', {}).get('exceptionDetails', {}).get('exception', {}).get('description') for e in c.events if e.get('method') == 'Runtime.exceptionThrown']
    finally:
        (ROOT/'verification/v015-probe.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf8')
        print(json.dumps(out, ensure_ascii=True, indent=2))
        h = ctypes.windll.user32.FindWindowW('BetterBiliSpace', 'Bili-Space [test]')
        ctypes.windll.user32.PostMessageW(h, 0x10, 0, 0)
        try: p.wait(timeout=6)
        except Exception: p.terminate()

asyncio.run(main())
