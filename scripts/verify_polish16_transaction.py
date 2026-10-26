from pathlib import Path
import base64,difflib,hashlib,json,subprocess
R=Path.cwd();V=R/'verification';shell=Path('C:/Program Files/Git/bin/bash.exe');ledger=json.loads((V/'VERIFICATION.txt').read_text(encoding='utf8'))
roles=[('ui-polish16',V/'polish16-baseline/enhance.js',R/'assets/enhance.js'),('native-polish16',V/'polish16-baseline/main.cpp',R/'src/main.cpp')]
rb=V/'ROLLBACK.sh';text=rb.read_text();patch=[];results={}
policy=V/'polish16-policy.py';policy.write_text('''from pathlib import Path
import json,sys
s=Path(sys.argv[1]).read_text(encoding='utf8');print(json.dumps({"avatar_card":"accountStatsRequest" in s,"animated_lamps":"transition:transform 240ms cubic-bezier" in s,"aligned_home":"top:50%;height:32px;width:64px" in s,"first_frame_gate":"requestVideoFrameCallback(shown)" in s,"native_curtain":"controller->put_IsVisible(FALSE)" in s,"ready_handshake":"surface-ready" in s},sort_keys=True))
''')
for role,baseline,current in roles:
 if ('\n'+role+')') not in text:text=text.replace('case "${2:-blocker}" in','case "${2:-blocker}" in\n'+role+')\nbase64 -d > "$tmp" <<BASELINE_BYTES\n'+base64.b64encode(baseline.read_bytes()).decode()+'\nBASELINE_BYTES\n;;',1)
 patch.extend(difflib.unified_diff(baseline.read_text(encoding='utf8').splitlines(True),current.read_text(encoding='utf8').splitlines(True),fromfile=str(baseline),tofile=str(current)))
rb.write_text(text,newline='\n');rb.chmod(0o755)
for role,baseline,current in roles:
 restored=V/f'{role}-restored'+Path('') if False else V/f'{role}-restored{current.suffix}'
 restored.write_bytes(current.read_bytes());command=[str(shell),str(rb).replace('\\','/'),str(restored).replace('\\','/'),role];run=subprocess.run(command,capture_output=True,text=True)
 assert run.returncode==0,(run.stdout,run.stderr);assert restored.read_bytes()==baseline.read_bytes()
 steps={}
 for name,p in [('BASELINE',baseline),('MODIFIED',current),('ROLLBACK',restored)]:
  cmd=['python',str(policy),str(p)];r=subprocess.run(cmd,capture_output=True,text=True);steps[name]={'command':cmd,'stdout':r.stdout,'stderr':r.stderr,'exit':r.returncode,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 results[role]={'checks':steps,'rollback_command':command,'rollback_stdout':run.stdout,'rollback_stderr':run.stderr,'rollback_exit':run.returncode,'restored_hash_equals_original':True}
(V/'polish16.patch').write_text(''.join(patch),encoding='utf8')
ledger.setdefault('supplemental',{})['polish16']={'goal':'white flash mitigation, animated lamps, aligned Home, own profile hover card','transactions':results,'runtime_reports':['polish16-motion.json','polish16-loading.json'],'unit_output':(V/'polish16-unit.txt').read_text(encoding='utf8',errors='replace'),'build_output':(V/'polish16-build.txt').read_text(encoding='utf8',errors='replace'),'limitations':'Account responses tested with mock own-account fixtures; no private signed-in profile inspected. Public navigation test verifies frame-ready overlay exit, not a guarantee every upstream page never flashes. First live attempt redirected to home; retained failure output; sequential retry passed.'}
(V/'VERIFICATION.txt').write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf8')
for p in [R/'assets/blocker.home.user.js',V/'blocker.home.patch',V/'VERIFICATION.txt',V/'ROLLBACK.sh']:
 b=p.read_bytes();print(str(p),len(b),hashlib.sha256(b).hexdigest())
print(json.dumps(results,ensure_ascii=True))
