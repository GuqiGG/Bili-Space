"""Test native brand-state handoff across actual www/t.bilibili.com document origins."""
from pathlib import Path
import asyncio,base64,json,subprocess,urllib.request,shutil,tempfile
from websockets.asyncio.client import connect
from verify_login50_runtime import Session
from smoke import ROOT

class FixtureSession(Session):
    async def call(self,method,params=None,session=None):
        self.sequence+=1;number=self.sequence
        await self.ws.send(json.dumps({'id':number,'method':method,'params':params or {}}))
        while True:
            value=json.loads(await asyncio.wait_for(self.ws.recv(),25))
            if value.get('method')=='Fetch.requestPaused':
                await self.ws.send(json.dumps({'id':1000000+number,'method':'Fetch.fulfillRequest','params':{'requestId':value['params']['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode((ROOT/'assets/fixture.html').read_bytes()).decode()}}))
            if value.get('id')==number:
                if 'error' in value:raise RuntimeError(value['error'])
                return value.get('result',{})

async def main():
    stage=Path(tempfile.mkdtemp(prefix='brand-motion-',dir=ROOT/'verification'))
    for name in ['Bili-Space.exe','WebView2Loader.dll']:shutil.copy2(ROOT/'dist'/name,stage/name)
    shutil.copytree(ROOT/'assets',stage/'assets')
    process=subprocess.Popen([str(stage/'Bili-Space.exe'),'--test'],cwd=stage)
    try:
        for _ in range(100):
            try:
                target=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if t.get('type')=='page');break
            except (OSError,StopIteration):await asyncio.sleep(.1)
        async with connect(target['webSocketDebuggerUrl'],max_size=30000000) as ws:
            c=FixtureSession(ws);report=[]
            for _ in range(100):
                if await c.js("document.readyState==='complete'&&!!window.BiliSpace"):break
                await asyncio.sleep(.1)
            await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
            await c.js("BiliSpace.update({headerBrand:true,logoAutoHide:true})");await asyncio.sleep(.6)
            await c.call('Fetch.enable',{'patterns':[{'urlPattern':'https://www.bilibili.com/*','resourceType':'Document'},{'urlPattern':'https://t.bilibili.com/*','resourceType':'Document'}]})
            for url,show,moving in [('https://www.bilibili.com/',True,True),('https://www.bilibili.com/history',False,True),('https://t.bilibili.com/',False,False),('https://www.bilibili.com/',True,True)]:
                await c.call('Page.navigate',{'url':url})
                for _ in range(100):
                    if await c.js('location.href==='+json.dumps(url)+'&&!!window.BiliSpace&&typeof BiliSpace.state.headerBrand.shown===\"boolean\"'):break
                    await asyncio.sleep(.01)
                await asyncio.sleep(.04)
                value=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,slot=s.querySelector('.brand-slot'),label=s.querySelector('.brand-label'),motions=[...slot.getAnimations(),...label.getAnimations()];return {url:location.href,hidden:slot.hidden,motions:motions.map(a=>({duration:a.effect.getTiming().duration,easing:a.effect.getTiming().easing,frames:a.effect.getKeyframes()}))}})()")
                assert bool(value['motions'])==moving,value
                if moving:assert all(a['duration']==360 and a['easing']=='cubic-bezier(0.4, 0, 0.2, 1)' for a in value['motions']),value
                await asyncio.sleep(.45)
                assert await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('.brand-slot').hidden")== (not show)
                report.append(value)
            (ROOT/'verification/brand-motion-runtime.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            print('Home enter → history exit → dynamic stays hidden → home enter: passed; 360ms curved motion')
    finally:process.terminate();process.wait()
if __name__=='__main__':asyncio.run(main())
