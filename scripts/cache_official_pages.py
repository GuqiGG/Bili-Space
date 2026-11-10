"""Cache the actual public site documents and loaded static resources, without user profiles.

By default the built client is driven through its test CDP port. `--edge` uses an isolated headless
Microsoft Edge guest profile instead, and `--routes` limits capture to named routes; new captures are
merged into the existing manifest so earlier resources stay verifiable.
"""
import argparse,asyncio,base64,hashlib,json,os,shutil,subprocess,tempfile,urllib.request
from urllib.parse import urlsplit,unquote
from pathlib import Path
from websockets.asyncio.client import connect
ROOT=Path(__file__).resolve().parents[1]
ROUTES={'home':'https://www.bilibili.com/','dynamic':'https://t.bilibili.com/','history':'https://www.bilibili.com/account/history',
 'space':'https://space.bilibili.com/2','message':'https://message.bilibili.com/','search':'https://search.bilibili.com/all?keyword=bilibili'}
DOCUMENT_HOSTS={'www.bilibili.com','t.bilibili.com','space.bilibili.com','message.bilibili.com','search.bilibili.com'}
class Session:
 def __init__(self,ws):self.ws=ws;self.sequence=0;self.resources={}
 async def call(self,method,params=None):
  self.sequence+=1;n=self.sequence;await self.ws.send(json.dumps({'id':n,'method':method,'params':params or {}}))
  while True:
   v=json.loads(await asyncio.wait_for(self.ws.recv(),30))
   if v.get('method')=='Network.responseReceived':
    p=v['params'];r=p['response'];u=urlsplit(r['url']);kind=p['type']
    if r.get('status')==200 and u.scheme=='https' and ((kind=='Document' and u.hostname in DOCUMENT_HOSTS) or (kind in ['Stylesheet','Script','Font'] and (u.hostname or '').endswith('.hdslb.com'))):self.resources[p['requestId']]={'url':r['url'],'type':kind,'mime':r.get('mimeType','application/octet-stream')}
   if v.get('id')==n:
    if 'error' in v:raise RuntimeError(v['error'])
    return v.get('result',{})
 async def js(self,code):return (await self.call('Runtime.evaluate',{'expression':code,'returnByValue':True})).get('result',{}).get('value')
def fetch(url):
 # Static CDN files are public and immutable, so an evicted response body is fetched again unchanged.
 request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0','Referer':'https://www.bilibili.com/'})
 with urllib.request.urlopen(request,timeout=30) as response:
  if response.status!=200 or response.headers.get('Content-Encoding'):raise RuntimeError('unexpected response')
  return response.read()
def launch(edge):
 if not edge:return subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist'),9223,None
 profile=tempfile.mkdtemp(prefix='bili-space-capture-');binary=next(p for p in [os.environ.get('EDGE_PATH',''),r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'] if p and Path(p).exists())
 return subprocess.Popen([binary,'--headless=new','--remote-debugging-port=9224','--user-data-dir='+profile,'--no-first-run','--window-size=1440,900','about:blank']),9224,profile
async def main(edge,routes):
 out=ROOT/'assets/web-copy';out.mkdir(exist_ok=True);path=out/'manifest.json'
 manifest=json.loads(path.read_text(encoding='utf-8')) if routes and path.exists() else {'schema':1,'resources':{},'pages':{}}
 process,port,profile=launch(edge)
 try:
  for _ in range(100):
   try:t=next(x for x in json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list',timeout=1)) if x.get('type')=='page');break
   except (OSError,StopIteration):await asyncio.sleep(.2)
  async with connect(t['webSocketDebuggerUrl'],max_size=40*1024*1024) as ws:
   s=Session(ws);await s.call('Network.clearBrowserCookies');await s.call('Network.enable',{'maxTotalBufferSize':100000000,'maxResourceBufferSize':10000000})
   if not edge:
    for _ in range(100):
     if await s.js('!!window.BiliSpace'):break
     await asyncio.sleep(.2)
   for route in routes or ['home','dynamic','history']:
    url=ROUTES[route];s.resources={};await s.call('Page.navigate',{'url':url})
    for _ in range(80):
     await s.js('document.readyState');await asyncio.sleep(.15)
     if len(s.resources)>8 and await s.js("document.readyState==='complete'"):break
    await asyncio.sleep(3);await s.js('0')
    for identifier,record in list(s.resources.items()):
     if record['url'] in manifest['resources']:continue
     try:
      try:body=await s.call('Network.getResponseBody',{'requestId':identifier});data=base64.b64decode(body['body']) if body.get('base64Encoded') else body['body'].encode('utf-8')
      except RuntimeError:
       if record['type']=='Document':raise
       data=fetch(record['url'])
      if len(data)>10000000:continue
      u=urlsplit(record['url']);file=u.hostname+unquote(u.path);file=file.rstrip('/')+'/index.html' if record['type']=='Document' and not Path(file).suffix else file
      if u.query:file+='.__'+hashlib.sha256(u.query.encode()).hexdigest()[:12]
      dest=out/file;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
      manifest['resources'][record['url']]={'file':file,'mime':record['mime'],'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'type':record['type']}
      if record['type']=='Document':manifest['pages'][route]=record['url']
     except Exception as e:print('skip',record['url'],str(e)[:80],flush=True)
    print(route,len(manifest['resources']),'resources',flush=True)
   path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
   print('Cached',len(manifest['resources']),'actual resources;',sum(r['bytes'] for r in manifest['resources'].values()),'bytes')
 finally:
  process.terminate();process.wait()
  if profile:shutil.rmtree(profile,ignore_errors=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--edge',action='store_true');parser.add_argument('--routes',default='')
 args=parser.parse_args();routes=[r for r in args.routes.split(',') if r]
 assert all(r in ROUTES for r in routes),routes
 asyncio.run(main(args.edge,routes))
