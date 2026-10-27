from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json,hashlib,subprocess,threading,time,sys
R=Path(__file__).resolve().parents[1];phase=sys.argv[1];exe=R/sys.argv[2];mode='force-stale';payload=b'MZ'+b'fixture-data'*1000
base=dict(schema=1,appId='bili-space',platform='windows-x64',version='0.1.43',minimumSupportedVersion='0.1.0',force=False,downloadUrl='https://bili.gvqi.top/releases/Bili-Space-0.1.43-win64.zip',sha256='a'*64,size=100,changelog=['fixture'],setupUrl='https://github.com/GuqiGG/Bili-Space/releases/download/v0.1.43/Bili-Space-0.1.43-Setup.exe',setupSha256=hashlib.sha256(payload).hexdigest(),setupSize=len(payload))
class Server(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/failure':self.send_response(500);self.end_headers();return
  if self.path=='/slow':self.send_response(200);self.send_header('Content-Length','100000000');self.end_headers();time.sleep(12);return
  if self.path.endswith('windows-x64.json'):
   m={**base}
   if mode=='force-stale' and self.path.startswith('/updates/'):
    m.update(version='0.1.43',force=True,downloadUrl='https://bili.gvqi.top/releases/Bili-Space-0.1.43-win64.zip');[m.pop(k) for k in ['setupUrl','setupSha256','setupSize']]
   body=json.dumps(m).encode()
  else:body=payload
  self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def log_message(self,*a):pass
srv=ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=srv.serve_forever,daemon=True).start();report={}
try:
 for mode in ['force-stale','resume','busy-install','peer-failure','gate-data','gate-foreign']:
  d=R/f'verification/hotfix38-{phase}-{mode}';arg=f'http://127.0.0.1:{srv.server_port}' if mode=='peer-failure' else str(srv.server_port);cmd=[str(exe),arg,str(d),mode];start=time.monotonic()
  try:
   p=subprocess.run(cmd,capture_output=True,text=True,encoding='utf8',timeout=5 if mode=='peer-failure' else 35);assert p.returncode==0,(p.returncode,p.stderr);v=json.loads(p.stdout)
   fixed=(v['check']['required'] if mode=='force-stale' else v['rechecked'].get('ready',False) if mode=='resume' else '下载' in v['install']['message'] if mode=='busy-install' else v['accepted'] if mode=='gate-data' else not v['accepted'] if mode=='gate-foreign' else v['preserved'] and not v['busy'])
   row={'command':cmd,'stdout':p.stdout,'stderr':p.stderr,'exit':p.returncode,'fixed':fixed,'seconds':time.monotonic()-start}
  except subprocess.TimeoutExpired as e:row={'command':cmd,'stdout':str(e.stdout or ''),'stderr':str(e.stderr or ''),'event':'timeout; fixture process terminated','fixed':False,'seconds':time.monotonic()-start}
  report[mode]=row;assert row['fixed']==(phase=='MODIFIED' or mode=='gate-foreign'),(phase,mode,row);print(mode,'PASS' if row['fixed'] else 'REPRODUCED',flush=True)
finally:srv.shutdown()
(R/f'verification/hotfix38-{phase}-native.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
