"""Build the shared renderer for native WebKit hosts; no user data is included."""
from pathlib import Path
import argparse, json, re, subprocess

ROOT = Path(__file__).resolve().parents[1]

def build(destination):
    assets = ROOT / 'assets'
    source = (assets / 'enhance.js').read_text(encoding='utf-8')
    categories = re.search(r'const DEFAULT_CATEGORIES=(\[[^;]+\]);', source).group(1)
    defaults = re.search(r'const DEFAULTS = (\{[^\n]+\});', source).group(1)
    code = 'const DEFAULT_CATEGORIES='+categories+';process.stdout.write(JSON.stringify('+defaults+'));'
    initial = json.loads(subprocess.check_output(['node', '-e', code], text=True))
    (destination / 'defaults.json').write_text(json.dumps(initial, ensure_ascii=False), encoding='utf-8')
    icons = {key: (assets / name).read_text(encoding='utf-8') for key, name in {
        'ICON_SETTINGS':'settings.svg','ICON_SPARKLES':'sparkles.svg','ICON_MESSAGE':'message-square-more.svg','ICON_FRAMES':'frame-interpolation.svg'}.items()}
    chunks = ['''
(()=>{if(window.top!==window)return;const payload=window.__BILI_NATIVE__;if(!payload)return;
if(!['www.bilibili.com','search.bilibili.com','space.bilibili.com','live.bilibili.com','t.bilibili.com','passport.bilibili.com','account.bilibili.com','message.bilibili.com','manga.bilibili.com','bili-space.local','assets'].includes(location.hostname))return;
const APP_INFO=payload.appInfo,INITIAL=payload.config,GM_INITIAL=payload.gm||{},RUNTIME=payload.runtime,PLUGINS=[];
window.__bsPaintReady=()=>window.chrome.webview.postMessage({type:'surface-ready'});
''']
    chunks += ['const '+key+'='+json.dumps(value, ensure_ascii=False)+';' for key,value in icons.items()]
    chunks += [(assets / 'bridge.js').read_text(encoding='utf-8')]
    chunks += ["if(INITIAL.btr){(()=>{"+(assets/'btr.user.js').read_text(encoding='utf-8')+'})();}']
    chunks += ["if(location.hostname==='www.bilibili.com'){(()=>{"+(assets/'blocker.home.user.js').read_text(encoding='utf-8')+'})();}']
    chunks += [(assets/name).read_text(encoding='utf-8') for name in ['desktop44.js','community44.js','plugins.js','accounts50.js','favorites49.js','enhance.js','media-probe.js']]
    chunks += ['})();']
    bundle = '\n'.join(chunks).replace('https://bili-space.local/', 'bili-space://assets/')
    (destination / 'renderer.js').write_text(bundle, encoding='utf-8')
    return destination / 'renderer.js'

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'build/web');args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True);print(build(args.output))
