<p align="center"><img src="assets/branding/bili-space.png" width="180" alt="Bili Space"></p>
<h1 align="center">Bili Space</h1>
<p align="center">更纯粹的 B 站桌面体验 · 为观看留出空间</p>
<p align="center"><b>Windows x64 / C++20 / WebView2 / 本地 AI</b><br>Source available · Noncommercial</p>

---

## 熟悉的播放，更好的外壳

保留官网登录、弹幕和播放器，搭配简洁的原生桌面外壳。没有 Electron，也不重新发明不兼容的播放体验。

| 观看 | 个性化 | 随时回来 |
| --- | --- | --- |
| Anime4K GPU 超分 / RIFE 光流补帧 | 深浅主题、顶部栏、分区选择 | 托盘双击唤起 |
| 无标题栏画中画 | 自由缩放与紧凑布局 | 关闭驻留、右键退出 |
| 推广清理、首页一键拉黑 | 进度条与播放栏融合 | 重复启动唤起已有窗口 |

## 开始使用

在 Releases 下载 Windows x64 包，**完整解压**后运行 `BetterBiliSpace.exe`。需要 Microsoft Edge WebView2 Evergreen Runtime。不要只复制 EXE；模型、资源和 DLL 需要一同保留。

- 关闭主窗口驻留系统托盘，双击打开，右键退出；没有设置开机自启。
- AI 视频帧本地处理，不上传。需要 WebGPU，60/120 fps 是呈现目标，不是性能保证；运动遮挡可能产生伪影，不可用时恢复原始播放。
- 线程撕裂者保留引擎，关闭浮动小球；一键拉黑仅保留首页功能。
- 可选 Mihomo 代理默认关闭。不保证免费候选可信或能观看地区限定番剧，建议使用自己的可信节点；不修改系统代理。

## 开发

```powershell
python scripts/bootstrap.py
npm ci
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
npm test
python scripts/package.py
```

bootstrap 仅准备编译工具链。AI 模型、运行时与插件需要按 `vendor/runtime.lock.json`、`vendor/rife-model.json` 和 `vendor/plugins.lock.json` 的来源与校验值准备。开发日志、账号资料和测试目录不公开。

## 许可

自有代码和资产采用 **PolyForm Noncommercial 1.0.0**，不授权商业用途；这是源码可用许可，不是 OSI 开源许可。第三方依赖仍遵循各自许可，见 [LICENSE](LICENSE) 与 [第三方声明](THIRD_PARTY_NOTICES.md)。

无作者署名。独立第三方客户端，与哔哩哔哩无隶属或官方认可关系。商标和内容属于各自权利人，不绕过付费或会员授权。

[更新记录](docs/CHANGELOG.md)

## 0.1.8 播放增强修订

超分使用 Anime4K WebGPU CNN（性能 CNNx2M / 质量 CNNx2UL），不是 Kazumi 的 mpv 后端。补帧从原始视频取帧，再将合成帧交给 GPU 超分，取消旧 CPU ×3 像素重建链路。补帧按源时间戳呈现，约33ms缓冲加推理开销；实际稳定性仍需要真实站点长时间验证。

## 0.1.9 补帧时序候选修订

补帧按固定短缓冲和有界完成队列呈现；仅显示原帧和 RIFE 真实中点，不再将中点光流近似为任意时刻。30fps源的AI ×2为60个不同画面，120Hz只代表显示目标。此修订仍需真实网站复测，不保证所有视频无抖动。

[通用超分模型调研（未接入）](docs/GENERAL-SR-MODELS.md)：优先比较 realesr-general-x4v3，不将 Anime4K 当作真人/游戏内容的通用默认。

## 0.1.10 剪贴板与简介链接

客户端运行时监听新复制的 BV 号或 bilibili.com/video 链接并跳转，保留数字 t / p 参数；不读取启动前的剪贴板，不记录内容，不主动弹出窗口。设置 → 外观可关闭。简介里的 HTTP(S) 链接变蓝，点击交给系统默认浏览器；只修复明确属于 lanzou[a-z]?.com 域名中的中文/表情干扰，保留其他文字、表情和正常国际化域名。不猜测 ASCII 字母干扰或任意网站真实地址，不自动访问提取出的链接。

## 0.1.11 通用域名干扰清理

简介链接清理不再限于蓝奏：域名中混入中文或表情时，若移除后仍是完整 ASCII 域名则生成清理后的蓝色链接。纯中文域名、路径/参数的中文和链接外表情保留；混合文字真实国际域名与人为干扰无法完全自动区分，请核对显示的目标域名。ASCII 字母干扰和路径干扰不猜测删除。
