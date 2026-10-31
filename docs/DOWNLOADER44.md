# 下载器 44 · 原生协议与验收

本地开发补充，未创建 Release。

## Native / WebView 契约

- `download-queue / enqueue`：`items:[{bvid,cid,p,title,representation?}]`，最多 200 项。首次选目录，串行运行任务，单任务内部有限并发。
- `download-queue / status|pause|resume|retry|cancel|remove`，单项传 `id`。`pause/resume` 不传 id 操作整个队列。移除仅删除任务与其私有断点，不删除已完成 MP4。
- 回调 `window.BiliSpace.acceptDownloadQueue({items,paused,activeId,resolvingId,directory,message})`。
- 状态：`pending,resolving,downloading,merging,paused,failed,completed,cancelled`。
- Native 请求 `window.BiliSpace.resolveQueuedDownload(item)`；WebView 用当前登录权限取 fresh playurl，回 `{type:'download-plan',queueId:item.id,planToken:item.planToken,url,audioUrl,representation}`，失败回 `error`。`planToken` 用于拒绝旧页面/过期解析回调，不能省略。
- `representation` 只保存 video/audio 的数值 id、codecid、bandwidth、width、height；侧写不保存 URL、签名 query、cookie。
- 再启动所有未完成任务暂停，显式继续后重新解析 URL。解析失败不阻塞后续任务。旧单下载 API 保留。

## 断点与并发边界

`downloadConnections` 默认 4，可选 1/2/4；单任务最多 4 个 Range worker，DASH 视频与音频各分到 2 个，不额外开启不受控文件级并发。

- 新轨只在 HEAD 成功、有明确总长、`Accept-Ranges: bytes`、强 ETag 或 Last-Modified 时开启分段。弱 ETag 无 Last-Modified、HEAD 不支持、小于 4 MiB 时走单流。
- 请求禁止重定向，沿用原 HTTPS B站媒体域名白名单，不携带用户 cookie。
- 保存 Range 边界/总长/资源身份 hash/validator。续传要求服务器 206 的 Content-Range、长度和 validator 全匹配；错误响应在追加前拒绝。
- If-Range 后返回 200：从零重写私有轨，不追加错误数据；分段请求返回 200：关闭并等待所有 worker，再安全回单流。
- 完整轨、失败轨、取消后的轨或分段都有可恢复私有文件。成功提交成品后才清理。最终成品永不覆盖现有目标。
- 队列身份使用 bvid/cid/representation；更换签名 query 不改变身份。representation 变更不复用旧轨。
- 旧按钮也保留断点，重新下载时需选同一保存位置；其身份来自媒体路径，不含 query。路径改变时保守不续传。旧按钮任务不会自动注册进持久队列。
- 暂停/退出时取消并 join worker；没有 detached 下载线程。磁盘失败/网络错误与用户取消状态区分。

## 与 Bili23 的实际差异

仅研究协议/参数，未复制 GPL 实现。

上游源码：[downloader.py](https://github.com/ScottSloan/Bili23-Downloader/blob/main/src/util/download/downloader/downloader.py)、[config.py](https://github.com/ScottSloan/Bili23-Downloader/blob/main/src/util/common/config.py)。检查日期 2026-10-31。

Bili23 默认每任务 4 线程，文件并行默认 1；4 MiB chunk、8192 字节迭代读取、最多 5 次重试、连接池复用、Range/ETag 校验。旧客户端虽已有音视频两轨并行，但每轨只有一个连接，并以 64 KiB `QueryDataAvailable + ReadData` 往返读取。本次增加有界 Range 并发、会话复用及 256 KiB 直接异步读取；不声称所有 CDN 都会提升，亦未实现 Bili23 的自动 5 次重试（用户可继续/重试任务）。

## 可复现验收

原生探针：`tests/download44-native.cpp`，localhost fixture：`python scripts/verify_download44_native.py`。

完整字面结果：`verification/download44-native-results.json`。覆盖中断恢复、签名 query 更新、200 重置、错位 206、validator 改变、取消、4 Range 整体一致性、HEAD 缺失、弱 ETag / Last-Modified、成品不覆盖、成功清理、失败保留、任务串行、重启暂停恢复、旧 token 拒绝、已完成任务移除不删成品，以及持久化字段不含媒体 URL。

速度数据只为 8 MiB、每连接限速的 localhost fixture；具体单流/四连接毫秒以最新 JSON 的 `benchmark` 为准，不能当真实 B站 CDN 速度承诺。真实登录权限下的多 P / 合集、真实 DASH Media Foundation 合并、实际 UI 仍需父任务整体运行验收。
