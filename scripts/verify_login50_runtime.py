"""Inspect the directly mounted official login component without entering credentials or authorizing accounts."""
import asyncio,json,subprocess,urllib.request
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import ROOT

class Session:
    def __init__(self,ws):self.ws=ws;self.sequence=0
    async def call(self,method,params=None,session=None):
        self.sequence+=1;number=self.sequence;message={'id':number,'method':method,'params':params or {}}
        if session:message['sessionId']=session
        await self.ws.send(json.dumps(message))
        while True:
            value=json.loads(await asyncio.wait_for(self.ws.recv(),25))
            if value.get('id')==number:
                if 'error' in value:raise RuntimeError(value['error'])
                return value.get('result',{})
    async def js(self,code,session=None):
        value=await self.call('Runtime.evaluate',{'expression':code,'returnByValue':True,'awaitPromise':True},session)
        if value.get('exceptionDetails'):raise RuntimeError(value['exceptionDetails'])
        return value.get('result',{}).get('value')
    async def shot(self,name):
        import base64
        value=await self.call('Page.captureScreenshot',{'format':'png'});(ROOT/'verification'/name).write_bytes(base64.b64decode(value['data']))

async def main():
    si=subprocess.STARTUPINFO();si.dwFlags|=subprocess.STARTF_USESHOWWINDOW;si.wShowWindow=0
    process=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist',startupinfo=si);report={}
    try:
        for _ in range(100):
            try:target=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if t.get('type')=='page');break
            except (OSError,StopIteration):await asyncio.sleep(.2)
        async with connect(target['webSocketDebuggerUrl'],max_size=25*1024*1024) as ws:
            c=Session(ws)
            for _ in range(100):
                if await c.js("location.hostname==='bili-space.local'&&!!window.BiliSpace"):break
                await asyncio.sleep(.2)
            await c.call('Page.navigate',{'url':'https://www.bilibili.com/'})
            for _ in range(100):
                if await c.js("location.hostname==='www.bilibili.com'&&!!window.BiliSpace"):break
                await asyncio.sleep(.2)
            await c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':940,'deviceScaleFactor':1,'mobile':False})
            await c.js("BiliSpace.update({theme:'dark'});BiliSpace.openLoginPanel()")
            for _ in range(100):
                if await c.js("!!document.querySelector('#bili-space-login-mount .bili-mini-content-wp')"):break
                await asyncio.sleep(.2)
            probe="""(()=>{const p=document.querySelector('#bili-space-login-mount'),box=p.querySelector('.bili-mini-content-wp'),visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};return {iframeCount:p.querySelectorAll('iframe').length,width:p.clientWidth,scrollWidth:p.scrollWidth,bg:getComputedStyle(box).backgroundColor,qr:!!p.querySelector('canvas,.login-client-qr-code'),inputs:[...p.querySelectorAll('input')].filter(visible).map(i=>({type:i.type,placeholder:i.placeholder})),providers:[...p.querySelectorAll('.login-sns-name')].filter(visible).map(e=>e.textContent.trim())}})()"""
            report['password']=await c.js(probe);assert report['password']['iframeCount']==0;assert report['password']['qr'];assert any(i['type']=='password' for i in report['password']['inputs']);assert len(report['password']['providers'])>=5
            await c.js("[...document.querySelectorAll('#bili-space-login-mount .login-tab-item')].find(e=>e.textContent.trim()==='短信登录').click()")
            await asyncio.sleep(.3);report['sms']=await c.js(probe);assert any('手机' in i['placeholder'] for i in report['sms']['inputs'])
            await c.shot('login50-direct-dark.png')
            await c.js("BiliSpace.update({theme:'light'})");report['light']=await c.js(probe);assert report['light']['bg']!=report['sms']['bg'];await c.shot('login50-direct-light.png')
            await c.js("BiliSpace.update({theme:'dark'})");await c.call('Emulation.setDeviceMetricsOverride',{'width':620,'height':800,'deviceScaleFactor':1,'mobile':False});await asyncio.sleep(.3)
            report['small']=await c.js(probe);assert report['small']['scrollWidth']<=report['small']['width']+2;assert len(report['small']['providers'])>=5;await c.shot('login50-direct-small.png')
            report['cover']=await c.js("""(async()=>{const response=await fetch('https://api.bilibili.com/x/web-interface/popular?pn=1&ps=1',{credentials:'include'}),j=await response.json(),raw=j.data?.list?.[0]?.pic;if(!raw)return {available:false};const url=BiliFavoriteCoverURL(raw);const image=new Image();image.referrerPolicy='no-referrer';const loaded=await new Promise(resolve=>{image.onload=()=>resolve(image.naturalWidth>0);image.onerror=()=>resolve(false);image.src=url;setTimeout(()=>resolve(false),10000)});return {available:true,originalProtocol:new URL(raw,location.href).protocol,normalizedProtocol:new URL(url).protocol,loaded}})()""")
            assert report['cover'].get('available') and report['cover'].get('loaded'),report['cover']
            print(json.dumps(report,ensure_ascii=False,indent=2));(ROOT/'verification/login50-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    finally:process.terminate();process.wait()

if __name__=='__main__':asyncio.run(main())
