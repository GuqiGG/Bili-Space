/* Official Bilibili favorites, loaded only when the user opens the panel. */
(()=>{
function coverURL(value){if(typeof value!=='string'||value.length>4096)return '';try{const u=new URL(value,location.href);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!/(^|\.)(hdslb|biliimg)\.com$/i.test(u.hostname))return '';u.protocol='https:';return u.href;}catch{return '';}}
window.BiliFavoriteCoverURL=coverURL;
const SPRING='cubic-bezier(.32,.72,0,1)';
window.installBiliFavorites=({shadow,native,closeSearch})=>{
 const wrap=shadow.querySelector('.favorites-wrap'),button=wrap.querySelector('.favorites'),panel=wrap.querySelector('.favorites-panel');
 let request,generation=0,folders=[],selected=0,page=1,mid='',motion,indicator;
 const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 const body=panel.querySelector('.favorites-body'),nav=panel.querySelector('.favorites-folders');
 const moving=()=>!!panel.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const expanded=()=>button.getAttribute('aria-expanded')==='true';
 /* The panel grows out of the bookmark button and settles without overshoot; an interrupted motion continues from where it is. */
 function present(){
  if(!moving())return;const visual=getComputedStyle(panel),from=motion?{opacity:visual.opacity,transform:visual.transform}:{opacity:0,transform:'translateY(-8px) scale(.96)'};motion?.cancel();
  const b=button.getBoundingClientRect(),p=panel.getBoundingClientRect();panel.style.transformOrigin=Math.round(b.left+b.width/2-p.left)+'px 0px';
  motion=panel.animate([from,{opacity:1,offset:.4},{opacity:1,transform:'none'}],{duration:420,easing:SPRING});motion.onfinish=()=>{motion=null;};
 }
 function dismiss(){
  if(!moving()){motion?.cancel();motion=null;panel.hidden=true;return;}
  const visual=getComputedStyle(panel),from={opacity:visual.opacity,transform:visual.transform};motion?.cancel();
  motion=panel.animate([from,{opacity:0,transform:'translateY(-4px) scale(.98)'}],{duration:160,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
  motion.onfinish=()=>{if(expanded())return;panel.hidden=true;motion?.cancel();motion=null;};
 }
 function close(focus=false){generation++;request?.abort();const was=expanded();button.setAttribute('aria-expanded','false');if(was)dismiss();else if(!motion)panel.hidden=true;if(focus)button.focus();}
 async function json(path,signal){const r=await fetch('https://api.bilibili.com'+path,{credentials:'include',signal});if(!r.ok)throw Error('收藏夹暂时无法加载');const j=await r.json();if(j.code===-101)throw Error('请先登录 B站，再查看收藏夹');if(j.code!==0)throw Error('收藏夹暂时无法加载，请稍后重试');return j.data;}
 function message(text,retry){body.replaceChildren(node('div','favorites-empty',text));if(retry){const b=node('button','favorites-retry','重新加载');b.onclick=open;body.firstChild.append(b);}}
 /* Placeholder cards keep the layout steady while the official API answers; the spoken status stays in text. */
 function skeleton(text){const grid=node('div','favorites-grid favorites-skeleton');grid.setAttribute('aria-hidden','true');for(let i=0;i<4;i++){const card=node('div','favorites-ghost');card.style.setProperty('--i',String(i));card.append(node('i',''),node('i',''),node('i',''));grid.append(card);}body.replaceChildren(node('span','sr-only',text),grid);}
 function placeIndicator(){
  const target=nav.querySelector('.favorites-folder[aria-pressed=true]');if(!target){indicator?.remove();indicator=null;return;}
  const previous=indicator?.isConnected?{y:indicator.offsetTop,h:indicator.offsetHeight}:null;
  if(!indicator){indicator=node('span','favorites-indicator');indicator.setAttribute('aria-hidden','true');}nav.prepend(indicator);
  const y=target.offsetTop,h=target.offsetHeight;indicator.style.top=y+'px';indicator.style.height=h+'px';
  if(previous&&previous.y!==y&&moving())indicator.animate([{transform:'translateY('+(previous.y-y)+'px)',height:previous.h+'px'},{transform:'none',height:h+'px'}],{duration:340,easing:SPRING});
 }
 function sidebar(){for(const b of [...nav.querySelectorAll('.favorites-folder,.favorites-folder-ghost')])b.remove();for(const folder of folders){const b=node('button','favorites-folder',folder.title);b.type='button';b.setAttribute('aria-pressed',String(folder.id===selected));b.append(node('span','favorites-count',String(folder.media_count||0)));b.onclick=()=>{if(folder.id!==selected)loadFolder(folder.id);};nav.append(b);}placeIndicator();}
 async function loadFolder(id,more=false){
  request?.abort();request=new AbortController();const signal=request.signal,revision=++generation;const timer=setTimeout(()=>request?.abort(),10000);
  selected=id;page=more?page+1:1;sidebar();if(!more){skeleton('正在读取收藏视频…');body.scrollTop=0;}
  try{const data=await json('/x/v3/fav/resource/list?media_id='+id+'&pn='+page+'&ps=20&platform=web',signal);if(revision!==generation)return;
   let grid=body.querySelector('.favorites-grid:not(.favorites-skeleton)');if(!more||!grid){grid=node('div','favorites-grid');body.replaceChildren(grid);}body.querySelector('.favorites-more')?.remove();
   let order=0;
   for(const video of data.medias||[]){const bvid=String(video.bvid||'');const card=node('a','favorites-video');const available=/^BV[a-z0-9]{10}$/i.test(bvid)&&!(Number(video.attr)&1);card.href=available?'https://www.bilibili.com/video/'+bvid:'https://www.bilibili.com/';card.style.setProperty('--i',String(Math.min(order++,9)));
    const cover=node('div','favorites-cover'),source=coverURL(video.cover);if(source){const image=node('img','');image.alt='';image.loading=grid.children.length<6?'eager':'lazy';image.decoding='async';image.referrerPolicy='no-referrer';image.onload=()=>{image.dataset.ready='true';};image.onerror=()=>{image.remove();cover.append(node('span','favorites-cover-error','封面暂不可用'));};image.src=source;cover.append(image);}else cover.append(node('span','favorites-cover-error','暂无封面'));
    const title=node('strong','',video.title||'已失效的视频');card.title=title.textContent;card.append(cover,title,node('span','favorites-author',video.upper?.name||'已收藏'));
    if(!available){card.setAttribute('aria-disabled','true');card.onclick=e=>e.preventDefault();}else card.onclick=e=>{e.preventDefault();close();native('navigate',{url:card.href});};grid.append(card);
   }
   if(!grid.children.length)message('这个收藏夹还没有视频');
   if(data.has_more){const b=node('button','favorites-more','加载更多');b.onclick=()=>{b.disabled=true;b.textContent='正在加载…';loadFolder(id,true);};body.append(b);}
  }catch(e){if(revision!==generation)return;if(more){page--;const b=body.querySelector('.favorites-more');if(b){b.disabled=false;b.textContent='加载失败，点击重试';}}else message(e.message,true);}
  finally{clearTimeout(timer);}
 }
 async function open(){
  const was=expanded();panel.hidden=false;button.setAttribute('aria-expanded','true');closeSearch?.();if(!was)present();
  request?.abort();request=new AbortController();const signal=request.signal,revision=++generation,timer=setTimeout(()=>request?.abort(),10000);
  if(!folders.length){for(const b of [...nav.querySelectorAll('.favorites-folder-ghost')])b.remove();for(let i=0;i<3;i++){const ghost=node('span','favorites-folder-ghost');ghost.setAttribute('aria-hidden','true');nav.append(ghost);}}skeleton('正在打开你的收藏夹…');
  try{const account=await json('/x/web-interface/nav',signal);if(revision!==generation)return;if(!account.isLogin||!account.mid){nav.replaceChildren();indicator=null;message('登录后，你的收藏会出现在这里');const login=node('button','favorites-retry','登录 B站');login.onclick=()=>{close();native('navigate',{url:'https://passport.bilibili.com/login?gourl=https%3A%2F%2Fwww.bilibili.com%2F'});};body.firstChild.append(login);return;}
   mid=String(account.mid);const data=await json('/x/v3/fav/folder/created/list-all?up_mid='+encodeURIComponent(mid),signal);if(revision!==generation)return;
   folders=(data.list||[]).filter(f=>Number.isSafeInteger(f.id)&&f.id>0);if(!folders.length){nav.replaceChildren();indicator=null;message('还没有收藏夹，去发现喜欢的视频吧');return;}
   clearTimeout(timer);await loadFolder(folders.some(f=>f.id===selected)?selected:folders[0].id);
  }catch(e){if(revision!==generation)return;for(const b of [...nav.querySelectorAll('.favorites-folder-ghost')])b.remove();message(signal.aborted?'加载超时，请检查网络后重试':e.message,true);}finally{clearTimeout(timer);}
 }
 button.onclick=()=>expanded()?close():open();panel.querySelector('.favorites-close').onclick=()=>close(true);
 panel.querySelector('.favorites-official').onclick=()=>{close();native('navigate',{url:mid?'https://space.bilibili.com/'+mid+'/favlist':'https://www.bilibili.com/'});};
 wrap.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded()){e.preventDefault();e.stopPropagation();close(true);}});
 document.addEventListener('pointerdown',e=>{if(!e.composedPath().includes(wrap))close();},{passive:true});
 window.addEventListener('pagehide',()=>close());
 return {close};
};
})();
