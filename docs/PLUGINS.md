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

## 稳定性与安全

- 插件的入口、事件和包装函数都运行在错误边界里；同一个插件在一个页面里连续出错 20 次会在该页面自动停用。
- 停用插件时，客户端会撤销它的样式、事件和包装，并先发送 `destroy` 事件，让插件清理自己做的其他改动。
- 插件 API 不提供原生能力（下载、更新、窗口、文件系统）；客户端收到的每条页面消息都会校验。
- 插件是本机代码，能读写页面内容和你的 B 站页面数据。**不要安装来源不明的插件。**
