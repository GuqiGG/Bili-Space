import asyncio,ctypes,json,subprocess,urllib.request,time,hashlib
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
ROOT=Path.cwd();OUT=ROOT/'verification';report={};u=ctypes.windll.user32;u.SendMessageW.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_size_t,ctypes.c_ssize_t];u.SendMessageW.restype=ctypes.c_ssize_t
class POINT(ctypes.Structure):_fields_=[('x',ctypes.c_long),('y',ctypes.c_long)]
class MINMAX(ctypes.Structure):_fields_=[('reserved',POINT),('maxSize',POINT),('maxPosition',POINT),('minTrack',POINT),('maxTrack',POINT)]
async def wait(c,exp,seconds=20):
 for _ in range(int(seconds/.15)):
  if await c.js(exp):return
  await asyncio.sleep(.15)
 raise AssertionError(exp+' STATE '+json.dumps(await c.js('BiliSpace.state'),ensure_ascii=True))
async def main():
 settings=ROOT/'dist/.appdata/settings.json';backup=settings.read_bytes();data=json.loads(backup);data['config'].update(srMode='off',fiMode='off',proxy=False,zoom=100,autoZoom=False);settings.write_text(json.dumps(data),encoding='utf8');p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],cwd=ROOT/'dist')
 try:
  for _ in range(100):
   try:
    ts=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5));t=next(t for t in ts if t.get('type')=='page' and 'bili-space.local' in t.get('url',''));break
   except:await asyncio.sleep(.2)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable');await wait(c,'!!window.BiliSpace');h=u.FindWindowW('BetterBiliSpace','Bili-Space [test]')
   m=MINMAX();u.SendMessageW(h,0x24,0,ctypes.addressof(m));report['minimum']=[m.minTrack.x,m.minTrack.y];assert report['minimum']==[480,320]
   await c.js('BiliSpace.openSettings()');report['settingsResize']=await c.js('getComputedStyle(document.querySelector("#bili-space-root").shadowRoot.querySelector(".dialog")).resize');assert report['settingsResize']=='both'
   await c.js('(()=>{const d=document.querySelector("#bili-space-root").shadowRoot.querySelector(".dialog");d.style.width="800px";d.style.height="500px"})()');await asyncio.sleep(.2)
   box=await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector(".dialog").getBoundingClientRect().toJSON()');x=box['right']-7;y=box['bottom']-7
   await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':x,'y':y});await c.call('Input.dispatchMouseEvent',{'type':'mousePressed','button':'left','buttons':1,'clickCount':1,'x':x,'y':y});await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved','button':'left','buttons':1,'x':x-100,'y':y-60});await c.call('Input.dispatchMouseEvent',{'type':'mouseReleased','button':'left','buttons':0,'clickCount':1,'x':x-100,'y':y-60});await asyncio.sleep(.2)
   resized=await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector(".dialog").getBoundingClientRect().toJSON()');report['dialogDrag']={'before':[box['width'],box['height']],'after':[resized['width'],resized['height']]};assert resized['width']<box['width']-20 and resized['height']<box['height']-10,report['dialogDrag']
   await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector(".dialog").style.width="500px"');await asyncio.sleep(.2)
   report['compactDialog']=await c.js('(()=>{const d=document.querySelector("#bili-space-root").shadowRoot.querySelector(".dialog");return {compact:d.dataset.compact,columns:getComputedStyle(d).gridTemplateColumns,width:d.getBoundingClientRect().width,main:d.querySelector("main").clientWidth}})()');assert report['compactDialog']['compact']=='true' and report['compactDialog']['main']>450,report['compactDialog'];await c.shot('player-compact-dialog.png')
   await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector(".dialog").removeAttribute("style")')
   u.SetWindowPos(h,0,0,0,640,440,0x0002|0x0004);await asyncio.sleep(.4);report['small']=await c.js('(()=>{const r=document.querySelector("#bili-space-root").shadowRoot.querySelector(".dialog").getBoundingClientRect();return {viewport:[innerWidth,innerHeight],dialog:[r.left,r.top,r.right,r.bottom],scrollWidth:document.documentElement.scrollWidth}})()');assert report['small']['dialog'][2]<=report['small']['viewport'][0] and report['small']['dialog'][3]<=report['small']['viewport'][1],report['small'];await c.shot('player-small-settings.png')
   u.SetWindowPos(h,0,0,0,1380,880,0x0002|0x0004);await asyncio.sleep(.3);await c.js('BiliSpace.closeSettings();document.querySelector("video").style.cssText="width:1280px;height:720px;max-width:none";(()=>{const q=document.querySelector(".bpx-player-ctrl-quality");q.style.cssText="color:rgba(250,250,250,.9);font-size:14px;opacity:.82";const m=document.createElement("div");m.className="bpx-player-ctrl-quality-menu";m.style.cssText="display:none;background:rgba(20,20,20,.8);border-radius:2px";q.append(m)})();BiliSpace.update({fiMode:"off"})');await asyncio.sleep(.3)
   report['integration']=await c.js('(()=>{const q=document.querySelector(".bpx-player-ctrl-quality"),sr=document.querySelector(".bs-player-tool[data-kind=sr]"),fi=document.querySelector(".bs-player-tool[data-kind=fi]"),s=getComputedStyle(sr),b=getComputedStyle(sr.querySelector("button")),o=getComputedStyle(q);return {order:sr.nextElementSibling===fi&&fi.nextElementSibling===q,color:[s.color,o.color],opacity:[s.opacity,o.opacity],font:[b.fontSize,o.fontSize],icon:[...fi.querySelectorAll("svg rect")].map(r=>[r.getAttribute("x"),r.getAttribute("opacity")])}})()');assert report['integration']['order'];assert all(x[0]==x[1] for x in [report['integration']['color'],report['integration']['opacity'],report['integration']['font']]);assert report['integration']['icon']==[['3',None],['6','.5'],['9','.2']]
   report['aiFlowProof']=await c.js('BiliSpace.testInterpolation()');assert report['aiFlowProof']['aiMse']<report['aiFlowProof']['blendMse']*.5 and report['aiFlowProof']['oldEdge']<100 and report['aiFlowProof']['newEdge']>200,report['aiFlowProof']
   await c.js('document.querySelector(".bpx-player-control-bottom").scrollIntoView({block:"end",behavior:"instant"})');await asyncio.sleep(.2)
   await c.js('document.querySelector(".bs-fi-toggle").click();document.querySelector("video").play();(()=>{const s=document.querySelector("[aria-label=补帧模式]");s.value="rife";s.dispatchEvent(new Event("change",{bubbles:true}))})()');await wait(c,'BiliSpace.state.interpolation?.generated>10');report['fiOnly']=await c.js('BiliSpace.state.interpolation');assert not report['fiOnly']['stopped'] and report['fiOnly']['inferences']>0 and 'RIFE AI' in report['fiOnly']['status'];await c.shot('player-interpolation.png')
   await c.js('BiliSpace.update({srMode:"quality",srScale:2})');await wait(c,'BiliSpace.state.frames>5&&document.querySelector(".bs-fi-canvas")?.width===1280');report['combined']=await c.js('({ai:BiliSpace.state.frames,fi:BiliSpace.state.interpolation,aiSize:[document.querySelector(".bs-gpu-canvas:not(.bs-fi-canvas)").width,document.querySelector(".bs-gpu-canvas:not(.bs-fi-canvas)").height],fiSize:[document.querySelector(".bs-fi-canvas").width,document.querySelector(".bs-fi-canvas").height]})');assert report['combined']['aiSize']==report['combined']['fiSize']==[1280,720]
   await c.js('BiliSpace.update({fiMode:"off"})');await asyncio.sleep(.3);assert await c.js('document.querySelector("video").style.opacity')=='0' and await c.js('!!document.querySelector(".bs-gpu-canvas:not(.bs-fi-canvas)")')
   await c.js('BiliSpace.update({fiMode:"rife"})');await wait(c,'BiliSpace.state.interpolation?.generated>2');await c.js('BiliSpace.update({srMode:"off"})');await wait(c,'document.querySelector(".bs-fi-canvas")?.width===640');assert await c.js('document.querySelector("video").style.opacity')=='0'
   await c.js('BiliSpace.update({fiMode:"off"})');assert await c.js('document.querySelector("video").style.opacity')!='0';assert not await c.js('!!document.querySelector(".bs-gpu-canvas")')
   await c.js('BiliSpace.update({fiMode:"rife",fiFps:120})');await wait(c,'BiliSpace.state.interpolation?.generated>1');report['target120']=await c.js('BiliSpace.state.interpolation');await asyncio.sleep(.3)
   await c.js('(()=>{const s=document.querySelector("[aria-label=光流规模]");s.value="25";s.dispatchEvent(new Event("change",{bubbles:true}))})()');await wait(c,'BiliSpace.state.interpolation?.inferences>2');report['flowScale25']=await c.js('BiliSpace.state.interpolation');assert report['flowScale25']['estimate']==[192,128],report['flowScale25']
   saved=json.loads(settings.read_text());assert saved['config']['fiMode']=='rife' and saved['config']['fiFps']==120 and saved['config']['fiFlowScale']==25
   await c.js('BiliSpace.update({fiMode:"off"})');await c.call('Page.reload');await asyncio.sleep(.3);await wait(c,'!!window.BiliSpace');assert await c.js('BiliSpace.state.prefs.fiFps')==120
   await c.js('BiliSpace.update({fiMode:"rife"})');await wait(c,'BiliSpace.state.interpolation?.generated>1');await c.js('document.querySelector(".bs-fi-canvas").getContext("webgl").getExtension("WEBGL_lose_context").loseContext()');await asyncio.sleep(.2);report['fallback']=await c.js('({state:BiliSpace.state.interpolation,opacity:document.querySelector("video").style.opacity,canvas:!!document.querySelector(".bs-fi-canvas")})');assert report['fallback']['state']['stopped'] and not report['fallback']['canvas'] and report['fallback']['opacity']!='0';await c.js('BiliSpace.update({fiMode:"off"})')
   report['errors']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown'];assert not report['errors'];report['sha256']={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [ROOT/'dist/Bili-Space.exe',ROOT/'assets/enhance.js',ROOT/'assets/frame-interpolation.svg']};report['result']='PASS'
 finally:
  u.PostMessageW(u.FindWindowW('BetterBiliSpace','Bili-Space [test]'),0x10,0,0)
  try:p.wait(timeout=5)
  except:p.terminate();p.wait()
  settings.write_bytes(backup);(OUT/'player-regression.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True,indent=2))
asyncio.run(main())
