from pathlib import Path
import json,subprocess,hashlib,time,sys
r=Path.cwd();d=r/'verification/update42-race';d.mkdir(exist_ok=True);install=d/'install';install.mkdir(exist_ok=True)
payload=(r/'verification/update38-worker/fixture.exe').read_bytes();(install/'Bili-Space.exe').write_bytes(payload)
pkg=d/'Bili-Space-0.1.42-Setup.exe';pkg.write_bytes(payload)
parent=subprocess.Popen([str(install/'Bili-Space.exe'),'--hold']);time.sleep(2.6)
job={'parentPid':parent.pid,'installDir':str(install),'package':str(pkg),'version':'0.1.42','sha256':hashlib.sha256(payload).hexdigest(),'size':len(payload)}
j=d/'install-job.json';j.write_text(json.dumps(job)); worker=sys.argv[1] if len(sys.argv)>1 else str(r/'verification/update42-baseline/Bili-Space.exe')
p=subprocess.run([worker,'--apply-update',str(j)],capture_output=True,timeout=40);parent.wait()
result={'command':p.args,'exit':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode(),'result':json.loads((d/'install-result.json').read_text(encoding='utf-8'))}; print(json.dumps(result,ensure_ascii=True));(d/('modified.json' if len(sys.argv)>1 else 'baseline.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')

if len(sys.argv)>1: assert p.returncode==0 and result['result']['success'],result
