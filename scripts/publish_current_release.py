"""Run in Actions with its scoped token. Never overwrite immutable release assets."""
from pathlib import Path
import hashlib, json, os, subprocess, urllib.request, urllib.error
ROOT = Path(__file__).resolve().parents[1]
version = json.loads((ROOT/'package.json').read_text(encoding='utf8'))['version']
tag = 'v'+version
repo = os.environ['GH_REPO']
files = [ROOT/'releases'/f'Bili-Space-{version}-win64.zip', ROOT/'releases'/f'Bili-Space-{version}-Setup.exe']
checksums = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
sums = ROOT/'releases/SHA256SUMS.txt'
sums.write_text(''.join(f'{digest}  {name}\n' for name,digest in checksums.items()), encoding='utf8', newline='\n')
checksums[sums.name] = hashlib.sha256(sums.read_bytes()).hexdigest(); files.append(sums)
def api(path):
    request = urllib.request.Request(f'https://api.github.com/repos/{repo}'+path, headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'], 'User-Agent':'Bili-Space-release'})
    with urllib.request.urlopen(request, timeout=60) as r: return json.load(r)
try: release = api('/releases/tags/'+tag)
except urllib.error.HTTPError as e:
    if e.code != 404: raise
    subprocess.run(['gh','release','create',tag,'--draft','--target',os.environ['GITHUB_SHA'],'--title','Bili-Space '+version,'--notes-file',str(ROOT/'docs'/f'RELEASE-{version}.md')], check=True)
    release = api('/releases/tags/'+tag)
for p in files:
    existing = next((a for a in release['assets'] if a['name']==p.name), None)
    if existing:
        assert existing.get('digest') == 'sha256:'+checksums[p.name], 'Existing asset mismatch; refusing overwrite'
    else:
        subprocess.run(['gh','release','upload',tag,str(p)], check=True)
release = api('/releases/tags/'+tag)
for name,digest in checksums.items():
    asset = next(a for a in release['assets'] if a['name']==name)
    assert asset['digest']=='sha256:'+digest
subprocess.run(['gh','release','edit',tag,'--draft=false','--latest'],check=True)
print(json.dumps({'tag':tag,'checksums':checksums,'published':True}))
