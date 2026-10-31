$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& .tools/zig/zig-windows-x86_64-0.13.0/zig.exe c++ tests/community44-native.cpp -std=c++20 -O0 -target x86_64-windows-gnu -municode -DUNICODE -D_UNICODE -DNOMINMAX -Ivendor -luser32 -lshell32 -o verification/community44-native.exe
if ($LASTEXITCODE) { throw 'Community native test build failed' }
& verification/community44-native.exe
if ($LASTEXITCODE) { throw 'Community native test failed' }
