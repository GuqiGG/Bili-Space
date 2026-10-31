$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force verification | Out-Null
& .tools/zig/zig-windows-x86_64-0.13.0/zig.exe c++ tests/windows_media44-native.cpp -std=c++20 -O0 -target x86_64-windows-gnu -fms-extensions -municode -DUNICODE -D_UNICODE -DNOMINMAX -Ivendor -lole32 -luser32 -lgdi32 -lshell32 -luuid -o verification/windows_media44-native.exe
if ($LASTEXITCODE) { throw 'Windows media native test build failed' }
& verification/windows_media44-native.exe
if ($LASTEXITCODE) { throw 'Windows media native integration test failed' }
