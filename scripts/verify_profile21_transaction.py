from pathlib import Path
import base64,difflib,hashlib,json,subprocess
R=Path.cwd();V=R/'verification';shell=Path('C:/Program Files/Git/bin/bash.exe');ledger=json.loads((V/'VERIFICATION.txt').read_text(encoding='utf8'))
roles=[('ui-profile21',V/'profile21-baseline/enhance.js',R/'assets/enhance.js'),('native-profile21',V/'profile21-baseline/main.cpp',R/'src/main.cpp')]
rb=V/'ROLLBACK.sh';text=rb.read_text();patch=[];results={}
policy=R/'tests/profile21-policy.cjs'
for role,baseline,current in roles:
 if ('\n'+role+')') not in text:text=text.replace('case "${2:-blocker}" in','case "${2:-blocker}" in\n'+role+')\nbase64 -d > "$tmp" <<BASELINE_BYTES\n'+base64.b64encode(baseline.read_bytes()).decode()+'\nBASELINE_BYTES\n;;',1)
 patch.extend(difflib.unified_diff(baseline.read_text(encoding='utf8').splitlines(True),current.read_text(encoding='utf8').splitlines(True),fromfile=str(baseline),tofile=str(current)))
rb.write_text(text,newline='\n');rb.chmod(0o755)
for role,baseline,current in roles:
 restored=V/f'{role}-restored{current.suffix}'
 restored.write_bytes(current.read_bytes());command=[str(shell),str(rb).replace('\\','/'),str(restored).replace('\\','/'),role];run=subprocess.run(command,capture_output=True,text=True)
 assert run.returncode==0,(run.stdout,run.stderr);assert restored.read_bytes()==baseline.read_bytes()
 steps={}
 for name,p in [('BASELINE',baseline),('MODIFIED',current),('ROLLBACK',restored)]:
  cmd=['node',str(policy),str(p if role.startswith('ui-') else (V/'profile21-baseline/enhance.js' if name!='MODIFIED' else R/'assets/enhance.js')),str((V/'profile21-baseline/main.cpp' if name!='MODIFIED' else R/'src/main.cpp') if role.startswith('ui-') else p)];r=subprocess.run(cmd,capture_output=True,text=True);steps[name]={'command':cmd,'stdout':r.stdout,'stderr':r.stderr,'exit':r.returncode,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 results[role]={'checks':steps,'rollback_command':command,'rollback_stdout':run.stdout,'rollback_stderr':run.stderr,'rollback_exit':run.returncode,'restored_hash_equals_original':True}
(V/'profile21.patch').write_text(''.join(patch),encoding='utf8')
ledger.setdefault('supplemental',{})['profile21']={'goal':'own profile banner and dynamic media, avatar pendant and active VIP badge; native player PiP interception and native volume slider 200 via gain','transactions':results,'runtime_reports':['profile21-decoration-runtime.json','profile21-player-runtime.json'],'unit_output':(V/'profile21-unit.txt').read_text(encoding='utf8',errors='replace'),'build_output':(V/'profile21-build.txt').read_text(encoding='utf8',errors='replace'),'limitations':'Own-account decoration response verified with mock identity and public official assets, not real private login. Banner dynamic video muted/loop lifecycle tested in unit fixture; GIF/WebP source URL preserved. Live public-player volume track dragged to 200 with gain-200; actual native PiP and fullscreen-to-PiP transitions verified. Initial card bounds test used inherited 75% zoom; fixed test configuration to 100%, not production geometry. Resource fields grounded in official space index-c5b07bd7.js and laputa-header/bili-header.umd.js; unavailable decorations remain hidden.'}
(V/'VERIFICATION.txt').write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf8')
for p in [R/'assets/blocker.home.user.js',V/'blocker.home.patch',V/'VERIFICATION.txt',V/'ROLLBACK.sh']:
 b=p.read_bytes();print(str(p),len(b),hashlib.sha256(b).hexdigest())
print(json.dumps(results,ensure_ascii=True))
