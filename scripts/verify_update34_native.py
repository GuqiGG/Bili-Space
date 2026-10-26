from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import json,hashlib,threading,subprocess
R=Path.cwd();payload=b'PK\x03\x04'+b'local-update-test-'*10000
base=dict(schema=1,appId='bili-space',platform='windows-x64',version='0.1.35',minimumSupportedVersion='0.1.0',force=False,downloadUrl='https://bili.gvqi.top/releases/Bili-Space-0.1.35-win64.zip',sha256=hashlib.sha256(payload).hexdigest(),size=len(payload),changelog=['更新测试','<img src=x>'])
mode='normal'
class Server(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path.startswith('/updates/'):
   m={**base}
   if mode=='force':m['force']=True
   if mode=='bad-hash':m['sha256']='0'*64
   if mode=='minimum':m['minimumSupportedVersion']='0.1.35'
   if mode=='current':m.update(version='0.1.34',force=True,downloadUrl='https://bili.gvqi.top/releases/Bili-Space-0.1.34-win64.zip')
   if mode=='invalid':m['downloadUrl']='https://evil.example/payload.exe'
   if mode=='missing':self.send_response(404);self.end_headers();return
   if mode=='redirect':self.send_response(302);self.send_header('Location','https://evil.example/');self.end_headers();return
   body=json.dumps(m,ensure_ascii=False).encode()
  else:body=payload
  self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=server.serve_forever,daemon=True).start();report={}
try:
 for mode in ['normal','bad-hash','force','minimum','current','invalid','missing','redirect']:
  target=R/f'verification/update34-native-{mode}';p=subprocess.run([str(R/'verification/update34-native-test.exe'),str(server.server_port),str(target),mode],capture_output=True,text=True,encoding='utf8',timeout=30);assert p.returncode==0,(mode,p.stdout,p.stderr);d=json.loads(p.stdout)
  if mode=='normal':assert d['ignored']['ignored'] and d['download']['ready'] and d['readyFile'] and d['partFiles']==0
  if mode=='bad-hash':assert d['download']['status']=='error' and not d['readyFile'] and d['partFiles']==0
  if mode=='force':assert d['ignoreBlocked'] and d['restartGate'] and d['revoked'] and d['cacheRemoved']
  if mode=='minimum':assert d['check']['required']
  if mode=='current':assert not d['check']['required'] and not d['check']['available']
  if mode in ['invalid','missing','redirect']:assert d['check']['status']=='error' and not d['check'].get('required',False)
  report[mode]={'command':p.args,'stdout':p.stdout,'stderr':p.stderr,'exit':p.returncode};print(mode,'PASS')
finally:server.shutdown()
(R/'verification/update34-native.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
