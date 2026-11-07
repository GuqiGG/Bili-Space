const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{app}=require('./ui-harness.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const record=(w,list)=>{w.Element.prototype.animate=function(frames,options){const m={target:this,frames,options,onfinish:null,cancel(){this.cancelled=true;},finish(){this.onfinish?.();}};list.push(m);return m;};w.Element.prototype.getBoundingClientRect=function(){return {left:0,top:0,right:40,bottom:32,width:40,height:32};};};

test('favorites panel grows from its button and hides only after the exit motion',async()=>{
 const a=app({reduceMotion:false,loggedIn:true});try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,motions=[];record(a.w,motions);
  a.w.fetch=async url=>({ok:true,json:async()=>String(url).includes('/nav')?{code:0,data:{isLogin:true,mid:1}}:String(url).includes('list-all')?{code:0,data:{list:[{id:3,title:'默认',media_count:1}]}}:{code:0,data:{medias:[{bvid:'BV1234567890',title:'片',upper:{name:'UP'}}],has_more:false}}});
  const button=s.querySelector('.favorites'),panel=s.querySelector('.favorites-panel');button.click();
  const enter=motions.find(m=>m.target===panel);assert.equal(enter.frames[0].opacity,0);assert.equal(enter.frames.at(-1).transform,'none');assert.equal(enter.options.easing,'cubic-bezier(.32,.72,0,1)');
  assert(s.querySelector('.favorites-skeleton'));await wait(30);
  assert.equal(s.querySelector('.favorites-video').style.getPropertyValue('--i'),'0');assert(s.querySelector('.favorites-indicator'));
  button.click();assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(panel.hidden,false);
  motions.filter(m=>m.target===panel).at(-1).finish();assert.equal(panel.hidden,true);
 }finally{a.close();}
});

test('main nav fades out beside the channels and the page route is reported for the next load',()=>{
 const a=app({reduceMotion:false});try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,motions=[];record(a.w,motions);
  const nav=s.querySelector('.primary-nav');s.querySelector('.back').dispatchEvent(new a.w.MouseEvent('click',{bubbles:true,composed:true,detail:1}));
  const exit=motions.find(m=>m.target===nav);assert(exit);assert.equal(exit.frames.at(-1).opacity,0);assert.equal(nav.hidden,false);exit.finish();assert.equal(nav.hidden,true);
  assert(a.messages.some(m=>m.type==='navigation-state'&&m.action==='route'&&m.route==='home'));
 }finally{a.close();}
});

test('native hosts keep the previous header route and only cache private space and message shells',()=>{
 const cpp=fs.readFileSync('src/main.cpp','utf8'),shell=fs.readFileSync('src/local_shell.hpp','utf8'),mac=fs.readFileSync('src/macos_main.mm','utf8'),linux=fs.readFileSync('src/linux_main.py','utf8');
 assert.match(cpp,/\{"route",headerRoute\}/);assert.match(mac,/@"route":self\.headerRoute/);assert.match(linux,/'route':self\.header_route/);
 assert.match(shell,/bool spacePage/);assert.doesNotMatch(shell,/search\.bilibili\.com/);
 const manifest=JSON.parse(fs.readFileSync('assets/web-copy/manifest.json','utf8'));
 for(const bundle of ['fresh-space','message-pc','laputa-search'])assert(Object.keys(manifest.resources).some(u=>u.includes(bundle)),bundle);
});
