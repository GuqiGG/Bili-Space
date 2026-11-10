"""Check original-resource integrity, private cache isolation, expiry and URL rewriting."""
import hashlib,json,os,sys,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from web_cache import WebCache,is_page

manifest=json.loads((ROOT/'assets/web-copy/manifest.json').read_text(encoding='utf-8'))
for url,item in manifest['resources'].items():
    data=(ROOT/'assets/web-copy'/item['file']).read_bytes()
    assert hashlib.sha256(data).hexdigest()==item['sha256'],url
    assert len(data)==item['bytes'],url
assert is_page('https://www.bilibili.com/history')
assert is_page('https://www.bilibili.com/history?from=header')
assert is_page('https://space.bilibili.com/2')
assert is_page('https://space.bilibili.com/2/?spm_id_from=333')
assert is_page('https://message.bilibili.com/#/reply')
assert is_page('https://space.bilibili.com/zh-Hans/2')
assert not is_page('https://space.bilibili.com/2/favlist')
assert not is_page('https://space.bilibili.com/abc')
assert not is_page('https://search.bilibili.com/all?keyword=x')
assert not is_page('https://www.bilibili.com/video/BV123')
assert not is_page('https://evil.test/?url=https://www.bilibili.com/')
with tempfile.TemporaryDirectory() as directory:
    a=WebCache(ROOT,Path(directory)/'a');b=WebCache(ROOT,Path(directory)/'b');url='https://www.bilibili.com/'
    html=b'<html><body>original account A</body></html>'
    a.store(url,html);assert a.get(url)==html.decode();assert b.get(url) is None
    os.utime(a.path(url),(time.time()-30*86400-1,)*2);assert a.get(url) is None
    a.store(url,b'not HTML');assert a.get(url) is None
    static=next(u for u,v in manifest['resources'].items() if v['type']=='Stylesheet')
    rewritten=a.offline('<html><link href="'+static+'"></html>')
    assert 'bili-space://assets/web-copy/' in rewritten and static not in rewritten
print('Original resources verified:',len(manifest['resources']),'; private cache isolation and expiry passed')
