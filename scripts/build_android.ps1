# Builds the Android APK into dist/. Needs the Android SDK (platform 34), a JDK 17-21 and node/python for the shared renderer.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$web = Join-Path $root 'android\app\src\main\assets\web'
if (Test-Path $web) { Remove-Item $web -Recurse -Force }
New-Item -ItemType Directory -Force $web | Out-Null

# The same renderer bundle as Linux; the client's own files are served at https://bili-space.local/ from the APK.
python (Join-Path $root 'scripts\build_web_bundle.py') --output $web | Out-Null
$renderer = Join-Path $web 'renderer.js'
[IO.File]::WriteAllText($renderer, [IO.File]::ReadAllText($renderer).Replace('bili-space://assets/', 'https://bili-space.local/'), (New-Object Text.UTF8Encoding $false))
$assets = Join-Path $web 'assets'; New-Item -ItemType Directory -Force $assets | Out-Null
foreach ($dir in 'fonts', 'onboarding', 'whats-new', 'web-copy', 'branding') { Copy-Item (Join-Path $root "assets\$dir") $assets -Recurse -Force }
foreach ($file in 'tv.svg', 'search-quips.txt', 'startup.html') { Copy-Item (Join-Path $root "assets\$file") $assets -Force }

$info = Get-Content (Join-Path $root 'assets\app-info.json') -Raw -Encoding utf8 | ConvertFrom-Json
$info.platform = 'android'; $info.updateUrl = ''
$info.releaseName = "Bili-Space $($info.version) · 安卓版 | 你为什么这么做"
[IO.File]::WriteAllText((Join-Path $web 'app-info.json'), ($info | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

# Gradle is fetched once into .tools.
$gradleVersion = '8.7'
$gradleHome = Join-Path $root ".tools\gradle-$gradleVersion"
if (-not (Test-Path "$gradleHome\bin\gradle.bat")) {
    $zip = Join-Path $root ".tools\gradle-$gradleVersion-bin.zip"
    Invoke-WebRequest "https://services.gradle.org/distributions/gradle-$gradleVersion-bin.zip" -OutFile $zip
    Expand-Archive $zip (Join-Path $root '.tools') -Force; Remove-Item $zip
}
if (-not $env:BILI_ANDROID_JDK) { $env:BILI_ANDROID_JDK = 'C:\Program Files\BellSoft\LibericaJDK-18-Full' }
$env:JAVA_HOME = $env:BILI_ANDROID_JDK
Push-Location (Join-Path $root 'android')
try { & "$gradleHome\bin\gradle.bat" --no-daemon -q assembleRelease; if ($LASTEXITCODE) { throw "gradle failed: $LASTEXITCODE" } } finally { Pop-Location }

New-Item -ItemType Directory -Force (Join-Path $root 'dist') | Out-Null
$out = Join-Path $root "dist\Bili-Space-$($info.version)-android.apk"
Copy-Item (Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk') $out -Force
Write-Output $out
