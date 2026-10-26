import asyncio,json,subprocess,urllib.request
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
R=Path.cwd();report={}
async def main():
 settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();data=json.loads(backup);data['config'].update(srMode='off',fiMode='off',proxy=False,zoom=100,autoZoom=False);settings.write_text(json.dumps(data));p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 try:
  for _ in range(100):
   try:
    ts=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5));t=next(x for x in ts if x.get('type')=='page' and 'bili-space.local' in x.get('url',''));break
   except:await asyncio.sleep(.2)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Emulation.setFocusEmulationEnabled',{'enabled':True})
   for _ in range(100):
    if await c.js('!!window.BiliSpace'):break
    await asyncio.sleep(.2)
   await c.call('Page.navigate',{'url':'https://www.bilibili.com/'});await asyncio.sleep(5)
   await c.js('BiliSpace.update({hideAds:true,showChannels:true})');report['sizes']=[]
   for width in [1920,960,1280,640,1600,1280]:
    await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':1000,'deviceScaleFactor':1,'mobile':False});await asyncio.sleep(.5)
    item=await c.js("(()=>{const host=document.querySelector('[data-bs-feed=grid]');if(!host)return null;const cards=[...host.querySelectorAll('[data-bs-feed=card]')].map(e=>e.getBoundingClientRect()).filter(b=>b.width>5&&b.height>5),rows=[];for(const b of cards){let row=rows.find(r=>Math.abs(r.y-b.y)<2);if(!row){row={y:b.y,x:[]};rows.push(row);}row.x.push(b.x);}rows.sort((a,b)=>a.y-b.y);return {width:innerWidth,columns:getComputedStyle(host).gridTemplateColumns.split(' ').length,rows:rows.map(r=>({y:r.y,count:r.x.length})),shim:[...document.querySelectorAll('.fixed-channel-shim')].map(e=>({position:getComputedStyle(e).position,height:e.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth}})()");report['sizes'].append(item);assert item and len(item['rows'])>1,item;assert not item['overflow'],item
    assert all(row['count']==item['columns'] for row in item['rows'][:-1]),item
   report['result']='PASS'
   await c.js('BiliSpace.update({fiMode:"off",srMode:"off"});chrome.webview.postMessage({type:"window",action:"close"})')
 finally:
  try:p.wait(timeout=3)
  except: p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/navigation-home-resize.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
