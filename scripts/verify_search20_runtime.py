import asyncio,json,subprocess,urllib.request,base64
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
R=Path.cwd();report={}
async def target():
 for _ in range(100):
  try:return next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5)) if x.get('type')=='page')
  except:await asyncio.sleep(.15)
 raise RuntimeError('test target missing')
async def wait(c,expr):
 for _ in range(100):
  if await c.js(expr):return
  await asyncio.sleep(.1)
 raise AssertionError(expr)
async def fixture(c):
 def intercept(p):
  return {'method':'Fetch.fulfillRequest','params':{'requestId':p['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode(b'<html><head><title>Search Test</title></head><body><main>Search integration fixture</main></body></html>').decode()}}
 c.intercept=intercept
 await c.call('Fetch.enable',{'patterns':[{'urlPattern':'https://www.bilibili.com/search20-fixture*'},{'urlPattern':'https://search.bilibili.com/all?*'}]})
 await c.call('Page.navigate',{'url':'https://www.bilibili.com/search20-fixture.html'})
 await wait(c,"!!window.BiliSpace&&document.readyState==='complete'")
async def main():
 settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();data=json.loads(backup);data['config'].update(proxy=False,srMode='off',fiMode='off',clipboardAutoOpen=False,zoom=100,autoZoom=False);data['searchHistory']=[];settings.write_text(json.dumps(data));p=None
 try:
  p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist');t=await target()
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await fixture(c)
   await c.js("(()=>{const i=document.querySelector('#bili-space-root').shadowRoot.querySelector('.search input');i.value='python';i.focus();i.dispatchEvent(new Event('input',{bubbles:true}));})()")
   await wait(c,"document.querySelector('#bili-space-root').shadowRoot.querySelectorAll('#search-panel [data-query]').length>0")
   report['official']=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot;return {origin:location.origin,heading:s.querySelector('#search-panel').textContent,terms:[...s.querySelectorAll('#search-panel [data-query]')].map(e=>e.dataset.query),requests:performance.getEntriesByType('resource').filter(x=>x.name.startsWith('https://s.search.bilibili.com/main/suggest')).map(x=>x.name)};})()")
   assert report['official']['requests'] and len(report['official']['terms'])>=1
   report['bounds']=[]
   for width in [480,1280]:
    await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':800,'deviceScaleFactor':1,'mobile':False});await asyncio.sleep(.2)
    r=await c.js("(()=>{const p=document.querySelector('#bili-space-root').shadowRoot.querySelector('#search-panel').getBoundingClientRect();return {width:innerWidth,left:p.left,right:p.right,top:p.top,bottom:p.bottom};})()");assert r['left']>=0 and r['right']<=width and r['bottom']<=800;report['bounds'].append(r)
   await c.shot('search20.png')
   await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot;s.querySelector('.search input').value='Search20 test';s.querySelector('.search').requestSubmit();})()")
   await wait(c,"location.hostname==='search.bilibili.com'&&!!window.BiliSpace")
   await c.js("(()=>{const input=document.querySelector('#bili-space-root').shadowRoot.querySelector('.search input');input.focus();input.dispatchEvent(new Event('click'));})()")
   await wait(c,"!!document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-remove=\"Search20 test\"]')")
   report['crossOriginHistory']=json.loads(settings.read_text()).get('searchHistory');assert report['crossOriginHistory']==['Search20 test']
   await c.js("chrome.webview.postMessage({type:'window',action:'close'})")
  p.wait(timeout=4);p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist');t=await target()
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await wait(c,'!!window.BiliSpace');await c.js("(()=>{const input=document.querySelector('#bili-space-root').shadowRoot.querySelector('.search input');input.focus();input.dispatchEvent(new Event('click'));})()")
   report['restartBefore']=await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('#search-panel').textContent");report['restartStored']=json.loads(settings.read_text()).get('searchHistory');await wait(c,"!!document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-remove=\"Search20 test\"]')");report['survivesRestart']=True
   await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-remove=\"Search20 test\"]').click()")
   await asyncio.sleep(.3);report['afterDelete']=json.loads(settings.read_text()).get('searchHistory');assert report['afterDelete']==[]
   await c.js("chrome.webview.postMessage({type:'search-history',action:'add',term:'Clear20 test'})")
   await wait(c,"!!document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-clear]')")
   await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-clear]').click()")
   await asyncio.sleep(.3);report['afterClear']=json.loads(settings.read_text()).get('searchHistory');assert report['afterClear']==[];report['result']='PASS'
   await c.js("chrome.webview.postMessage({type:'window',action:'close'})")
 finally:
  if p:
   try:p.wait(timeout=3)
   except:p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/search20-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
