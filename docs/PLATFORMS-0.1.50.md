# 0.1.50 平台适配范围

本分支保留已发布的 0.1.49，新增以下实现与构建验证。

| 平台 | 宿主 | 当前范围 |
| --- | --- | --- |
| Windows 10/11 x64 | WebView2 | 现有功能；返回、收藏封面、账号管理与官方登录卡片修复 |
| Windows 7 SP1 x64 | WebView2 109 | 独立兼容目标，旧版 Loader 固定校验；关闭 WebGPU 可选增强；仍需实际 Win7 机器验收 |
| macOS 14+，Apple 芯片与 Intel | AppKit / WKWebView | Universal 原生应用；系统红绿灯；浏览、收藏、多账号、官方登录卡片 |
| Ubuntu 22.04+ / Debian 12+ | GTK 3 / WebKitGTK 4.1 | 原生 GTK 应用和 DEB；浏览、收藏、多账号、官方登录卡片 |

macOS/Linux 当前不移植 Windows 专属的原生下载队列、Mihomo 管理、SMTC 和原生自动安装更新；相应入口隐藏。它们是原生基础客户端，尚不等同于 Windows 的全部功能。Mac 包暂为本地签名，未进行 Developer ID 公证。

## 登录与账号

- 登录卡片使用 B站官方页面，保留官方展示的扫码、密码、短信和第三方登录入口。第三方提供方禁止 iframe 时，在同一浏览器资料中的原生小窗口完成授权。
- Windows 仅备份 B站域 Cookie，用当前 Windows 用户的 DPAPI 加密。页面只收到账号名称、头像和 UID，不会收到 Cookie 或密码。
- macOS 使用独立的持久化 `WKWebsiteDataStore`；Linux 使用独立 WebKit 资料目录。元数据文件不导出 Cookie。
- “添加账号”保留当前账号；“退出当前账号”清除当前资料的本机 B站登录并移除已保存入口。不同浏览器或其他设备的登录不受该本机操作影响。
- 第三方账号的实际授权仍取决于 B站和提供方的可用性，需要用户自行完成验证；自动测试不提交密码、短信或真实授权。

## 构建

Windows：`scripts/build.ps1`。Win7 兼容包：`scripts/build_win7.ps1`，需要先准备主工具链；目标机另需 Microsoft WebView2 Runtime 109。

macOS：`cmake -S . -B build/macos '-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64' -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0`，再执行 `cmake --build build/macos`。需要 Xcode Command Line Tools、Node、Python 和 CMake。

Linux：安装 `python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1`，执行 `python3 scripts/package_linux.py`。可通过 `BILI_SPACE_RESOURCES=build/linux-package/usr/lib/bili-space /usr/bin/python3 src/linux_main.py` 启动。

三个原生宿主的构建与基础启动测试由 `platforms-0.1.50.yml` 执行。WebKit 自检使用不包含用户登录的本地页面，不能代替实机媒体播放及全部第三方提供方的最终验收。
