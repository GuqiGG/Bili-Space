import asyncio,json,subprocess,urllib.request,base64
from pathlib import Path
from smoke import CDP
from websockets.asyncio.client import connect
R=Path.cwd();report={}
public=json.loads((R/'verification/profile21-public-card.json').read_text(encoding='utf8'))['card'];banner='https://i0.hdslb.com/bfs/static/jinkela/long/images/fresh_space_toutu_greenery.png';dynamic=public['vip']['label']['img_label_uri_hans'];mid=1234
async def main():
 settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();d=json.loads(backup);d['config'].update(proxy=False,srMode='off',fiMode='off',clipboardAutoOpen=False,zoom=100,autoZoom=False);settings.write_text(json.dumps(d));p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist')
 try:
  for _ in range(100):
   try:t=next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=.5)) if x.get('type')=='page');break
   except:await asyncio.sleep(.15)
  async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
   def intercept(params):
    path=params['request']['url'];profile={'mid':mid,'uname':'装扮测试（模拟账户）','face':public['face'],'level_info':{'current_level':6},'vip':public['vip'],'pendant':public['pendant'],'top_photo_v2':{'l_200h_img':banner}}
    if '/nav/stat' in path:data={'follower':1234,'following':56}
    elif '/nav' in path:data={**profile,'isLogin':True}
    elif '/card' in path:data={'card':{**public,'mid':str(mid)}}
    elif '/myinfo' in path:data=profile
    elif '/upstat' in path:data={'likes':7890}
    else:return None
    return {'method':'Fetch.fulfillRequest','params':{'requestId':params['requestId'],'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'application/json'},{'name':'Access-Control-Allow-Origin','value':'https://bili-space.local'},{'name':'Access-Control-Allow-Credentials','value':'true'}],'body':base64.b64encode(json.dumps({'code':0,'data':data}).encode()).decode()}}
   c.intercept=intercept;await c.call('Fetch.enable',{'patterns':[{'urlPattern':'https://api.bilibili.com/x/*'}]})
   for _ in range(100):
    if await c.js('!!window.BiliSpace'):break
    await asyncio.sleep(.1)
   await c.js('BiliSpace.refreshAccount(true)');await c.js('BiliSpace.showAccountCard()')
   for _ in range(80):
    if await c.js("!!document.querySelector('#bili-space-root').shadowRoot.querySelector('.account-banner img')"):break
    await asyncio.sleep(.1)
   await asyncio.sleep(.8)
   report['decorations']=await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,b=s.querySelector('.account-banner img');return {name:s.querySelector('.account-name').textContent,banner:b?.src,bannerLoaded:b?.complete&&b?.naturalWidth>0,pendant:s.querySelector('.account .account-pendant')?.src,badge:s.querySelector('.account .account-vip-badge')?.src,label:s.querySelector('.account-vip-label').textContent};})()")
   assert report['decorations']['banner']==banner and report['decorations']['bannerLoaded'] and report['decorations']['pendant'] and report['decorations']['badge'],report
   report['bounds']=[]
   for w in [480,1280]:
    await c.call('Emulation.setDeviceMetricsOverride',{'width':w,'height':800,'deviceScaleFactor':1,'mobile':False});await asyncio.sleep(.2)
    r=await c.js("(()=>{const b=document.querySelector('#bili-space-root').shadowRoot.querySelector('#account-card').getBoundingClientRect();return {left:b.left,right:b.right,width:innerWidth};})()");report['bounds'].append(r);assert r['left']>=-1 and r['right']<=w+1,r
   await c.shot('profile21-card.png')
   report['result']='PASS'
   await c.js("chrome.webview.postMessage({type:'window',action:'close'})")
 finally:
  try:p.wait(timeout=3)
  except:p.terminate();p.wait()
  settings.write_bytes(backup);(R/'verification/profile21-decoration-runtime.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
asyncio.run(main())
