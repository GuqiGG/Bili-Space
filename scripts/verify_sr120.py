from pathlib import Path
import json,subprocess,hashlib,base64,shutil
r=Path.cwd();o=r/'verification';events=[]
rollback=o/"ROLLBACK.sh";s=rollback.read_text();marker='native-sr120)\nbase64 -d > "$tmp" <<BASELINE_BYTES\n'+base64.b64encode((o/"sr120-baseline/main.cpp").read_bytes()).decode()+"\nBASELINE_BYTES\n;;\n"
s=s.replace('case "${2:-blocker}" in\n','case "${2:-blocker}" in\n'+marker);rollback.write_text(s,newline='\n')
copy=o/'sr120-rollback.cpp';shutil.copyfile(r/'src/main.cpp',copy)
bash='C:/Program Files/Git/bin/bash.exe'
p=subprocess.run([bash,str(rollback),str(copy),'native-sr120'],capture_output=True,text=True);events.append({'command':p.args,'stdout':p.stdout,'stderr':p.stderr,'exit_status':p.returncode});assert p.returncode==0
assert copy.read_bytes()==(o/'sr120-baseline/main.cpp').read_bytes()
base=json.loads((o/'native-resize-verification.json').read_text())['events'][0]['command']
for label,source in [('BASELINE',o/'sr120-baseline/main.cpp'),('MODIFIED',r/'src/main.cpp'),('ROLLBACK',copy)]:
 cmd=base.copy();cmd[2]=str(r/'tests/native_close_probe.cpp');cmd[3]='-DTARGET_CPP="'+source.as_posix()+'"';cmd[-1]=str(r/'.tools/hidden-resize'/('close-'+label+'.exe'))
 for command in [cmd,[cmd[-1]]]:
  p=subprocess.run(command,capture_output=True,text=True);events.append({'label':label,'command':command,'stdout':p.stdout,'stderr':p.stderr,'exit_status':p.returncode});assert p.returncode==0,events[-1]
 behavior=json.loads(p.stdout);assert behavior['tray']['window_retained'];assert behavior['exit']['window_retained']==(label!='MODIFIED');print(label,p.stdout.strip(),flush=True)
ledger=json.loads((o/'VERIFICATION.txt').read_text(encoding='utf8'));ledger.setdefault('supplemental',{})['sr120_close_transaction']={'events':events,'baseline_sha256':hashlib.sha256(copy.read_bytes()).hexdigest(),'modified_sha256':hashlib.sha256((r/'src/main.cpp').read_bytes()).hexdigest(),'note':'Hidden Win32 windows test close policy; UI geometry has not been visually rechecked on live website.'};(o/'VERIFICATION.txt').write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf8')
for path in [r/'assets/blocker.home.user.js',o/'blocker.home.patch',o/'VERIFICATION.txt',rollback]:print(str(path),len(path.read_bytes()))
