# Observed development corrections

这些是先前真实工具调用观察到的失败摘要，不是最终通过结果。完整最终命令输出在相邻日志与 VERIFICATION.txt；此文件不把失败改写为成功。

| Command / source | Observed exit | Literal error excerpt | Correction |
|---|---:|---|---|
| Python fontTools font inspection | 1 | `ModuleNotFoundError: No module named 'fontTools'` | 使用已安装 PySide6 字体数据库；再用标准库解析 TTF name 表，得到真实 full/PostScript 名称。 |
| scripts/adapt_plugins.py | 1 | `AssertionError` on original route replacement, count `0` | 只对读取到的工作字符串规范化 CRLF，原始字节仍保留。 |
| scripts/adapt_plugins.py | 1 | `AssertionError` on indented `showToast`, count `0` | 匹配实际源码缩进，去除不必要的前导空格条件。 |
| scripts/adapt_plugins.py | 1 | `AssertionError: ('        updateBlacklistCount();', 2)` | 把变更限制在 init 中 `setupObserver()` 相邻调用，未全局替换。 |
| scripts/build.ps1 | 1 | `error: use of undeclared identifier 'SetProcessDpiAwarenessContext'` | 从 user32 动态解析 DPI API，兼容 MinGW headers。 |
| scripts/build.ps1 | 1 | `Missing argument in parameter list.` | PowerShell 中给包含逗号的 linker 参数加引号。 |
| scripts/build.ps1 | 1 | `undefined symbol: _GUID const& __mingw_uuidof<ICoreWebView2_3>()` | 针对 MinGW 使用 Clang 的 UUID 支持，保留 MSVC 编译路径。 |
| scripts/build.ps1 | 1 | `cannot call operator __uuidof on a type with no GUID` | 还原 MIDL_INTERFACE 的 UUID 属性；IUnknown 使用 IID_IUnknown。 |
| npm test | 1 | `ReferenceError: structuredClone is not defined` | 为 jsdom 测试环境提供 Node 原生 structuredClone，生产 Chromium 无须补丁。 |
| scripts/verify_transaction.py | 1 | `assert sha(rebuild/'policy.user.js')==sha(modified)` | Git 在子目录应用补丁时跳过路径；改用明确的目标目录。 |
| scripts/verify_transaction.py | 1 | `patch does not apply` | Windows 全局 autocrlf 影响字节精确校验；重建命令禁用 autocrlf 并指定 binary attributes。 |
| scripts/smoke.py | 1 | `ReferenceError: BiliSpace is not defined` | 刷新后等待真实引导完成，不用固定两秒假设；序列化脚本注册。 |
| scripts/smoke.py | 1 | `AssertionError: Home blocker buttons missing` | 识别真实海外路由 `/zh-Hans`，扩展明确的带语言前缀 UID URL；计数时进入上游拥有的 ShadowRoot。 |

视觉检查发现但非进程失败：PiP 仍显示 BTR 悬浮按钮，上游 inline `all:initial!important` 覆盖样式表，改为进入/退出 PiP 时保存和恢复对应 host 的 inline display。浅色主题预览与红绿灯共用 `.light` 名称，缩小选择器作用域。
