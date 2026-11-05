import asyncio,json,urllib.request
from websockets.asyncio.client import connect
from smoke import CDP,ROOT
async def main():
 ts=json.load(urllib.request.urlopen('http://127.0.0.1:9224/json/list'))
 t=next(t for t in ts if t.get('type')=='page')
 async with connect(t['webSocketDebuggerUrl'],max_size=30*1024*1024) as ws:
  c=CDP(ws);await c.call('Runtime.enable')
  print('normal boot',await c.js("({ready:!!window.BiliSpace,host:location.hostname,version:document.querySelector('#bili-space-root')?.shadowRoot.querySelector('.aside-footer')?.textContent})"))
  print('official suggestion response',await c.js("(async()=>{try{const r=await fetch('https://api.bilibili.com/x/web-interface/suggest?term=python&highlight=0',{credentials:'include'});const j=await r.json();return {status:r.status,code:j.code,count:(j.data?.result?.tag||j.result?.tag||[]).length}}catch(e){return {error:e.message}}})()"))
  print('account and folders',await c.js("(async()=>{try{const a=await (await fetch('https://api.bilibili.com/x/web-interface/nav',{credentials:'include'})).json();if(!a.data?.isLogin)return {signedIn:false};const f=await(await fetch('https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid='+a.data.mid,{credentials:'include'})).json();return {signedIn:true,code:f.code,folderCount:f.data?.list?.length||0}}catch(e){return {error:e.message}}})()"))
  await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,i=s.querySelector('.search input');i.focus();i.value='python';i.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await asyncio.sleep(2)
  print('actual search panel',await c.js("(()=>{const s=document.querySelector('#bili-space-root').shadowRoot,p=s.querySelector('#search-panel');return {historyCount:p.querySelectorAll('[data-search-kind=history]').length,suggestionCount:p.querySelectorAll('[data-search-kind=suggestion]').length,status:p.querySelector('[role=status]')?.textContent}})()"))
  await c.shot('ui49-live-search.png')
asyncio.run(main())
