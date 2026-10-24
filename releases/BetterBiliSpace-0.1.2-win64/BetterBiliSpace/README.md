# Better Bili Space

Windows 原生 **C++20 / Win32 / WebView2** B站客户端，保留官网播放器、弹幕与登录流程。不是 Electron，也不是一张静态设计稿。

## 0.1.2 顶部栏定制

- 首页保留导航入口；`bili space` 按顶部栏的几何中心居中，不受左右按钮数量影响。
- 绿灯内部改为最大化方框；红黄绿内部符号在悬停/键盘聚焦时渐显，离开后渐隐。减少动态效果设置下即时切换。
- 消息按钮使用用户提供的原始 `message-square-more.svg`，跳转到 B站消息页。
- 视频网页内容区新增独立“首页”链接，即使关闭客户端顶部首页入口仍可返回首页。
- 设置新增“顶部栏”：可分别显示/隐藏首页、动态、历史、居中标题、搜索、消息、头像/登录、后退；即时保存，重启保留。窗口红黄绿控制不可隐藏。
- 小窗口使用两行顶部布局，避免居中标题挤压搜索和按钮。

## 0.1.1 修复

- 红黄绿按钮改为居中的矢量符号，避免不同字体基线造成错位。
- 登录状态通过 B站官方 nav 接口读取真实头像；搜索栏右侧增加站内消息入口。网络读取失败时不伪造头像。
- 导航高亮跟随当前 URL（含海外路径、动态域名及 SPA 路由），历史/动态不再错误高亮首页。
- 移除官网导航的占位容器，分别收紧历史、动态、搜索和视频页顶部间距。
- 移除推广轮播后重排旧版首页推荐网格；关闭频道后不再保留轮播槽位，保留普通直播卡片。
- 深色模式补齐频道、筛选/历史按钮、动态卡片、直播卡片、播放器周边及弹幕输入；移除播放器外围白色阴影。
- 搜索词从 URL 恢复；隐藏官网重复搜索输入框但保留搜索分类；Enter 后显示加载旋转图标与细进度条，导航完成/失败后停止。系统减少动态效果设置下改为静态加载提示。
- 正式配置和 Cookie 沿用原路径，不触碰已运行的旧版本，也不要求重新创建账号。

## 运行

双击 `dist/BetterBiliSpace.exe`。保留同目录的 `WebView2Loader.dll` 与 `assets/`，不要只移动 exe。

- Windows 10/11 x64；需要 Microsoft Edge WebView2 Evergreen Runtime。
- 已安装的抖音美好体使用其真实字体名称 **DouyinSans Bold / DOUYINSANSBOLD-GB**；不打包或再分发字体。
- 登录在 B站官方页面完成。Cookie、偏好及插件设置保存在 `%LOCALAPPDATA%/BetterBiliSpace/`，与系统浏览器相互独立。
- 左下角齿轮打开设置；`Ctrl+,` 同样可用。F5 刷新。

## 这一版

- 去掉操作系统标题栏；左上角红/黄/绿按钮关闭、最小化、最大化。拖动顶部空白区域移动窗口，边缘缩放。
- 使用两个用户提供的 SVG；左下角客户端设置，播放器分辨率左侧星光超分入口。
- 深色 / 浅色 / 跟随系统、强调色、界面缩放和字体开关。
- 进度条颜色、高度、圆角、拖动圆点、常显控制条；不替换原生拖动和时间预览。
- 首页频道区显隐；保留频道节点，按开关隐藏。
- 非破坏式广告隐藏：首页推广轮播、赛事与下载入口、视频下方横幅、视频右侧明确的广告/运营容器。根据广告标识与投放 URL，不把普通视频或评论里的“广告”字样当成广告。
- **Bilibili 线程撕裂者**：固定上游 2026.10.24.1，本地集成用户脚本及必要 GM 存储适配。BTR 自身设置可从客户端设置打开。开关后刷新生效。不绕过会员、地区限制或 DRM。
- **一键拉黑**：保留上游官方黑名单接口实现，仅首页推荐按钮；兼容 `/zh-Hans` 等海外首页及带语言前缀的 UP主页 URL。搜索页、视频页按钮、隐藏直播、插件广告过滤、插件菜单均禁用。广告由客户端自己的开关管理。
- **无标题栏画中画**：复用当前播放窗口，切换为置顶无边框小窗，不重新加载视频。只显示视频与悬停后的返回/暂停操作，隐藏 BTR 悬浮球。Esc 或右下角“返回”恢复窗口。**这一版不是同时保留主窗口浏览的双窗口 PiP。**
- **GPU 空间增强**：WebGL 实际读取解码帧，缩放并进行自适应边缘锐化；性能模式 5 采样 / 最高 30fps，质量模式 9 采样 / 最高 60fps。支持 1×锐化、2×、3×目标倍率。受 GPU 最大纹理尺寸及 4K 像素预算限制，显示真实输出尺寸和实际倍率。**不是 AI 模型超分、RTX VSR 或 AMD 驱动超分。**
- GPU 失效、跨域不可读、受保护视频或源尺寸超过预算时保留原生播放，并显示失败原因。

## 构建

本机没有现成 C++ 编译器，因此工具链只下载到项目 `.tools/`，不改系统 PATH、不安装全局编译环境。

```powershell
python scripts/bootstrap.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
```

固定 Zig 0.13.0、WebView2 SDK 1.0.3537.50；下载文件检查固定 SHA256。也提供 CMake 配置，已有 MSVC/Clang + Windows SDK 时可以使用。WebView2 SDK 路径通过 `WEBVIEW2_SDK` 指定。

## 验证

```powershell
npm ci --ignore-scripts
npm test
python scripts/verify_transaction.py
python scripts/smoke.py
python scripts/regression_ui.py
```

- `npm test`：DOM 清理、正常内容保留、设置、字体配置、播放器控件位置、PiP 状态、GPU 不可用降级、增量广告，以及拉黑插件路由/UID 策略。
- `smoke.py`：**启动已编译 C++ exe**，用测试专用的 localhost CDP 接口验证 WebView2 真实渲染、BTR 启动、字体加载、设置原生落盘、GPU 输出帧、实际 HWND 无标题栏与置顶、GPU 上下文丢失降级及匿名官网首页按钮。测试模式使用 `dist/.appdata/`，不接触正式用户 Cookie。
- `regression_ui.py`：在原生 WebView2 内用明确标注的页面 DOM 样本与模拟登录接口，验证五类页面布局、头像、消息链接、红绿灯几何中心，以及真实 Enter 按键和原生搜索导航。**模拟头像不是你的账号头像，也不声称已验证你的登录态。**
- 正常启动**不开放调试端口**。测试模式 `--test` 会开放本机 9223 端口，勿在测试中登录真实账号。
- `verification/smoke.json` 保存观察值；PNG 是运行截图，本地 fixture 均明确标识，不冒充官网数据。
- `verification/VERIFICATION.txt` 是 JSON 格式证据账本；包含 BASELINE、MODIFIED、ROLLBACK 原始 stdout/stderr、退出码与哈希。
- `verification/blocker.home.patch` 是字节精确的 Git binary patch，保留原插件并扩展 UI/native 改动；`verification/ROLLBACK.sh TARGET_COPY` 恢复原插件，`verification/ROLLBACK.sh TARGET_COPY ui` / `native` 恢复 0.1.0 的界面/原生源码；`ui-v0.1.1` / `native-v0.1.1` 恢复本次修改前的 0.1.1。请只对副本使用。
- `third_party/` 中上游 checkout 未改动；`verification/blocker.original.user.js` 保存原始字节。项目自用适配在 `assets/blocker.home.user.js`。

真实账号登录、会员片源、账号拉黑写入及不同海外网络吞吐仍需用户环境验收；测试没有替用户执行拉黑。广告规则依赖网站 DOM，网站更新后可能需要维护。

## 来源与许可

- [Bilibili-thread-ripper](https://github.com/MrTangLuyao/Bilibili-thread-ripper) — MIT，原样分发，commit 见 `vendor/plugins.lock.json`。
- [bilibili-1-click-blocker](https://github.com/codertesla/bilibili-1-click-blocker) — MIT，仅首页适配及海外路径修正，修改记录见补丁。
- [WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/) — Microsoft WebView2 SDK，使用其分发条款。
- [nlohmann/json](https://github.com/nlohmann/json) — MIT，许可保留于头文件。
- 用户提供的 SVG 保留源文件署名信息。

非 B站官方产品，账户和视频权限仍由 B站处理。
