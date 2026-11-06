"""Keep original site bytes intact; emit WebKit CSS URL variants for the local scheme."""
import json,re
from pathlib import Path
from urllib.parse import urljoin,quote
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'assets/web-copy'
manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
for uri,item in manifest['resources'].items():
    if item['type']!='Stylesheet':continue
    text=(folder/item['file']).read_text(encoding='utf-8')
    def replace(match):
        raw=match[1].strip().strip('"\'')
        if raw.startswith(('data:','#')):return match[0]
        target=urljoin(uri,raw);record=manifest['resources'].get(target)
        value='bili-space://assets/web-copy/'+quote(record['file']) if record else target
        return 'url("'+value+'")'
    portable=re.sub(r'url\(([^)]+)\)',lambda m:m[0] if m[1].strip().strip(chr(34)+chr(39)).startswith(('data:','#')) else 'url("'+urljoin(uri,m[1].strip().strip(chr(34)+chr(39)))+'")',text)
    item['portableFile']=item['file']+'.portable.css'
    (folder/item['portableFile']).write_text(portable,encoding='utf-8')
    text=re.sub(r'url\(([^)]+)\)',replace,text)
    item['webkitFile']=item['file']+'.webkit.css'
    (folder/item['webkitFile']).write_text(text,encoding='utf-8')
(folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Prepared',len(manifest['resources']),'original resources')
