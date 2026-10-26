from pathlib import Path
import subprocess,json,os,hashlib,zipfile
R=Path.cwd();V=R/'verification';report={};env={**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8'}
def run(name,args):
 p=subprocess.run(args,cwd=R,capture_output=True,text=True,encoding='utf8',errors='replace',env=env);report[name]={'command':list(map(str,args)),'stdout':p.stdout,'stderr':p.stderr,'exit':p.returncode};(V/f'update34-{name}-final.txt').write_text(p.stdout+'\nSTDERR:\n'+p.stderr,encoding='utf8');(V/'update34-final-commands.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(name,p.returncode,flush=True);assert p.returncode==0,(name,p.stdout[-1500:],p.stderr[-1500:])
run('build',['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/build.ps1'])
run('unit',['node','--test','--test-concurrency=1',*map(str,sorted(Path('tests').glob('*.test.cjs')))])
zig=str(R/'.tools/zig/zig-windows-x86_64-0.13.0/zig.exe');flags=['-std=c++20','-O1','-target','x86_64-windows-gnu','-fms-extensions','-municode','-DUNICODE','-D_UNICODE','-DNOMINMAX','-Ivendor','-I.tools/webview2/build/native/include'];libs=['-l'+x for x in ['ole32','user32','gdi32','shell32','dwmapi','uuid','ws2_32','winhttp','comdlg32','mfplat','mfreadwrite','mfuuid','bcrypt']]
run('native-build',[zig,'c++','verification/update34-native-test.cpp',*flags,*libs,'-o','verification/update34-native-test.exe'])
run('native',['python','scripts/verify_update34_native.py'])
run('policy-build',[zig,'c++','verification/update34-policy-test.cpp','-std=c++20','-O1','-target','x86_64-windows-gnu','-o','verification/update34-policy-test.exe'])
run('policy',['verification/update34-policy-test.exe'])
run('ui',['python','scripts/verify_update34_ui.py'])
run('package',['python','scripts/package.py'])
run('manifest',['python','scripts/make_update_manifest.py','--package','releases/Bili-Space-0.1.34-win64.zip','--version','0.1.34','--changelog','统一命名 Bili-Space，新增版本和作者信息','--changelog','新增检查更新、忽略普通更新、强制更新与更新日志','--changelog','原生下载并校验更新包，保留已有登录和设置','--copy-package'])
m=json.loads((R/'update-site/public/updates/windows-x64.json').read_text(encoding='utf8'));z=R/'releases/Bili-Space-0.1.34-win64.zip';assert m['sha256']==hashlib.sha256(z.read_bytes()).hexdigest() and m['size']==z.stat().st_size and not m['force'];assert (R/'update-site/public/releases'/z.name).read_bytes()==z.read_bytes()
with zipfile.ZipFile(z) as archive:
 assert archive.testzip() is None
 for p in ['assets/enhance.js','assets/app-info.json','assets/update-required.html','UPDATE-SITE.md']:
  expected=R/('dist/'+p if p.startswith('assets/') else p);assert archive.read('Bili-Space/'+p)==expected.read_bytes()
 assert not any('BetterBiliSpace.exe' in p or 'Bili23-Downloader-source' in p or '.appdata' in p for p in archive.namelist())
print('archive + manifest hashes + package contents verified',flush=True)
