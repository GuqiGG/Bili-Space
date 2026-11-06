/* Shared snapshot compositor. Live DOM, history, scroll and the player stay untouched. */
(()=>{
 const DURATIONS=[450,400,420,400,420,350,430,400,420,450,430,480];
 const EASE='cubic-bezier(.77,0,.175,1)',OUT='cubic-bezier(.23,1,.32,1)';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const send=(action,extra={})=>native('transition',{action,...extra});
 let localJob=null;let state=null,arrived=false,nativeReady=false,checkTimer=0,snapshotTimer=0,serial=0;
 const stats=[];const record=(event,s)=>{if(testing){stats.push({event,id:s.id,index:s.index,time:performance.now()});if(stats.length>120)stats.shift();}};
 const testing=typeof RUNTIME!=='undefined'&&RUNTIME.testing;
 const video=value=>{try{return /^\/(?:zh-Hans\/|zh-Hant\/|en\/)?(?:video|bangumi|list|cheese)(?:\/|$)/.test(new URL(value,location.href).pathname);}catch{return true;}};
 function ordinary(value){try{const u=new URL(value,location.href);return ['https:','http:'].includes(u.protocol)&&(/(^|\.)bilibili\.com$/.test(u.hostname)||u.hostname==='bili-space.local')&&!video(u.href)&&!(/\.(zip|exe|dmg|deb|mp4|pdf)$/i.test(u.pathname))&&!(u.pathname===location.pathname&&u.search===location.search&&u.hash!==location.hash);}catch{return false;}}
 const pick=()=>Math.floor(Math.random()*12); // Independent uniform draws; rerendering never draws.
 function cleanup(notify=true){
  clearTimeout(checkTimer);checkTimer=0;
  if(!state)return;const old=state;if(testing)stats.push({event:'frames',id:old.id,index:old.index,gaps:old.frameTimes||[]});record('done',old);state=null;
  cancelAnimationFrame(old.frameId);old.animations.forEach(a=>{a.onfinish=null;a.cancel();});clearTimeout(old.guard);old.host.remove();
  if(notify)send('done',{id:old.id});
 }
 function image(src){const e=document.createElement('img');e.alt='';e.draggable=false;e.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none';e.src=src;return e;}
 const loaded=e=>e.complete&&e.naturalWidth?Promise.resolve():new Promise(resolve=>{e.onload=resolve;e.onerror=resolve;});
 function mount(record){
  cleanup(false);const host=document.createElement('div');host.id='bs-transition';host.setAttribute('aria-hidden','true');
  host.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;isolation:isolate';
  const base=image(record.old),old=image(record.old),next=image(record.old),curtain=document.createElement('div');
  for(const e of [old,next,curtain])e.style.willChange='transform,opacity,clip-path';
  next.style.visibility='hidden';curtain.style.cssText='position:absolute;inset:0;visibility:hidden;pointer-events:none;will-change:transform,clip-path';
  const dark=typeof INITIAL!=='undefined'&&(INITIAL.theme==='dark'||INITIAL.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
  curtain.style.background=dark?'#202023':'#f1f1f4';host.append(base,old,next,curtain);document.documentElement.append(host);
  state={...record,host,base,old,next,curtain,animations:[],guard:0,phase:'waiting',progress:0};return state;
 }
 function shape(index,p,w,h){
  const b=Math.min(w,h)*.1,bleed=4,diag=Math.hypot(w,h)+4;
  switch(index){
   case 0:return {clipPath:`circle(${diag*p}px at ${w+24*(1-p)}px ${-24*(1-p)}px)`};
   case 2:return {clipPath:`circle(${(Math.hypot(w/2,h/2)+2)*p}px at 50% 50%)`};
   case 3:{const x=w+h*.65+b-(w+h*.65+2*b)*p;return {clipPath:`path("M ${x} -4 Q ${x-h*.325-b*.3} ${h*.5} ${x-h*.65} ${h+4} L ${w+4} ${h+4} L ${w+4} -4 Z")`};}
   case 4:{const x=w+2*b-(w+4*b)*p;return {clipPath:`path("M ${x+b} -4 Q ${x-b} ${h*.5} ${x+b} ${h+4} L ${w+4} ${h+4} L ${w+4} -4 Z")`};}
   case 6:{const y=h+2*b-(h+4*b)*p;return {clipPath:`path("M -4 ${y} Q ${w*.5} ${y-b*2} ${w+4} ${y} L ${w+4} ${h+4} L -4 ${h+4} Z")`};}
   case 8:{const x=p<.35?p/.35*.65:.65+(p-.35)/.65*1.05,y=p<.35?p/.35*.07:.07+(p-.35)/.65*1.63;return {clipPath:`ellipse(${w*x}px ${h*y}px at 68% 48%)`};}
   case 9:{const a=Math.min(18,h*.025),x=w+2*a-(w+4*a)*p;return {clipPath:`path("M ${x} -4 C ${x-a} ${h*.22} ${x+a} ${h*.3} ${x} ${h*.5} C ${x-a} ${h*.7} ${x+a} ${h*.8} ${x} ${h+4} L ${w+4} ${h+4} L ${w+4} -4 Z")`};}
   case 10:{const r=diag*Math.min(1,p*1.8)+.01,angle=Math.PI/2*p,x=r*Math.cos(angle),y=h-r*Math.sin(angle);return {clipPath:`path("M 0 ${h} L ${r} ${h} A ${r} ${r} 0 0 0 ${x} ${y} Z")`};}
   default:return {};
  }
 }
 function curtainShape(index,p,w,h,exit=false){
  if(index===0)return shape(0,exit?1-p:p,w,h);
  const b=w*.14,x=exit?-b-(2*w+2*b)*p:w+b-(w+2*b)*p;
  return {clipPath:`path("M ${x} -4 Q ${x-b} ${h*.5} ${x} ${h+4} L ${x+2*w+2*b} ${h+4} Q ${x+2*w+3*b} ${h*.5} ${x+2*w+2*b} -4 Z")`};
 }
 function frames(index,part,start=0){
  const w=innerWidth,h=innerHeight,list=[];
  for(let i=0;i<=36;i++){
   const p=start+(1-start)*i/36;let f={};
   if(part==='cover'||part==='curtain')f=curtainShape(index,p,w,h,part==='curtain');
   else if(index===1)f=part==='new'?{transform:`translate(${w*(1-p)}px,${-6*Math.sin(Math.PI*p)}px)`}:{transform:`translate(${-w*p}px,${6*Math.sin(Math.PI*p)}px)`};
   else if(index===5)f=part==='new'?{transform:`scale(${1.03-.03*p})`,opacity:p}:{transform:`scale(${1-.03*p})`,opacity:1-p};
   else if(index===7)f=part==='new'?{transform:`translateX(${w*.8*(1-p)}px)`,opacity:Math.min(1,p*2)}:{transform:`translateX(${-w*.32*p}px)`,opacity:1-p};
   else if(part==='new')f=shape(index,p,w,h);
   list.push({...f,offset:i/36});
  }return list;
 }
 function animate(s,phase,start=0){
  if(phase==='animating'&&start===0){record('present',s);if(testing){s.frameTimes=[];let previous=0;const sample=t=>{if(state!==s)return;if(previous)s.frameTimes.push(t-previous);previous=t;s.frameId=requestAnimationFrame(sample);};s.frameId=requestAnimationFrame(sample);}}clearTimeout(s.guard);
  s.animations.forEach(a=>{a.onfinish=null;a.cancel();});s.animations=[];s.phase=phase;s.progress=start;
  const split=s.index===0||s.index===11,total=DURATIONS[s.index]*(split?.5:1),duration=Math.max(1,total*(1-start));
  const parts=phase==='cover'?[[s.curtain,'cover']]:split?[[s.curtain,'curtain']]:[[s.old,'old'],[s.next,'new']];
  let last;
  for(const [node,part] of parts){node.style.visibility='visible';last=node.animate(frames(s.index,part,start),{duration,easing:s.index===5?OUT:EASE,fill:'forwards'});s.animations.push(last);}
  s.guard=setTimeout(()=>{if(state===s&&phase==='animating')cleanup();},duration+1500);
  last.onfinish=()=>{if(state!==s)return;if(phase==='cover'){s.phase='waiting';s.covered=true;maybeReady();}else{cleanup();scheduleSnapshot();}};
 }
 function recordEvent(s){record('accept',s);}
 function accept(record){
  if(!record||!Number.isInteger(record.index)||record.index<0||record.index>11||!record.old?.startsWith('data:image/png;base64,'))return;
  if(video(location.href)||reduced.matches){send('cancel',{id:record.id});return;}
  const s=mount(record);s.localPending=!!record.localToken;recordEvent(s);Promise.all([loaded(s.old),loaded(s.base)]).then(()=>{if(state!==s)return;send('attached',{id:s.id});if(s.index===0||s.index===11)animate(s,'cover');else s.covered=true;if(record.localToken)commitLocal(record);maybeReady();});
 }
 function contentReady(){
  if(document.readyState!=='complete'||!document.body||!document.querySelector('#bili-space-root')||!nativeReady)return false;
  const body=document.body;if(!body.children.length||body.getBoundingClientRect().height<1)return false;
  if(document.querySelector('#bs-video-loading'))return false;
  if(document.fonts?.status==='loading')return false;
  return [...document.images].filter(e=>!e.closest('#bs-transition')).every(e=>{const r=e.getBoundingClientRect();return !r.width||!r.height||r.bottom<0||r.top>innerHeight||r.left>innerWidth||e.complete||e.loading==='lazy';});
 }
 function maybeReady(){
  clearTimeout(checkTimer);if(!state||state.phase==='animating')return;
  if(state.localPending||!state.covered||!contentReady()){checkTimer=setTimeout(maybeReady,50);return;}
  const s=state;if(s.requested)return;s.requested=true;send('ready',{id:s.id});
 }
 function prepareSnapshot(){if(!state)return;state.host.style.visibility='hidden';getComputedStyle(document.documentElement).backgroundColor;send('capture-new',{id:state.id});}
 async function present(record){
  const s=state;if(!s||s.id!==record.id)return;s.next.src=record.image;await loaded(s.next);if(state!==s)return;
  s.host.style.visibility='visible';s.next.style.visibility='visible';animate(s,'animating');getComputedStyle(s.next).clipPath;send('attached',{id:s.id});
 }
 function scheduleSnapshot(){clearTimeout(snapshotTimer);snapshotTimer=setTimeout(()=>{if(!state&&document.readyState==='complete')send('snapshot',{reduced:reduced.matches});},120);}
 async function commitLocal(record){const job=localJob;if(!job||job.token!==record.localToken)return;try{await job.commit();}finally{if(localJob===job)localJob=null;if(state?.localToken===record.localToken)state.localPending=false;nativeReady=true;maybeReady();scheduleSnapshot();}}
 function navigate(commit,target){if(reduced.matches){cleanup();Promise.resolve(commit()).then(ready);return;}const token=String(++serial);localJob={token,commit};send('local-begin',{token,url:new URL(target,location.href).href,reduced:reduced.matches});}
 function arrive(){if(arrived)return;arrived=true;send('arrive',{url:location.href});}
 function leave(target){if(!ordinary(target)||reduced.matches)return false;scheduleSnapshot();return true;}
 function ready(){nativeReady=true;maybeReady();if(!state)scheduleSnapshot();}
 function cancel(){cleanup();}
 function resized(){if(!state)return;const s=state,a=s.animations[0];if(a&&s.phase!=='waiting'){const p=s.progress+(1-s.progress)*Math.min(1,Number(a.currentTime||0)/Number(a.effect.getTiming().duration));animate(s,s.phase,p);}}
 const onReduced=()=>{if(reduced.matches)cancel();scheduleSnapshot();};
 window.addEventListener('resize',resized,{passive:true});window.addEventListener('scroll',scheduleSnapshot,{passive:true});window.addEventListener('pagehide',()=>cleanup(false));window.addEventListener('load',()=>{ready();},{once:true});reduced.addEventListener('change',onReduced);
 const manager={navigate,commitLocal,arrive,leave,ready,accept,prepareSnapshot,present,cancel,pick,RECIPES:12};
 if(testing)manager.test={stats,frames,shape,durations:DURATIONS,async preview(index,oldImage,newImage){accept({id:'test-'+(++serial),index,old:oldImage});await new Promise(r=>setTimeout(r,index===0||index===11?DURATIONS[index]/2+30:20));if(!state)return;state.requested=true;await present({id:state.id,image:newImage});},get state(){return state?{id:state.id,index:state.index,phase:state.phase,covered:state.covered,requested:state.requested,nativeReady,bodyHeight:document.body?.getBoundingClientRect().height,oldLoaded:state.old.naturalWidth,baseLoaded:state.base.naturalWidth}:null;}};
 window.TransitionManager=window.BiliTransition=manager;
})();
