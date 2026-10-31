# 插件接口

Bili-Space 支持把本地 JS 插件注入页面，用来加样式、加交互、监听播放状态。插件只跑在网页上下文里，**不会拿到 native 桥**（下载、更新、窗口、代理等能力都不暴露）。

## 目录与清单

插件放在用户数据目录下：

```
%LOCALAPPDATA%\BetterBiliSpace\plugins\<插件id>\
  plugin.json
  main.js
```

`plugin.json`：

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "示例：给播放器加一条边框",
  "main": "main.js"
}
```

- `id` 只能用小写字母、数字与 `.` `_` `-`，最长 40 字符，同时用作存储命名空间。
- `main` 只能是文件名，不能带路径；默认 `main.js`。
- 单个入口文件上限 512 KB，`plugin.json` 上限 16 KB，最多加载 32 个插件。

## 入口代码

`main.js` 的内容会被当作函数体执行，签名等价于：

```js
function main(api) {
  // 你的代码
}
```

示例：

```js
api.css('.bpx-player-video-wrap{outline:2px solid #fb7299;outline-offset:-2px}');

const seen = api.storage.get('runs') || 0;
api.storage.set('runs', seen + 1);
api.log('loaded', seen + 1, 'times');

api.on('tick', () => {
  const video = api.getVideo();
  if (video) document.title = '插件在听 · ' + Math.floor(video.currentTime) + 's';
});
```

## API

| 成员 | 说明 |
| --- | --- |
| `api.id` / `api.manifest` | 当前插件身份与清单（只读） |
| `api.version` | 客户端版本号 |
| `api.log(...)` | 带插件前缀的 console 输出 |
| `api.storage.get/set/remove(key)` | 每插件独立命名空间（`bs-plugin:<id>:`），值上限 64 KB |
| `api.css(text)` | 注入/替换一段 `<style data-bs-plugin="id">` |
| `api.on(event, handler)` | 事件：`tick`（每秒）、`route`（URL 变化）、`video`（video 元素变化）、`destroy`。返回取消函数 |
| `api.getVideo()` | 当前 `<video>` 元素或 null |
| `api.route()` | 当前页面 URL |
| `api.prefs()` | 客户端设置快照（只读副本） |

限制：每个事件最多 20 个监听；`storage` 键最长 80 字符；插件抛出的异常会被隔离并记录，不会影响其他插件或客户端本身。

## 启用、禁用与排错

设置 → 扩展插件 → 插件：可以看到已加载插件、开关、插件目录入口和"重新加载页面"。开关保存到客户端设置（`pluginsDisabled`），刷新页面后生效。

加载失败的插件会显示"加载失败"，具体报错在开发者工具控制台；`plugin.json` 不合法的插件会被跳过并在面板里说明原因。

## 安全边界

插件是**本机可信代码**，与直接修改 `assets/` 等价：它能操作页面 DOM、发网页请求、读页面 localStorage。它**拿不到**客户端 native 能力，但也不构成安全沙箱——不要安装来源不明的插件。
