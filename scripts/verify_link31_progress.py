from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import threading,subprocess,json,time
R=Path.cwd();payload=(R/'verification/dash29-fixture.mp4').read_bytes()
class Server(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200)
  if self.path!='/unknown':self.send_header('Content-Length',str(len(payload)))
  self.send_header('Connection','close');self.end_headers()
  for i in range(0,len(payload),1024):self.wfile.write(payload[i:i+1024]);self.wfile.flush();time.sleep(.04)
 def log_message(self,*args):pass
srv=ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=srv.serve_forever,daemon=True).start();report={}
try:
 for case in ['known','unknown']:
  out=R/f'verification/link31-{case}.mp4';p=subprocess.run([str(R/'verification/link31-native-test.exe'),f'http://127.0.0.1:{srv.server_port}/{case}',f'http://127.0.0.1:{srv.server_port}/{case}',str(out)],capture_output=True,text=True,encoding="utf-8");assert p.returncode==0,(p.stdout,p.stderr);rows=json.loads(p.stdout);progress=[r['progress'] for r in rows if 'progress' in r];assert len(progress)>=4,progress;assert any(r['bytesPerSecond']>0 for r in progress);assert all(a['bytes']<=b['bytes'] for a,b in zip(progress,progress[1:]));assert progress[-1]['bytes']==len(payload)*2;assert rows[-1]['ok'] is True;assert any(r.get('phase')=='合并中' for r in rows)
  if case=='known':assert progress[-1]['percent']==100 and any(r['etaSeconds'] and r['etaSeconds']>0 for r in progress)
  else:assert all(r['percent'] is None and r['etaSeconds'] is None for r in progress)
  report[case]={'events':rows,'outputBytes':out.stat().st_size,'verified':True}
finally:srv.shutdown()
(R/'verification/link31-progress.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:{'progress_events':sum('progress' in r for r in v['events']),'verified':v['verified'],'outputBytes':v['outputBytes']} for k,v in report.items()},indent=2))
