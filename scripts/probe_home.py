"""Read-only anonymous homepage observation; no account actions."""
import asyncio,ctypes,hashlib,json,subprocess,urllib.request
from websockets.asyncio.client import connect
from smoke import ROOT,OUT,CDP

async def main():
 startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
 p=subprocess.Popen([str(ROOT/'dist/Bili-Space.exe'),'--test'],startupinfo=startup)
 try:
  for _ in range(80):
   try:
    targets=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));targets=[t for t in targets if t.get('type')=='page' and 'bili-space.local' in t.get('url','')]
    if targets:break
   except Exception:pass
   await asyncio.sleep(.25)
  async with connect(targets[0]['webSocketDebuggerUrl'],max_size=20000000) as ws:
   c=CDP(ws);await c.call('Emulation.setFocusEmulationEnabled',{'enabled':True});await c.call('Page.navigate',{'url':'https://www.bilibili.com/'});await asyncio.sleep(10)
   await c.js('BiliSpace.update({showChannels:false,hideAds:true,srMode:"off"})');await asyncio.sleep(.4)
   report=await c.js('''(()=>{const rect=e=>e.getBoundingClientRect().toJSON();return{url:location.href,banner:rect(document.querySelector('.bili-header__banner')),brand:document.querySelector('.bs-banner-brand')?.textContent,cards:document.querySelectorAll('.bili-video-card').length,roots:[...document.querySelectorAll('[data-bs-feed=grid]')].map(e=>({c:e.className,rect:rect(e),columns:getComputedStyle(e).gridTemplateColumns})),shims:[...document.querySelectorAll('.fixed-channel-shim,.load-more-anchor')].map(e=>({c:e.className,display:getComputedStyle(e).display,rect:rect(e),html:e.outerHTML.slice(0,2500)})),overflow:document.documentElement.scrollWidth>innerWidth}})()''')
   report['source_sha256']=hashlib.sha256((ROOT/'assets/enhance.js').read_bytes()).hexdigest()
   assert report['brand']=='Bili Space' and report['banner']['height']>0 and not report['overflow'],report
   report['loaded_without_scrolling']=await c.js('[...document.querySelectorAll(".bili-video-card")].filter(e=>e.querySelector("a[href*=video]")).length')
   await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
   report['banner_motion']=[]
   for x in [.15,.85]:
    b=report['banner'];await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':b['x']+b['width']*x,'y':b['y']+b['height']*.5});await asyncio.sleep(.2)
    report['banner_motion'].append(await c.js('(()=>{const b=document.querySelector("[data-bs-banner=true]"),img=b.querySelector(".banner-img");return{mode:b.dataset.bsMotion,transform:img?getComputedStyle(img).transform:null,x:b.style.getPropertyValue("--bs-banner-x"),layers:b.querySelectorAll(".animated-banner .layer").length}})()'))
   if report['banner_motion'][0]['mode']=='static':assert report['banner_motion'][0]['transform']!=report['banner_motion'][1]['transform'],report['banner_motion']
   if report['banner_motion'][0]['mode']=='static':
    await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]})
    report['reduced_motion_banner']=await c.js('getComputedStyle(document.querySelector("[data-bs-banner=true] .banner-img")).transform')
    assert report['reduced_motion_banner']=='none'
    await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
   await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':1000,'y':500});await asyncio.sleep(.2)
   await c.shot('home-live-current.png')
   report['scroll']=[]
   for _ in range(3):
    await c.js('scrollTo(0,document.documentElement.scrollHeight)');await asyncio.sleep(3)
    report['scroll'].append(await c.js('({y:scrollY,height:document.documentElement.scrollHeight,cards:document.querySelectorAll(".bili-video-card").length,loaded:[...document.querySelectorAll(".bili-video-card")].filter(e=>e.querySelector("a[href*=video]")).length})'))
   assert report['scroll'][-1]['loaded']>report['scroll'][0]['loaded'],report['scroll']
   assert report['scroll'][-1]['height']>report['scroll'][0]['height'],report['scroll']
   report['result']='PASS'
   await c.shot('home-live-scrolled.png')
   (OUT/'home-live-current.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
   print(json.dumps(report,ensure_ascii=True,indent=2))
 finally:
  if p.poll() is None:
   ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]'),0x10,0,0)
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:p.terminate();p.wait()

asyncio.run(main())
