"""Run in Actions with its scoped token. Never overwrite immutable release assets."""
from pathlib import Path
import hashlib, json, os, urllib.request, urllib.parse
ROOT = Path(__file__).resolve().parents[1]
version = json.loads((ROOT/'package.json').read_text(encoding='utf8'))['version']
tag = 'v'+version
repo = os.environ['GH_REPO']
files = [ROOT/'releases'/f'Bili-Space-{version}-win64.zip', ROOT/'releases'/f'Bili-Space-{version}-Setup.exe']
checksums = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
sums = ROOT/'releases/SHA256SUMS.txt'
sums.write_text(''.join(f'{digest}  {name}\n' for name,digest in checksums.items()), encoding='utf8', newline='\n')
checksums[sums.name] = hashlib.sha256(sums.read_bytes()).hexdigest(); files.append(sums)
def api(path,method='GET',data=None,content_type='application/json'):
    url = path if path.startswith('https://') else f'https://api.github.com/repos/{repo}'+path
    assert url.startswith(f'https://api.github.com/repos/{repo}/') or url.startswith(f'https://uploads.github.com/repos/{repo}/')
    body = json.dumps(data).encode() if data is not None and content_type=='application/json' else data
    request = urllib.request.Request(url,data=body,method=method,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'], 'User-Agent':'Bili-Space-release','Content-Type':content_type})
    with urllib.request.urlopen(request, timeout=60) as r: return json.load(r)
release = next((r for r in api('/releases?per_page=100') if r['tag_name']==tag),None)
metadata={'tag_name':tag,'target_commitish':os.environ['GITHUB_SHA'],'name':'Bili-Space '+version,'body':(ROOT/'docs'/f'RELEASE-{version}.md').read_text(encoding='utf8')}
if release is None: release = api('/releases','POST',{**metadata,'draft':True})
elif release['draft']: release = api('/releases/'+str(release['id']),'PATCH',metadata)
for p in files:
    existing = next((a for a in release['assets'] if a['name']==p.name), None)
    if existing:
        assert existing.get('digest') == 'sha256:'+checksums[p.name], 'Existing asset mismatch; refusing overwrite'
    else:
        api(release['upload_url'].split('{')[0]+'?name='+urllib.parse.quote(p.name),'POST',p.read_bytes(),'application/octet-stream')
release = api('/releases/'+str(release['id']))
for name,digest in checksums.items():
    asset = next(a for a in release['assets'] if a['name']==name)
    assert asset['digest']=='sha256:'+digest
api('/releases/'+str(release['id']),'PATCH',{'draft':False,'make_latest':'true'})
print(json.dumps({'tag':tag,'checksums':checksums,'published':True}))

