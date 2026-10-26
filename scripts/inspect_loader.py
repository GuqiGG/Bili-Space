import asyncio,json,subprocess,urllib.request,re
from websockets.asyncio.client import connect
from smoke import ROOT,OUT,CDP
async def main():
 s=subprocess.STARTUPINFO();s.dwFlags|=subprocess.STARTF_USESHOWWINDOW;s.wShowWindow=0;p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],startupinfo=s)
 try:
  for _ in range(80):
   try:
    ts=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list'));ts=[t for t in ts if t.get('type')=='page' and 'bili-space.local' in t.get('url','')]
    if ts:break
   except Exception:pass
   await asyncio.sleep(.2)
  async with connect(ts[0]['webSocketDebuggerUrl'],max_size=30000000) as ws:
   c=CDP(ws);await c.call('Page.navigate',{'url':'https://www.bilibili.com/'});await asyncio.sleep(5)
   urls=await c.js('[...document.querySelectorAll("script[src],link[rel=modulepreload]")].map(e=>e.src||e.href)')
   report={'urls':urls,'matches':[]}
   for i,u in enumerate(urls):
    if 'laputa-home' not in u:continue
    try:
     code=urllib.request.urlopen(u,timeout=15).read().decode('utf8');(OUT/f'upstream-home-module-{i}.js').write_text(code,encoding='utf8')
     for term in ['load-more-anchor','IntersectionObserver','addEventListener("scroll"','scrollHeight','loadMore']:
      matches=[code[max(0,m.start()-250):m.end()+400] for m in list(re.finditer(re.escape(term),code))[:10]]
      if matches:report['matches'].append({'url':u,'term':term,'matches':matches})
    except Exception as e:report['matches'].append({'url':u,'error':str(e)})
   (OUT/'loader-inspect.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
 finally:p.terminate();p.wait()
asyncio.run(main())
