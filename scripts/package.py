from pathlib import Path
import zipfile,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'releases';out.mkdir(exist_ok=True)
version=json.loads((ROOT/'package.json').read_text())['version']
target=out/f'Bili-Space-{version}-win64.zip'
files=[ROOT/'dist/Bili-Space.exe',ROOT/'dist/WebView2Loader.dll']
files+=list((ROOT/'dist/assets').rglob('*'))
files+=list((ROOT/'dist/runtime').rglob('*'))
files+=[ROOT/'vendor/mihomo.LICENSE',ROOT/'vendor/onnxruntime.LICENSE',ROOT/'vendor/espcn.LICENSE',ROOT/'vendor/rife.LICENSE',ROOT/'vendor/anime4k.LICENSE',ROOT/'vendor/anime4k-source.json',ROOT/'vendor/rife-model.json',ROOT/'vendor/runtime.lock.json',ROOT/'vendor/free-nodes-sources.json']
files+=[ROOT/'vendor/iana-tlds.txt',ROOT/'vendor/iana-tlds-source.json']
files+=[ROOT/'vendor/btr.LICENSE',ROOT/'vendor/blocker.LICENSE',ROOT/'vendor/plugins.lock.json',ROOT/'vendor/WebView2.LICENSE.txt',ROOT/'vendor/WebView2.NOTICE.txt',ROOT/'vendor/json.LICENSE',ROOT/'README.md',ROOT/'LICENSE',ROOT/'THIRD_PARTY_NOTICES.md',ROOT/'UPDATE-SITE.md']
files+=list((ROOT/'docs').rglob('*'))
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for f in files:
  if f.is_file():
   if f.is_relative_to(ROOT/'dist'):name=f.relative_to(ROOT/'dist')
   else:name=f.relative_to(ROOT)
   z.write(f,Path('Bili-Space')/name)
with zipfile.ZipFile(target) as z:
 assert z.testzip() is None
 assert not any('.appdata' in n or 'settings.json' in n for n in z.namelist())
 assert z.read('Bili-Space/Bili-Space.exe')[:2]==b'MZ'
 manifest={'archive':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'entries':z.namelist(),'crc_verified':True,'no_user_profile':True}
(ROOT/'verification/package.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print(json.dumps(manifest,indent=2))
