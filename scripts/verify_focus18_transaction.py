from pathlib import Path
import json,subprocess,base64,hashlib,difflib
R=Path.cwd();V=R/'verification';original=V/'focus18-baseline/main.cpp';changed=R/'src/main.cpp';restored=V/'focus18-rollback-main.cpp';rollback=V/'ROLLBACK.sh';role='native-focus18';text=rollback.read_text()
if '\n'+role+')' not in text:text=text.replace('case "${2:-blocker}" in','case "${2:-blocker}" in\n'+role+')\nbase64 -d > "$tmp" <<BASELINE_BYTES\n'+base64.b64encode(original.read_bytes()).decode()+'\nBASELINE_BYTES\n;;',1)
rollback.write_text(text,newline='\n');rollback.chmod(0o755);restored.write_bytes(changed.read_bytes());cmd=['C:/Program Files/Git/bin/bash.exe',str(rollback).replace('\\','/'),str(restored).replace('\\','/'),role];r=subprocess.run(cmd,capture_output=True,text=True);assert r.returncode==0,(r.stdout,r.stderr);assert restored.read_bytes()==original.read_bytes()
checks={}
for label,path in [('BASELINE',original),('MODIFIED',changed),('ROLLBACK',restored)]:
 command=['python',str(R/'scripts/verify_focus18_policy.py'),str(path)];p=subprocess.run(command,capture_output=True,text=True);checks[label]={'command':command,'stdout':p.stdout,'stderr':p.stderr,'exit':p.returncode,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()};assert p.returncode==0,(label,p.stderr);print(label,p.stdout.strip())
assert json.loads(checks['MODIFIED']['stdout'])['mockChecks']==12
assert not json.loads(checks['BASELINE']['stdout'])['installed']
assert checks['BASELINE']['stdout']==checks['ROLLBACK']['stdout']
patch=[]
for before,after in [(original,changed),(V/'focus18-baseline/enhance.js',R/'assets/enhance.js')]:patch.extend(difflib.unified_diff(before.read_text(encoding='utf8').splitlines(True),after.read_text(encoding='utf8').splitlines(True),fromfile=str(before),tofile=str(after)))
(V/'focus18.patch').write_text(''.join(patch),encoding='utf8')
ledger=json.loads((V/'VERIFICATION.txt').read_text(encoding='utf8'));ledger.setdefault('supplemental',{})['focus18']={'TARGET':str(changed),'GOAL':'WM_ACTIVATE and WM_SETFOCUS queue guarded WebView MoveFocus(PROGRAMMATIC); preserve last DOM editing control','checks':checks,'rollback':{'command':cmd,'stdout':r.stdout,'stderr':r.stderr,'exit':r.returncode,'restored_hash_equals_original':True},'unit_output':(V/'focus18-unit.txt').read_text(encoding='utf8',errors='replace'),'native_logic_output':(V/'focus18-native.txt').read_text(encoding='utf8',errors='replace'),'build_output':(V/'focus18-build.txt').read_text(encoding='utf8',errors='replace'),'limitations':'Real desktop Alt+Tab regression was not completed: physical Escape stopped Computer Use; no further desktop input issued. Twelve native checks compile actual extracted focus handlers with a mock controller. Chromium engine migration cancelled explicitly by user; WebView2 remains unchanged. First mock compile missing hwnd was corrected and its error retained in focus18-native-attempt1.txt.'};(V/'VERIFICATION.txt').write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf8')
for path in [R/'assets/blocker.home.user.js',V/'blocker.home.patch',V/'VERIFICATION.txt',V/'ROLLBACK.sh']:
 data=path.read_bytes();print(str(path),len(data),hashlib.sha256(data).hexdigest())
