$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& .tools/zig/zig-windows-x86_64-0.13.0/zig.exe c++ tests/taskbar43-native.cpp -std=c++20 -O0 -target x86_64-windows-gnu -fms-extensions -municode -DUNICODE -D_UNICODE -DNOMINMAX -Ivendor -I.tools/webview2/build/native/include -lole32 -luser32 -lgdi32 -lshell32 -ldwmapi -luuid -lws2_32 -lwinhttp -lcomdlg32 -lmfplat -lmfreadwrite -lmfuuid -lbcrypt -o verification/taskbar43-native.exe
if ($LASTEXITCODE) { throw 'Native taskbar test build failed' }
& verification/taskbar43-native.exe
if ($LASTEXITCODE) { throw 'Native taskbar test failed' }
