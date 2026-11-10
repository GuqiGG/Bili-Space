"""Exercise native back/forward buttons, their enabled states and entry motion across origins."""
import asyncio,json,shutil,subprocess,tempfile,urllib.request
from pathlib import Path
from websockets.asyncio.client import connect
from verify_brand_motion import FixtureSession
from smoke import ROOT

async def main():
    stage=Path(tempfile.mkdtemp(prefix='history-buttons-',dir=ROOT/'verification'))
    for name in ['Bili-Space.exe','WebView2Loader.dll']:shutil.copy2(ROOT/'dist'/name,stage/name)
    shutil.copytree(ROOT/'assets',stage/'assets')
    process=subprocess.Popen([str(stage/'Bili-Space.exe'),'--test'],cwd=stage)
    try:
        for _ in range(100):
            try:
                target=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if t.get('type')=='page');break
            except (OSError,StopIteration):await asyncio.sleep(.1)
        async with connect(target['webSocketDebuggerUrl'],max_size=30000000) as ws:
            c=FixtureSession(ws,b'<html><body><h1>Native navigation fixture</h1><p>Rendered content for browser history and toolbar motion verification.</p></body></html>')
            async def until(code):
                for _ in range(150):
                    if await c.js(code):return
                    await asyncio.sleep(.03)
                raise AssertionError(code)
            await until("!!window.BiliSpace&&document.readyState==='complete'")
            await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
            await c.call('Fetch.enable',{'patterns':[{'urlPattern':'https://www.bilibili.com/*','resourceType':'Document'},{'urlPattern':'https://t.bilibili.com/*','resourceType':'Document'}]})
            async def arrive(url):await until('location.href==='+json.dumps(url)+'&&!!window.BiliSpace')
            root="document.querySelector('#bili-space-root').shadowRoot"
            async def button(action):await c.js(root+".querySelector('[data-window="+action+"]').click()")
            home='https://www.bilibili.com/';history=home+'history';dynamic='https://t.bilibili.com/'
            await c.call('Page.navigate',{'url':home});await arrive(home);await asyncio.sleep(.5)
            await c.call('Page.navigate',{'url':history});await arrive(history)
            await until(root+".querySelector('.history-controls').getAnimations().length>0")
            await asyncio.sleep(.5)
            await until('!'+root+".querySelector('.history-back').disabled&&"+root+".querySelector('.history-forward').disabled")
            await c.call('Page.navigate',{'url':dynamic});await arrive(dynamic);await asyncio.sleep(.5)
            await button('back');await arrive(history)
            await until('!'+root+".querySelector('.history-forward').disabled")
            await button('back');await arrive(home)
            await until(root+".querySelector('.history-back').hidden&&!"+root+".querySelector('.history-forward').hidden&&!"+root+".querySelector('.history-forward').disabled")
            await asyncio.sleep(.5);await button('forward');await arrive(history)
            await until(root+".querySelector('.history-back').getAnimations().length>0")
            await asyncio.sleep(.5);await button('forward');await arrive(dynamic)
            await until(root+".querySelector('.history-forward').disabled")
            print('Native back/forward across home/history/dynamic passed; correct disabled states and animated appearances')
    finally:process.terminate();process.wait()
if __name__=='__main__':asyncio.run(main())
