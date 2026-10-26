from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import threading,subprocess,json,hashlib
R=Path.cwd();payload=(R/'verification/dash29-fixture.mp4').read_bytes()
class Server(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(404 if self.path=='/404' else 200);self.send_header('Content-Length',str(len(payload)+(100 if self.path=='/truncated' else 0)));self.end_headers();self.wfile.write(payload)
 def log_message(self,*args):pass
srv=ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=srv.serve_forever,daemon=True).start();out=R/'verification/dash29-merged.mp4';report={};exe=R/'verification/dash29-native-test.exe'
for case in ['ok','truncated','404']:
 dest=out if case=='ok' else R/f'verification/dash29-{case}.mp4';dest.write_bytes(b'pristine-sentinel');p=subprocess.run([str(exe),f'http://127.0.0.1:{srv.server_port}/ok',f'http://127.0.0.1:{srv.server_port}/{case}',str(dest),'run'],capture_output=True);assert p.returncode==0,p.stderr
 result=dest.read_bytes();report[case]={'exit':p.returncode,'bytes':len(result),'sha256':hashlib.sha256(result).hexdigest(),'partial_cleaned':not list(dest.parent.glob(dest.name+'.bs-part-*'))};assert report[case]['partial_cleaned']
 if case=='ok':assert result!=b'pristine-sentinel',report
 else:assert result==b'pristine-sentinel',case
for label,file in [('input',R/'verification/dash29-fixture.mp4'),('output',out)]:
 p=subprocess.run([str(exe),str(file),str(R/f'verification/dash29-{label}')],capture_output=True,text=True);assert p.returncode==0,(p.stdout,p.stderr);report[label]={'samples_and_last_timestamps':p.stdout.strip()}
for track in ['v','a']:
 original=(R/f'verification/dash29-input.{track}.es').read_bytes();merged=(R/f'verification/dash29-output.{track}.es').read_bytes();assert original==merged,(track,len(original),len(merged));report[track]={'bytes':len(merged),'sha256':hashlib.sha256(merged).hexdigest(),'lossless_equal':True}
srv.shutdown();report['pass']=True;(R/'verification/dash29-native.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
