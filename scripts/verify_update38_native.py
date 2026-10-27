from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import hashlib,json,threading,subprocess
R=Path(__file__).resolve().parents[1];payload=b'MZ'+b'isolated-package-data'*10000;mode='normal'
base=dict(schema=1,appId='bili-space',platform='windows-x64',version='0.1.39',minimumSupportedVersion='0.1.0',force=False,downloadUrl='https://bili.gvqi.top/releases/Bili-Space-0.1.39-win64.zip',sha256='a'*64,size=100,changelog=['fixture'],setupUrl='https://github.com/GuqiGG/Bili-Space/releases/download/v0.1.39/Bili-Space-0.1.39-Setup.exe',setupSha256=hashlib.sha256(payload).hexdigest(),setupSize=len(payload))
class Server(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path.endswith('windows-x64.json'):
   primary=self.path.startswith('/updates/')
   if mode=='fallback' and primary:self.send_response(404);self.end_headers();return
   m={**base}
   if mode=='bad-hash':m['setupSha256']='0'*64
   if mode=='force' and primary:m['force']=True
   if mode=='invalid':m['setupUrl']='https://evil.example/payload.exe'
   if mode=='stale' and primary:m.update(version='0.1.37',downloadUrl='https://bili.gvqi.top/releases/Bili-Space-0.1.37-win64.zip');m.pop('setupUrl');m.pop('setupSha256');m.pop('setupSize')
   body=json.dumps(m).encode()
  elif mode=='redirect' and self.path.startswith('/GuqiGG/'):
   self.send_response(302);self.send_header('Location','https://release-assets.githubusercontent.com/synthetic');self.end_headers();return
  elif mode=='untrusted-redirect':
   self.send_response(302);self.send_header('Location','https://evil.example/payload.exe');self.end_headers();return
  else:body=payload
  self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=server.serve_forever,daemon=True).start();report={}
try:
 for mode in ['normal','fallback','stale','force','bad-hash','invalid','redirect','untrusted-redirect']:
  d=R/f'verification/update38-native-{mode}';p=subprocess.run([str(R/'verification/update38-native.exe'),str(server.server_port),str(d),mode],capture_output=True,text=True,encoding='utf8',timeout=40);assert p.returncode==0,(mode,p.stdout,p.stderr);v=json.loads(p.stdout)
  if mode in ['normal','fallback','stale','redirect']:assert v['download'].get('ready') and v['readyFile'] and v['check']['version']=='0.1.39',v
  elif mode=='force':assert v['check']['required'],v
  elif mode=='invalid':assert v['check']['status']=='error',v
  else:assert v['download']['status']=='error' and not v['readyFile'],v
  assert v['partFiles']==0
  report[mode]={'command':p.args,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr};print(mode,'PASS')
finally:server.shutdown()
(R/'verification/update38-native.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
