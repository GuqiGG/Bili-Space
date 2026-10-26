from pathlib import Path
import subprocess,json,hashlib,sys
r=Path.cwd();o=r/'verification';build=r/'.tools/hidden-resize';build.mkdir(exist_ok=True);events=[]
targets=[('BASELINE',o/'top-frame-baseline/main.cpp'),('MODIFIED',r/'src/main.cpp')]
if len(sys.argv)>1:targets.append(('ROLLBACK',Path(sys.argv[1]).resolve()))
for label,source in targets:
 exe=build/(label.lower()+'.exe');cmd=[str(r/'.tools/zig/zig-windows-x86_64-0.13.0/zig.exe'),'c++',str(r/'tests/native_frame_probe.cpp'),'-DTARGET_CPP="'+source.as_posix()+'"','-std=c++20','-O2','-target','x86_64-windows-gnu','-fms-extensions','-municode','-DUNICODE','-D_UNICODE','-DNOMINMAX','-I'+str(r/'vendor'),'-I'+str(r/'.tools/webview2/build/native/include'),'-lole32','-luser32','-lgdi32','-lshell32','-ldwmapi','-luuid','-lws2_32','-lwinhttp','-lcomdlg32','-o',str(exe)]
 p=subprocess.run(cmd,capture_output=True);event={'label':label+' BUILD','command':cmd,'stdout':p.stdout.decode('utf8'),'stderr':p.stderr.decode('utf8'),'exit_status':p.returncode};events.append(event);assert p.returncode==0,event
 path=o/('top-frame-'+label.lower()+'.json');p=subprocess.run([str(exe),str(path)],capture_output=True);event={'label':label,'command':[str(exe),str(path)],'stdout':p.stdout.decode('utf8'),'stderr':p.stderr.decode('utf8'),'exit_status':p.returncode,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'behavior':json.loads(path.read_text())};events.append(event);assert p.returncode==0,event;assert event['behavior']['window_visible'] is False
 print(label,json.dumps(event['behavior']),flush=True)
 assert event['behavior']['native_resize_targets']==8,event
(o/'top-frame-verification.json').write_text(json.dumps({'events':events,'note':'Hidden real Win32 windows; no desktop mouse / keyboard actions. Full-client child reproduces WebView hit coverage. User independently reported resize now works.'},ensure_ascii=False,indent=2),encoding='utf8')
