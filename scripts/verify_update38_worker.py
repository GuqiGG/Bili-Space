"""Run the real native updater against an isolated deterministic installer fixture."""
from pathlib import Path
import hashlib,json,subprocess,time
R=Path(__file__).resolve().parents[1];out=R/'verification/update38-worker';out.mkdir(exist_ok=True)
fixture=out/'fixture.cpp'
fixture.write_text(r'''#include <windows.h>
#include <filesystem>
#include <fstream>
#include <string>
namespace fs=std::filesystem;
int wmain(int n,wchar_t** a){
 if(n==2&&std::wstring(a[1])==L"--hold"){Sleep(2200);return 0;}
 fs::path dir;for(int i=1;i<n;i++){std::wstring s=a[i];if(s.rfind(L"/DIR=",0)==0)dir=s.substr(5);}
 if(dir.empty()){wchar_t p[32768];GetModuleFileNameW(nullptr,p,32768);std::ofstream(fs::path(p).parent_path()/"restarted.txt")<<"restarted";return 0;}
 fs::create_directories(dir/"assets");std::ofstream(dir/"assets/app-info.json")<<"{\"version\":\"0.1.39\"}";
 std::ofstream log(dir/"installer-args.txt");for(int i=1;i<n;i++)log<<fs::path(a[i]).string()<<"\n";return 0;
}''',encoding='utf8')
zig=R/'.tools/zig/zig-windows-x86_64-0.13.0/zig.exe'
subprocess.run([str(zig),'c++',str(fixture),'-std=c++20','-target','x86_64-windows-gnu','-municode','-o',str(out/'fixture.exe')],check=True)
payload=(out/'fixture.exe').read_bytes();worker=R/'dist/Bili-Space.exe';results={}
for mode in ['success','tampered','wrong-version']:
    d=out/mode;d.mkdir(exist_ok=True);install=d/'install';install.mkdir(exist_ok=True);(install/'Bili-Space.exe').write_bytes(payload)
    profile=install/'.appdata';profile.mkdir(exist_ok=True);(profile/'settings.json').write_text('{"sentinel":"preserved"}')
    package=d/'Bili-Space-0.1.39-Setup.exe';package.write_bytes(payload)
    (install/'restarted.txt').unlink(missing_ok=True)
    parent=subprocess.Popen([str(install/'Bili-Space.exe'),'--hold']) if mode=='success' else None
    job={'parentPid':parent.pid if parent else 4294967294,'installDir':str(install),'package':str(package),'version':'0.1.39','sha256':hashlib.sha256(payload).hexdigest(),'size':len(payload)}
    if mode=='tampered':package.write_bytes(payload+b'changed')
    if mode=='wrong-version':job['version']='0.1.40';package=d/'Bili-Space-0.1.40-Setup.exe';package.write_bytes(payload);job['package']=str(package)
    jobfile=d/'install-job.json';jobfile.write_text(json.dumps(job),encoding='utf8')
    started=time.monotonic();p=subprocess.run([str(worker),'--apply-update',str(jobfile)],capture_output=True,timeout=40);elapsed=time.monotonic()-started
    result=json.loads((d/'install-result.json').read_text(encoding='utf8'))
    if mode=='success':
        assert p.returncode==0 and result['success'],result
        assert elapsed>=1.8,'installer did not wait for the old client';parent.wait(timeout=5)
        for _ in range(50):
            if (install/'restarted.txt').exists():break
            time.sleep(.1)
        assert (install/'restarted.txt').exists()
        assert '/VERYSILENT' in (install/'installer-args.txt').read_text()
    else:assert p.returncode!=0 and not result['success'],result
    if mode=='tampered':assert not (install/'installer-args.txt').exists()
    assert json.loads((profile/'settings.json').read_text())=={'sentinel':'preserved'}
    results[mode]={'command':p.args,'exit':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode(),'result':result,'profile_preserved':True,'elapsed_seconds':elapsed}
report=out/'results.json';report.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(results,ensure_ascii=False,indent=2))
