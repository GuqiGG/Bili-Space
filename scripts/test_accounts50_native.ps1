$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force verification | Out-Null
& .tools/zig/zig-windows-x86_64-0.13.0/zig.exe c++ tests/accounts50-native.cpp -std=c++20 -O0 -target x86_64-windows-gnu -fms-extensions -municode -DUNICODE -D_UNICODE -DNOMINMAX -Ivendor -I.tools/webview2/build/native/include -lole32 -luser32 -lgdi32 -lshell32 -ldwmapi -luuid -lws2_32 -lwinhttp -lcomdlg32 -lmfplat -lmfreadwrite -lmfuuid -lbcrypt -lcrypt32 -lgdiplus -o verification/accounts50-native.exe
if ($LASTEXITCODE) { throw 'Account native test compilation failed' }
& verification/accounts50-native.exe verification/accounts50-native-profile
if ($LASTEXITCODE) { throw 'Account native test failed' }
