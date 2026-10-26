"""Rank the public node feed with mihomo's parallel delay test, then check bilibili exit region."""
import json, subprocess, time
from pathlib import Path
import requests, yaml

ROOT = Path.cwd(); OUT = ROOT / 'verification' / 'free-node-test'; OUT.mkdir(exist_ok=True)
feed = yaml.safe_load((ROOT / 'verification' / 'free-feed.yaml').read_text(encoding='utf8'))['proxies']
seen, nodes = set(), []
for n in feed:
    key = (n.get('type'), n.get('server'), n.get('port'))
    if key in seen or not n.get('name'):
        continue
    seen.add(key); nodes.append(n)
print('unique nodes', len(nodes))
S = 'rank'; PORT, CTRL = 17991, 17992
cfg = {'mixed-port': PORT, 'external-controller': f'127.0.0.1:{CTRL}', 'secret': S, 'allow-lan': False,
       'bind-address': '127.0.0.1', 'mode': 'rule', 'log-level': 'silent', 'proxies': nodes,
       'proxy-groups': [{'name': 'RANK', 'type': 'select', 'proxies': [n['name'] for n in nodes]}],
       'rules': ['MATCH,RANK']}
f = OUT / 'rank.json'; f.write_text(json.dumps(cfg, ensure_ascii=False), encoding='utf8')
log = open(OUT / 'rank-core.log', 'wb')
p = subprocess.Popen([str(ROOT / 'runtime' / 'mihomo.exe'), '-d', str(OUT), '-f', str(f)],
                     stdout=log, stderr=log, creationflags=0x08000000)
H = {'Authorization': 'Bearer ' + S}
result = {'total': len(nodes), 'live': [], 'regions': {}}
try:
    for _ in range(100):
        try:
            if requests.get(f'http://127.0.0.1:{CTRL}/version', headers=H, timeout=.3).status_code == 200: break
        except Exception: time.sleep(.1)
    t = time.time()
    r = requests.get(f'http://127.0.0.1:{CTRL}/group/RANK/delay',
                     params={'url': 'https://www.gstatic.com/generate_204', 'timeout': 4000}, headers=H, timeout=180)
    delays = r.json()
    live = sorted(((int(v), k) for k, v in delays.items() if isinstance(v, int) and v > 0))
    print('probe', round(time.time() - t, 1), 's, live', len(live))
    result['live'] = [{'name': k, 'delay': v} for v, k in live[:80]]
    UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141 Safari/537.36',
          'Referer': 'https://www.bilibili.com/'}
    PX = {'http': f'http://127.0.0.1:{PORT}', 'https': f'http://127.0.0.1:{PORT}'}
    for delay, name in live[:45]:
        requests.put(f'http://127.0.0.1:{CTRL}/proxies/RANK', json={'name': name}, headers=H, timeout=3)
        item = {'name': name, 'delay': delay}
        try:
            z = requests.get('https://api.bilibili.com/x/web-interface/zone', timeout=8, proxies=PX, headers=UA)
            d = z.json().get('data', {})
            item.update(region=d.get('country'), city=d.get('city'), ip=d.get('addr'))
        except Exception as e:
            item.update(error=str(e)[:60])
        node = next(n for n in nodes if n['name'] == name)
        item.update(type=node.get('type'), server=node.get('server'), port=node.get('port'))
        result['regions'][item.get('region') or 'unknown'] = result['regions'].get(item.get('region') or 'unknown', 0) + 1
        print(json.dumps(item, ensure_ascii=False))
        result.setdefault('tested', []).append(item)
finally:
    p.terminate(); p.wait(); log.close()
(ROOT / 'verification' / 'free-nodes-ranked.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
print('regions', result['regions'])
