"""Cache the actual public site documents and loaded static resources, without user profiles."""
import asyncio,base64,hashlib,json,subprocess,urllib.request
from urllib.parse import urlsplit,unquote
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import ROOT
class Session:
 def __init__(self,ws):self.ws=ws;self.sequence=0;self.resources={}
 async def call(self,method,params=None):
  self.sequence+=1;n=self.sequence;await self.ws.send(json.dumps({'id':n,'method':method,'params':params or {}}))
  while True:
   v=json.loads(await asyncio.wait_for(self.ws.recv(),30))
   if v.get('method')=='Network.responseReceived':
    p=v['params'];r=p['response'];u=urlsplit(r['url']);kind=p['type']
    if r.get('status')==200 and u.scheme=='https' and ((kind=='Document' and u.hostname in ['www.bilibili.com','t.bilibili.com']) or (kind in ['Stylesheet','Script','Font'] and (u.hostname or '').endswith('.hdslb.com'))):self.resources[p['requestId']]={'url':r['url'],'type':kind,'mime':r.get('mimeType','application/octet-stream')}
   if v.get('id')==n:
    if 'error' in v:raise RuntimeError(v['error'])
    return v.get('result',{})
 async def js(self,code):return (await self.call('Runtime.evaluate',{'expression':code,'returnByValue':True})).get('result',{}).get('value')
async def main():
 out=ROOT/'assets/web-copy';out.mkdir(exist_ok=True);manifest={'schema':1,'resources':{},'pages':{}}
 process=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist')
 try:
  for _ in range(100):
   try:t=next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1)) if x.get('type')=='page');break
   except (OSError,StopIteration):await asyncio.sleep(.2)
  async with connect(t['webSocketDebuggerUrl'],max_size=40*1024*1024) as ws:
   s=Session(ws);await s.call('Network.clearBrowserCookies');await s.call('Network.enable',{'maxTotalBufferSize':100000000,'maxResourceBufferSize':10000000})
   for _ in range(100):
    if await s.js('!!window.BiliSpace'):break
    await asyncio.sleep(.2)
   for route,url in [('home','https://www.bilibili.com/'),('dynamic','https://t.bilibili.com/'),('history','https://www.bilibili.com/account/history')]:
    s.resources={};await s.call('Page.navigate',{'url':url})
    for _ in range(80):
     await s.js('document.readyState');await asyncio.sleep(.15)
     if len(s.resources)>8 and await s.js("document.readyState==='complete'"):break
    await asyncio.sleep(2);await s.js('0')
    for identifier,record in list(s.resources.items()):
     if record['url'] in manifest['resources']:continue
     try:
      body=await s.call('Network.getResponseBody',{'requestId':identifier});data=base64.b64decode(body['body']) if body.get('base64Encoded') else body['body'].encode('utf-8')
      if len(data)>10000000:continue
      u=urlsplit(record['url']);path=u.hostname+unquote(u.path);path=path.rstrip('/')+'/index.html' if record['type']=='Document' and not Path(path).suffix else path
      if u.query:path+='.__'+hashlib.sha256(u.query.encode()).hexdigest()[:12]
      dest=out/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
      manifest['resources'][record['url']]={'file':path,'mime':record['mime'],'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'type':record['type']}
      if record['type']=='Document':manifest['pages'][route]=record['url']
     except Exception as e:print('skip',record['url'],str(e)[:80],flush=True)
    print(route,len(manifest['resources']),'resources',flush=True)
   (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
   print('Cached',len(manifest['resources']),'actual resources;',sum(r['bytes'] for r in manifest['resources'].values()),'bytes')
 finally:process.terminate();process.wait()
asyncio.run(main())
