from pathlib import Path
import subprocess,json,threading,socket,time,hashlib
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
r=Path.cwd();d=r/'verification/download44-transaction';payload=b'\0\0\0\x18ftypisom'+b'X'*(8*1024*1024)
class H(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_HEAD(self):self.send_response(405);self.end_headers()
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Length',str(len(payload)));self.send_header('ETag','"test"');self.end_headers();self.wfile.write(payload[:262144]);self.wfile.flush();self.close_connection=True
  try:self.connection.shutdown(socket.SHUT_RDWR)
  except OSError:pass
class S(ThreadingHTTPServer):
 def handle_error(self,*a):pass
s=S(('127.0.0.1',0),H);threading.Thread(target=s.serve_forever,daemon=True).start();records=[]
for phase,exe in [('BASELINE','baseline.exe'),('MODIFIED','modified.exe'),('ROLLBACK','rollback.exe')]:
 p=subprocess.run([str(d/exe),f'http://127.0.0.1:{s.server_port}/same-input.mp4',str(d/(phase+'-'+str(time.time_ns())))],capture_output=True)
 records.append({'phase':phase,'command':subprocess.list2cmdline(p.args),'stdout':p.stdout.decode('utf-8'),'stderr':p.stderr.decode('utf-8'),'exit':p.returncode})
 assert p.returncode==0
assert json.loads(records[0]['stdout'])['partialFiles']==0
assert json.loads(records[1]['stdout'])['partialFiles']>0
assert records[0]['stdout']==records[2]['stdout']
assert (d/'baseline-main.cpp').read_bytes()==(d/'rollback-copy.cpp').read_bytes()
records.append({'restoredSHA256':hashlib.sha256((d/'rollback-copy.cpp').read_bytes()).hexdigest(),'matchesBaseline':True})
(d/'VERIFICATION.txt').write_text(json.dumps(records,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(records,ensure_ascii=True,indent=2));s.shutdown()
