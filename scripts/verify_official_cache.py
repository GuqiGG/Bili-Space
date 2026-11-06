"""Verify original site markup and a warm document cache in an isolated native profile."""
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
            except (OSError,StopIteration):await asyncio.sleep(.2)
        async with connect(target['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
            c=Session(ws);report=[]
            await c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':940,'deviceScaleFactor':1,'mobile':False})
            for visit in range(2):
                await c.call('Page.navigate',{'url':'https://www.bilibili.com/'})
                for _ in range(180):
                    value=await c.js("({url:location.href,ready:document.readyState,cards:document.querySelectorAll('.bili-video-card').length,original:!!document.querySelector('#app'),custom:!!document.querySelector('#bs-local-content'),titles:[...document.querySelectorAll('.bili-video-card__info--tit')].slice(0,4).map(e=>e.textContent),images:[...document.querySelectorAll('.bili-video-card img')].filter(e=>e.complete&&e.naturalWidth>0).length})")
                    if value and value['cards']>=4 and value['images']>=4:break
                    await asyncio.sleep(.2)
                assert value['cards']>=4 and value['images']>=4 and not value['custom'],value
                report.append(value);await c.shot('official-cache-'+str(visit)+'.png');await asyncio.sleep(1)
            log=(ROOT/'dist/.appdata/runtime.log').read_text(encoding='utf-8')
            assert 'official HTML cache hit' in log,log[-2000:]
            (ROOT/'verification/official-cache-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({'visits':len(report),'officialCards':[v['cards'] for v in report],'loadedCovers':[v['images'] for v in report],'warmCacheHit':True},ensure_ascii=False))
    finally:process.terminate();process.wait()

if __name__=='__main__':asyncio.run(main())
