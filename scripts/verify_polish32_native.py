from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import threading,subprocess,json,time,hashlib
R=Path.cwd();payload=(R/'verification/dash29-fixture.mp4').read_bytes()
class Server(BaseHTTPRequestHandler):
 def do_GET(self):
  try:
   if self.path=='/headers':time.sleep(3)
   body=payload*(50 if self.path=='/slow' else 1)
   self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers()
   for i in range(0,len(body),1024):self.wfile.write(body[i:i+1024]);self.wfile.flush();time.sleep(.025)
  except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
 def log_message(self,*args):pass
srv=ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=srv.serve_forever,daemon=True).start();report={}
try:
 for name,path,delay in [('normal','/normal',-1),('cancel-transfer','/slow',250),('cancel-headers','/headers',200),('cancel-before-start','/slow',0)]:
  out=R/f'verification/polish32-{name}.mp4';out.write_bytes(b'pristine-sentinel');start=time.monotonic();p=subprocess.run([str(R/'verification/polish32-native-test.exe'),f'http://127.0.0.1:{srv.server_port}{path}',f'http://127.0.0.1:{srv.server_port}{path}',str(out),str(delay)],capture_output=True,text=True,encoding='utf-8',timeout=12);assert p.returncode==0,(p.stdout,p.stderr);rows=json.loads(p.stdout);final=rows['events'][-1];assert not rows['busy'];assert not list(out.parent.glob(out.name+'.bs-part-*'))
  if delay>=0:assert not final['ok'] and final['message']=='已取消下载' and out.read_bytes()==b'pristine-sentinel',rows;assert rows['elapsedMs']<1500,rows
  else:assert final['ok'] and out.stat().st_size>1000,rows
  rows.update({'target_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'partial_cleaned':True});report[name]=rows
finally:srv.shutdown()
(R/'verification/polish32-native.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:{'elapsedMs':v['elapsedMs'],'result':v['events'][-1],'partial_cleaned':True} for k,v in report.items()},ensure_ascii=False,indent=2))
