#requires -Version 5.1
<#
  Upload the current release ZIP + in-app update manifest to the Cloudflare R2 bucket
  behind https://bili.gvqi.top, then verify the public endpoints.

  The GitHub Release and the repo manifest (update-site/public/updates/windows-x64.json)
  are published by the release workflow; this script only covers the R2 objects that the
  worker serves. Upload order matters: ZIP first, manifest last, so no client can see a
  manifest pointing at a missing package.

  Requires a logged-in wrangler session: npx wrangler login
#>
param(
    [string]$Version = '',
    [switch]$VerifyOnly,
    [switch]$DeepVerify,
    [switch]$FetchRelease
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$site = 'https://bili.gvqi.top'
$bucket = 'bili-space-releases'

if (-not $Version) {
    $Version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
}

$zip = Join-Path $root "releases/Bili-Space-$Version-win64.zip"
$setup = Join-Path $root "releases/Bili-Space-$Version-Setup.exe"
$manifestPath = Join-Path $root 'update-site/public/updates/windows-x64.json'

if (-not (Test-Path $manifestPath)) { throw "missing manifest: $manifestPath" }

$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.version -ne $Version) { throw "manifest version $($manifest.version) != $Version" }

function Sync-ReleaseAsset([string]$path, [string]$name, [string]$expectedHash, [int64]$expectedSize) {
    $hash = if (Test-Path $path) { (Get-FileHash $path -Algorithm SHA256).Hash.ToLower() } else { '' }
    $size = if (Test-Path $path) { (Get-Item $path).Length } else { 0 }
    if ($hash -eq $expectedHash -and $size -eq $expectedSize) { return }
    if (-not $FetchRelease) {
        throw "local $name does not match the manifest; rebuild it or pass -FetchRelease to pull the CI asset"
    }
    $url = "https://github.com/GuqiGG/Bili-Space/releases/download/v$Version/$name"
    Write-Host "downloading $name from the GitHub release ..."
    $temp = "$path.part"
    Invoke-WebRequest -Uri $url -OutFile $temp -UseBasicParsing -TimeoutSec 900 -MaximumRedirection 5
    $downloadHash = (Get-FileHash $temp -Algorithm SHA256).Hash.ToLower()
    if ($downloadHash -ne $expectedHash) { Remove-Item $temp -Force; throw "downloaded $name sha256 does not match the manifest" }
    Move-Item -Force $temp $path
    Write-Host "synced $name ($($expectedSize) bytes)"
}

Sync-ReleaseAsset $zip "Bili-Space-$Version-win64.zip" $manifest.sha256 ([int64]$manifest.size)
Sync-ReleaseAsset $setup "Bili-Space-$Version-Setup.exe" $manifest.setupSha256 ([int64]$manifest.setupSize)

$zipHash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
$setupHash = (Get-FileHash $setup -Algorithm SHA256).Hash.ToLower()
$zipSize = (Get-Item $zip).Length
$setupSize = (Get-Item $setup).Length

Write-Host "version   : $Version"
Write-Host "zip       : $zipSize bytes  sha256 $zipHash"
Write-Host "setup     : $setupSize bytes  sha256 $setupHash"
Write-Host "manifest  : version=$($manifest.version) size=$($manifest.size) sha256=$($manifest.sha256)"

# The manifest must describe the bytes we are about to upload, otherwise the client
# verifies a download against a hash that belongs to a different build.
if ($manifest.sha256 -ne $zipHash -or [int64]$manifest.size -ne $zipSize) { throw 'manifest zip sha256/size does not match releases/*.zip' }
if ($manifest.setupSha256 -ne $setupHash -or [int64]$manifest.setupSize -ne $setupSize) { throw 'manifest setup sha256/size does not match releases/*-Setup.exe' }
if ($manifest.downloadUrl -ne "$site/releases/Bili-Space-$Version-win64.zip") { throw "unexpected downloadUrl: $($manifest.downloadUrl)" }
Write-Host 'local integrity: PASS' -ForegroundColor Green

function Get-Remote([string]$url, [switch]$Head) {
    try {
        if ($Head) { return Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 60 -MaximumRedirection 5 }
        return Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 -MaximumRedirection 5
    } catch { return $null }
}

function Test-RemoteSite {
    $ok = $true
    $zipUrl = "$site/releases/Bili-Space-$Version-win64.zip"
    $probe = Get-Remote $zipUrl -Head
    if (-not $probe -or $probe.StatusCode -ne 200) {
        Write-Host "remote zip  : MISSING ($zipUrl)" -ForegroundColor Red; $ok = $false
    } elseif ([int64]$probe.Headers['Content-Length'] -ne $zipSize) {
        Write-Host "remote zip  : SIZE MISMATCH $($probe.Headers['Content-Length']) != $zipSize" -ForegroundColor Red; $ok = $false
    } else {
        Write-Host "remote zip  : 200 $zipSize bytes"
        if ($DeepVerify) {
            $tmp = Join-Path ([IO.Path]::GetTempPath()) "bs-verify-$Version.zip"
            Invoke-WebRequest -Uri $zipUrl -OutFile $tmp -UseBasicParsing -TimeoutSec 600
            $remoteHash = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower()
            Remove-Item $tmp -Force
            if ($remoteHash -ne $zipHash) { Write-Host "remote zip  : SHA256 MISMATCH $remoteHash" -ForegroundColor Red; $ok = $false }
            else { Write-Host 'remote zip  : sha256 matches local build' }
        }
    }
    $live = Get-Remote "$site/updates/windows-x64.json"
    if (-not $live) {
        Write-Host 'remote manifest: MISSING' -ForegroundColor Red; $ok = $false
    } else {
        $parsed = $live.Content | ConvertFrom-Json
        if ($parsed.version -ne $Version -or $parsed.sha256 -ne $zipHash) {
            Write-Host "remote manifest: STALE version=$($parsed.version)" -ForegroundColor Red; $ok = $false
        } else {
            Write-Host "remote manifest: version=$($parsed.version) sha256=$($parsed.sha256.Substring(0,12))..."
        }
    }
    if ($ok) { Write-Host "update site: PASS ($Version live)" -ForegroundColor Green }
    else { Write-Host 'update site: FAIL' -ForegroundColor Red }
    return $ok
}

if ($VerifyOnly) {
    $okSite = Test-RemoteSite
    if (-not $okSite) { exit 1 }
    exit 0
}

$whoami = & npx --yes wrangler whoami 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $whoami -match 'not authenticated|wrangler login') {
    throw "wrangler is not logged in. Run: npx wrangler login"
}

Write-Host 'uploading zip ...'
& npx --yes wrangler r2 object put "$bucket/releases/Bili-Space-$Version-win64.zip" --file $zip --remote --content-type application/zip
if ($LASTEXITCODE -ne 0) { throw 'zip upload failed' }

Write-Host 'uploading manifest ...'
& npx --yes wrangler r2 object put "$bucket/updates/windows-x64.json" --file $manifestPath --remote --content-type 'application/json; charset=utf-8'
if ($LASTEXITCODE -ne 0) { throw 'manifest upload failed' }

if (-not (Test-RemoteSite)) { throw 'public verification failed after upload' }
