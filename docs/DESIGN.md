# Bili-Space 设计思路

这份文档记录软件「为什么这样做」：定位、交互原则、架构、插件与安全模型，以及已经被否决、不要再做的方案。改动之前先读一遍；做了新的取舍就补进来。

## 1. 定位

- **你的最后一款 B 站客户端**：保留官网的登录、播放器、弹幕和推荐，不重新发明播放器。我们只做外壳和增强。
- **主打高度自定义**：能让用户自己决定的就做成设置，并且尽量用拖动条、实时预览，而不是写死的几档。外观、顶栏、首页、播放相关的细节都集中在「个性化」里。
- **轻**：C++20 + WebView2，不用 Electron。没有用处的常驻开销都要砍：离屏暂停循环、事件驱动的顶栏、弹幕和直播聊天不触发页面扫描、精简打包。
- **尊重老用户**：每次大改都要让老用户「有感觉」，同时给他们保留原样的选项（例如欢迎引导里的「还是现在好」）。
- **国内外网络都要能用**：不要强制跳 `/zh-Hans` 等语言路由。在海外 IP 下那会打开没有「换一换」的海外版首页（`localeRedirect` 返回空）。

## 2. 交互与视觉原则

- **参考体系**：Apple HIG 风格，克制、内容优先、外壳安静。颜色以中性色为主，只有一个强调色（用户可选），状态色只用于状态。
- **动画**：
  - 只动 `transform` 和 `opacity`（或 filter 这类合成层属性），不动布局。
  - 统一缓动：`cubic-bezier(.32,.72,0,1)`。进入 300–450ms，离开 240–260ms。新的操作会立刻结束上一段动画，不排队。
  - 一定要尊重「减少动态效果」：系统开了就直接切换或只做淡入淡出。
  - 动画结束后要清理保持态（`fill:'forwards'` 的动画要 cancel）。否则往回切换时会留下透明页面，0.1.62 修过一次。
- **一页一事**：引导、对话框都是一屏只有一个焦点、一个主按钮。设置项多就分页，不要一页塞满。
- **选了就生效**：设置和引导里的选项立即应用、实时预览，不需要「保存」按钮。
- **可以退出、可以后退**：任何流程都要能「上一步」和「跳过」。
- **不用 emoji 当图标**：图标风格统一。弹窗只用于需要决定的事。
- **文字**：中文，简短，按钮用动词。更新日志写给用户看：说明好处，不写实现，不用 `**`（日志原样显示在应用内更新弹窗里）。

## 3. 架构

- **Windows 主程序**：`src/main.cpp`（Win10/11 x64，另有 Win7 目标）。由 zig c++ 编译，CMake 也可。
- **WebView2 composition 宿主**：
  - 用 DirectComposition 组合两层视图：顶栏层 `CHROME_VIEW`（`https://www.bilibili.com/__bili_space_chrome__`，透明，负责顶栏、设置、弹窗、引导）和页面层 `CONTENT_VIEW`（B 站页面，可多个标签）。
  - 点击由 `chrome-layout` 上报的矩形和 modal 状态决定落到哪一层。
  - 顶栏层只有报告过的区域能接到点击，其余地方会穿透到网页。凡是在顶栏页面里显示的东西都要报告，包括不在客户端界面里、由别的脚本打开的窗口（登录面板、线程撕裂者设置等）；模态 `<dialog>` 按整窗处理，已关闭的 dialog 要跳过。
  - 视频网页全屏时，左下角的设置、上传悬浮按钮要隐藏，不能挡住播放器控制栏。
  - 文字缩放 = RasterizationScale × Windows「文本大小」(TextScaleFactor)，实时跟随系统设置。
- **客户端脚本 `assets/enhance.js`**：
  - 同一份脚本同时注入两层视图，用 `CHROME_VIEW` 和 `CONTENT_VIEW` 区分。
  - 调用原生功能：`native(type, payload)`。原生调用页面：`executeEverywhere`、`pluginsBroadcast`、`execute`。
  - 设置 `PREFS` 的默认值在 `DEFAULTS`（JS）和 main.cpp 的默认配置里两边都要加，并在原生端做范围校验，例如 `settingsZoom` 80–160、`downloadConnections` 1–512。
- **页面缩放**：用户用 Ctrl+滚轮等方式手动设置的缩放（`manualZoom`）要在调整窗口大小、最大化、全屏、保存设置之后都保留，只有改缩放设置本身才会覆盖它。
- **全屏**：
  - 默认是原生的普通切换。
  - 从最大化窗口进入视频全屏时，先去掉 `WS_MAXIMIZE`，否则任务栏会露出来；退出后再恢复最大化。
  - 「全屏动画」只是**实验性**选项：默认关闭，开启时有警告弹窗。
- **其他平台**：Linux（`src/linux_main.py`）和 macOS（`src/macos_main.mm`）尽量跟随 Windows 的功能，版本号同步。
- **安卓**（`android/`，`scripts/build_android.ps1` 生成 `dist/Bili-Space-<版本>-android.apk`）：WebView 打开电脑版 B 站（桌面 UA、宽视口），注入和 Linux 同一份 `renderer.js`，`window.chrome.webview` 由 JS 接口模拟。客户端自带文件从 APK 里以 `https://bili-space.local/` 提供。软件内更新读 GitHub 最新 Release 里的 `.apk`，下载后交给系统安装器。版本号跟随 `assets/app-info.json`。暂用 debug 签名，换签名会导致无法覆盖安装。
- **非 Windows 的软件内更新**：都读 GitHub 最新 Release，用 GitHub 记录的 sha256 校验下载。Linux 下载 `-linux.deb`，用 `pkexec apt-get install` 安装后自动重启；macOS 下载 `-macos-universal.zip`，退出后由一个 shell 脚本替换 `.app` 并重新打开（App 所在目录不可写时提示手动更新）；安卓下载 `.apk` 交给系统安装器。发布流程里有安卓任务，Release 会带上 APK。
- **鸿蒙**：鸿蒙 NEXT 需要 DevEco Studio 和 ArkTS 工程，尚未开始；老鸿蒙（2–4）可以直接装安卓 APK。
- **测试**：
  - `npm test` 是 node 单元测试。
  - `Bili-Space.exe --test` 会打开 CDP 端口 9223。它从 `bili-space.local/fixture.html` 启动，需要真实页面的检查要先导航到 bilibili.com。

## 4. 插件与安全

- 插件 API 详见 [PLUGINS.md](PLUGINS.md)，示例见 `docs/examples/`。原则是「整个软件都能被插件控制、加东西」：顶栏按钮、对话框、侧边面板、窗口、播放器、B 站接口、快捷键、定时器、视频信息和字幕等都开放。插件停用时，它注册的一切都要自动清理。
- **完整权限**：插件声明 `@grant native` 并在导入时经用户同意后，可以访问任意网址、读写文件、运行程序、用 DPAPI 加密保存密钥（实现在 `src/plugin_native.hpp`）。
- **防冒充**：
  - 每次运行生成随机 `PLUGIN_TOKEN`，只注入客户端自己的脚本。
  - `postNative` 在页面脚本运行前就捕获好。
  - `BiliSpacePlugins` 对象冻结、不可写。
  - 原生端只接受带正确 token 的插件消息。
  - B 站网页上的脚本不能伪装成插件。
- **防恶意**：
  - 导入和加载时做静态风险扫描（`pluginRisk`），可疑的直接拒绝。
  - 运行时由 `nativeGuard` 拦截危险操作，例如读账号数据、浏览器密码库。
- **顶栏层是特权视图**：任何来自网络的文字（订阅节点名、提示信息等）插入它之前都必须 `escapeHtml`。
- **原生消息处理**：异常不能逃出 WebView2 回调，否则整个程序会退出，所以畸形消息要先拒绝。

## 4.5 反馈

- 入口：托盘菜单「反馈问题…」和 设置 → 关于与更新。
- 字段：类型、内容；邮箱可选，不填开发者就没法回复；系统信息可选，不含账号、Cookie 和浏览记录。
- 发送：客户端原生 `POST https://bili.gvqi.top/feedback`（JSON），服务器转成 ntfy 推送（主题 feedback）给开发者，不发邮件。
- 客户端里不放任何邮箱或推送凭据。反馈次数不限，但每次间隔至少 30 秒：客户端自己限制，服务器按 IP 用同样的 30 秒间隔兜底，没有每日上限。返回 2xx 算成功，429 提示「半分钟后再试」。

## 5. 欢迎引导（0.1.62）

- 新安装（`RUNTIME.firstRun`）显示「欢迎」，升级用户显示「软件大翻新」。只显示一次（`onboardingSeen`），「重置设置」后也不会再弹。
- 流程：
  1. 展示页：官网宣传图和当前首页截图轮播。
  2. 每页设置一项：主题、强调色、字体、动效、顶栏、首页每行、页面缩放、设置字号、页面净化、声音、关闭窗口方式。
  3. 完成页：引导去「个性化」继续细调。
- 引导期间背后整个客户端全模糊：顶栏层用 backdrop-filter，页面层用 `tourBackdrop` 给 body 加 filter。关闭时卡片先淡出，背景再约 1.1 秒慢慢变清晰，露出配好的样子。
- 老用户在跳过的位置看到「还是现在好」，选了就保留全部现有设置。

## 5.5 更新公告

- 每个版本在安装包里带自己的公告（`assets/whats-new/`），离线也能看。
- 新版本第一次启动时弹一次；新安装的用户在欢迎引导结束后再弹。
- 可以用按钮、圆点或左右键翻页，用 ×、Esc 或「知道了」关闭。看过的版本记在 `whatsNewSeen` 里。设置 → 关于与更新可以重新打开。
- 每页高度一致，翻页时窗口不跳。图片区保持 16:9，并按窗口高度缩小。

## 6. 否决过的方案（不要再做）

- **启动时的屏外窗口 + 从小电视展开的启动动画**：用户觉得难看。保留原来窗口内的启动页。
- **默认全屏防闪烁覆盖层和全屏放大动画**：多轮修复后仍会闪烁，已删除默认路径，只作为实验选项保留。不要再加回默认路径。
- **强制语言路由 `/zh-Hans`**：会丢失「换一换」。
- **会员 / 打赏 / 赞助类彩蛋和入口**：已删除，不要再加。B 站原生的「充电」按钮要保留，不要隐藏。
- **超分、补帧的 ONNX/RIFE/ESPCN 链路**：为了包体和性能已移除。

## 7. 协作约定（给开发助手看）

- 回复和更新日志用中文。
- 提交和 PR 不加 AI 署名或共同作者。
- 只有用户说「发布 / release」时才推送到发布分支 `codex/navigation-accounts-platforms`，因为推送会触发 CI 构建。平时提交只推到工作分支，或者只留在本地。发布成功不用通知，失败才告诉用户。
- 发布步骤：
  1. 在 CMakeLists.txt、assets/app-info.json、package.json、package-lock.json、src/app.rc（两处字符串和逗号形式）、src/app_info.hpp、src/linux_main.py、src/macos_main.mm 里改版本号。
  2. `git mv .github/workflows/platforms-<旧>.yml platforms-<新>.yml`，并替换文件里的版本号。
  3. 写 `docs/RELEASE-<版本>.md`。
  4. 更新公告：改 `assets/whats-new/whats-new.json` 的 `version` 为新版本，并写好每一页（`title`、`text`，`media` 可以是 mp4/webm/gif/png/webp，或者用 `items` 列一组要点）；配图放在同一目录，可以用 `scripts/record_whats_new.py` 从测试窗口录。版本号对不上时公告不会弹出。
  5. 提交信息带 `[release-<版本>]`，推送到 `codex/navigation-accounts-platforms`，等 GitHub 上的构建和发布全部完成。
  6. 发布完成后，把发布分支合并进 master（`git merge --no-ff`），再推送 master。master 是仓库首页显示的分支，发布脚本会往 master 写每个版本的更新清单，所以必须等发布结束再合并；合并时保留 master 上的 `update-site/public/updates/windows-x64.json`。这样首页的源码始终是最新版。
  7. 只改文档、不需要构建的提交，在提交信息里加 `[skip ci]`。
- 不要改动 `D:\Bili-Space`（用户自己装的那份），除非用户要求。
- 测试绝不发送系统级键鼠输入（keybd_event、mouse_event、SetCursorPos），只用 CDP 操作测试窗口。用户在玩游戏时不要弹出测试窗口。
- 不打印、不保存 GitHub token。不要使用裸 `git stash`。
