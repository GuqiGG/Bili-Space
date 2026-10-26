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
    record={'label':label,'cwd':str(cwd),'command':[str(x) for x in cmd],'input':('nested scrollbox + synthetic wheel deltaY=120, sample 35ms / 151ms' if 'SCROLL' in label else 'categorySelection=[0,2,5] and the same app fixture' if 'LATEST' in label else 'same policy extraction and routes: home, video, search, popular'),'stdout':p.stdout.decode('utf8',errors='replace'),'stderr':p.stderr.decode('utf8',errors='replace'),'exit_status':p.returncode}
    ledger.append(record)
    assert p.returncode==expected,record
    return record

before=sha(original)
# Keep the original four roles. UI/native corrections extend their patch and rollback.
ui_original=OUT/'ui-v0.1.0/enhance.original.js'
native_original=OUT/'ui-v0.1.0/main.original.cpp'
extras=[]
if ui_original.exists():extras=[('ui',ui_original,ROOT/'assets/enhance.js','enhance.js'),('native',native_original,ROOT/'src/main.cpp','main.cpp')]
extras.append(('bridge',OUT/'ui-v0.1.4/bridge.original.js',ROOT/'assets/bridge.js','bridge.js'))
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
latest_original=OUT/'ui-v0.1.4/enhance.original.js'
latest_native_original=OUT/'ui-v0.1.4/main.original.cpp'
cases.extend([('ui-v0.1.4',latest_original),('native-v0.1.4',latest_native_original),('bridge-v0.1.4',OUT/'ui-v0.1.4/bridge.original.js'),('ui-scroll',OUT/'scroll-baseline/enhance.original.js')])
player_original=OUT/'ui-v0.1.5/enhance.original.js'
player_native_original=OUT/'ui-v0.1.5/main.original.cpp'
cases.extend([('ui-v0.1.5',player_original),('native-v0.1.5',player_native_original),('bridge-v0.1.5',OUT/'ui-v0.1.5/bridge.original.js')])
flow_original=OUT/'ui-v0.1.6/enhance.original.js'
flow_native_original=OUT/'ui-v0.1.6/main.original.cpp'
cases.extend([('ui-v0.1.6',flow_original),('native-v0.1.6',flow_native_original),('bridge-v0.1.6',OUT/'ui-v0.1.6/bridge.original.js')])
cases.append(('native-edge',OUT/'edge-resize-baseline/main.original.cpp'))
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
latest_record={}
run('LATEST BASELINE',['node',ROOT/'tests/latest-policy.cjs',latest_original])
run('LATEST MODIFIED',['node',ROOT/'tests/latest-policy.cjs',ROOT/'assets/enhance.js'])
restored_latest=OUT/'latest-rollback-copy.js';shutil.copyfile(ROOT/'assets/enhance.js',restored_latest)
run('EXECUTE LATEST ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_latest,'ui-v0.1.4'])
run('LATEST ROLLBACK',['node',ROOT/'tests/latest-policy.cjs',restored_latest])
assert sha(restored_latest)==sha(latest_original)
for role,baseline,target in [('native-v0.1.4',latest_native_original,ROOT/'src/main.cpp'),('bridge-v0.1.4',OUT/'ui-v0.1.4/bridge.original.js',ROOT/'assets/bridge.js')]:
 restored_copy=OUT/('latest-'+target.name);shutil.copyfile(target,restored_copy)
 run('EXECUTE '+role+' ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_copy,role]);assert sha(restored_copy)==sha(baseline)
latest_record={'baseline_file':str(latest_original),'original_sha256':sha(latest_original),'restored_sha256':sha(restored_latest),'modified_file':str(ROOT/'assets/enhance.js'),'modified_sha256':sha(ROOT/'assets/enhance.js'),'changed_symbols':['.back svg','categorySelection','autoZoomTarget / applyZoom','withoutFloatingLauncher','AIScaler / localAiSession','proxyAction / proxyConfig / startProxy / coreApi','pageCss / shellCss scrollbars','installWheelInertia'],'originals_unchanged':True,'native_baseline_sha256':sha(latest_native_original),'bridge_baseline_sha256':sha(OUT/'ui-v0.1.4/bridge.original.js')}
run('SCROLL BASELINE',['node',ROOT/'tests/scroll-policy.cjs',OUT/'scroll-baseline/enhance.original.js'])
run('SCROLL MODIFIED',['node',ROOT/'tests/scroll-policy.cjs',ROOT/'assets/enhance.js'])
restored_scroll=OUT/'scroll-rollback-copy.js';shutil.copyfile(ROOT/'assets/enhance.js',restored_scroll)
run('EXECUTE SCROLL ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_scroll,'ui-scroll'])
run('SCROLL ROLLBACK',['node',ROOT/'tests/scroll-policy.cjs',restored_scroll])
assert sha(restored_scroll)==sha(OUT/'scroll-baseline/enhance.original.js')
run('PLAYER BASELINE',['node',ROOT/'tests/player-policy.cjs',player_original,player_native_original])
run('PLAYER MODIFIED',['node',ROOT/'tests/player-policy.cjs',ROOT/'assets/enhance.js',ROOT/'src/main.cpp'])
restored_player=OUT/'player-rollback-copy.js';shutil.copyfile(ROOT/'assets/enhance.js',restored_player)
restored_player_native=OUT/'player-native-rollback.cpp';shutil.copyfile(ROOT/'src/main.cpp',restored_player_native)
run('EXECUTE PLAYER ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_player,'ui-v0.1.5'])
run('EXECUTE PLAYER NATIVE ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_player_native,'native-v0.1.5'])
run('PLAYER ROLLBACK',['node',ROOT/'tests/player-policy.cjs',restored_player,restored_player_native])
assert sha(restored_player)==sha(player_original) and sha(restored_player_native)==sha(player_native_original)
player_record={'baseline_file':str(player_original),'original_sha256':sha(player_original),'restored_sha256':sha(restored_player),'modified_file':str(ROOT/'assets/enhance.js'),'modified_sha256':sha(ROOT/'assets/enhance.js'),'native_original_sha256':sha(player_native_original),'native_restored_sha256':sha(restored_player_native),'changed_symbols':['WM_GETMINMAXINFO','shellCss .dialog resize','syncPlayerAppearance / mountPlayerTools','fiMode / fiFps','FrameInterpolator','AIScaler push / restoreVideo'],'input':'same player fixture / native source; settings resize, tool order, SVG, FI defaults, window minimum'}
run('FLOW BASELINE',['node',ROOT/'tests/flow-policy.cjs',flow_original])
run('FLOW MODIFIED',['node',ROOT/'tests/flow-policy.cjs',ROOT/'assets/enhance.js'])
restored_flow=OUT/'flow-rollback-copy.js';shutil.copyfile(ROOT/'assets/enhance.js',restored_flow)
run('EXECUTE FLOW ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_flow,'ui-v0.1.6'])
run('FLOW ROLLBACK',['node',ROOT/'tests/flow-policy.cjs',restored_flow])
assert sha(restored_flow)==sha(flow_original)
for role,baseline,target in [('native-v0.1.6',flow_native_original,ROOT/'src/main.cpp'),('bridge-v0.1.6',OUT/'ui-v0.1.6/bridge.original.js',ROOT/'assets/bridge.js')]:
 restored_copy=OUT/('flow-'+target.name);shutil.copyfile(target,restored_copy);run('EXECUTE '+role+' ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_copy,role]);assert sha(restored_copy)==sha(baseline)
flow_record={'baseline_file':str(flow_original),'original_sha256':sha(flow_original),'restored_sha256':sha(restored_flow),'modified_file':str(ROOT/'assets/enhance.js'),'modified_sha256':sha(ROOT/'assets/enhance.js'),'changed_symbols':['mountHomeBanner / mountShell brand capitalization','fiMode=rife / fiFlowScale','inferRife / localRifeSession','FrameInterpolator learned flow + mask reprojection','exclusiveGpu / runLocalSession serialization'],'lossless_reference':str(OUT/'lossless-reference.json'),'reference_files_not_modified':True,'model_provenance':str(ROOT/'vendor/rife-model.json')}
restored_edge=OUT/'edge-rollback.cpp';shutil.copyfile(ROOT/'src/main.cpp',restored_edge)
run('EXECUTE EDGE ROLLBACK',[r'C:\Program Files\Git\bin\bash.exe',rollback,restored_edge,'native-edge'])
assert sha(restored_edge)==sha(OUT/'edge-resize-baseline/main.original.cpp')
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
summary['supplemental']['latest_transaction']=latest_record
summary['supplemental']['player_transaction']=player_record
summary['supplemental']['flow_transaction']=flow_record
(OUT/'VERIFICATION.txt').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
# Reopen all four native artifacts, including the final ledger.
for role,path in summary['roles'].items():
 p=Path(path);data=p.read_bytes();print(f'{role}: {p} [{len(data)} bytes; SHA256 {sha(p)}]')
print('BASELINE:',ledger[0]['stdout'].strip())
print('MODIFIED:',ledger[1]['stdout'].strip())
print('ROLLBACK:',ledger[3]['stdout'].strip())
print('Verified: pristine target unchanged; rollback hash matches; diff reconstructs exact modified bytes.')
for event in ledger:
 if event['label'] in ['UI BASELINE','UI MODIFIED','UI ROLLBACK','HEADER BASELINE','HEADER MODIFIED','HEADER ROLLBACK','HOME BASELINE','HOME MODIFIED','HOME ROLLBACK','POLISH BASELINE','POLISH MODIFIED','POLISH ROLLBACK','LATEST BASELINE','LATEST MODIFIED','LATEST ROLLBACK','PLAYER BASELINE','PLAYER MODIFIED','PLAYER ROLLBACK','FLOW BASELINE','FLOW MODIFIED','FLOW ROLLBACK']:print(event['label']+':',event['stdout'].strip())
