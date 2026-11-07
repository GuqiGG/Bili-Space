"""Exercise real official history and homepage navigations, including a warm history document."""
import asyncio,json,subprocess,time,urllib.request
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
            c=Session(ws);report=[]
            for _ in range(100):
                if await c.js("document.readyState==='complete'&&!!window.BiliSpace"):break
                await asyncio.sleep(.1)
            for route in ['history','home','history']:
                start=time.monotonic();await c.call('Page.navigate',{'url':'https://www.bilibili.com/'+('history' if route=='history' else '')})
                for _ in range(300):
                    value=await c.js("(()=>{const s=document.querySelector('#bili-space-root')?.shadowRoot;return {url:location.href,route:window.BiliSpace?.state.route,ready:document.readyState,feedback:document.documentElement?.dataset.bsContentState,pending:!!s?.querySelector('#page-pending'),text:(document.body?.innerText||'').slice(0,100),historyHref:s?.querySelector('[data-route=history]')?.href,randomTransition:typeof window.TransitionManager}})()")
                    if value.get('route')==route and value['ready']=='complete' and not value['pending'] and len(value['text'])>24:break
                    await asyncio.sleep(.05)
                assert value.get('route')==route and not value['pending'] and len(value['text'])>24,value
                assert value['historyHref']=='https://www.bilibili.com/history',value
                assert value['randomTransition']=='undefined',value
                value['elapsedMs']=round((time.monotonic()-start)*1000);report.append(value)
                await c.shot('history-navigation-'+str(len(report))+'.png')
            log=(ROOT/'dist/.appdata/runtime.log').read_text(encoding='utf-8')
            assert 'official HTML cache hit' in log
            (ROOT/'verification/history-navigation-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(report,ensure_ascii=False))
    finally:process.terminate();process.wait()
if __name__=='__main__':asyncio.run(main())
