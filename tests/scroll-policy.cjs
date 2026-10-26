const {app}=require('./ui-harness.cjs');
const a=app({source:process.argv[2],reduceMotion:false}),w=a.w,d=w.document;
const el=d.createElement('div');el.style.overflowY='auto';d.body.append(el);
Object.defineProperty(el,'scrollHeight',{value:1000});Object.defineProperty(el,'clientHeight',{value:100});el.scrollTop=0;el.scrollTo=({top})=>el.scrollTop=top;
let frame;w.requestAnimationFrame=f=>(frame=f,1);w.cancelAnimationFrame=()=>{frame=null};w.performance.now=()=>0;
const e=new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true});el.dispatchEvent(e);
if(frame)frame(35);const during=el.scrollTop;if(frame)frame(151);
console.log(JSON.stringify({scrollbarWidth:w.getComputedStyle(d.documentElement).scrollbarWidth||'auto (unset)',wheel120Intercepted:e.defaultPrevented,during:Number(during.toFixed(3)),end:el.scrollTop}));a.close();
