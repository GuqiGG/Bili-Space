from pathlib import Path
import json,struct,zipfile
ROOT=Path(__file__).resolve().parents[1]
stage=ROOT/'build/win7';version=json.loads((ROOT/'package.json').read_text())['version']
data=(stage/'Bili-Space.exe').read_bytes();pe=struct.unpack_from('<I',data,0x3c)[0];optional=pe+24
major,minor=struct.unpack_from('<HH',data,optional+40);assert (major,minor)<=(6,1),'PE requires an OS newer than Windows 7'
readme='''Windows 7 x64 compatibility build

Requires Windows 7 SP1 x64 and the Microsoft WebView2 Runtime 109.
Microsoft ended Win7 WebView2 support after version 109. Install the last official 109 runtime, or place a Microsoft Fixed Version Runtime 109 under runtime/webview2-109/ (msedgewebview2.exe directly inside).
This build disables optional WebGPU super-resolution/frame interpolation.
Build/import checks do not replace testing on a real Windows 7 machine. The Bilibili website itself may change its browser requirements.
Original account data is retained. Local account snapshots are protected with Windows DPAPI.
'''
(stage/'README-WIN7.txt').write_text(readme,encoding='utf-8')
out=ROOT/'releases';out.mkdir(exist_ok=True);target=out/f'Bili-Space-{version}-win7-x64.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=7) as z:
    for name in ['Bili-Space.exe','WebView2Loader.dll','README-WIN7.txt']:z.write(stage/name,'Bili-Space/'+name)
    for file in (ROOT/'assets').rglob('*'):
        if file.is_file() and 'ai' not in file.relative_to(ROOT/'assets').parts:z.write(file,'Bili-Space/assets/'+file.relative_to(ROOT/'assets').as_posix())
    for name in ['LICENSE','THIRD_PARTY_NOTICES.md']:z.write(ROOT/name,'Bili-Space/'+name)
    z.write(ROOT/'vendor/WebView2.LICENSE.txt','Bili-Space/vendor/WebView2.LICENSE.txt')
with zipfile.ZipFile(target) as z:assert z.testzip() is None
print(target,'PE OS target',major,minor)
