$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$zig = Join-Path $root '.tools\zig\zig-windows-x86_64-0.13.0\zig.exe'
if (!(Test-Path $zig)) { python scripts/bootstrap.py; if ($LASTEXITCODE) { throw 'Toolchain bootstrap failed' } }
# Zig defaults its caches next to the toolchain. When that path is not writable (stale
# handle, read-only mount, confined shell) the compiler exits with a bare
# "error: AccessDenied" that reads like a source problem. Pin both caches inside .tools.
$env:ZIG_GLOBAL_CACHE_DIR = Join-Path $root '.tools\zig-cache-global'
$env:ZIG_LOCAL_CACHE_DIR = Join-Path $root '.tools\zig-cache-local'
New-Item -ItemType Directory -Force $env:ZIG_GLOBAL_CACHE_DIR, $env:ZIG_LOCAL_CACHE_DIR, (Join-Path $root '.tools') | Out-Null
New-Item -ItemType Directory -Force dist | Out-Null
& $zig rc /I . /fo .tools/app-icon.res src/app.rc
if ($LASTEXITCODE) { throw "Icon resource build failed: $LASTEXITCODE" }
& $zig c++ src/main.cpp .tools/app-icon.res -std=c++20 -O2 -s -target x86_64-windows-gnu -fms-extensions -municode '-Wl,/subsystem:windows' -DUNICODE -D_UNICODE -DNOMINMAX -Ivendor -I.tools/webview2/build/native/include -lole32 -luser32 -lgdi32 -lshell32 -ldwmapi -luuid -lws2_32 -lwinhttp -lcomdlg32 -lmfplat -lmfreadwrite -lmfuuid -lbcrypt -lcrypt32 -lgdiplus -o dist/Bili-Space.exe
if ($LASTEXITCODE) { throw "C++ build failed: $LASTEXITCODE" }
Copy-Item .tools/webview2/build/native/x64/WebView2Loader.dll dist -Force
Copy-Item assets dist -Recurse -Force
Copy-Item runtime dist -Recurse -Force
Copy-Item vendor dist -Recurse -Force
Copy-Item README.md dist -Force
Copy-Item docs dist -Recurse -Force
Remove-Item dist/docs/website,dist/docs/images -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "Built: $root\dist\Bili-Space.exe"
