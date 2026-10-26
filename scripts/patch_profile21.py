from pathlib import Path
import re
p=Path('assets/enhance.js');s=p.read_text(encoding='utf8');idx=s.index('let accountProfile=')
sp=re.search(r'Sp=(\{[^}]+\})',Path('verification/profile21-official.js').read_text(encoding='utf8')).group(1)
helpers='''const OFFICIAL_SPACE_BANNERS=MAP;
function profileMediaUrl(value){if(typeof value!=='string'||!value||value.length>4096)return '';try{const url=new URL(value.startsWith('bfs/')?'https://i0.hdslb.com/'+value:value,location.href);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!/(^|\\.)(hdslb|bilibili|bilivideo)\\.com$/i.test(url.hostname))return '';url.protocol='https:';return url.href;}catch{return '';}}
function setProfileImage(host,className,url,alt){let image=$('.'+className,host);if(!url){image?.remove();return;}if(!image){image=document.createElement('img');image.className=className;image.alt=alt;image.referrerPolicy='no-referrer';image.onerror=()=>image.hidden=true;host.append(image);}if(image.getAttribute('src')!==url){image.hidden=false;image.src=url;}}
function mergeAccountDecorations(info={},cardData={}){
  if(!accountProfile)return;const card=cardData.card||{},mid=String(accountProfile.mid);if(info.mid!==undefined&&String(info.mid)!==mid)info={};if(card.mid!==undefined&&String(card.mid)!==mid)return;
  const photo=info.top_photo_v2||info.toutu||{},theme=info.theme||{},pendant=info.pendant||card.pendant||accountProfile.pendant||{},vip=info.vip||card.vip||accountProfile.vip||{};
  accountProfile.face=profileMediaUrl(info.face||card.face||accountProfile.face);
  accountProfile.banner=profileMediaUrl(photo.l_200h_img||photo.l_img||OFFICIAL_SPACE_BANNERS[photo.sid]||theme.toutu||info.top_photo||cardData.space?.l_img||accountProfile.banner);
  accountProfile.bannerStatic=profileMediaUrl(info.top_photo||photo.l_img||accountProfile.banner);
  accountProfile.pendant=pendant;accountProfile.vip=vip;
}
function renderAccountDecorations(){
  const card=$('#account-card',shadow),account=$('.account',shadow),portrait=$('.account-portrait',card),banner=$('.account-banner',card),profile=accountProfile;
  const face=profileMediaUrl(profile?.face),pendant=profile?.pendant||{},vip=profile?.vip||{},reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame=profileMediaUrl((reduced&&pendant.image_enhance_frame)||pendant.image_enhance||pendant.image||pendant.image_enhance_frame);
  const vipType=Number(vip.type??vip.vipType),vipStatus=Number(vip.status??vip.vipStatus),isVip=vipType>0&&vipStatus===1;
  const badge=isVip?(profileMediaUrl(vip.avatar_subscript_url||vip.avatar_icon?.icon_resource?.url)||'https://i0.hdslb.com/bfs/seed/jinkela/short/user-avatar/'+(Number(vip.avatar_subscript)===2?'small-vip':'big-vip')+'.svg'):'';
  if(face){if(!$('.account-face',account))account.replaceChildren();for(const host of [account,portrait]){setProfileImage(host,'account-face',face,profile.uname||'我的头像');setProfileImage(host,'account-pendant',frame,pendant.name||'头像挂件');setProfileImage(host,'account-vip-badge',badge,'大会员');}}else{portrait.replaceChildren();if(!profile){account.replaceChildren(document.createTextNode('登录 B站'));delete account.dataset.authenticated;account.href='https://passport.bilibili.com/login?gourl=https%3A%2F%2Fwww.bilibili.com%2F';}}
  portrait.hidden=!face;
  const label=$('.account-vip-label',card);label.textContent=isVip?(vip.label?.text||'大会员'):'';label.hidden=!isVip;
  const src=profileMediaUrl((reduced&&profile?.bannerStatic)||profile?.banner);banner.hidden=!src;
  if(!src){$('video',banner)?.pause();banner.replaceChildren();return;}
  const video=/\\.(mp4|webm)(?:$|[?#])/i.test(src);let media=banner.firstElementChild;if(!media||media.tagName!==(video?'VIDEO':'IMG')){media=document.createElement(video?'video':'img');media.referrerPolicy='no-referrer';if(video){media.muted=true;media.loop=true;media.playsInline=true;media.preload='metadata';media.setAttribute('aria-label','主页动态横幅');media.onerror=()=>{if(profile.bannerStatic&&profile.bannerStatic!==src){profile.banner=profile.bannerStatic;renderAccountDecorations();}else banner.hidden=true;};}else{media.alt='我的主页横幅';media.onerror=()=>banner.hidden=true;}banner.replaceChildren(media);}if(media.getAttribute('src')!==src)media.src=src;
  if(video){if(!card.hidden&&!reduced)media.play().catch(()=>{});else media.pause();}
}
'''.replace('MAP',sp)
s=s[:idx]+helpers+s[idx:]
s=s.replace("  $('.account-name',card).textContent=", "  renderAccountDecorations();\n  $('.account-name',card).textContent=",1)
old="accountStatsRequest=Promise.all([get('/x/web-interface/nav/stat'),get('/x/space/upstat?mid='+encodeURIComponent(current.mid))]).then(([stats,up])=>{"
new="accountStatsRequest=Promise.all([get('/x/web-interface/nav/stat'),get('/x/space/upstat?mid='+encodeURIComponent(current.mid)),get('/x/space/myinfo'),get('/x/web-interface/card?mid='+encodeURIComponent(current.mid))]).then(([stats,up,info,card])=>{"
assert old in s;s=s.replace(old,new)
s=s.replace("if(Number.isFinite(up?.likes)&&up.likes>=0)current.likes=up.likes;renderAccountCard();", "if(Number.isFinite(up?.likes)&&up.likes>=0)current.likes=up.likes;mergeAccountDecorations(info||{},card||{});renderAccountCard();",1)
s=s.replace("if(card.hidden", "if(card.hidden")
s=s.replace("accountHideTimer=setTimeout(()=>card.hidden=true,180);", "accountHideTimer=setTimeout(()=>{card.hidden=true;$('video',card)?.pause();},180);",1)
s=s.replace("level:Number.isInteger(data.level_info?.current_level)?data.level_info.current_level:null});renderAccountCard();", "level:Number.isInteger(data.level_info?.current_level)?data.level_info.current_level:null,face:profileMediaUrl(data.face),vip:data.vip||{type:data.vipType,status:data.vipStatus,avatar_subscript:data.vip_avatar_subscript},pendant:data.pendant||accountProfile.pendant});renderAccountCard();",1)
s=s.replace("    account.replaceChildren(img);account.setAttribute", "    renderAccountDecorations();account.setAttribute",1)
s=s.replace('<div class="account-card-head"><strong class="account-name">', '<div class="account-banner" hidden></div><div class="account-identity"><div class="account-portrait" hidden></div><div class="account-card-head"><strong class="account-name">',1)
s=s.replace('<span class="account-level"></span></div><div class="account-stats">', '<span class="account-level"></span><span class="account-vip-label" hidden></span></div></div><div class="account-stats">',1)
s=s.replace('.account-card-head{display:flex;align-items:center;gap:10px}', '.account-identity{display:flex;align-items:center;gap:12px}.account-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}.account-banner{height:100px;margin:-18px -18px 14px;overflow:hidden;border-radius:13px 13px 0 0;background:var(--field)}.account-banner[hidden],.account-portrait[hidden],.account-vip-label[hidden]{display:none}.account-banner img,.account-banner video{display:block;width:100%;height:100%;object-fit:cover}.account-portrait{position:relative;width:52px;height:52px;flex-shrink:0}.account-portrait .account-face{width:52px;height:52px;border-radius:50%;object-fit:cover}.account-vip-label{font-size:10px;background:#fb729918;color:#fb7299;border-radius:4px;padding:2px 5px}.account-portrait .account-pendant{position:absolute;inset:-9px;width:70px;height:70px;object-fit:contain;pointer-events:none}.account-portrait .account-vip-badge{position:absolute;right:-1px;bottom:-1px;width:17px;height:17px;object-fit:contain}')
s=s.replace('.account img{width:30px;', '.account{position:relative;overflow:visible!important}.account .account-face{width:30px;',1)
s=s.replace('.messages{display:flex;', '.account .account-pendant{position:absolute;inset:-5px;width:40px;height:40px;object-fit:contain;pointer-events:none}.account .account-vip-badge{position:absolute;right:-2px;bottom:-2px;width:12px;height:12px;object-fit:contain;pointer-events:none}.messages{display:flex;',1)
p.write_text(s,encoding='utf8')
for name in ['package.json','package-lock.json','assets/bridge.js','assets/enhance.js','CMakeLists.txt']:
 p=Path(name);p.write_text(p.read_text(encoding='utf8').replace('0.1.20','0.1.21'),encoding='utf8')
