const test=require('node:test'),assert=require('node:assert/strict'),{app}=require('./ui-harness.cjs');

test('auto-hidden brand fades out as a ghost while the header slides with transforms only',()=>{
 const a=app({reduceMotion:false});try{
  const s=a.w.document.querySelector('#bili-space-root').shadowRoot,animations=[];const layoutKeys=m=>m.frames.some(f=>['width','marginRight','marginLeft','flexBasis','paddingLeft','paddingRight'].some(k=>k in f));
  a.w.Element.prototype.animate=function(frames,options){const motion={target:this,frames,options,onfinish:null,cancel(){this.cancelled=true;}};animations.push(motion);return motion;};
  a.w.Element.prototype.getBoundingClientRect=function(){return {left:10,top:0,right:50,bottom:32,width:40,height:32};};
  a.w.history.pushState({},'','/history');
  assert.equal(s.querySelector('.brand-slot').hidden,true);
  const ghost=animations.find(m=>m.target.dataset?.ghost==='true'&&m.target.matches('.brand-slot'));assert(ghost);assert.equal(ghost.frames.at(-1).opacity,0);
  assert(!animations.some(layoutKeys));
  a.w.BiliSpace.update({logoAutoHide:false});assert.equal(s.querySelector('.brand-slot').hidden,false);
 }finally{a.close();}
});

test('blank documents show loading feedback, expose retry on failure and clear when content renders',()=>{
 const a=app({url:'https://www.bilibili.com/history',html:'<html><body></body></html>'});try{
  const s=a.w.document.querySelector('#bili-space-root').shadowRoot;
  assert(s.querySelector('#page-pending').textContent.includes('正在加载历史记录'));
  a.w.BiliSpace.setLoading(false,true);assert.equal(s.querySelector('#page-pending button').hidden,false);
  a.w.document.body.textContent='历史记录：今天的视频、昨天的视频以及已经加载的观看记录';
  a.w.BiliSpace.setLoading(false);assert.equal(s.querySelector('#page-pending'),null);
  assert.equal(s.querySelector('[data-route=history]').href,'https://www.bilibili.com/history');
 }finally{a.close();}
});

test('forward uses native history availability and enters when returning to home with a forward destination',()=>{
 const a=app({reduceMotion:false});try{
  const s=a.w.document.querySelector('#bili-space-root').shadowRoot,button=s.querySelector('.history-forward'),motions=[];const layoutKeys=m=>m.frames.some(f=>['width','marginRight','marginLeft','flexBasis','paddingLeft','paddingRight'].some(k=>k in f));
  a.w.Element.prototype.animate=function(frames,options){const m={frames,options,onfinish:null,cancel(){}};motions.push(m);return m;};
  assert(button.disabled);button.click();assert(!a.messages.some(m=>m.type==='window'&&m.action==='forward'));
  a.w.__bsAcceptNavigationState({back:true,forward:true,visible:0});
  assert(!button.hidden&&!button.disabled);assert(s.querySelector('.history-back').hidden);
  assert(motions.some(m=>m.frames[0].opacity===0));assert(!motions.some(layoutKeys));
  button.click();assert(a.messages.some(m=>m.type==='window'&&m.action==='forward'));
 }finally{a.close();}
});

test('category arrow hides at once and leaves as a fading ghost, without layout animation',()=>{
 const a=app({reduceMotion:false});try{
  const s=a.w.document.querySelector('#bili-space-root').shadowRoot,b=s.querySelector('.back'),motions=[];const layoutKeys=m=>m.frames.some(f=>['width','marginRight','marginLeft','flexBasis','paddingLeft','paddingRight'].some(k=>k in f));
  a.w.Element.prototype.animate=function(frames,options){const m={target:this,frames,options,onfinish:null,cancel(){}};motions.push(m);return m;};
  a.w.Element.prototype.getBoundingClientRect=function(){return {left:10,top:0,right:50,bottom:32,width:40,height:32};};
  a.w.BiliSpace.update({headerBack:false});assert(b.hidden);assert(motions.some(m=>m.target.dataset?.ghost==='true'&&m.frames.at(-1).opacity===0));
  a.w.BiliSpace.update({headerBack:true});assert(!b.hidden);
  assert(!motions.some(layoutKeys));
 }finally{a.close();}
});
