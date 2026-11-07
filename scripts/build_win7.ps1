$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
python scripts/bootstrap_win7_loader.py
if ($LASTEXITCODE) { throw 'Legacy loader verification failed' }
$zig='.tools/zig/zig-windows-x86_64-0.13.0/zig.exe'
& $zig rc /I . /fo .tools/win7-icon.res src/app.rc
if ($LASTEXITCODE) { throw 'Legacy resource build failed' }
& $zig c++ src/main.cpp .tools/win7-icon.res -std=c++20 -O2 -target x86_64-windows.win7-gnu -fms-extensions -municode '-Wl,/subsystem:windows' -DUNICODE -D_UNICODE -DNOMINMAX -D_WIN32_WINNT=0x0601 -DWINVER=0x0601 -DBILI_LEGACY_WIN7=1 -Ivendor -I.tools/webview2/build/native/include -lole32 -luser32 -lgdi32 -lshell32 -ldwmapi -luuid -lws2_32 -lwinhttp -lcomdlg32 -lmfplat -lmfreadwrite -lmfuuid -lbcrypt -lcrypt32 -lgdiplus -o build/win7/Bili-Space.exe
if ($LASTEXITCODE) { throw 'Windows 7 target build failed' }
python scripts/package_win7.py
if ($LASTEXITCODE) { throw 'Legacy package verification failed' }
