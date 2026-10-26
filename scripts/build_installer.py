"""Build an offline per-user Setup from the sanitized portable ZIP, never raw dist."""
from pathlib import Path
import argparse, hashlib, json, subprocess, tempfile, urllib.request, zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '6.7.3'
SHA256 = '9c73c3bae7ed48d44112a0f48e66742c00090bdb5bef71d9d3c056c66e97b732'

def compiler():
    tools = ROOT / '.tools'; tools.mkdir(exist_ok=True)
    archive = tools / f'innosetup-{VERSION}.exe'
    if not archive.exists():
        urllib.request.urlretrieve(f'https://github.com/jrsoftware/issrc/releases/download/is-{VERSION.replace(".", "_")}/innosetup-{VERSION}.exe', archive)
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == SHA256, 'Inno Setup checksum mismatch'
    destination = tools / f'inno-{VERSION}'
    iscc = destination / 'ISCC.exe'
    if not iscc.exists():
        subprocess.run([str(archive), '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', '/PORTABLE=1', '/CURRENTUSER', '/NOICONS', f'/DIR={destination}'], check=True)
    return iscc

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--test-install', action='store_true'); args = parser.parse_args()
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf8'))['version']
    archive = ROOT / 'releases' / f'Bili-Space-{version}-win64.zip'
    with tempfile.TemporaryDirectory(prefix='installer-', dir=ROOT / '.tools') as staging:
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            for name in z.namelist():
                p = Path(name)
                assert p.parts[0] == 'Bili-Space' and '..' not in p.parts and not p.is_absolute()
                assert not any(t.lower() in {'.appdata', '.git', 'settings.json', 'cookies'} for t in p.parts)
            z.extractall(staging)
        source = Path(staging) / 'Bili-Space'
        assert (source / 'Bili-Space.exe').read_bytes()[:2] == b'MZ'
        command = [str(compiler()), '/Qp', f'/DAppVersion={version}', f'/DSourceDir={source}', f'/DOutputDir={ROOT / "releases"}']
        if args.test_install: command += ['/DTestInstall=1']
        subprocess.run(command + [str(ROOT / 'installer/Bili-Space.iss')], check=True)
    suffix = '-Test' if args.test_install else ''
    setup = ROOT / 'releases' / f'Bili-Space-{version}-Setup{suffix}.exe'
    assert setup.read_bytes()[:2] == b'MZ'
    print(json.dumps({'file': str(setup), 'bytes': setup.stat().st_size, 'sha256': hashlib.sha256(setup.read_bytes()).hexdigest(), 'isolated_test_app_id': args.test_install}))

if __name__ == '__main__': main()
