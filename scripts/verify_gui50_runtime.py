"""Check that the borderless pass changes surfaces, not geometry or preferences."""
import asyncio,json,subprocess,urllib.request
from websockets.asyncio.client import connect
from verify_login50_runtime import Session
from smoke import ROOT

async def main():
    si=subprocess.STARTUPINFO();si.dwFlags|=subprocess.STARTF_USESHOWWINDOW;si.wShowWindow=0
    process=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist',startupinfo=si);report={}
    try:
        for _ in range(100):
            try:t=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list')) if t.get('type')=='page' and 'bili-space.local' in t.get('url',''));break
            except (OSError,StopIteration):await asyncio.sleep(.2)
        async with connect(t['webSocketDebuggerUrl'],max_size=25*1024*1024) as ws:
            c=Session(ws)
            for _ in range(100):
                if await c.js('!!window.BiliSpace'):break
                await asyncio.sleep(.2)
            await c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':940,'deviceScaleFactor':1,'mobile':False})
            await c.js("window.guiPrefs=JSON.stringify(BiliSpace.state.prefs);BiliSpace.openSettings();const s=document.querySelector('#bili-space-root').shadowRoot;window.guiStyle=s.querySelector('style').textContent")
            measure="(()=>{const s=document.querySelector('#bili-space-root').shadowRoot;return ['.dialog','#settings-trigger','#settings-query'].map(q=>{const e=s.querySelector(q),r=e.getBoundingClientRect(),c=getComputedStyle(e);return {selector:q,x:r.x,y:r.y,w:r.width,h:r.height,border:c.borderTopColor,shadow:c.boxShadow}})})()"
            report['after']=await c.js(measure)
            report['close']=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,b=s.querySelector('#dismiss'),h=s.querySelector('#tab-content h2'),r=b.getBoundingClientRect(),t=h.getBoundingClientRect(),v=b.querySelector('svg').getBoundingClientRect();return {headingOffset:Math.abs(r.y+r.height/2-t.y-t.height/2),svgX:Math.abs(r.x+r.width/2-v.x-v.width/2),svgY:Math.abs(r.y+r.height/2-v.y-v.height/2)}})()")
            assert report['close']['headingOffset']<1 and report['close']['svgX']<.1 and report['close']['svgY']<.1,report['close']
            await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,a=guiStyle.indexOf('/* Soft, borderless surfaces;'),b=guiStyle.indexOf('#chrome{border-bottom-color',a),end=guiStyle.indexOf('}',b)+1;s.querySelector('style').textContent=guiStyle.slice(0,a)+guiStyle.slice(end)})()")
            report['before']=await c.js(measure);await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('style').textContent=guiStyle")
            for before,after in zip(report['before'],report['after']):
                assert all(abs(before[k]-after[k])<.1 for k in ['x','y','w','h']),(before,after)
                assert after['border']=='rgba(0, 0, 0, 0)' and after['shadow']!='none',after
            await c.shot('gui50-settings-dark.png')
            await c.js("BiliSpace.update({theme:'light'})");await c.shot('gui50-settings-light.png')
            await c.js("BiliSpace.update({theme:JSON.parse(guiPrefs).theme})")
            assert await c.js('JSON.stringify(BiliSpace.state.prefs)===guiPrefs')
            report['preferencesPreserved']=True;report['geometryPreserved']=True
            print(json.dumps(report,ensure_ascii=False,indent=2));(ROOT/'verification/gui50-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    finally:process.terminate();process.wait()

if __name__=='__main__':asyncio.run(main())
