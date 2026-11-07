"""Measure header alignment and inspect original refresh panel elevation in WebView2."""
import asyncio,json,subprocess,urllib.request
from websockets.asyncio.client import connect
from verify_login50_runtime import Session
from smoke import ROOT
async def main():
    process=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist')
    try:
        for _ in range(100):
            try:
                target=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if t.get('type')=='page');break
            except (OSError,StopIteration):await asyncio.sleep(.1)
        async with connect(target['webSocketDebuggerUrl'],max_size=30000000) as ws:
            c=Session(ws)
            for _ in range(100):
                if await c.js("location.hostname==='bili-space.local'&&document.readyState==='complete'&&!!window.BiliSpace"):break
                await asyncio.sleep(.1)
            await asyncio.sleep(.2)
            await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]})
            await c.call('Page.navigate',{'url':'https://www.bilibili.com/'})
            for _ in range(160):
                if await c.js("location.hostname==='www.bilibili.com'&&document.readyState==='complete'&&!!window.BiliSpace&&document.querySelectorAll('.bili-video-card').length>4"):break
                await asyncio.sleep(.15)
            assert await c.js("location.hostname==='www.bilibili.com'")
            await c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':940,'deviceScaleFactor':1,'mobile':False})
            # Synthetic avatar markup tests the actual header layout without account operations.
            await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,a=s.querySelector('.account');delete a.dataset.pending;a.innerHTML='<img class=\"account-face\" alt=\"alignment fixture\" src=\"https://i0.hdslb.com/bfs/face/member/noface.jpg\">';})()")
            await c.js("(()=>{if(document.querySelector('.roll-btn,.feed-roll-btn'))return;const p=document.createElement('button');p.className='roll-btn';p.dataset.alignmentFixture='true';p.textContent='换一换';p.style.cssText='position:fixed;right:80px;top:320px;width:44px;height:110px;border:1px solid #38383f;border-radius:9px;writing-mode:vertical-rl';document.body.append(p)})()")
            report={}
            for theme in ['dark','light']:
                await c.js('BiliSpace.update('+json.dumps({'theme':theme,'headerBrand':True,'logoAutoHide':False})+')');await asyncio.sleep(.5)
                await c.js("(async()=>{await document.fonts.ready;TransitionManager.cancel();chrome.webview.postMessage({type:'transition',action:'cancel'});return true})()")
                value=await c.js("""(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,cy:b.y+b.height/2}};return {header:Object.fromEntries(['.brand-label','.primary-nav a','.favorites','.messages','.account','.favorites svg','.messages svg','.account-face'].map(k=>[k,r(s.querySelector(k))])),roll:[...document.querySelectorAll('.roll-btn,.feed-roll-btn')].map(e=>({class:e.className,border:getComputedStyle(e).borderColor,shadow:getComputedStyle(e).boxShadow}))}})()""")
                report[theme]=value;await c.shot('header-align-'+theme+'.png')
                values=list(value['header'].values());assert all(values),value
                assert max(v['cy'] for v in values)-min(v['cy'] for v in values)<.6,value
                
                assert value['roll'],value
                assert all(v['border']=='rgba(0, 0, 0, 0)' and v['shadow']!='none' for v in value['roll']),value
            (ROOT/'verification/header-alignment-runtime.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            print(json.dumps(report,ensure_ascii=False))
    finally:process.terminate();process.wait()
if __name__=='__main__':asyncio.run(main())
