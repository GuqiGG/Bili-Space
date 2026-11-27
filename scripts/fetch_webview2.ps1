# 把微软官方的 WebView2 在线安装程序（Evergreen Bootstrapper，约 2MB）放进 dist/runtime，
# 安装包和便携版缺运行库时用它装。只接受微软签名有效的文件。
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root 'dist\runtime\MicrosoftEdgeWebview2Setup.exe'
New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
$cache = Join-Path $root '.tools\MicrosoftEdgeWebview2Setup.exe'
if (!(Test-Path $cache)) { Invoke-WebRequest -UseBasicParsing 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $cache }
$sig = Get-AuthenticodeSignature $cache
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { Remove-Item $cache -Force; throw "WebView2 bootstrapper signature check failed: $($sig.Status)" }
Copy-Item $cache $target -Force
Write-Output "WebView2 bootstrapper ready ($([math]::Round((Get-Item $target).Length/1MB,1)) MB, signed by Microsoft)"
