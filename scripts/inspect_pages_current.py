import asyncio,json,subprocess,urllib.request
from websockets.asyncio.client import connect
from smoke import ROOT,OUT,CDP
async def main():
 s=subprocess.STARTUPINFO();s.dwFlags|=subprocess.STARTF_USESHOWWINDOW;s.wShowWindow=0
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],startupinfo=s)
 try:
  for _ in range(80):
   try:
    ts=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list'));ts=[t for t in ts if t.get('type')=='page' and 'bili-space.local' in t.get('url','')]
    if ts:break
   except Exception:pass
   await asyncio.sleep(.2)
  async with connect(ts[0]['webSocketDebuggerUrl'],max_size=30000000) as ws:
   c=CDP(ws);await c.call('Network.enable')
   await c.call('Page.navigate',{'url':'https://www.bilibili.com/'});await asyncio.sleep(8)
   home=await c.js('''({url:location.href,header:document.querySelector('.bili-header')?.outerHTML,styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(e=>e.href),backgrounds:[...document.querySelectorAll('body,#i_cecream,#app,.bili-feed4-layout,.feed2')].map(e=>({c:e.className,id:e.id,bg:getComputedStyle(e).backgroundImage})),animated:[...document.querySelectorAll('.animated-banner,.bili-banner,.bili-header__banner')].map(e=>({c:e.className,html:e.outerHTML.slice(0,6000)}))})''')
   (OUT/'current-home-dom.json').write_text(json.dumps(home,ensure_ascii=False,indent=2),encoding='utf8')
   await c.call('Page.navigate',{'url':'https://message.bilibili.com/#/whisper'});await asyncio.sleep(7)
   message=await c.js('''({url:location.href,body:document.body.outerHTML.slice(0,60000),styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(e=>e.href),frames:[...document.querySelectorAll('iframe')].map(e=>({src:e.src,c:e.className})),roots:[...document.querySelectorAll('body,#app,#link-message-container,.container,.space-left,.space-right')].map(e=>({id:e.id,c:e.className,bg:getComputedStyle(e).background,color:getComputedStyle(e).color}))})''')
   (OUT/'current-message-dom.json').write_text(json.dumps(message,ensure_ascii=False,indent=2),encoding='utf8')
   await c.shot('message-baseline-live.png');print(json.dumps({'home_url':home['url'],'home_styles':home['styles'],'message_styles':message['styles'],'message_roots':message['roots'],'frames':message['frames']},ensure_ascii=True))
 finally:p.terminate();p.wait()
asyncio.run(main())
