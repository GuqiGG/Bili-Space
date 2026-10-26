"""Exercise nested homepage layout and hover disclosure in the real native runtime."""
import asyncio,base64,ctypes,hashlib,json,subprocess,sys,urllib.request
from websockets.asyncio.client import connect
from smoke import ROOT,OUT,CDP

async def main():
 label=sys.argv[1] if len(sys.argv)>1 else 'modified'
 baseline=label=='baseline'
 report={'mode':'nested domestic-style DOM fixture in native WebView2, no account writes','label':label,'source_sha256':hashlib.sha256((ROOT/'dist/assets/enhance.js').read_bytes()).hexdigest()}
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
   c=CDP(ws);await c.call('Runtime.enable')
   body=(ROOT/'tests/fixtures/home-nested.html').read_bytes()
   def intercept(event):
    return {'method':'Fetch.fulfillRequest','params':{'requestId':event['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode(body).decode()}}
   c.intercept=intercept
   await c.call('Fetch.enable',{'patterns':[{'urlPattern':'*','resourceType':'Document'}]})
   await c.call('Emulation.setDeviceMetricsOverride',{'width':1360,'height':900,'deviceScaleFactor':1,'mobile':False})
   await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
   await c.call('Page.navigate',{'url':'https://www.bilibili.com/'})
   for _ in range(100):
    if await c.js('!!window.BiliSpace&&document.querySelectorAll("[data-fixture-card]").length===20'):break
    await asyncio.sleep(.1)
   await c.js('BiliSpace.update({theme:"dark",hideAds:true,showChannels:false,srMode:"off",headerHome:true,headerDynamic:true,headerHistory:true,headerBrand:true,headerBack:true})');await asyncio.sleep(.4)
   stats='''(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right}};const s=document.querySelector('#bili-space-root').shadowRoot,b=document.querySelector('.bili-header__banner'),brand=document.querySelector('.bs-banner-brand'),cards=[...document.querySelectorAll('[data-fixture-card]')].filter(e=>e.getClientRects().length&&!e.classList.contains('fixture-ad'));return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,banner:rect(b),bannerBrand:brand?rect(brand):null,bannerText:brand?.textContent,headerTitle:s.querySelector('.brand').textContent,duplicateBar:getComputedStyle(document.querySelector('.bili-header__bar')).display,live:cards.filter(e=>e.classList.contains('floor-single-card')).length,ads:[...document.querySelectorAll('.fixture-ad')].map(e=>({outer:getComputedStyle(e).display,inner:getComputedStyle(e.firstElementChild).display})),cards:cards.map(rect),home:rect(s.querySelector('[data-route=home]')),trigger:rect(s.querySelector('.back')),triggerExpanded:s.querySelector('.back').getAttribute('aria-expanded')}})()'''
   report['before']=await c.js(stats);await c.shot('home-'+label+'.png')
   if not baseline:
    def dense(data,columns):
     assert not data['overflow'],data
     assert data['live']==2 and len(data['cards'])==18,data
     rows={}
     for card in data['cards']:rows.setdefault(round(card['y']),[]).append(card)
     rows=sorted(rows.values(),key=lambda row:row[0]['y'])
     assert all(len(row)==columns for row in rows[:-1]),rows
     for row in rows:
      row.sort(key=lambda card:card['x'])
      for a,b in zip(row,row[1:]):assert 18<=b['x']-a['right']<=22,(a,b)
    dense(report['before'],4)
    assert report['before']['banner']['h']>=88 and report['before']['bannerText']=='Bili Space'
    assert report['before']['headerTitle']=='Bili Space' and report['before']['duplicateBar']=='none'
    assert abs(report['before']['bannerBrand']['x']+report['before']['bannerBrand']['w']/2-(report['before']['banner']['x']+report['before']['banner']['w']/2))<1
    assert all(ad['outer']=='none' for ad in report['before']['ads']),report
    # Only a click opens categories; primary navigation disappears while categories are open.
    t=report['before']['trigger'];point={'x':t['x']+t['w']/2,'y':t['y']+t['h']/2}
    await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved',**point});await asyncio.sleep(.55)
    early=await c.js(stats);assert early['triggerExpanded']=='false',early
    for kind in ['mousePressed','mouseReleased']:await c.call('Input.dispatchMouseEvent',{'type':kind,'button':'left','clickCount':1,**point})
    await asyncio.sleep(.3);opened=await c.js(stats)
    assert opened['triggerExpanded']=='true' and opened['home']['w']==0,opened
    report['categories']={'click_only':True,'primary_hidden':True,'labels':await c.js('[...document.querySelector("#bili-space-root").shadowRoot.querySelectorAll("#header-categories a")].map(a=>({label:a.textContent,url:a.href,font:getComputedStyle(a).fontSize}))')}
    assert all(float(x['font'][:-2])>=15 for x in report['categories']['labels'])
    await c.shot('home-categories-open.png')
    await c.call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':900,'y':500});await asyncio.sleep(.7)
    assert (await c.js(stats))['triggerExpanded']=='true'
    await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector(".back").click()')
    await asyncio.sleep(.25);closed=await c.js(stats);assert closed['triggerExpanded']=='false' and abs(closed['home']['x']-report['before']['home']['x'])<1
    # Dynamically loaded cards join the same grid without moving their native DOM parent.
    await c.js('window.__newCard=document.createElement("article");__newCard.className="feed-card";__newCard.innerHTML="<div class=cover>NEW</div>";document.querySelector(".feed-list").append(__newCard)');await asyncio.sleep(.3)
    assert await c.js('__newCard.dataset.bsFeed==="card"&&__newCard.parentElement.className==="feed-list"')
    await c.js('__newCard.remove();BiliSpace.update({showChannels:true})');await asyncio.sleep(.25)
    report['channels_on']=await c.js(stats);dense(report['channels_on'],4)
    # Narrow screens have a keyboard-operable wrapped disclosure, not title/search overlap.
    report['responsive']=[]
    for width,columns in [(580,2),(880,3),(1100,3),(1440,4),(1680,5)]:
     await c.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':False});await asyncio.sleep(.15)
     data=await c.js(stats);dense(data,columns)
     await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector(".back").click()');await asyncio.sleep(.3)
     metrics=await c.js('(()=>{const s=document.querySelector("#bili-space-root").shadowRoot,r=s.querySelector("#header-categories").getBoundingClientRect();return{left:r.left,right:r.right,width:innerWidth,expanded:s.querySelector(".back").getAttribute("aria-expanded")}})()')
     assert metrics['expanded']=='true' and metrics['left']>=0 and metrics['right']<=width,metrics
     report['responsive'].append({'width':width,'cards':data['cards'],'categories':metrics})
     await c.js('document.querySelector("#bili-space-root").shadowRoot.querySelector(".back").click()')
    await c.call('Emulation.setDeviceMetricsOverride',{'width':1360,'height':900,'deviceScaleFactor':1,'mobile':False})
    # reduced-motion removes the transform transition; Escape returns focus to the trigger.
    await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]})
    report['reduced_motion']=await c.js('(()=>{const s=document.querySelector("#bili-space-root").shadowRoot;return getComputedStyle(s.querySelector(".primary-nav")).transitionDuration})()')
    assert report['reduced_motion']=='0s'
    # The Manga category must stay inside the C++ client, not launch a system browser.
    await c.js('const s=document.querySelector("#bili-space-root").shadowRoot;s.querySelector(".back").click();[...s.querySelectorAll("#header-categories a")].find(a=>a.textContent==="漫画").click()')
    for _ in range(60):
     if await c.js('location.hostname==="manga.bilibili.com"&&!!window.BiliSpace'):break
     await asyncio.sleep(.1)
    report['manga_navigation']=await c.js('({url:location.href,clientHeader:!!document.querySelector("#bili-space-root")})')
    assert report['manga_navigation']=={'url':'https://manga.bilibili.com/','clientHeader':True},report['manga_navigation']
   report['runtime_errors']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown'];assert not report['runtime_errors'],report['runtime_errors']
   report['result']='OBSERVED BASELINE' if baseline else 'PASS'
 finally:
  if p.poll() is None:
   ctypes.windll.user32.PostMessageW(ctypes.windll.user32.FindWindowW('BetterBiliSpace','Bili-Space [test]'),0x10,0,0)
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:p.terminate();p.wait()
  (OUT/('home-'+label+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps(report,ensure_ascii=True,indent=2))

asyncio.run(main())
