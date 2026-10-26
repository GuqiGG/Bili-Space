import asyncio,json,subprocess,urllib.request
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
R=Path.cwd();report={}
async def main():
 settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();d=json.loads(backup);d['config'].update(btr=False,proxy=False,clipboardAutoOpen=False,srMode='off',fiMode='off',zoom=100,autoZoom=False);settings.write_text(json.dumps(d));p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 try:
  for _ in range(100):
   try:t=next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5)) if x.get('type')=='page');break
   except:await asyncio.sleep(.15)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Page.enable');await c.call('Runtime.enable');await c.call('Page.addScriptToEvaluateOnNewDocument',{'source':"new MutationObserver(()=>document.querySelectorAll('video,audio').forEach(v=>v.muted=true)).observe(document,{childList:true,subtree:true});"});await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV17an46ZEEc/'})
   for _ in range(80):
    report['dom']=await c.js("(()=>{const root=document.querySelector('.right-container'),metric=document.querySelector('.video-page-card-small .playinfo');return {url:location.href,title:document.title,hasRight:!!root,metric:metric?.outerHTML,right:root?.outerHTML.slice(0,18000)}})()")
    if report['dom'].get('metric'):break
    await asyncio.sleep(.15)
   if report['dom'].get('metric'):
    report['ancestors']=await c.js("(()=>{let e=document.querySelector('.playinfo'),a=[];for(let i=0;i<4&&e;i++,e=e.parentElement)a.push({tag:e.tagName,classes:e.className,width:e.getBoundingClientRect().width,html:e.outerHTML.slice(0,2300)});return a})()")
    report['styles']=await c.js("(()=>{const m=document.querySelector('.video-page-card-small .playinfo');return [m,...m.querySelectorAll('*')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,classes:e.className?.baseVal??e.className,display:s.display,width:r.width,margin:s.margin,padding:s.padding,gap:s.gap,justify:s.justifyContent,flex:s.flex,html:e.outerHTML.slice(0,500)}})})()")
   if report['dom'].get('metric'):
    report['geometry']=[]
    for width in [169,130,95]:
     row=await c.js("(()=>{const m=document.querySelector('.video-page-card-small .playinfo'),info=m.parentElement;for(const name of ['width','max-width'])info.style.setProperty(name,'"+str(width)+"px','important');info.style.setProperty('flex','0 0 "+str(width)+"px','important');const icons=[...m.querySelectorAll('svg')],texts=[...m.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>{const r=document.createRange();r.selectNodeContents(n);const boxes=[...r.getClientRects()].filter(r=>r.width>0);return {text:n.textContent.trim(),boxes:boxes.map(x=>({left:x.left,right:x.right,top:x.top,bottom:x.bottom}))}});return {infoWidth:info.getBoundingClientRect().width,infoStyle:info.getAttribute('style'),width:m.getBoundingClientRect().width,display:getComputedStyle(m).display,columns:getComputedStyle(m).gridTemplateColumns,icons:icons.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}}),texts}})()")
     assert row['display']=='grid' and len(row['texts'])==2,row
     for i in [0,1]:assert len(row['texts'][i]['boxes'])==1 and abs(row['texts'][i]['boxes'][0]['left']-row['icons'][i]['right']-4)<.3,row
     if width==169:assert abs(row['icons'][1]['left']-row['texts'][0]['boxes'][0]['right']-8)<.3,row
     else:assert row['icons'][1]['top']>row['icons'][0]['top'],row
     report['geometry'].append(row)
    await c.js("(()=>{const info=document.querySelector('.video-page-card-small .playinfo').parentElement;for(const name of ['width','max-width','flex'])info.style.removeProperty(name)})()")
    # Exercise the exact screenshot text in a description root; never visit the target shop.
    report['screenshotDomain']=await c.js("(()=>{const root=document.querySelector('.basic-desc-info');if(!root)return null;root.append(document.createTextNode(' RoseShop.Asia '));return true})()")
    if report['screenshotDomain']:
     for _ in range(20):
      report['shopLink']=await c.js("[...document.querySelectorAll('.basic-desc-info a')].find(a=>a.textContent==='RoseShop.Asia')?.href")
      if report['shopLink']:break
      await asyncio.sleep(.1)
     assert report['shopLink']=='https://roseshop.asia/'
   await c.shot('inspect33-live.png')
 finally:p.terminate();p.wait(timeout=10);settings.write_bytes(backup);(R/'verification/inspect33-live.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
asyncio.run(main());print(json.dumps(report,ensure_ascii=False,indent=2))
