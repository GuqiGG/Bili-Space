"""Prove native add/cancel preserves the original account, using synthetic cookies only."""
import asyncio,json,shutil,subprocess,tempfile,urllib.request
from pathlib import Path
from websockets.asyncio.client import connect
from verify_login50_runtime import Session
from smoke import ROOT

async def main():
    stage=Path(tempfile.mkdtemp(prefix='account52-',dir=ROOT/'verification'))
    for name in ['Bili-Space.exe','WebView2Loader.dll']:shutil.copy2(ROOT/'dist'/name,stage/name)
    shutil.copytree(ROOT/'assets',stage/'assets')
    process=subprocess.Popen([str(stage/'Bili-Space.exe'),'--test'],cwd=stage)
    try:
        for _ in range(100):
            try:
                target=next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if t.get('type')=='page');break
            except (OSError,StopIteration):await asyncio.sleep(.2)
        async with connect(target['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
            c=Session(ws)
            async def until(code):
                for _ in range(100):
                    if await c.js(code):return
                    await asyncio.sleep(.05)
                raise AssertionError(code)
            async def observe():
                await until('!!window.BiliSpace')
                await c.js('window.accountEvents=[];BiliSpace.acceptAccountState=x=>accountEvents.push(x)')
            async def action(name,uid=''):
                await c.js('chrome.webview.postMessage('+json.dumps({'type':'accounts','action':name,'profile':{'mid':uid,'uname':'Synthetic '+uid,'face':''}})+')')
            async def cookie(uid):
                for name,value in [('DedeUserID',uid),('SESSDATA','synthetic-account52-not-authenticated')]:
                    await c.call('Network.setCookie',{'name':name,'value':value,'domain':'.bilibili.com','path':'/','secure':True,'httpOnly':name=='SESSDATA'})
            async def current():
                values=await c.call('Network.getCookies',{'urls':['https://www.bilibili.com/']})
                return next((v['value'] for v in values['cookies'] if v['name']=='DedeUserID'),None)
            await observe();await cookie('952001');await action('remember','952001')
            await until("accountEvents.some(e=>e.event==='saved')")
            await action('add','952001');await until("accountEvents.some(e=>e.event==='login-add')")
            assert await current() is None
            await cookie('952002');await action('remember','952002')
            for _ in range(100):
                if await current()=='952001':break
                await asyncio.sleep(.05)
            assert await current()=='952001'
            await asyncio.sleep(.6);await observe();await action('add','952001')
            await until("accountEvents.some(e=>e.event==='login-add')")
            await action('cancel-add')
            for _ in range(100):
                if await current()=='952001':break
                await asyncio.sleep(.05)
            assert await current()=='952001'
            saved=json.loads((stage/'.appdata/accounts50.json').read_text())
            assert saved['active']=='952001' and not saved['pendingAddition']
            assert {e['mid'] for e in saved['accounts']}=={'952001','952002'}
            assert 'synthetic-account52' not in json.dumps(saved)
            print('Native add and cancel restore original account; both encrypted accounts retained')
    finally:process.terminate();process.wait()

if __name__=='__main__':asyncio.run(main())
