/* Only the bundled document uses the native, read-only Bilibili API transport. */
(()=>{
 if(!/\/(?:__client\/)?app\.html$/.test(location.pathname))return;
 const original=window.fetch.bind(window),pending=new Map();let sequence=0;
 window.BiliLocalAPI={accept(reply){const task=pending.get(reply.id);if(!task)return;pending.delete(reply.id);clearTimeout(task.timer);task.signal?.removeEventListener('abort',task.abort);if(reply.error)task.reject(Error(reply.error));else task.resolve(new Response(reply.body||'',{status:reply.status||502,headers:{'Content-Type':'application/json; charset=utf-8'}}));}};
 window.fetch=(input,options={})=>{
  const value=typeof input==='string'?input:input.url;let url;try{url=new URL(value,location.href);}catch{return original(input,options);}
  if((options.method||'GET').toUpperCase()!=='GET'||!(url.origin==='https://api.bilibili.com'&&url.pathname.startsWith('/x/')||url.href==='https://www.bilibili.com/'))return original(input,options);
  return new Promise((resolve,reject)=>{const id=Date.now().toString(36)+'-'+(++sequence),signal=options.signal,abort=()=>{clearTimeout(task.timer);pending.delete(id);reject(new DOMException('Request aborted','AbortError'));},task={resolve,reject,signal,abort,timer:0};if(signal?.aborted){reject(new DOMException('Request aborted','AbortError'));return;}task.timer=setTimeout(()=>{pending.delete(id);signal?.removeEventListener('abort',abort);reject(Error('请求超时，请重试'));},16000);pending.set(id,task);signal?.addEventListener('abort',abort,{once:true});native('local-api',{id,url:url.href});});
 };
})();
