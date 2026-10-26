"""Enable and verify the Bili23 Downloader MCP bridge (loopback, token auth, parse only)."""
import json, os, pathlib, re, secrets, subprocess, sys, time, urllib.error, urllib.request

CONFIG = pathlib.Path(os.environ['APPDATA']) / 'Bili23 Downloader' / 'config.json'
EXE = pathlib.Path(r'C:\Program Files\Bili23 Downloader\Bili23.exe')
PORT = 23330


def load():
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def save(data):
    tmp = CONFIG.with_suffix('.json.bs-tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=4), encoding='utf-8')
    os.replace(tmp, CONFIG)


def post(body, token, timeout=120):
    request = urllib.request.Request(
        f'http://127.0.0.1:{PORT}/mcp',
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'},
        method='POST')
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


def main():
    data = load()
    mcp = data.setdefault('MCP', {})
    if not mcp.get('mcp_token'):
        mcp['mcp_token'] = secrets.token_urlsafe(32)
    mcp['mcp_enabled'] = True
    mcp.setdefault('mcp_port', PORT)
    save(data)
    token = mcp['mcp_token']
    print('mcp enabled, token length', len(token))

    process = subprocess.Popen([str(EXE)], cwd=str(EXE.parent))
    try:
        ready = False
        for attempt in range(90):
            try:
                result = post({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
                               'params': {'protocolVersion': '2025-06-18', 'capabilities': {},
                                          'clientInfo': {'name': 'Better Bili Space', 'version': '0.1.26'}}}, token, 5)
                ready = True
                break
            except Exception:
                time.sleep(1)
        print('initialize', json.dumps(result if ready else 'timeout', ensure_ascii=False)[:300])
        if not ready:
            return 1
        tools = post({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list', 'params': {}}, token)
        names = [t['name'] for t in tools.get('result', {}).get('tools', [])]
        print('tools', names)
        parsed = post({'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call',
                       'params': {'name': 'parse_url', 'arguments': {'url': 'https://www.bilibili.com/video/BV1jDJb68EJS'}}}, token)
        body = parsed.get('result', {})
        print('parse isError', body.get('isError'), 'summary', json.dumps(body.get('content', [{}])[0], ensure_ascii=False)[:160])
        episodes = body.get('structuredContent', {}).get('episodes', [])
        print('episodes', json.dumps(episodes[:2], ensure_ascii=False)[:400])
        bad = post({'jsonrpc': '2.0', 'id': 4, 'method': 'tools/call',
                    'params': {'name': 'create_download', 'arguments': {'episode_ids': ['bs-probe-does-not-exist']}}}, token)
        bad_result = bad.get('result', {})
        print('create_download(probe) isError', bad_result.get('isError'),
              json.dumps(bad_result.get('content', [{}])[0], ensure_ascii=False)[:200])
        json.dump({'tools': names, 'episodes': episodes[:2],
                   'parse_error': body.get('isError'), 'probe_error': bad_result.get('isError')},
                  open(pathlib.Path(__file__).resolve().parents[1] / 'verification' / 'v0126-mcp.json', 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        return 0
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


sys.exit(main())
