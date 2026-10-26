from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import threading,subprocess,json,hashlib
R=Path.cwd();payload=b'\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2'+b'\x00\x00\x00\x08mdat'+b'fixture-byte-transfer'*10000
class Server(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(404 if self.path=='/404' else 200);self.send_header('Content-Length',str(len(payload)+(100 if self.path=='/truncated' else 0)));self.end_headers();self.wfile.write(b'invalid!' if self.path=='/invalid' else payload)
 def log_message(self,*args):pass
srv=ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=srv.serve_forever,daemon=True).start();out=R/'verification/download28-transfer.mp4';report={}
for case in ['ok','truncated','404','invalid']:
 out.write_bytes(b'pristine-sentinel');p=subprocess.run([str(R/'verification/download28-native-test.exe'),f'http://127.0.0.1:{srv.server_port}/{case}',str(out)],capture_output=True);assert p.returncode==0,p.stderr
 result=out.read_bytes();assert result==(payload if case=='ok' else b'pristine-sentinel'),case;assert not list(out.parent.glob(out.name+'.bs-part-*'));report[case]={'exit':p.returncode,'bytes':len(result),'sha256':hashlib.sha256(result).hexdigest(),'expected_matches':True,'partial_cleaned':True}
srv.shutdown();(R/'verification/download28-native.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
