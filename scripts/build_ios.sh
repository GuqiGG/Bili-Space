#!/bin/bash
# 打一个没签名的 iOS 安装包 releases/Bili-Space-<版本>-ios-unsigned.ipa，用户自己用 AltStore、Sideloadly 等签名安装。
# 只能在装了 Xcode 的 macOS 上跑（CI 的 macOS 任务里）。
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
APP=build/ios/Payload/Bili-Space.app
rm -rf build/ios && mkdir -p "$APP" releases

# 和 Mac 版同一份页面脚本；客户端自己的文件从 bili-space://assets/ 读
python3 scripts/build_web_bundle.py --output "$APP" >/dev/null
cp assets/app-info.json "$APP/"
mkdir -p "$APP/assets"
cp -R assets/fonts assets/onboarding assets/whats-new assets/branding assets/i18n "$APP/assets/"
cp assets/tv.svg assets/search-quips*.txt "$APP/assets/"

xcrun -sdk iphoneos clang -arch arm64 -miphoneos-version-min=15.0 -fobjc-arc -O2 \
  -framework UIKit -framework WebKit src/ios_main.m -o "$APP/Bili-Space"

ICON=assets/branding/bili-space.png
sips -z 120 120 "$ICON" --out "$APP/AppIcon60x60@2x.png" >/dev/null
sips -z 180 180 "$ICON" --out "$APP/AppIcon60x60@3x.png" >/dev/null
sips -z 152 152 "$ICON" --out "$APP/AppIcon76x76@2x~ipad.png" >/dev/null
sips -z 167 167 "$ICON" --out "$APP/AppIcon83.5x83.5@2x~ipad.png" >/dev/null

sed "s/__VERSION__/$VERSION/g" scripts/ios-Info.plist > "$APP/Info.plist"
plutil -lint "$APP/Info.plist"
plutil -convert binary1 "$APP/Info.plist"

(cd build/ios && zip -qr "../../releases/Bili-Space-$VERSION-ios-unsigned.ipa" Payload)
ls -l "releases/Bili-Space-$VERSION-ios-unsigned.ipa"
