"""Original site documents are private per browser profile; assets are public and immutable."""
import hashlib,json,time
from pathlib import Path
from urllib.parse import urlparse,quote

def is_page(uri):
    u=urlparse(uri or '');path=u.path.rstrip('/')
    return u.scheme=='https' and (u.hostname=='www.bilibili.com' and path in ('','/zh-Hans','/history','/account/history','/zh-Hans/history') or u.hostname=='t.bilibili.com' and path in ('','/zh-Hans'))

class WebCache:
    def __init__(self,resources,profile):
        self.root=Path(resources)/'assets/web-copy';self.profile=Path(profile)/'web-pages';self.profile.mkdir(parents=True,exist_ok=True,mode=0o700)
        try:self.manifest=json.loads((self.root/'manifest.json').read_text(encoding='utf-8'))
        except (OSError,ValueError):self.manifest={'resources':{}}
    def path(self,uri):return self.profile/(hashlib.sha256(uri.encode()).hexdigest()+'.html')
    def get(self,uri):
        if not is_page(uri):return None
        try:
            p=self.path(uri)
            return p.read_text(encoding='utf-8') if time.time()-p.stat().st_mtime<86400 else None
        except (OSError,UnicodeError):return None
    def store(self,uri,data):
        if not is_page(uri) or len(data)>8*1024*1024 or b'<html' not in data.lower():return
        p=self.path(uri);temp=p.with_suffix('.tmp');temp.write_bytes(data);temp.chmod(0o600);temp.replace(p)
    def offline(self,html):
        for uri,item in self.manifest['resources'].items():
            if item['type']=='Document':continue
            local='bili-space://assets/web-copy/'+quote(item.get('webkitFile',item['file']))
            html=html.replace(uri,local).replace(uri.removeprefix('https:'),local)
        return html
