from pathlib import Path
import zipfile,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'releases';out.mkdir(exist_ok=True)
version=json.loads((ROOT/'package.json').read_text())['version']
target=out/f'BetterBiliSpace-{version}-win64.zip'
files=[ROOT/'dist/BetterBiliSpace.exe',ROOT/'dist/WebView2Loader.dll']
files+=list((ROOT/'dist/assets').rglob('*'))
files+=[ROOT/'vendor/btr.LICENSE',ROOT/'vendor/blocker.LICENSE',ROOT/'vendor/plugins.lock.json',ROOT/'vendor/WebView2.LICENSE.txt',ROOT/'vendor/WebView2.NOTICE.txt',ROOT/'vendor/json.LICENSE',ROOT/'README.md']
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for f in files:
  if f.is_file():
   if f.is_relative_to(ROOT/'dist'):name=f.relative_to(ROOT/'dist')
   else:name=f.relative_to(ROOT)
   z.write(f,Path('BetterBiliSpace')/name)
with zipfile.ZipFile(target) as z:
 assert z.testzip() is None
 assert not any('.appdata' in n or 'settings.json' in n for n in z.namelist())
 assert z.read('BetterBiliSpace/BetterBiliSpace.exe')[:2]==b'MZ'
 manifest={'archive':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'entries':z.namelist(),'crc_verified':True,'no_user_profile':True}
(ROOT/'verification/package.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print(json.dumps(manifest,indent=2))
