"""Pin upstream files, adapt only blocker scope; never modify the checkout."""
from pathlib import Path
import difflib, hashlib, json, subprocess

root = Path(__file__).resolve().parents[1]
upstream = root / 'third_party/blocker/script.user.js'
original = upstream.read_bytes()
source = original.decode('utf-8').replace('\r\n', '\n')
out = root / 'assets/blocker.home.user.js'
changes = [
    ("video: ['.right-container'],", "video: ['.right-container'],\n        disabled: [],"),
    ("hideLiveCards: GM_getValue(STORAGE_KEYS.HIDE_LIVE, false)", "hideLiveCards: false"),
    ("blockAdCards: GM_getValue(STORAGE_KEYS.BLOCK_AD, true)", "blockAdCards: false"),
    ("videoProfileButton: GM_getValue(STORAGE_KEYS.VIDEO_PROFILE_BUTTON, true)", "videoProfileButton: false"),
    (r"/space\.bilibili\.com\/(\d+)/", r"/space\.bilibili\.com\/(?:(?:zh-Hans|zh-Hant|en)\/)?(\d+)(?:[/?#]|$)/"),
    ("        if (location.pathname.startsWith('/video/')) return 'video';\n        if (location.hostname === 'search.bilibili.com') return 'search';\n        return 'home';", "        return location.hostname === 'www.bilibili.com' && /^\\/(?:(?:index\\.html)|(?:(?:zh-Hans|zh-Hant|en)\\/?))?$/.test(location.pathname) ? 'home' : 'disabled';"),
    ("        if (!root || isInsideVideoPlayer(root)) return;\n        try {", "        if (getPageKind() !== 'home') { removeHomeCardOverlays(); return; }\n        if (!root || isInsideVideoPlayer(root)) return;\n        try {"),
    ("        if (targets.length === 0) scheduleObserverRebind(500);", "        if (targets.length === 0 && getPageKind() === 'home') scheduleObserverRebind(500);"),
    ("showToast('B站拉黑脚本提示：请先登录 B 站账号！', 5000);", "// The button itself reports login errors only when clicked."),
    ("        registerToggleMenus();", "        // Client policy: no plugin menus or optional features."),
    ("        setupObserver();\n        updateBlacklistCount();", "        setupObserver();\n        // No background blacklist-count request in the home-only adaptation."),
]
for old, new in changes:
    assert source.count(old) == 1, (old, source.count(old))
    source = source.replace(old, new)
out.write_text(source, encoding='utf-8', newline='\n')
(root / 'verification/blocker.original.user.js').write_bytes(original)
patch = ''.join(difflib.unified_diff(original.decode().replace('\r\n', '\n').splitlines(True), source.splitlines(True), fromfile='blocker.original.user.js', tofile='blocker.home.user.js'))
(root / 'verification/blocker.home.patch').write_text(patch, encoding='utf-8', newline='\n')
# Embed original bytes; rollback works outside this checkout without Python or Git.
import base64
payload = base64.b64encode(original).decode()
rollback = f'''#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then echo "Usage: $0 TARGET_COPY" >&2; exit 2; fi
tmp="$1.rollback.$$"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
base64 -d > "$tmp" <<'BASELINE_BYTES'
{payload}
BASELINE_BYTES
cat "$tmp" > "$1"
'''
(root / 'verification/ROLLBACK.sh').write_text(rollback, encoding='utf-8', newline='\n')
(root / 'verification/ROLLBACK.sh').chmod(0o755)
import shutil
shutil.copyfile(root/'third_party/btr/user_scripts/bilibili-thread-ripper.user.js', root/'assets/btr.user.js')
for name in ['btr','blocker']:
    shutil.copyfile(root/f'third_party/{name}/LICENSE', root/f'vendor/{name}.LICENSE')
meta = {}
for name in ['btr','blocker']:
    meta[name] = {'repository': {'btr':'https://github.com/MrTangLuyao/Bilibili-thread-ripper','blocker':'https://github.com/codertesla/bilibili-1-click-blocker'}[name], 'commit': subprocess.check_output(['git','-C',str(root/f'third_party/{name}'),'rev-parse','HEAD'], text=True).strip()}
meta['blocker']['original_sha256'] = hashlib.sha256(original).hexdigest()
meta['blocker']['modified_sha256'] = hashlib.sha256(out.read_bytes()).hexdigest()
meta['btr']['sha256'] = hashlib.sha256((root/'assets/btr.user.js').read_bytes()).hexdigest()
(root/'vendor/plugins.lock.json').write_text(json.dumps(meta, indent=2)+'\n', encoding='utf-8')
print(json.dumps(meta, indent=2))
