"""Assemble a per-user WebKit/GTK client without including browser profiles."""
from pathlib import Path
import json, shutil, subprocess, sys
from build_web_bundle import build

ROOT=Path(__file__).resolve().parents[1]
version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
stage=ROOT/'build/linux-package';app=stage/'usr/lib/bili-space'
app.mkdir(parents=True,exist_ok=True)
shutil.copytree(ROOT/'assets',app/'assets',dirs_exist_ok=True)
shutil.copy2(ROOT/'src/web_cache.py',app/'web_cache.py');shutil.copy2(ROOT/'src/linux_main.py',app/'linux_main.py');build(app)
binary=stage/'usr/bin/bili-space';binary.parent.mkdir(parents=True,exist_ok=True)
binary.write_text('#!/bin/sh\nexec /usr/bin/python3 /usr/lib/bili-space/linux_main.py "$@"\n');binary.chmod(0o755)
desktop=stage/'usr/share/applications/bili-space.desktop';desktop.parent.mkdir(parents=True,exist_ok=True)
desktop.write_text('[Desktop Entry]\nType=Application\nName=Bili-Space\nComment=Bilibili desktop client\nExec=bili-space\nIcon=bili-space\nTerminal=false\nCategories=AudioVideo;Video;Network;\nStartupWMClass=BiliSpace\n',encoding='utf-8')
icon=stage/'usr/share/icons/hicolor/256x256/apps/bili-space.png';icon.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/'assets/branding/bili-space.png',icon)
control=stage/'DEBIAN/control';control.parent.mkdir(exist_ok=True)
control.write_text(f'Package: bili-space\nVersion: {version}\nArchitecture: all\nMaintainer: Bili-Space contributors\nDepends: python3, python3-gi, python3-gi-cairo, python3-cairo, gstreamer1.0-libav, gstreamer1.0-plugins-good, gstreamer1.0-plugins-bad, gstreamer1.0-plugins-ugly, gir1.2-gtk-3.0, gir1.2-webkit2-4.1\nSection: video\nPriority: optional\nHomepage: https://github.com/GuqiGG/Bili-Space\nDescription: Bilibili desktop client with native GTK and isolated account profiles\n',encoding='utf-8')
out=ROOT/'releases';out.mkdir(exist_ok=True)
if sys.platform.startswith('linux'):
    subprocess.run(['dpkg-deb','--root-owner-group','--build',str(stage),str(out/f'Bili-Space-{version}-linux.deb')],check=True)
print(app)
