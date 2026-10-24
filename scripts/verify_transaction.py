"""Evidence ledger for the exact upstream blocker -> home-only adaptation."""
from pathlib import Path
import base64,hashlib,json,shutil,subprocess

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification'
original=OUT/'blocker.original.user.js'
modified=ROOT/'assets/blocker.home.user.js'
patch=OUT/'blocker.home.patch'
rollback=OUT/'ROLLBACK.sh'
ledger=[]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def run(label,cmd,cwd=ROOT,expected=0):
    p=subprocess.run([str(x) for x in cmd],cwd=cwd,capture_output=True)
    record={'label':label,'cwd':str(cwd),'command':[str(x) for x in cmd],'input':'same policy extraction and routes: home, video, search, popular','stdout':p.stdout.decode('utf8',errors='replace'),'stderr':p.stderr.decode('utf8',errors='replace'),'exit_status':p.returncode}
    ledger.append(record)
    assert p.returncode==expected,record
    return record

before=sha(original)
# Keep the original four roles. UI/native corrections extend their patch and rollback.
ui_original=OUT/'ui-v0.1.0/enhance.original.js'
native_original=OUT/'ui-v0.1.0/main.original.cpp'
extras=[]
if ui_original.exists():extras=[('ui',ui_original,ROOT/'assets/enhance.js','enhance.js'),('native',native_original,ROOT/'src/main.cpp','main.cpp')]
cases=[('blocker',original),*[(role,old) for role,old,_,_ in extras]]
header_original=OUT/'ui-v0.1.1/enhance.original.js'
header_native_original=OUT/'ui-v0.1.1/main.original.cpp'
if header_original.exists():cases.extend([('ui-v0.1.1',header_original),('native-v0.1.1',header_native_original)])
home_original=OUT/'ui-v0.1.2/enhance.original.js'
home_native_original=OUT/'ui-v0.1.2/main.original.cpp'
if home_original.exists():cases.extend([('ui-v0.1.2',home_original),('native-v0.1.2',home_native_original)])
polish_original=OUT/'ui-v0.1.3/enhance.original.js'
polish_native_original=OUT/'ui-v0.1.3/main.original.cpp'
if polish_original.exists():cases.extend([('ui-v0.1.3',polish_original),('native-v0.1.3',polish_native_original)])
rollback_text='''#!/bin/sh
set -eu
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then echo "Usage: $0 TARGET_COPY [blocker|ui|native|ui-v0.1.1|native-v0.1.1|ui-v0.1.2|native-v0.1.2|ui-v0.1.3|native-v0.1.3]" >&2; exit 2; fi
tmp="$1.rollback.$$"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
case "${2:-blocker}" in
'''
for role,old in cases:
 rollback_text+=f"{role})\nbase64 -d > \"$tmp\" <<'BASELINE_BYTES'\n{base64.b64encode(old.read_bytes()).decode()}\nBASELINE_BYTES\n;;\n"
rollback_text+='*) echo "Unknown rollback role" >&2; exit 2;;\nesac\ncat "$tmp" > "$1"\n'
rollback.write_text(rollback_text,encoding='utf8',newline='\n');rollback.chmod(0o755)
run('BASELINE',['node',ROOT/'tests/blocker-policy.cjs',original])
run('MODIFIED',['node',ROOT/'tests/blocker-policy.cjs',modified])
restored=OUT/'rollback-copy.user.js';shutil.copyfile(modified,restored)
run('EXECUTE ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored])
run('ROLLBACK',['node',ROOT/'tests/blocker-policy.cjs',restored])
assert sha(restored)==before
# A git binary patch is exact even though upstream is CRLF and adaptation is LF.
attrs=OUT/'binary.attributes';attrs.write_text('*.user.js binary\n*.js binary\n*.cpp binary\n',encoding='utf8')
work=OUT/'patch-inputs';(work/'a').mkdir(parents=True,exist_ok=True);(work/'b').mkdir(exist_ok=True)
shutil.copyfile(original,work/'a/policy.user.js');shutil.copyfile(modified,work/'b/policy.user.js')
r=run('BUILD EXACT DIFF',['git','-c',f'core.attributesfile={attrs}','diff','--no-index','--binary','--','a/policy.user.js','b/policy.user.js'],cwd=work,expected=1)
binary=r['stdout'].replace('a/a/policy.user.js b/b/policy.user.js','a/policy.user.js b/policy.user.js')
for role,old,new,name in extras:
 shutil.copyfile(old,work/'a'/name);shutil.copyfile(new,work/'b'/name)
 r=run(f'EXTEND DIFF {role}',['git','-c',f'core.attributesfile={attrs}','diff','--no-index','--binary','--',f'a/{name}',f'b/{name}'],cwd=work,expected=1)
 binary+=r['stdout'].replace(f'a/a/{name} b/b/{name}',f'a/{name} b/{name}')
assert 'GIT binary patch' in binary
patch.write_text(binary,encoding='utf8',newline='\n')
rebuild=OUT/'reconstructed';rebuild.mkdir(exist_ok=True);shutil.copyfile(original,rebuild/'policy.user.js')
for role,old,new,name in extras:shutil.copyfile(old,rebuild/name)
run('RECONSTRUCT FROM DIFF',['git','-c','core.autocrlf=false','-c',f'core.attributesfile={attrs}','apply','--binary','--unsafe-paths',f'--directory={rebuild}',patch],cwd=ROOT)
assert sha(rebuild/'policy.user.js')==sha(modified)
assert sha(ROOT/'third_party/blocker/script.user.js')==before
ui_records={}
for role,old,new,name in extras:
 assert sha(rebuild/name)==sha(new)
 restored_copy=OUT/f'{role}-rollback-copy{new.suffix}';shutil.copyfile(new,restored_copy)
 if role=='ui':
  run('UI BASELINE',['node',ROOT/'tests/ui-policy.cjs',old])
  run('UI MODIFIED',['node',ROOT/'tests/ui-policy.cjs',new])
 run(f'EXECUTE {role.upper()} ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_copy,role])
 assert sha(restored_copy)==sha(old)
 if role=='ui':run('UI ROLLBACK',['node',ROOT/'tests/ui-policy.cjs',restored_copy])
 new.write_bytes((rebuild/name).read_bytes())
 ui_records[role]={'pristine_file':str(old),'modified_file':str(new),'original_sha256':sha(old),'modified_sha256':sha(new),'restored_sha256':sha(restored_copy),'diff_reconstructed_exactly':True}
header_record={}
if header_original.exists():
 run('HEADER BASELINE',['node',ROOT/'tests/header-policy.cjs',header_original])
 run('HEADER MODIFIED',['node',ROOT/'tests/header-policy.cjs',ROOT/'assets/enhance.js'])
 restored_header=OUT/'header-rollback-copy.js';shutil.copyfile(ROOT/'assets/enhance.js',restored_header)
 run('EXECUTE HEADER ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_header,'ui-v0.1.1'])
 run('HEADER ROLLBACK',['node',ROOT/'tests/header-policy.cjs',restored_header])
 assert sha(restored_header)==sha(header_original)
 restored_native=OUT/'header-native-rollback.cpp';shutil.copyfile(ROOT/'src/main.cpp',restored_native)
 run('EXECUTE HEADER NATIVE ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_native,'native-v0.1.1'])
 assert sha(restored_native)==sha(header_native_original)
 header_record={'baseline_file':str(header_original),'original_sha256':sha(header_original),'restored_sha256':sha(restored_header),'modified_file':str(ROOT/'assets/enhance.js'),'modified_sha256':sha(ROOT/'assets/enhance.js'),'native_original_sha256':sha(header_native_original),'native_restored_sha256':sha(restored_native),'previous_delivery':str(OUT/'ui-v0.1.1/previous-verification.json')}
home_record={}
if home_original.exists():
 run('HOME BASELINE',['node',ROOT/'tests/home-policy.cjs',home_original,home_native_original])
 run('HOME MODIFIED',['node',ROOT/'tests/home-policy.cjs',ROOT/'assets/enhance.js',ROOT/'src/main.cpp'])
 restored_home=OUT/'home-rollback-copy.js';shutil.copyfile(ROOT/'assets/enhance.js',restored_home)
 run('EXECUTE HOME ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_home,'ui-v0.1.2'])
 restored_home_native=OUT/'home-native-rollback.cpp';shutil.copyfile(ROOT/'src/main.cpp',restored_home_native)
 run('EXECUTE HOME NATIVE ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_home_native,'native-v0.1.2'])
 run('HOME ROLLBACK',['node',ROOT/'tests/home-policy.cjs',restored_home,restored_home_native])
 assert sha(restored_home)==sha(home_original)
 assert sha(restored_home_native)==sha(home_native_original)
 home_record={'baseline_file':str(home_original),'original_sha256':sha(home_original),'restored_sha256':sha(restored_home),'modified_file':str(ROOT/'assets/enhance.js'),'modified_sha256':sha(ROOT/'assets/enhance.js'),'native_original_sha256':sha(home_native_original),'native_modified_sha256':sha(ROOT/'src/main.cpp'),'native_restored_sha256':sha(restored_home_native),'previous_delivery':str(OUT/'ui-v0.1.2/previous-verification.json'),'changed_symbols':['mountHomeBanner','compactHomeFeed','setCategories','markAds','mountShell','pageCss','shellCss','trusted message / injection / navigation host allowlists'],'baseline_runtime':str(OUT/'home-baseline.json')}
polish_record={}
if polish_original.exists():
 run('POLISH BASELINE',['node',ROOT/'tests/polish-policy.cjs',polish_original])
 run('POLISH MODIFIED',['node',ROOT/'tests/polish-policy.cjs',ROOT/'assets/enhance.js'])
 restored_polish=OUT/'polish-rollback-copy.js';shutil.copyfile(ROOT/'assets/enhance.js',restored_polish)
 run('EXECUTE POLISH ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_polish,'ui-v0.1.3'])
 run('POLISH ROLLBACK',['node',ROOT/'tests/polish-policy.cjs',restored_polish])
 assert sha(restored_polish)==sha(polish_original)
 polish_record={'baseline_file':str(polish_original),'original_sha256':sha(polish_original),'restored_sha256':sha(restored_polish),'modified_file':str(ROOT/'assets/enhance.js'),'modified_sha256':sha(ROOT/'assets/enhance.js'),'native_original_sha256':sha(polish_native_original),'native_unchanged':sha(polish_native_original)==sha(ROOT/'src/main.cpp'),'previous_delivery':str(OUT/'ui-v0.1.3/previous-verification.json'),'changed_symbols':['compactHomeFeed','wakeHomeLoader','setCategories','mountHomeBanner','applyPreferences','pageCss','shellCss'],'baseline_runtime':str(OUT/'polish-baseline.json')}
# Reapply requested goal from the verified patch, leaving MODIFIED_FILE modified.
modified.write_bytes((rebuild/'policy.user.js').read_bytes())
run('REAPPLIED MODIFIED',['node',ROOT/'tests/blocker-policy.cjs',modified])
for role in [modified,patch,rollback]:assert role.read_bytes()
summary={
 'TARGET':str(ROOT/'third_party/blocker/script.user.js'),
 'GOAL':'getPageKind => www.bilibili.com homepage only, including locale home routes; extractUid supports explicit locale author URLs; hideLiveCards=false, blockAdCards=false, videoProfileButton=false; no optional menus or background count',
 'roles':{'MODIFIED_FILE':str(modified),'DIFF_FILE':str(patch),'VERIFICATION':str(OUT/'VERIFICATION.txt'),'ROLLBACK':str(rollback)},
 'hashes':{'original':before,'modified':sha(modified),'rollback':sha(restored),'reconstructed':sha(rebuild/'policy.user.js')},
 'original_unchanged':True,'rollback_hash_matches':True,'diff_reconstructs_exact_bytes':True,
 'events':ledger,
 'supplemental':{'build_log':str(OUT/'build.log'),'smoke':str(OUT/'smoke.json'),'unit_tests':str(OUT/'tests.stdout.txt')}
}
if extras:
 summary['supplemental']['ui_transaction']=ui_records
 summary['supplemental']['ui_functions']=['pageKind','syncRoute','refreshAccount','submitSearch','setLoading','pageCss','shellCss']
 summary['supplemental']['previous_verified_delivery']=str(OUT/'ui-v0.1.0/previous-verification.json')
if header_record:summary['supplemental']['header_transaction']=header_record
if home_record:summary['supplemental']['home_transaction']=home_record
if polish_record:summary['supplemental']['polish_transaction']=polish_record
(OUT/'VERIFICATION.txt').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
# Reopen all four native artifacts, including the final ledger.
for role,path in summary['roles'].items():
 p=Path(path);data=p.read_bytes();print(f'{role}: {p} [{len(data)} bytes; SHA256 {sha(p)}]')
print('BASELINE:',ledger[0]['stdout'].strip())
print('MODIFIED:',ledger[1]['stdout'].strip())
print('ROLLBACK:',ledger[3]['stdout'].strip())
print('Verified: pristine target unchanged; rollback hash matches; diff reconstructs exact modified bytes.')
for event in ledger:
 if event['label'] in ['UI BASELINE','UI MODIFIED','UI ROLLBACK','HEADER BASELINE','HEADER MODIFIED','HEADER ROLLBACK','HOME BASELINE','HOME MODIFIED','HOME ROLLBACK','POLISH BASELINE','POLISH MODIFIED','POLISH ROLLBACK']:print(event['label']+':',event['stdout'].strip())
