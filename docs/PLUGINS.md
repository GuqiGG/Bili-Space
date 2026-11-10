# 插件接口

Bili-Space 的插件是一段 JS，可以改主题、改客户端界面（顶栏、菜单、设置页）、改 B 站页面，还能包装客户端在页面里的逻辑。插件里的错误会被隔离：出错的插件只会失去它自己的效果，不会让客户端、其他插件或原生程序崩溃。

## 安装

设置 → 扩展插件 → **导入插件…**，选择下面任意一种：

- **单个 `.js` 文件**：文件开头用注释写清单（`@id` 可省略，会用文件名）：

  ```js
  // @id        blue-theme
  // @name      蓝色主题
  // @version   1.0.0
  // @description 把强调色换成蓝色
  api.theme({ '--accent': '#00aeec' });
  ```

- **插件文件夹里的 `plugin.json`**：整个文件夹会被复制进插件目录。

  ```json
  { "id": "blue-theme", "name": "蓝色主题", "version": "1.0.0", "description": "…", "main": "main.js" }
  ```

导入后立即启用，不用刷新。每个插件都有开关和“删除插件”，开关同样即时生效。插件也可以手动放进插件目录（`%LOCALAPPDATA%\BetterBiliSpace\plugins\<id>\`），然后点“重新加载页面”。

限制：`id` 只能用小写字母、数字和 `.` `_` `-`（最长 40）；入口文件最大 512 KB；最多 32 个插件。

## 插件在哪里运行

客户端有两种视图，插件在每一个里都会运行一次：

- `api.view === 'header'`：常驻的顶栏层（顶栏、菜单、设置页都在这里）。
- `api.view === 'page'`：每个 B 站页面（主页、动态、每个视频页……）。

只想改其中一种时，先判断 `api.view`。插件声明的设置项要在 `header` 里声明，设置页才能显示出来。

## API

| 成员 | 说明 |
| --- | --- |
| `api.id` / `api.manifest` / `api.version` | 插件身份、清单、客户端版本 |
| `api.view` | `'header'` 或 `'page'` |
| `api.theme({ '--accent': '#00aeec', ... })` | 设置主题变量，同时作用于客户端界面和页面。常用：`--accent`、`--bg`、`--ink`、`--muted`、`--field`、`--line` |
| `api.shellCss(css)` | 给客户端界面（顶栏、菜单、设置页）加样式 |
| `api.css(css)` | 给 B 站页面加样式 |
| `api.shell()` | 客户端界面的 shadow root，可以直接改 DOM |
| `api.on(event, fn)` | 事件：`tick`（每秒）、`route`（地址变化）、`video`（视频元素变化）、`settings`（本插件设置变化）、`destroy`（停用前，用来清理）。返回取消函数 |
| `api.settings.define([...])` | 声明设置项，显示在设置页插件卡片里。字段：`key`、`label`、`hint`、`type`（`toggle` / `text` / `number` / `color` / `select`）、`options`、`default` |
| `api.settings.get(key)` / `set(key, value)` / `all()` | 读写设置值；值由客户端保存，所有视图同步 |
| `api.storage.get/set/remove(key)` | 插件私有的本地存储（按网站分开，值最大 64 KB） |
| `api.prefs()` / `api.setPrefs(patch)` | 读取 / 修改客户端设置（和设置页一样经过校验） |
| `api.client()` | 客户端页面逻辑函数的只读列表 |
| `api.wrap(name, (original, ...args) => …)` | 包装客户端页面逻辑函数，比如 `homeBubble`、`acceptConfig`、`chromeActive`。包装函数出错时自动改用原函数 |
| `api.unwrap(name)` | 取消包装 |
| `api.toast(text)` | 显示客户端提示 |
| `api.navigate(url)` | 在当前页面打开地址 |
| `api.getVideo()` / `api.route()` / `api.log(...)` | 当前视频元素、当前地址、带前缀的日志 |

### 往客户端里加东西

这些只在画客户端界面的那个视图里生效（Windows 上是 `header` 视图；没有独立顶栏的平台是页面本身），在其他视图里调用会安静地什么也不做。

| 成员 | 说明 |
| --- | --- |
| `api.ui.button({ text, title, onClick })` | 在顶栏搜索框旁边加一个按钮，返回移除函数 |
| `api.ui.dialog({ title, text, buttons: [{ label, primary, onClick }] })` | 在客户端上弹出对话框（最多 4 个按钮，Esc 关闭），返回关闭函数 |
| `api.ui.root()` | 客户端界面的根节点（同 `api.shell()`），可以自由插入自己的元素 |

### 控制客户端

| 成员 | 说明 |
| --- | --- |
| `api.window.minimize()` / `maximize()` / `fullscreen()` / `pip()` / `close()` | 窗口操作，和客户端自己的按钮一样 |
| `api.window.back()` / `forward()` | 后退 / 前进 |
| `api.navigate(url)` | 打开地址 |
| `api.prefs()` / `api.setPrefs(patch)` | 读取 / 修改任意客户端设置（主题、强调色、顶栏项目、缩放……） |
| `api.wrap(name, fn)` | 改写客户端页面逻辑函数（见上表） |

### 顶栏和页面之间传消息

插件在顶栏和每个页面里各运行一份。用 `api.send(name, data)` 发消息，所有视图里这个插件的 `api.on('message', m => …)` 都会收到 `{ name, data, view }`（`view` 是发送方）。数据必须能转成 JSON，最大 64 KB；只会送到同一个插件。

### 页面和视频

| 成员 | 说明 |
| --- | --- |
| `api.page()` | 当前页面类型：`home`、`video`、`bangumi`、`live`、`dynamic`、`history`、`search`、`space`、`other` |
| `api.watch(selector, fn, 'shell'?)` | 对现在和以后出现的每个匹配元素调用一次 `fn(element)`；第三个参数写 `'shell'` 时监听客户端界面。按帧合并，弹幕再多也不会被拖慢 |
| `api.player.play()` / `pause()` / `seek(秒)` / `rate(倍速)` / `volume(0~1)` | 控制当前视频，没有视频时返回 `false` |
| `api.player.state()` | `{ time, duration, paused, rate, volume, muted, width, height }` |
| `api.biliApi(path, query)` | 以当前登录账号请求 `https://api.bilibili.com/...`，返回解析好的 JSON（只允许这个域名） |

### 更多界面与视频接口

| 成员 | 说明 |
| --- | --- |
| `api.ui.panel({ title, html, width, onClose })` | 窗口右侧的侧边栏面板，返回 `{ element, set(html), close() }`；适合显示 AI 分析结果等长内容 |
| `api.player.frame(maxWidth?, type?, quality?)` | 当前视频画面，返回图片 data URL（默认 JPEG），可以直接交给能看图的 AI |
| `api.video.info()` | 当前视频的 `{ bvid, aid, cid, page, title, desc, duration, owner, cover }`，不在视频页时为 `null` |
| `api.video.subtitles()` | 当前视频的字幕（B 站 AI 字幕或 UP 上传的）：`[{ lang, name, lines: [{ from, to, text }] }]` |

### 会自动清理的工具

| 成员 | 说明 |
| --- | --- |
| `api.hotkey('Ctrl+Shift+K', fn)` | 快捷键；在输入框里打字时不触发 |
| `api.listen(target, type, fn, capture)` | 加事件监听 |
| `api.every(ms, fn)` / `api.after(ms, fn)` | 定时器（重复的最少间隔 50 ms） |

以上每个都返回一个取消函数；插件停用时，它们会全部自动撤销，不用自己在 `destroy` 里清理。

## 完全访问权限（超出客户端沙盒）

插件在清单里声明 `// @grant native`（`plugin.json` 里写 `"grant": "native"`），导入时客户端会弹窗说明它将获得的权限；只有你点“是”，它才能使用 `api.native`。选“否”仍会安装，但 `api.native` 不存在。删除插件会同时收回权限。

| 成员 | 说明 |
| --- | --- |
| `api.native.http(url, { method, headers, body, timeout, responseType })` | 请求任意网址（不受浏览器跨域限制），返回 `{ status, headers, text }`；`responseType: 'base64'` 时返回 `base64`。`body` 可以是字符串或对象（自动转 JSON） |
| `api.native.readFile(path, 'utf8' \| 'base64')` / `writeFile(path, data, { encoding, append })` | 读写任意文件 |
| `api.native.list(path)` / `exists(path)` / `mkdir(path)` / `remove(path)` | 目录操作 |
| `api.native.exec(file, args, { cwd, input, timeout })` | 运行程序（不弹黑框），返回 `{ code, stdout, stderr, timedOut }` |
| `api.native.open(target)` | 用系统默认方式打开文件或网址 |
| `api.native.paths()` | `{ data, downloads, home, temp }`，`data` 是这个插件专属的文件夹 |
| `api.native.secret.get(key)` / `set(key, value)` | 用 Windows 加密保存密钥（例如 AI 服务的 API Key），只有当前 Windows 用户能解开 |

这些都返回 Promise，在后台线程执行，不会卡住界面。

### 安全检查

完全访问权限等于一个普通软件的权限，所以客户端有两道检查：

1. **导入和每次加载时检查代码**：发现明显的恶意写法就拒绝运行，并在扩展插件页显示原因。包括运行加密的 PowerShell 命令、删除系统备份或破坏磁盘、加入开机自启或计划任务、读取浏览器密码/Cookie/钱包/SSH 密钥、读取客户端自己的账号数据或其他插件的密钥、挖矿、用 `eval(atob(...))` 之类方式执行隐藏代码、大段编码隐藏的内容。
2. **执行时再拦一次**：即使代码检查没认出来，`api.native` 也会拒绝读取浏览器密码和本客户端账号文件、往开机启动目录或系统目录写文件、删除整个磁盘或用户文件夹、运行上面那类危险命令。

这些检查只能挡住常见的恶意手法，无法证明一个插件是安全的。**只安装你信任的插件。**

## 示例：AI 视频总结

完整代码见 [`docs/examples/ai-summary.js`](examples/ai-summary.js)：顶栏多一个“AI 总结”按钮，读取当前视频字幕，用你自己的 AI 服务（任何 OpenAI 兼容接口：OpenAI、DeepSeek、通义千问、Kimi……）生成带时间点的要点，显示在侧边栏，点要点跳到对应位置。API 密钥加密保存。

## 示例：可以选颜色的主题

```js
// @id accent-picker
// @name 自选强调色
api.settings.define([{ key: 'color', type: 'color', label: '强调色', default: '#00aeec' }]);
const apply = () => api.theme({ '--accent': api.settings.get('color') });
apply();
api.on('settings', apply);
```

## 示例：改客户端逻辑

```js
// 在主页按 Ctrl+T 时换一句提示
api.wrap('homeBubble', (original) => original('已经在首页了'));
```

## 示例：顶栏按钮控制视频

```js
// @id skip-op
// @name 跳过片头
// 顶栏按钮按下时，让视频页跳过 90 秒
if (api.view === 'header') {
  api.ui.button({ text: '⏭', title: '跳过片头 90 秒', onClick: () => api.send('skip', 90) });
} else {
  api.on('message', (m) => { if (m.name === 'skip') api.player.seek((api.player.state()?.time || 0) + m.data); });
}
```

## 示例：给每个视频卡片加标记

```js
// @id card-mark
// @name 卡片标记
if (api.page() === 'home') {
  api.watch('.bili-video-card', (card) => {
    const tag = document.createElement('span');
    tag.textContent = '★';
    tag.style.cssText = 'position:absolute;top:6px;left:6px;z-index:2;color:#fb7299';
    card.style.position = 'relative';
    card.append(tag);
  });
}
```

## 示例：快捷键切换倍速

```js
// @id speed-key
// @name 倍速快捷键
api.hotkey('Shift+ArrowUp', () => api.player.rate(Math.min(4, (api.player.state()?.rate || 1) + 0.25)));
api.hotkey('Shift+ArrowDown', () => api.player.rate(Math.max(0.25, (api.player.state()?.rate || 1) - 0.25)));
```

## 稳定性与安全

- 插件的入口、事件和包装函数都运行在错误边界里；同一个插件在一个页面里连续出错 20 次会在该页面自动停用。
- 停用插件时，客户端会撤销它的样式、事件和包装，并先发送 `destroy` 事件，让插件清理自己做的其他改动。
- 没有声明并获准 `@grant native` 的插件拿不到任何原生能力（文件、网络、运行程序）；客户端收到的每条页面消息都会校验。
- 插件是本机代码，能读写页面内容和你的 B 站页面数据。**不要安装来源不明的插件。**
