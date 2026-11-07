const test=require('node:test'),assert=require('node:assert/strict'),{app}=require('./ui-harness.cjs');

test('auto-hidden brand slides left before its slot collapses and can be interrupted',()=>{
 const a=app({reduceMotion:false});try{
  const s=a.w.document.querySelector('#bili-space-root').shadowRoot,animations=[];
  a.w.Element.prototype.animate=function(frames,options){const motion={target:this,frames,options,onfinish:null,cancel(){this.cancelled=true;}};animations.push(motion);return motion;};
  a.w.history.pushState({},'','/history');
  const brand=()=>animations.filter(m=>m.target.matches('.brand-slot,.brand-label'));
  assert.equal(s.querySelector('.brand-label').hidden,false);
  assert.equal(brand().length,2);assert.equal(brand()[0].options.duration,360);assert.equal(brand()[0].options.easing,'cubic-bezier(.4,0,.2,1)');assert.equal(brand()[1].frames.at(-1).transform,'translateX(-100%)');
  brand()[0].onfinish();assert(s.querySelector('.brand-slot').hidden);
  a.w.BiliSpace.update({logoAutoHide:false});assert(!s.querySelector('.brand-slot').hidden);
  a.w.BiliSpace.update({logoAutoHide:true});assert(brand()[2].cancelled);
  brand().at(-2).onfinish();assert(s.querySelector('.brand-label').hidden);
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
  const s=a.w.document.querySelector('#bili-space-root').shadowRoot,button=s.querySelector('.history-forward'),motions=[];
  a.w.Element.prototype.animate=function(frames,options){const m={onfinish:null,cancel(){}};motions.push({frames,options});return m;};
  assert(button.disabled);button.click();assert(!a.messages.some(m=>m.type==='window'&&m.action==='forward'));
  a.w.__bsAcceptNavigationState({back:true,forward:true,visible:0});
  assert(!button.hidden&&!button.disabled);assert(s.querySelector('.history-back').hidden);
  assert(motions.some(m=>m.frames[0].opacity===0&&m.frames.at(-1).opacity===1));
  button.click();assert(a.messages.some(m=>m.type==='window'&&m.action==='forward'));
 }finally{a.close();}
});
