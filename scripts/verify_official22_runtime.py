import asyncio,json,subprocess,urllib.request,base64
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
R=Path.cwd();report={}
async def wait(c,expr):
 for _ in range(100):
  if await c.js(expr):return
  await asyncio.sleep(.1)
 raise AssertionError(expr)
async def main():
 settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();d=json.loads(backup);d['config'].update(proxy=False,srMode='off',fiMode='off',clipboardAutoOpen=False,zoom=100,autoZoom=False);settings.write_text(json.dumps(d));p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist');old=None
 try:
  for _ in range(100):
   try:t=next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5)) if x.get('type')=='page');break
   except:await asyncio.sleep(.15)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable')
   guest=json.load(urllib.request.urlopen(urllib.request.Request('https://api.bilibili.com/x/web-interface/nav',headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.bilibili.com/'})))['data']
   def intercept(m):
    url=m['request']['url'];headers=[{'name':'Content-Type','value':'application/json'},{'name':'Access-Control-Allow-Origin','value':'https://www.bilibili.com'},{'name':'Access-Control-Allow-Credentials','value':'true'}]
    if '/official22-fixture' in url or 'search.bilibili.com/all?' in url:body=b'<html><head><title>Official integration fixture</title></head><body>Independent test fixture</body></html>';headers=[{'name':'Content-Type','value':'text/html'}]
    elif url.split('?')[0].endswith('/nav'):body=json.dumps({'code':0,'data':{'isLogin':True,'mid':2,'uname':'官方空间接口测试（非真实登录）','face':'https://i2.hdslb.com/bfs/face/ef0457addb24141e15dfac6fbf45293ccf1e32ab.jpg','wbi_img':guest['wbi_img']}}).encode()
    elif '/wbi/acc/info' in url:body=json.dumps({'code':0,'data':{'mid':2,'top_photo_v2':{'sid':1,'l_img':'https://i0.hdslb.com/bfs/space/cb1c3ef50e22b6096fde67febe863494caefebad.png','l_200h_img':'https://i0.hdslb.com/bfs/activity-plat/static/0977767b2e79d8ad0a36a731068a83d7/1sz3p8w2Sk.png'}}}).encode()
    else:body=json.dumps({'code':0,'data':{}}).encode()
    return {'method':'Fetch.fulfillRequest','params':{'requestId':m['requestId'],'responseCode':200,'responseHeaders':headers,'body':base64.b64encode(body).decode()}}
   c.intercept=intercept;await c.call('Fetch.enable',{'patterns':[{'urlPattern':'https://www.bilibili.com/official22-fixture*'},{'urlPattern':'https://search.bilibili.com/all?*'},{'urlPattern':'https://api.bilibili.com/x/*'}]});await c.call('Page.navigate',{'url':'https://www.bilibili.com/official22-fixture.html'});await wait(c,'!!window.BiliSpace')
   await c.js("window.testCols=(type,value)=>new Promise((resolve,reject)=>{const frame=document.querySelector('iframe[src*=\"/cols/iframe.html\"]'),id='test-'+crypto.randomUUID(),key='search_history:search_history',timer=setTimeout(()=>reject(Error('test official storage timeout')),4000);const fn=e=>{if(e.source===frame.contentWindow&&e.origin==='https://s1.hdslb.com'&&e.data?.id===id){clearTimeout(timer);removeEventListener('message',fn);resolve(e.data.value);}};addEventListener('message',fn);frame.contentWindow.postMessage({type,id,key,value},'https://s1.hdslb.com');})")
   await wait(c,"document.querySelector('iframe[src*=\"/cols/iframe.html\"]')?.dataset.loaded==='true'")
   old=await c.js("testCols('COLS_GET')");await c.js("testCols('COLS_SET',JSON.stringify([{value:'官网甲',timestamp:1},{value:'官网乙',timestamp:2}]))")
   await c.js("(()=>{const i=document.querySelector('#bili-space-root').shadowRoot.querySelector('.search input');i.focus();i.dispatchEvent(new Event('click'));})()")
   await wait(c,"document.querySelector('#bili-space-root').shadowRoot.querySelectorAll('.search-history-chip').length===2")
   report['chips']=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,rows=[...s.querySelectorAll('.search-history-chip')];return {labels:rows.map(x=>x.textContent),positions:rows.map(x=>({x:x.getBoundingClientRect().x,y:x.getBoundingClientRect().y})),heading:[...s.querySelectorAll('#search-panel h2')].map(x=>x.textContent)};})()")
   assert report['chips']['positions'][0]['y']==report['chips']['positions'][1]['y'] and report['chips']['heading'][-1]=='猜你想搜',report
   await c.shot('official22-search.png')
   await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-remove=\"官网甲\"]').click()")
   await asyncio.sleep(.3);report['officialAfterDelete']=json.loads(await c.js("testCols('COLS_GET')"));assert [x['value'] for x in report['officialAfterDelete']]==['官网乙']
   await c.js("document.querySelector('#bili-space-root').shadowRoot.querySelector('[data-clear]').click()")
   await asyncio.sleep(.3);report['officialAfterClear']=json.loads(await c.js("testCols('COLS_GET')"));assert report['officialAfterClear']==[]
   await c.js("testCols('COLS_SET',"+json.dumps(old)+")")
   await c.js("window.profileResponses=[];window.addEventListener('unhandledrejection',e=>profileResponses.push({error:String(e.reason)}));const originalFetch=window.fetch;window.fetch=async(...args)=>{try{const r=await originalFetch(...args);r.clone().json().then(j=>profileResponses.push({url:String(args[0]),code:j.code,mid:j.data?.mid,photo:j.data?.top_photo_v2}));return r;}catch(e){profileResponses.push({url:String(args[0]),error:String(e)});throw e;}};document.querySelector('#bili-space-root').shadowRoot.querySelector('.search input').blur();BiliSpace.showAccountCard()")
   await wait(c,"!!document.querySelector('#bili-space-root').shadowRoot.querySelector('.account-banner img')")
   for _ in range(10):
    await c.js('true');await asyncio.sleep(.1)
   report['officialBanner']=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,b=s.querySelector('.account-banner img');return {src:b?.src,loaded:b?.complete&&b.naturalWidth>0,signedRequests:performance.getEntriesByType('resource').filter(x=>x.name.includes('/x/space/wbi/acc/info?')).map(x=>x.name)};})()")
   assert report['officialBanner']['loaded'] and report['officialBanner']['signedRequests'],report
   await c.shot('official22-banner.png');report['result']='PASS';await c.js("chrome.webview.postMessage({type:'window',action:'close'})")
 finally:
  try:p.wait(timeout=3)
  except:p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/official22-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
