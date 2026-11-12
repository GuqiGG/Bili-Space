"""Builds assets/i18n/<lang>.json (source text → translation) from i18n/source.json and the translation tables.

- i18n/tr/*.tsv: one row per source index: idx, en, yue, ja, ko, es, fr, de, ru, pt-BR ('-' in en = not shown, skip).
- zh-TW: OpenCC s2twp (Taiwan wording: 網路, 軟體, 影片…) plus i18n/zh-TW.fix.tsv.
- zh-HK: OpenCC s2hk plus Hong Kong wording below and i18n/zh-HK.fix.tsv.
- lolcat: made from English with the LOLCAT rules below (a nod to Minecraft's LOLCAT).
Also writes the Traditional Chinese search-box line decks. Needs `pip install opencc-python-reimplemented` (build time only).
"""
import json, re
from pathlib import Path
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]; I18N = ROOT / 'i18n'; OUT = ROOT / 'assets' / 'i18n'
COLS = ['en', 'yue', 'ja', 'ko', 'es', 'fr', 'de', 'ru', 'pt-BR']
HK_WORDS = [('視頻', '影片'), ('默認', '預設'), ('設置', '設定'), ('文件夾', '資料夾'), ('登錄', '登入'), ('鼠標', '滑鼠'), ('程序', '程式'),
            ('內存', '記憶體'), ('信息', '資訊'), ('搜索', '搜尋'), ('屏幕', '螢幕'), ('緩存', '快取'), ('窗口', '視窗'), ('菜單', '選單'),
            ('鏈接', '連結'), ('賬號', '帳號'), ('賬戶', '帳戶'), ('文本', '文字'), ('運行', '執行'), ('點擊', '按'), ('全屏', '全螢幕'),
            ('加載', '載入'), ('粘貼', '貼上'), ('剪貼板', '剪貼簿'), ('托盤', '系統匣'), ('質量', '質素'), ('優化', '最佳化'), ('激活', '啟用'),
            ('户', '戶'), ('界面', '介面')]
TW_WORDS = [('托盤', '系統匣')]

def table(name):
    f = I18N / name
    if not f.exists(): return {}
    rows = [l.split('\t') for l in f.read_text(encoding='utf-8').splitlines() if '\t' in l]
    return {a: b for a, b in rows}

LOL_WORDS = {'the': 'teh', 'you': 'u', 'your': 'ur', "you're": 'ur', 'are': 'r', 'is': 'iz', 'have': 'haz', 'has': 'haz', 'please': 'plz',
             'thanks': 'kthx', 'thank': 'thx', 'okay': 'k', 'ok': 'k', 'my': 'mah', 'love': 'luv', 'with': 'wif', 'this': 'dis', 'that': 'dat',
             'what': 'wut', 'and': "an'", 'for': 'fur', 'to': '2', 'too': '2', 'one': '1', 'be': 'b', 'see': 'c', 'why': 'y', 'oh': 'o',
             'some': 'sum', 'come': 'cum', 'more': 'moar', 'very': 'veri', 'video': 'vidjo', 'videos': 'vidjoz', 'cat': 'kitteh', 'cats': 'kittehs',
             'settings': 'settinz', 'download': 'downlod', 'downloads': 'downlodz', 'search': 'serch', 'error': 'oopsie', 'failed': 'fail',
             'friend': 'fren', 'friends': 'frenz', 'want': 'wantz', 'now': 'nao', 'new': 'nu', 'update': 'updaet', 'version': 'vershun',
             'home': 'hoem', 'close': 'cloze', 'open': 'opun', 'loading': 'loadin', 'favorites': 'favritz', 'messages': 'mesijz', 'later': 'l8r',
             'great': 'gr8', 'wait': 'w8', 'before': 'b4', 'for': 'fur', 'not': 'nawt', 'no': 'noes', 'yes': 'yus', 'hello': 'oh hai', 'hi': 'hai'}
def lolcat(text):
    def word(m):
        w = m.group(0); low = w.lower()
        if low in LOL_WORDS: return LOL_WORDS[low]
        if len(w) <= 3 or not w.isalpha(): return w
        low = re.sub(r'tion(s?)$', r'shun\1', low); low = re.sub(r'ing$', 'in', low); low = re.sub(r'er$', 'r', low)
        low = re.sub(r'ck', 'k', low); low = re.sub(r'([^s])s$', r'\1z', low); low = re.sub(r'ph', 'f', low)
        return low
    out = re.sub(r"[A-Za-z']+", word, text).upper()
    return out + ' PLZ' if out.endswith('?') else out

def build():
    src = json.loads((I18N / 'source.json').read_text(encoding='utf-8'))
    tr = {c: {} for c in COLS}; skip = set()
    for f in sorted((I18N / 'tr').glob('*.tsv')):
        for line in f.read_text(encoding='utf-8').splitlines():
            if not line.strip() or line.startswith('#'): continue
            cells = line.split('\t'); i = int(cells[0])
            if cells[1] == '-': skip.add(i); continue
            for c, v in zip(COLS, cells[1:]): tr[c][i] = v
    s2tw, s2hk = OpenCC('s2twp'), OpenCC('s2hk'); fix_tw, fix_hk = table('zh-TW.fix.tsv'), table('zh-HK.fix.tsv')
    def tw(text):
        t = s2tw.convert(text)
        for a, b in TW_WORDS: t = t.replace(a, b)
        return t
    def hk(text):
        t = s2hk.convert(text)
        for a, b in HK_WORDS: t = t.replace(a, b)
        return t
    OUT.mkdir(parents=True, exist_ok=True); missing = {}
    for lang in ['zh-TW', 'zh-HK'] + COLS + ['lolcat']:
        d = {}
        for i, s in enumerate(src):
            if i in skip: continue
            if lang == 'zh-TW': d[s] = fix_tw.get(s) or tw(s)
            elif lang == 'zh-HK': d[s] = fix_hk.get(s) or hk(s)
            elif lang == 'lolcat':
                if i in tr['en']: d[s] = lolcat(tr['en'][i])
            elif i in tr[lang] and tr[lang][i]: d[s] = tr[lang][i]
        missing[lang] = len(src) - len(skip) - len(d)
        (OUT / f'{lang}.json').write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    quips = (ROOT / 'assets' / 'search-quips.txt').read_text(encoding='utf-8')
    (ROOT / 'assets' / 'search-quips.zh-TW.txt').write_text(tw(quips), encoding='utf-8')
    (ROOT / 'assets' / 'search-quips.zh-HK.txt').write_text(hk(quips), encoding='utf-8')
    print('missing per language:', missing)

if __name__ == '__main__':
    build()
