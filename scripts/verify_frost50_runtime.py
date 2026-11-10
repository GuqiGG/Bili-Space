"""Exercise optional frost and clipboard confirmation in the real Windows renderer."""
import asyncio,json,subprocess,urllib.request
from websockets.asyncio.client import connect
from verify_login50_runtime import Session
from smoke import ROOT

async def main():
    si=subprocess.STARTUPINFO();si.dwFlags|=subprocess.STARTF_USESHOWWINDOW;si.wShowWindow=0
    process=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist',startupinfo=si)
    try:
        for _ in range(100):
            try:t=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if 'bili-space.local' in t.get('url',''));break
            except (OSError,StopIteration):await asyncio.sleep(.2)
        async with connect(t['webSocketDebuggerUrl'],max_size=25*1024*1024) as ws:
            c=Session(ws)
            for _ in range(100):
                if await c.js('!!window.BiliSpace'):break
                await asyncio.sleep(.2)
            await c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':940,'deviceScaleFactor':1,'mobile':False})
            await c.js("window.savedFrostPrefs=JSON.stringify(BiliSpace.state.prefs);window.beforeFrostUrl=location.href;BiliSpace.update({experimentalFrost:true,clipboardAutoOpen:true,theme:'dark'});BiliSpace.offerClipboardVideo('BV1cjHK6GEJE')")
            probe="(()=>{const r=document.querySelector('#bili-space-root'),s=r.shadowRoot,p=s.querySelector('#clipboard-video-prompt'),g=q=>{const e=s.querySelector(q),c=getComputedStyle(e),r=e.getBoundingClientRect();return {blur:c.backdropFilter,border:c.borderTopWidth,background:c.backgroundColor,shadow:c.boxShadow,right:r.right,bottom:r.bottom}};return {url:location.href,root:r.dataset.frost,prompt:g('#clipboard-video-prompt'),upload:g('.upload'),settings:g('#settings-trigger'),gradient:getComputedStyle(s.querySelector('#chrome'),'::before').backgroundImage,tint:r.style.getPropertyValue('--frost-tint')}})()"
            dark=await c.js(probe);assert dark['root']=='true'
            for name in ['prompt','upload','settings']:assert 'blur(' in dark[name]['blur'] and dark[name]['shadow']!='none',(name,dark[name])
            assert dark['prompt']['border']=='0px' and dark['prompt']['right']<=1440 and dark['prompt']['bottom']<=940
            assert await c.js('location.href===beforeFrostUrl')
            await c.shot('frost50-dark.png')
            await c.js("BiliSpace.update({theme:'light',accent:'#49a9b5'})")
            light=await c.js(probe);assert dark['tint']!=light['tint'];await c.shot('frost50-light.png')
            await c.call('Emulation.setDeviceMetricsOverride',{'width':620,'height':700,'deviceScaleFactor':1,'mobile':False})
            small=await c.js(probe);assert small['prompt']['right']<=620 and small['prompt']['bottom']<=700;await c.shot('frost50-small.png')
            await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-dismiss]').click()")
            assert not await c.js("!!document.querySelector('#bili-space-root').shadowRoot.querySelector('#clipboard-video-prompt')")
            await c.js("BiliSpace.update({...JSON.parse(savedFrostPrefs),experimentalFrost:false})")
            assert await c.js("document.querySelector('#bili-space-root').dataset.frost==='false'")
            await c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':940,'deviceScaleFactor':1,'mobile':False})
            await c.call('Page.navigate',{'url':'https://www.bilibili.com/'})
            for _ in range(100):
                if await c.js("location.hostname==='www.bilibili.com'&&!!window.BiliSpace&&!!document.querySelector('.bili-video-card')"):break
                await asyncio.sleep(.3)
            await c.js("BiliSpace.update({experimentalFrost:true,theme:'dark'});BiliSpace.offerClipboardVideo('BV1cjHK6GEJE')")
            home=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,c=getComputedStyle(document.querySelector('.bili-video-card')),a=getComputedStyle(s.querySelector('.nav-lane a'));const r=s.querySelector('#clipboard-video-prompt').getBoundingClientRect();return {promptRight:r.right,promptWidth:r.width,viewport:innerWidth,cardBlur:c.backdropFilter,cardBackground:c.backgroundColor,navBackground:a.backgroundColor,backHidden:s.querySelector('.history-back').hidden}})()")
            assert home['promptRight']<=1440,home
            assert 'blur(' in home['cardBlur'] and home['navBackground']=='rgba(0, 0, 0, 0)' and home['backHidden'],home
            await c.shot('frost50-home.png')
            report={'dark':dark,'light':light,'small':small,'home':home,'noAutomaticNavigation':True,'dismissed':True,'disabled':True}
            (ROOT/'verification/frost50-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
    finally:process.terminate();process.wait()

if __name__=='__main__':asyncio.run(main())
