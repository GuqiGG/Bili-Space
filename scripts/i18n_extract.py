"""Collects every Chinese text run the client's own scripts can show into i18n/source.json (one entry per run).
Translations live in i18n/<lang>.json as arrays in the same order; scripts/i18n_build.py turns them into assets/i18n/<lang>.json maps.
Run this after changing UI text, then fill the new entries (marked "") in each language file."""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ['enhance.js', 'community44.js', 'accounts50.js', 'favorites49.js', 'plugins.js', 'desktop44.js']
CJK = r'㐀-鿿豈-﫿'
RUN = re.compile(r'[%s][%s　-〿！-～0-9A-Za-z %%·…/+\-—「」『』“”‘’、，。：；！？（）]*' % (CJK, CJK))
SKIP_LINE = re.compile(r'^\s*(//|\*|/\*)')   # comments are not shown

def runs(text):
    out = []
    for line in text.splitlines():
        if SKIP_LINE.match(line): continue
        for m in RUN.finditer(line):
            r = m.group(0).rstrip(' -/+')
            if r and re.search('[%s]' % CJK, r): out.append(r)
    return out

if __name__ == '__main__':
    out = ROOT / 'i18n'; out.mkdir(exist_ok=True)
    old = json.loads((out / 'source.json').read_text(encoding='utf-8')) if (out / 'source.json').exists() else []
    # Append-only: translations are stored by position, so existing entries keep theirs and new text goes last.
    seen, order = set(old), list(old)
    for name in FILES:
        for r in runs((ROOT / 'assets' / name).read_text(encoding='utf-8')):
            if r not in seen: seen.add(r); order.append(r)
    (out / 'source.json').write_text(json.dumps(order, ensure_ascii=False, indent=0), encoding='utf-8')
    print(len(order), 'strings,', sum(map(len, order)), 'chars;', len(set(order) - set(old)), 'new')
