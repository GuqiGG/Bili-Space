"""Check bundled free nodes: reachability, exit region, bilibili reachability."""
import json, subprocess, time, socket
from pathlib import Path
import requests, yaml

ROOT = Path.cwd(); OUT = ROOT / 'verification' / 'free-node-test'; OUT.mkdir(exist_ok=True)
nodes = yaml.safe_load((ROOT / 'runtime' / 'free-candidates.yaml').read_text(encoding='utf8'))['proxies']
SECRET = 'local-free-check'; PORT = 17989; CTRL = 17990
cfg = {'mixed-port': PORT, 'external-controller': f'127.0.0.1:{CTRL}', 'secret': SECRET, 'allow-lan': False,
       'bind-address': '127.0.0.1', 'mode': 'rule', 'log-level': 'warning', 'proxies': nodes,
       'proxy-groups': [{'name': 'TEST', 'type': 'select', 'proxies': [n['name'] for n in nodes]}],
       'rules': ['MATCH,TEST']}
f = OUT / 'config.json'; f.write_text(json.dumps(cfg), encoding='utf8')
log = open(OUT / 'core.log', 'wb')
p = subprocess.Popen([str(ROOT / 'runtime' / 'mihomo.exe'), '-d', str(OUT), '-f', str(f)],
                     stdout=log, stderr=log, creationflags=0x08000000)
H = {'Authorization': 'Bearer ' + SECRET}
res = []
try:
    for _ in range(80):
        try:
            if requests.get(f'http://127.0.0.1:{CTRL}/version', headers=H, timeout=.3).status_code == 200: break
        except Exception: time.sleep(.1)
    for n in nodes:
        requests.put(f'http://127.0.0.1:{CTRL}/proxies/TEST', json={'name': n['name']}, headers=H, timeout=3)
        item = {'name': n['name'], 'server': n['server'], 'type': n['type']}
        t = time.monotonic()
        try:
            z = requests.get('https://api.bilibili.com/x/web-interface/zone', timeout=8,
                             proxies={'http': f'http://127.0.0.1:{PORT}', 'https': f'http://127.0.0.1:{PORT}'})
            data = z.json().get('data', {})
            item.update(zone=z.status_code, country=data.get('country'), province=data.get('province'), ip=data.get('addr'))
        except Exception as e:
            item.update(zone_error=str(e)[:90])
        try:
            b = requests.get('https://www.bilibili.com/', timeout=8,
                             proxies={'http': f'http://127.0.0.1:{PORT}', 'https': f'http://127.0.0.1:{PORT}'}, headers={'User-Agent': 'Mozilla/5.0'})
            item.update(bili=b.status_code, bytes=len(b.content))
        except Exception as e:
            item.update(bili_error=str(e)[:90])
        item['seconds'] = round(time.monotonic() - t, 2)
        res.append(item); print(json.dumps(item, ensure_ascii=False))
finally:
    p.terminate(); p.wait(); log.close()
(ROOT / 'verification' / 'free-nodes-region.json').write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding='utf8')
