# Builds the Android APK into dist/. Needs the Android SDK (platform 34), a JDK 17-21 and node/python for the shared renderer.
# Runs on Windows PowerShell and on pwsh in CI; paths use forward slashes so both accept them.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$unix = $PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows
$web = "$root/android/app/src/main/assets/web"
if (Test-Path $web) { Remove-Item $web -Recurse -Force }
New-Item -ItemType Directory -Force $web | Out-Null

# The same renderer bundle as Linux; the client's own files are served at https://bili-space.local/ from the APK.
$python = if ($unix) { 'python3' } else { 'python' }
& $python "$root/scripts/build_web_bundle.py" --output $web | Out-Null
if ($LASTEXITCODE) { throw "renderer bundle failed: $LASTEXITCODE" }
$renderer = "$web/renderer.js"
[IO.File]::WriteAllText($renderer, [IO.File]::ReadAllText($renderer).Replace('bili-space://assets/', 'https://bili-space.local/'), (New-Object Text.UTF8Encoding $false))
$assets = "$web/assets"; New-Item -ItemType Directory -Force $assets | Out-Null
foreach ($dir in 'fonts', 'onboarding', 'whats-new', 'web-copy', 'branding', 'i18n') { Copy-Item "$root/assets/$dir" $assets -Recurse -Force }
foreach ($file in 'tv.svg', 'search-quips.txt', 'search-quips.zh-TW.txt', 'search-quips.zh-HK.txt', 'search-quips.lolcat.txt', 'startup.html') { Copy-Item "$root/assets/$file" $assets -Force }

$info = Get-Content "$root/assets/app-info.json" -Raw -Encoding utf8 | ConvertFrom-Json
$info.platform = 'android'; $info.updateUrl = ''
$info.releaseName = "Bili-Space $($info.version) · 安卓版 | 你为什么这么做"
[IO.File]::WriteAllText("$web/app-info.json", ($info | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

# Gradle is fetched once into .tools.
$gradleVersion = '8.7'
$gradleHome = "$root/.tools/gradle-$gradleVersion"
$gradle = if ($unix) { "$gradleHome/bin/gradle" } else { "$gradleHome/bin/gradle.bat" }
if (-not (Test-Path $gradle)) {
    New-Item -ItemType Directory -Force "$root/.tools" | Out-Null
    $zip = "$root/.tools/gradle-$gradleVersion-bin.zip"
    Invoke-WebRequest "https://services.gradle.org/distributions/gradle-$gradleVersion-bin.zip" -OutFile $zip
    Expand-Archive $zip "$root/.tools" -Force; Remove-Item $zip
}
if ($unix) { chmod +x $gradle }
if ($env:BILI_ANDROID_JDK) { $env:JAVA_HOME = $env:BILI_ANDROID_JDK } elseif (-not $unix -and -not $env:CI) { $env:JAVA_HOME = 'C:/Program Files/BellSoft/LibericaJDK-18-Full' }
Push-Location "$root/android"
try { & $gradle --no-daemon -q assembleRelease; if ($LASTEXITCODE) { throw "gradle failed: $LASTEXITCODE" } } finally { Pop-Location }

New-Item -ItemType Directory -Force "$root/dist" | Out-Null
$out = "$root/dist/Bili-Space-$($info.version)-android.apk"
Copy-Item "$root/android/app/build/outputs/apk/release/app-release.apk" $out -Force
Write-Output $out
