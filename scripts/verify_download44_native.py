"""Actual WinHTTP downloader against an isolated local HTTP Range fixture."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading, subprocess, json, hashlib, time, socket, shutil
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'verification/download44-http'
DATA.mkdir(exist_ok=True)
payload=b'\0\0\0\x18ftypisom\0\0\2\0isomiso2'+bytes(range(256))*32768
state={'mode':'ok','requests':[], 'active':0,'max':0,'rangeActive':0,'rangeMax':0}
lock=threading.Lock()
class Handler(BaseHTTPRequestHandler):
 protocol_version='HTTP/1.1'
 def log_message(self,*args): pass
 def do_HEAD(self):
  self.send_response(405 if state['mode']=='nohead' else 200);self.send_header('Content-Length',str(len(payload)));self.send_header('Accept-Ranges','bytes');self.send_header('ETag','W/"v1"' if state['mode'] in ('weak','weakmodified') else '"v1"');
  if state['mode']=='weakmodified':self.send_header('Last-Modified','Wed, 21 Oct 2015 07:28:00 GMT')
  self.end_headers()
 def do_GET(self):
  with lock:
   state['rangeActive']+=int(bool(self.headers.get('Range')));state['rangeMax']=max(state['rangeMax'],state['rangeActive']);state['active']+=1;state['max']=max(state['max'],state['active']);mode=state['mode'];state['requests'].append({'range':self.headers.get('Range'),'ifRange':self.headers.get('If-Range'),'path':self.path})
  try:
   data=payload if mode!='changed' else payload[:24]+b'Z'*(len(payload)-24)
   etag='"v2"' if mode in ('changed','badetag') else 'W/"v1"' if mode in ('weak','weakmodified') else '"v1"'
   start,end=0,len(data)-1;r=self.headers.get('Range')
   if r and mode not in ('ignore','changed'):
    bounds=r.removeprefix('bytes=').split('-');start=int(bounds[0]);end=int(bounds[1]) if bounds[1] else len(data)-1
    self.send_response(206);self.send_header('Content-Range',f'bytes {start+(1 if mode=="badstart" else 0)}-{end}/{len(data)}')
   else:self.send_response(200)
   
   if mode=='weakmodified':self.send_header('Last-Modified','Wed, 21 Oct 2015 07:28:00 GMT')
   self.send_header('Content-Length',str(end-start+1));self.send_header('ETag',etag);self.send_header('Accept-Ranges','bytes');self.end_headers()
   stop=min(end+1,start+384*1024) if mode=='interrupt' else end+1
   for i in range(start,stop,65536):
    self.wfile.write(data[i:min(i+65536,stop)]);self.wfile.flush();time.sleep(.008)
   if mode=='interrupt':
    self.close_connection=True
    try:self.connection.shutdown(socket.SHUT_RDWR)
    except OSError:pass
  except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError,OSError):pass
  finally:
   with lock:state['active']-=1;state['rangeActive']-=int(bool(self.headers.get('Range')))
class QuietServer(ThreadingHTTPServer):
 def handle_error(self,*args):pass # Intentional aborted requests have expected socket reset exceptions.
server=QuietServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/media.mp4'
report={}
def run(name,mode='ok',command='fetch',connections=1,request_url=None):
 directory=DATA/name;directory.mkdir(exist_ok=True)
 # Waiting ensures canceled connection cleanup does not distort per-test concurrency counts.
 while state['active']:time.sleep(.01)
 state.update(mode=mode,requests=[],max=0,rangeMax=0)
 p=subprocess.run([str(ROOT/'verification/download44-native.exe'),request_url or url,str(directory),command,str(connections)],capture_output=True,timeout=45)
 assert p.returncode==0,(name,p.returncode,p.stderr.decode(errors='replace'))
 out=json.loads(p.stdout.decode('utf-8'))
 out['requests']=list(state['requests']);out['maxConnections']=state['max'];out['maxRangeConnections']=state['rangeMax'];report[name+'-'+mode+'-'+command+str(connections)]=out
 return out,directory
# Fresh test IDs avoid deletion outside this dedicated fixture directory.
RUN=str(time.time_ns())
def case(n):return RUN+'-'+n
name=case('resume');out,d=run(name,'interrupt');assert not out['ok'] and 0<out['bytes']<len(payload),out
partial=(d/'track.mp4').read_bytes();out,d=run(name);assert out['ok'] and (d/'track.mp4').read_bytes()==payload and out['requests'][0]['range']==f'bytes={len(partial)}-',out
for behavior in ('ignore','changed','badstart','badetag'):
 name=case(behavior);out,d=run(name,'interrupt');before=(d/'track.mp4').read_bytes();out,d=run(name,behavior)
 if behavior in ('ignore','changed'):
  expected=payload if behavior=='ignore' else payload[:24]+b'Z'*(len(payload)-24)
  assert out['ok'] and (d/'track.mp4').read_bytes()==expected,out
 else:assert not out['ok'] and (d/'track.mp4').read_bytes()==before,out
name=case('cancel');out,d=run(name,command='cancel');assert not out['ok'] and 0<out['bytes']<len(payload),out
out,d=run(name);assert out['ok'] and (d/'track.mp4').read_bytes()==payload,out
for behavior in ('ok','ignore','badstart','badetag'):
 out,d=run(case('parallel-'+behavior),behavior,connections=4)
 if behavior in ('ok','ignore'):assert out['ok'] and (d/'track.mp4').read_bytes()==payload,out
 else:assert not out['ok'] and not (d/'track.mp4').exists(),out
 assert out['maxRangeConnections']<=4,out
 if behavior=='ok':assert out['maxConnections']<=4,out
one,d=run(case('benchmark1'));four,d=run(case('benchmark4'),connections=4)
assert one['ok'] and four['ok']
report['benchmark']={'singleMs':one['elapsedMs'],'fourMs':four['elapsedMs'],'ratio':round(one['elapsedMs']/max(1,four['elapsedMs']),2),'scope':'8 MiB local HTTP fixture capped per connection, not real Bilibili CDN'}
out,d=run(case('plan'),'ok','plan');assert out['ok'] and (d/'final.mp4').read_bytes()==payload and not list(d.glob('*.bs-part-*')),out
sentinel=(d/'final.mp4').read_bytes();out,d=run(d.name,'ok','plan');assert (d/'final.mp4').read_bytes()==sentinel and not out['requests'],out
out,d=run(case('plan-failure'),'interrupt','plan');assert not out['ok'] and list(d.glob('*.bs-part-*video.mp4.range*')),out
out,d=run(case('queue'),'ok','queue');assert out['stalePlanRejected'] and len(out['files'])==2 and all(x['exists'] and x['state']=='completed' for x in out['files']),out
saved=(d/'download-queue.json').read_text('utf-8');assert 'http:' not in saved and 'must-not-persist' not in saved and 'planToken' not in saved,saved
out,d=run(d.name,'ok','queue-reload');assert len(out['items'])==2 and all(x['state']=='completed' for x in out['items']),out
out,d=run(case('queue-paused'),'ok','queue-pause');assert any(x['state']=='paused' for x in out['files']),out
out,d=run(d.name,'ok','queue-reload');assert out['paused'] and all(x['state']=='paused' for x in out['items']),out
out,d=run(d.name,'ok','queue-resume');assert all(x['state']=='completed' for x in out['files']),out
out,d=run(case('queue-failed'),'ok','queue-failure');assert sorted(x['state'] for x in out['files'])==['completed','failed'],out
out,d=run(case('queue-remove'),'ok','queue-remove');assert out['completedFilePreserved'] and len(out['files'])==1,out
name=case('signed-query');out,d=run(name,'interrupt',request_url=url+'?token=old');old=out['bytes'];out,d=run(name,request_url=url+'?token=fresh');assert out['ok'] and out['requests'][0]['range']==f'bytes={old}-',out
for behavior in ('nohead','weak','weakmodified'):
 out,d=run(case(behavior),behavior,connections=4);assert out['ok'] and (d/'track.mp4').read_bytes()==payload,out
 assert (out['maxRangeConnections']>0)==(behavior=='weakmodified'),out
server.shutdown()
(ROOT/'verification/download44-native-results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),'utf-8')
print(json.dumps({'passed':len(report)-1,'benchmark':report['benchmark'],'report':str(ROOT/'verification/download44-native-results.json')},indent=2))


