export default {
 async fetch(request,env){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const path=new URL(request.url).pathname;
  const key=path==='/'?'index.html':path.slice(1);
  if(!['index.html','site.js','site.css','updates/windows-x64.json'].includes(key)&&!/^releases\/Bili-Space-\d+\.\d+\.\d+-win64\.zip$/.test(key))return new Response('Not found',{status:404});
  const object=await env.RELEASES.get(key);if(!object)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  const type=key.endsWith('.json')?'application/json; charset=utf-8':key.endsWith('.zip')?'application/zip':key.endsWith('.js')?'text/javascript; charset=utf-8':key.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';
  const headers=new Headers({'Content-Type':type,'Content-Length':String(object.size),'Cache-Control':key.endsWith('.zip')?'public, max-age=31536000, immutable':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'"});
  if(key.endsWith('.zip'))headers.set('Content-Disposition',`attachment; filename="${key.split('/').pop()}"`);
  return new Response(request.method==='HEAD'?null:object.body,{headers});
 }
};
