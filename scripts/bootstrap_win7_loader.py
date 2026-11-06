from pathlib import Path
import hashlib,json,urllib.request,zipfile
ROOT=Path(__file__).resolve().parents[1]
lock=json.loads((ROOT/'vendor/webview2-win7.lock.json').read_text(encoding='utf-8'))
archive=ROOT/'.tools/webview2-109.zip';archive.parent.mkdir(exist_ok=True)
if not archive.exists():urllib.request.urlretrieve(lock['url'],archive)
assert hashlib.sha256(archive.read_bytes()).hexdigest()==lock['sha256'],'Legacy WebView2 SDK checksum mismatch'
destination=ROOT/'build/win7';destination.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as package:
    (destination/'WebView2Loader.dll').write_bytes(package.read('build/native/x64/WebView2Loader.dll'))
print(destination)
