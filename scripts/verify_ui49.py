import asyncio,json,subprocess,urllib.request
from websockets.asyncio.client import connect
from smoke import CDP,ROOT
async def main():
 si=subprocess.STARTUPINFO();si.dwFlags|=subprocess.STARTF_USESHOWWINDOW;si.wShowWindow=0
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist',startupinfo=si)
 try:
  ts=[]
  for _ in range(80):
   try:ts=[t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if t.get('type')=='page' and 'bili-space.local' in t.get('url','')]
   except:pass
   if ts:break
   await asyncio.sleep(.2)
  async with connect(ts[0]['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable')
   for _ in range(100):
    if await c.js("location.hostname==='bili-space.local'&&!!window.BiliSpace"):break
    await asyncio.sleep(.2)
   await c.call('Emulation.setDeviceMetricsOverride',{'width':1500,'height':950,'deviceScaleFactor':1,'mobile':False})
   await c.js("history.replaceState({},'', '/');BiliSpace.syncRoute();BiliSpace.update({trafficLights:false,headerFavorites:true})")
   await c.js("window.originalFetch=fetch;window.fetch=async url=>String(url).includes('/x/web-interface/nav')?{ok:true,json:async()=>({code:0,data:{isLogin:true,mid:123}})}:String(url).includes('list-all')?{ok:true,json:async()=>({code:0,data:{list:[{id:7,title:'日常收藏',media_count:12},{id:8,title:'设计与灵感',media_count:32},{id:9,title:'音乐现场',media_count:8}]}})}:String(url).includes('/fav/resource')?{ok:true,json:async()=>({code:0,data:{medias:['那些值得反复观看的瞬间','把生活过成喜欢的模样','镜头之外，城市的另一面','留给自己的一个下午'].map((title,i)=>({bvid:'BV123456789'+i,title,upper:{name:['摄影笔记','生活观察员','城市漫游','音乐收藏家'][i]},cover:''})),has_more:true}})}:originalFetch(url)")
   await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('.favorites').click()")
   await asyncio.sleep(.3)
   await c.js("[...document.querySelector('#bili-space-root').shadowRoot.querySelectorAll('.favorites-cover')].forEach((e,i)=>e.style.background=['#53675b','#76635f','#4c647b','#806d48'][i])")
   await c.shot('ui49-favorites.png')
   for width in [900,620]:
    await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':False});await asyncio.sleep(.3)
    bounds=await c.js("(()=>{const p=document.querySelector('#bili-space-root').shadowRoot.querySelector('.favorites-panel'),r=p.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}})()")
    assert bounds['left']>=0 and bounds['right']<=bounds['width'],bounds
    await c.shot('ui49-favorites-'+str(width)+'.png')
   await c.call('Emulation.setDeviceMetricsOverride',{'width':1500,'height':950,'deviceScaleFactor':1,'mobile':False})
   await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('.favorites-close').click();BiliSpace.openSettings()")
   await c.shot('ui49-settings.png')
   await c.js("BiliSpace.closeSettings?.();window.fetch=originalFetch")
   await c.call('Page.navigate',{'url':'https://www.bilibili.com/'})
   await asyncio.sleep(7)
   print('live route',await c.js('location.href'))
   print('suggestion',await c.js("(async()=>{try{const r=await fetch('https://api.bilibili.com/x/web-interface/suggest?term=python&highlight=0',{credentials:'include'});const j=await r.json();return {status:r.status,code:j.code,count:(j.data?.result?.tag||j.result?.tag||[]).length}}catch(e){return {error:e.message}}})()"))
 finally:
  p.terminate();p.wait()
asyncio.run(main())
