"""Verify that frost reveals the real home banner behind an unchanged-height toolbar."""
import asyncio,json,subprocess,urllib.request
from websockets.asyncio.client import connect
from verify_login50_runtime import Session
from smoke import ROOT

async def main():
    process=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist',stdout=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:t=next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if x.get('type')=='page');break
            except (OSError,StopIteration):await asyncio.sleep(.2)
        async with connect(t['webSocketDebuggerUrl'],max_size=25*1024*1024) as ws:
            c=Session(ws)
            async def until(code):
                for _ in range(120):
                    if await c.js(code):return
                    await asyncio.sleep(.2)
                raise AssertionError(code)
            await until('!!window.BiliSpace')
            await c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':940,'deviceScaleFactor':1,'mobile':False})
            await c.js('BiliSpace.update({experimentalFrost:true,showChannels:true})')
            assert await c.js("getComputedStyle(document.querySelector('.channel-container')).backdropFilter.includes('blur(')")
            await c.js('BiliSpace.update({showChannels:false})')
            assert await c.js("getComputedStyle(document.querySelector('.channel-container')).display==='none'")
            await c.call('Page.navigate',{'url':'https://www.bilibili.com/'})
            await until("location.hostname==='www.bilibili.com'&&!!window.BiliSpace&&!!document.querySelector('[data-bs-banner=true]')")
            measure="(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,b=document.querySelector('[data-bs-banner=true]').getBoundingClientRect(),h=s.querySelector('#chrome').getBoundingClientRect(),n=document.querySelector('.bs-banner-brand').getBoundingClientRect(),p=getComputedStyle(s.querySelector('#chrome'),'::before'),channel=document.querySelector('.channel-container');return {top:b.top,bottom:b.bottom,height:b.height,headerHeight:h.height,brandY:n.y,logoY:document.querySelector('[data-bs-banner=true] .inner-logo')?.getBoundingClientRect().y,fadeBottom:p.bottom,underlap:document.documentElement.dataset.bsBannerUnderlap,channelDisplay:channel?getComputedStyle(channel).display:null,channelBlur:channel?getComputedStyle(channel).backdropFilter:null}})()"
            await c.js("BiliSpace.update({experimentalFrost:false,theme:'dark',showChannels:true})")
            off=await c.js(measure)
            await c.js("BiliSpace.update({experimentalFrost:true})")
            await c.js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            on=await c.js(measure)
            assert on['underlap']=='true' and abs(on['top'])<1,(off,on)
            assert abs(off['bottom']-on['bottom'])<1 and off['headerHeight']==on['headerHeight'],(off,on)
            assert abs(off['brandY']-on['brandY'])<1 and on['fadeBottom']=='0px',(off,on)
            if off['logoY'] is not None:assert abs(off['logoY']-on['logoY'])<1,(off,on)
            print(await c.js("Array.from(document.querySelector('[data-bs-banner=true]').querySelectorAll('a,svg')).slice(0,12).map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:e.className.baseVal,parent:e.parentElement.className,top:e.getBoundingClientRect().top,height:e.getBoundingClientRect().height,position:getComputedStyle(e).position}))"))
            await c.shot('ui51-banner-behind-toolbar.png')
            await c.js('BiliSpace.update({showChannels:false})');hidden=await c.js(measure)
            assert hidden['channelDisplay'] in [None,'none'],hidden
            await c.js('BiliSpace.update({showChannels:true,experimentalFrost:false})');restored=await c.js(measure)
            assert abs(off['top']-restored['top'])<1 and restored['underlap']=='false',(off,restored)
            result={'off':off,'on':on,'restored':restored,'headerHeightUnchanged':True,'contentPositionUnchanged':True,'nativeChannelsToggle':True}
            (ROOT/'verification/ui51-banner-runtime.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
    finally:process.terminate();process.wait()

if __name__=='__main__':asyncio.run(main())
