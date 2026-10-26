import asyncio,json,subprocess,urllib.request,base64
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
R=Path.cwd();report={}
async def wait(c,expr):
 for _ in range(120):
  if await c.js(expr):return
  await asyncio.sleep(.1)
 raise AssertionError(expr)
async def main():
 settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();d=json.loads(backup);d['config'].update(proxy=False,btr=True,srMode='off',fiMode='off',clipboardAutoOpen=False,zoom=100,autoZoom=False);settings.write_text(json.dumps(d));p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 try:
  for _ in range(100):
   try:t=next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5)) if x.get('type')=='page');break
   except:await asyncio.sleep(.15)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Emulation.setFocusEmulationEnabled',{'enabled':True});await c.call('Page.navigate',{'url':'https://www.bilibili.com/video/BV1cjHK6GEJE'})
   await wait(c,"!!window.BiliSpace&&document.querySelector('.bpx-player-video-wrap video')?.readyState>=2&&!document.querySelector('#bs-video-loading')")
   await c.js("window.testVideo=()=>[...document.querySelectorAll('.bpx-player-video-wrap video')].sort((a,b)=>{const score=v=>(getComputedStyle(v).display!=='none'&&v.getBoundingClientRect().width>0?100:0)+v.readyState;return score(b)-score(a);})[0];testVideo().play()")
   await wait(c,'!testVideo().paused')
   await c.js("(()=>{const i=document.querySelector('#bili-space-root').shadowRoot.querySelector('.search input');i.focus();i.value='python';i.setSelectionRange(6,6);})()")
   await c.js("window.seekLeak=0;window.pauseLeak=0;testVideo().addEventListener('seeking',()=>seekLeak++);testVideo().addEventListener('pause',()=>pauseLeak++)")
   report['beforeKeys']=await c.js("({time:testVideo().currentTime,paused:testVideo().paused})")
   for key,code,vk,text in [(' ','Space',32,' '),('ArrowLeft','ArrowLeft',37,''),('ArrowRight','ArrowRight',39,'')]:
    params={'type':'keyDown','key':key,'code':code,'windowsVirtualKeyCode':vk}
    if text:params['text']=text
    await c.call('Input.dispatchKeyEvent',params);await c.call('Input.dispatchKeyEvent',{'type':'keyUp','key':key,'code':code,'windowsVirtualKeyCode':vk})
   await c.call('Input.insertText',{'text':'🎵'})
   report['afterKeys']=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,v=testVideo(),i=s.querySelector('.search input');return {time:v.currentTime,paused:v.paused,input:i.value,caret:i.selectionStart,panelVisible:!s.querySelector('#search-panel').hidden,focused:s.activeElement===i,seekingEvents:seekLeak,pauseEvents:pauseLeak};})()")
   assert not report['afterKeys']['paused'] and report['afterKeys']['time']-report['beforeKeys']['time']<3 and report['afterKeys']['input']=='python 🎵' and report['afterKeys']['focused'] and report['afterKeys']['seekingEvents']==0 and report['afterKeys']['pauseEvents']==0,report
   report['queries']=[]
   for query in ['python 基础','C++','初音🎵','a&b']:
    await c.js("(()=>{const i=document.querySelector('#bili-space-root').shadowRoot.querySelector('.search input');i.value="+json.dumps(query)+";i.dispatchEvent(new Event('input',{bubbles:true}));})()")
    await asyncio.sleep(.25)
    for _ in range(70):
     item=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,p=s.querySelector('#search-panel');return {query:s.querySelector('.search input').value,visible:!p.hidden,terms:[...p.querySelectorAll('.search-row [data-query]')].map(x=>x.dataset.query),text:p.textContent};})()")
     if '正在获取' not in item['text']:break
     await asyncio.sleep(.1)
    assert item['visible'] and '猜你想搜' in item['text'] and '暂时不可用' not in item['text'],item
    report['queries'].append(item)
   await c.shot('input24-search.png')
   await c.js("(()=>{document.querySelector('#bili-space-root').shadowRoot.querySelector('.search input').blur();const root=document.createElement('div');root.id='editor-tests';root.innerHTML='<input id=dm-test><textarea id=comment-test></textarea><div id=comment-shadow></div>';document.body.append(root);const shadow=root.querySelector('#comment-shadow').attachShadow({mode:'open'});shadow.innerHTML='<textarea></textarea>';window.testEditors=[root.querySelector('input'),root.querySelector('textarea'),shadow.querySelector('textarea')];})()")
   report['editors']=[]
   for index in range(3):
    await c.js('testEditors['+str(index)+"].focus();testEditors["+str(index)+"].value='测试';testEditors["+str(index)+"].setSelectionRange(2,2)")
    for key,code,vk,text in [(' ','Space',32,' '),('ArrowLeft','ArrowLeft',37,''),('ArrowRight','ArrowRight',39,'')]:
     args={'type':'keyDown','key':key,'code':code,'windowsVirtualKeyCode':vk}
     if text:args['text']=text
     await c.call('Input.dispatchKeyEvent',args);await c.call('Input.dispatchKeyEvent',{'type':'keyUp','key':key,'code':code,'windowsVirtualKeyCode':vk})
    r=await c.js('({value:testEditors['+str(index)+'].value,paused:testVideo().paused,seeking:seekLeak,pauseEvents:pauseLeak})');assert r['value']=='测试 ' and not r['paused'] and r['seeking']==0 and r['pauseEvents']==0,r;report['editors'].append(r)
   # Reproduce current official negative layers without reading the user's private profile.
   html='''<html><head><style>#app{min-height:100vh}#app .space-theme-bg{pointer-events:none;z-index:-1;position:fixed;inset:0;background:linear-gradient(#456fa0,#28455d)}.header{height:220px;position:relative;display:flex;align-items:flex-end}.header .header-toutu{pointer-events:none;z-index:-1;position:absolute;inset:0;background:linear-gradient(100deg,#298457,#7eb95b)}.header-upinfo{padding:30px;color:white}.space-main{margin:30px;background:#222;color:white;padding:30px}</style></head><body><div id="app"><div class="space-theme-bg"></div><div class="header space-header"><div class="header-toutu"></div><div class="header-upinfo">公开空间图层结构测试 · 非私人账号</div></div><main class="space-main">原生负层级头图和主题背景应可见</main></div></body></html>'''
   def intercept(m):return {'method':'Fetch.fulfillRequest','params':{'requestId':m['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/html; charset=utf-8'}],'body':base64.b64encode(html.encode()).decode()}}
   c.intercept=intercept;await c.call('Fetch.enable',{'patterns':[{'urlPattern':'https://space.bilibili.com/2?input24-fixture*'}]});await c.call('Page.navigate',{'url':'https://space.bilibili.com/2?input24-fixture=1'});await asyncio.sleep(.2);report['spaceDebug']=await c.js("({href:location.href,ready:document.readyState,bili:!!window.BiliSpace,header:!!document.querySelector('.header-toutu'),html:document.documentElement?.outerHTML.slice(0,250)})");await wait(c,"!!window.BiliSpace&&!!document.querySelector('.header-toutu')")
   report['space']=await c.js("(()=>{const app=getComputedStyle(document.querySelector('#app')),head=getComputedStyle(document.querySelector('.space-header')),photo=getComputedStyle(document.querySelector('.header-toutu'));return {page:document.documentElement.dataset.bsPage,appBackground:app.backgroundColor,appIsolation:app.isolation,headerIsolation:head.isolation,headerPicture:photo.backgroundImage};})()")
   assert report['space']['page']=='space' and report['space']['appBackground']=='rgba(0, 0, 0, 0)' and report['space']['appIsolation']=='isolate' and report['space']['headerIsolation']=='isolate',report['space']
   await c.shot('input24-space.png')
   from PIL import Image
   image=Image.open(R/'verification/input24-space.png').convert('RGB');pixel=image.getpixel((100,150));report['space']['visibleHeaderPixel']=pixel;assert pixel[1]>90 and pixel[1]>pixel[0],pixel
   report['result']='PASS';await c.js("chrome.webview.postMessage({type:'window',action:'close'})")
 finally:
  try:p.wait(timeout=3)
  except:p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/input24-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
