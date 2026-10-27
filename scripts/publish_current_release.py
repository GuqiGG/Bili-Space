"""Run in Actions with its scoped token. Never overwrite immutable release assets."""
from pathlib import Path
import base64, hashlib, json, os, urllib.request, urllib.parse, urllib.error
ROOT = Path(__file__).resolve().parents[1]
version = json.loads((ROOT/'package.json').read_text(encoding='utf8'))['version']
tag = 'v'+version
repo = os.environ['GH_REPO']
files = [ROOT/'releases'/f'Bili-Space-{version}-win64.zip', ROOT/'releases'/f'Bili-Space-{version}-Setup.exe']
manifest = None
if tuple(map(int,version.split('.'))) >= (0,1,38):
    zipfile, setup = files
    manifest = {'schema':1,'appId':'bili-space','platform':'windows-x64','version':version,'minimumSupportedVersion':'0.1.0','force':False,
        'downloadUrl':f'https://bili.gvqi.top/releases/{zipfile.name}','sha256':hashlib.sha256(zipfile.read_bytes()).hexdigest(),'size':zipfile.stat().st_size,
        'setupUrl':f'https://github.com/{repo}/releases/download/{tag}/{setup.name}','setupSha256':hashlib.sha256(setup.read_bytes()).hexdigest(),'setupSize':setup.stat().st_size,
        'changelog':['软件内下载更新并校验 SHA256','点击安装并重启，无需手动解压替换','保留登录、设置和下载内容','更新站不可用时自动从 GitHub 检查更新']}
    manifest_file=ROOT/'releases/windows-x64.json'
    manifest_file.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8',newline='\n')
    files.append(manifest_file)
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
if manifest is not None:
    path='/contents/update-site/public/updates/windows-x64.json'
    try: previous=api(path+'?ref=master')
    except urllib.error.HTTPError as error:
        if error.code!=404: raise
        previous=None
    content=json.dumps(manifest,ensure_ascii=False,indent=2).encode()
    if previous is None or base64.b64decode(previous['content'])!=content:
        change={'message':f'Publish verified {version} in-app update manifest','branch':'master','content':base64.b64encode(content).decode()}
        if previous: change['sha']=previous['sha']
        api(path,'PUT',change)
print(json.dumps({'tag':tag,'checksums':checksums,'published':True}))
