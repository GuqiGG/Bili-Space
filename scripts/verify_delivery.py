from pathlib import Path
import hashlib,json,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def decode_output(data):
 try:return data.decode('utf8'),'utf8'
 except UnicodeDecodeError:return data.decode('gb18030'),'gb18030'
events=[]
for label,cmd in [('BUILD',['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',str(ROOT/'scripts/build.ps1')]),('UNIT_TESTS',['npm.cmd','test']),('TRANSACTION',['python',str(ROOT/'scripts/verify_transaction.py')]),('NATIVE_SMOKE',['python',str(ROOT/'scripts/smoke.py')]),('UI_REGRESSION',['python',str(ROOT/'scripts/regression_ui.py')]),('HOME_REGRESSION',['python',str(ROOT/'scripts/regression_home.py')]),('POLISH_REGRESSION',['python',str(ROOT/'scripts/regression_polish.py')]),('LIVE_HOME',['python',str(ROOT/'scripts/probe_home.py')]),('PACKAGE',['python',str(ROOT/'scripts/package.py')])]:
 p=subprocess.run(cmd,cwd=ROOT,capture_output=True)
 stdout,stdout_encoding=decode_output(p.stdout);stderr,stderr_encoding=decode_output(p.stderr)
 events.append({'label':label,'command':cmd,'stdout':stdout,'stderr':stderr,'stdout_encoding':stdout_encoding,'stderr_encoding':stderr_encoding,'exit_status':p.returncode})
 (OUT/f'final-{label.lower()}.stdout.txt').write_bytes(p.stdout);(OUT/f'final-{label.lower()}.stderr.txt').write_bytes(p.stderr)
 print(label,p.returncode,flush=True)
 if p.returncode:
  (OUT/'delivery-failed.json').write_text(json.dumps(events,ensure_ascii=False,indent=2),encoding='utf8')
  raise SystemExit(p.returncode)
smoke=json.loads((OUT/'smoke.json').read_text(encoding='utf8'))
assert smoke['result']=='PASS'
for path,h in smoke['artifact_sha256'].items():assert sha(ROOT/path)==h,path
for p in (ROOT/'assets').glob('*'):
 if p.is_file():assert sha(p)==sha(ROOT/'dist/assets'/p.name),p
package=json.loads((OUT/'package.json').read_text())
with zipfile.ZipFile(package['archive']) as z:
 assert z.testzip() is None
 for p in [ROOT/'dist/BetterBiliSpace.exe',ROOT/'dist/WebView2Loader.dll',*sorted((ROOT/'dist/assets').glob('*'))]:
  if p.is_file():assert hashlib.sha256(z.read('BetterBiliSpace/'+p.relative_to(ROOT/'dist').as_posix())).hexdigest()==sha(p)
ledger=json.loads((OUT/'VERIFICATION.txt').read_text(encoding='utf8'))
ledger['delivery_events']=events
ledger['native_smoke']=smoke
ledger['live_video_observation']=json.loads((OUT/'live-video-sr.json').read_text(encoding='utf8'))
ledger['live_video_observation_provenance']='Prior delivery evidence; video enhancement not re-tested against a live video in this turn (native local GPU smoke was repeated).'
ledger['package']=package
ledger['polish_regression']=json.loads((OUT/'polish-modified.json').read_text(encoding='utf8'))
assert ledger['polish_regression']['result']=='PASS'
assert ledger['polish_regression']['sha256']==sha(ROOT/'assets/enhance.js')
ledger['current_anonymous_home']=json.loads((OUT/'home-live-current.json').read_text(encoding='utf8'))
assert ledger['current_anonymous_home']['result']=='PASS'
assert ledger['current_anonymous_home']['source_sha256']==sha(ROOT/'assets/enhance.js')
if (OUT/'home-modified.json').exists():
 ledger['home_regression']=json.loads((OUT/'home-modified.json').read_text(encoding='utf8'))
 assert ledger['home_regression']['result']=='PASS'
 assert ledger['home_regression']['source_sha256']==sha(ROOT/'assets/enhance.js')
ledger['prior_errors']=[{'label':'initial jsdom inert initialization check','exit_status':1,'stdout_file':str(OUT/'ui-v0.1.2/initial-tests.stdout.txt'),'stderr_file':str(OUT/'ui-v0.1.2/initial-tests.stderr.txt'),'resolution':'initialize disclosure inert state at shell mount'}, {'label':'initial native homepage check','exit_status':1,'stderr_file':str(OUT/'ui-v0.1.2/initial-home-failed.stderr.txt'),'resolution':'override ID-specific hidden header ancestor rule'}, {'label':'banner center assertion','exit_status':1,'stderr_file':str(OUT/'ui-v0.1.2/center-assertion.stderr.txt'),'resolution':'compare with actual banner center, excluding native vertical scrollbar'}]
ledger['prior_errors'].append({'label':'first native smoke GPU observation','exit_status':1,'stderr_file':str(OUT/'ui-v0.1.2/initial-smoke-failed.stderr.txt'),'resolution':'not reproduced on identical smoke command retry; retain the initial BiliSpace undefined event','retry_stdout_file':str(OUT/'smoke-retry.stdout.txt'),'retry_stderr_file':str(OUT/'smoke-retry.stderr.txt'),'retry_exit_status':0})
ledger['prior_errors'].append({'label':'layout observation: load-more anchor lost its box','evidence_file':str(OUT/'ui-v0.1.2/initial-live-scroll.json'),'observed':'10 loaded videos remained unchanged through three scrolls; anchor display contents, 0x0','resolution':'keep the IntersectionObserver anchor as a 1px block, exclude its skeleton from flattening; repeated live scroll loads more videos'})
ledger['prior_errors'].append({'label':'initial UI hover check on inactive test target','exit_status':1,'stderr_file':str(OUT/'ui-v0.1.3/initial-ui-regression.stderr.txt'),'observations':str(OUT/'ui-v0.1.3/initial-ui-regression.json'),'resolution':'enable CDP focus emulation before dispatching pointer events; real opacity transition assertions retained','retry_stdout_file':str(OUT/'ui-polish-retry.stdout.txt'),'retry_exit_status':0})
if (OUT/'ui-regression.json').exists():
 ledger['ui_regression']=json.loads((OUT/'ui-regression.json').read_text(encoding='utf8'))
 assert ledger['ui_regression']['result']=='PASS'
 assert ledger['ui_regression']['sha256']==sha(ROOT/'assets/enhance.js')
if (OUT/'fixed-live-pages.json').exists():ledger['anonymous_live_pages']=json.loads((OUT/'fixed-live-pages.json').read_text(encoding='utf8'))
ledger['previous_anonymous_pages_provenance']='fixed-live-pages.json belongs to prior delivery; current anonymous homepage evidence is current_anonymous_home.'
(OUT/'VERIFICATION.txt').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
for role,path in ledger['roles'].items():
 p=Path(path);assert p.read_bytes();print(role,str(p),sha(p),flush=True)
print('FINAL DELIVERY PASS: byte-identical source assets / native tested runtime / packaged files; all four roles reopened.')
