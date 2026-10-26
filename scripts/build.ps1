$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$zig = Join-Path $root '.tools\zig\zig-windows-x86_64-0.13.0\zig.exe'
if (!(Test-Path $zig)) { python scripts/bootstrap.py; if ($LASTEXITCODE) { throw 'Toolchain bootstrap failed' } }
New-Item -ItemType Directory -Force dist | Out-Null
& $zig rc /I . /fo .tools/app-icon.res src/app.rc
if ($LASTEXITCODE) { throw "Icon resource build failed: $LASTEXITCODE" }
& $zig c++ src/main.cpp .tools/app-icon.res -std=c++20 -O2 -target x86_64-windows-gnu -fms-extensions -municode '-Wl,/subsystem:windows' -DUNICODE -D_UNICODE -DNOMINMAX -Ivendor -I.tools/webview2/build/native/include -lole32 -luser32 -lgdi32 -lshell32 -ldwmapi -luuid -lws2_32 -lwinhttp -lcomdlg32 -lmfplat -lmfreadwrite -lmfuuid -lbcrypt -o dist/Bili-Space.exe
if ($LASTEXITCODE) { throw "C++ build failed: $LASTEXITCODE" }
Copy-Item .tools/webview2/build/native/x64/WebView2Loader.dll dist -Force
Copy-Item assets dist -Recurse -Force
Copy-Item runtime dist -Recurse -Force
Copy-Item vendor dist -Recurse -Force
Copy-Item README.md dist -Force
Copy-Item docs dist -Recurse -Force
Write-Output "Built: $root\dist\Bili-Space.exe"
